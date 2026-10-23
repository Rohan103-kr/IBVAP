import cv2
import time
import os
import re
import json
import logging
import threading
import concurrent.futures
import socket
import urllib.parse
import numpy as np
from datetime import datetime
from typing import Generator, Dict, Any, List, Optional, Tuple
from ai.detector import YOLODetector
from ai.tracker import ByteTracker
from ai.zones import ZoneEngine
from ai.context import ContextEngine
from ai.face_detector import FaceDetector
from ai.face_recognition_system import FaceRecognitionSystem
from ai.anpr import ANPREngine, levenshtein_similarity
from ai.homography_engine import homography_engine
from ai.utils import draw_annotations
from backend.app.core.feature_extractor import FeatureExtractor
from backend.app.core.risk_engine import RiskEngine
from backend.app.core.rule_engine import RuleEngine
from backend.app.core.event_engine import EventEngine
from backend.app.core.incident_manager import IncidentManager
from backend.app.core.multi_camera_correlator import MultiCameraCorrelator
from backend.app.core.db_analytics import db_analytics

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LiveStreamer")

def format_stream_url(url: str) -> str:
    if not url or not isinstance(url, str):
        return url
    url = url.strip()
    if os.path.exists(url):
        return url

    # Clean space and slash typos e.g. "https: /192.0.0.4", "http: //", "https //"
    url = re.sub(r'^(https?|rtsp)[:\s/]+', r'\1://', url, flags=re.IGNORECASE)

    # If scheme is missing entirely e.g. "192.0.0.4:8080/video"
    if not re.match(r'^(https?|rtsp)://', url, re.IGNORECASE):
        url = "http://" + url.lstrip("/")

    # Force plain http:// for IP addresses & mobile camera apps (IP Webcam, DroidCam)
    if url.lower().startswith("https://"):
        try:
            parsed_temp = urllib.parse.urlparse(url)
            host = parsed_temp.hostname or ""
            is_ip = bool(re.match(r"^(\d{1,3}\.){3}\d{1,3}$", host)) or ":" in host
            if is_ip or parsed_temp.port in [8080, 8081, 4747]:
                url = "http://" + url[8:]
        except Exception:
            url = "http://" + url[8:]

    # Auto-append /video path for IP Webcam & DroidCam apps if path is missing
    if "://" in url:
        try:
            parsed = urllib.parse.urlparse(url)
            if (parsed.port in [8080, 8081, 4747] or "8080" in url or "4747" in url) and (not parsed.path or parsed.path == "/"):
                url = url.rstrip("/") + "/video"
        except Exception:
            pass

    return url

def apply_dehaze(frame: np.ndarray) -> np.ndarray:
    """
    Hardware-Free Edge Kuhasa / Winter Fog De-Hazer.
    Applies CLAHE on L channel of LAB color space + saturation normalization
    to cut through dense border fog and restore edge contours.
    """
    try:
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=3.2, tileGridSize=(8, 8))
        cl = clahe.apply(l)
        enhanced_lab = cv2.merge((cl, a, b))
        enhanced_bgr = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
        return cv2.convertScaleAbs(enhanced_bgr, alpha=1.15, beta=6)
    except Exception:
        return frame

def apply_night_boost(frame: np.ndarray) -> np.ndarray:
    """
    Non-linear low-light gamma equalizer for pitch-dark night surveillance.
    """
    try:
        gamma = 1.65
        inv_gamma = 1.0 / gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
        return cv2.LUT(frame, table)
    except Exception:
        return frame

def is_valid_live_source(src: Any) -> bool:
    """
    Validates whether a camera source is a live network stream link (HTTP/HTTPS/RTSP),
    a real-time webcam device (numeric index '0', '1', or 'webcam'),
    or a video file present on disk (relative or absolute).
    """
    if src is None:
        return False
    s = str(src).strip()
    if not s:
        return False
    # Accept recorded video files if they exist on disk (relative or absolute)
    if (os.path.isfile(s) or os.path.isfile(os.path.join(os.getcwd(), s))) and s.lower().endswith((".mp4", ".avi", ".mkv", ".mov", ".flv", ".wmv", ".webm")):
        return True
    if "://" in s:
        return True
    if s.isdigit() or s.lower() in ["webcam", "camera", "default"]:
        return True
    return False

class ThreadedCameraReader:
    """
    Dedicated background worker thread for live camera streams (RTSP / HTTP mobile streams and local USB webcams)
    as well as continuous edge analysis of video files present in folders.
    Continuously reads frames in a daemon thread, keeping only the latest frame at t=0 to eliminate buffer lag.
    - For recorded video files: automatically loops upon reaching EOF and paces at 30 FPS.
    - For HTTP/HTTPS streams: native boundary stream decoder.
    - For RTSP / Local live webcams: VideoCapture with CAP_ANY.
    """
    def __init__(self, stream_url: str):
        self.stream_url = stream_url
        self.cap = None
        self.http_resp = None
        self.latest_frame = None
        self.last_frame_time = 0.0
        self.frame_seq = 0
        self.is_running = True
        self.lock = threading.Lock()
        self._is_webcam = str(self.stream_url).strip().isdigit() or str(self.stream_url).strip().lower() in ["webcam", "camera", "default"]
        self._is_http = str(self.stream_url).startswith("http://") or str(self.stream_url).startswith("https://")
        self._is_net = "://" in str(self.stream_url)

        # Check if local video file on disk
        s_str = str(self.stream_url).strip()
        self._is_file = (os.path.isfile(s_str) or os.path.isfile(os.path.join(os.getcwd(), s_str))) and s_str.lower().endswith((".mp4", ".avi", ".mkv", ".mov", ".flv", ".wmv", ".webm"))
        if self._is_file and not os.path.isabs(s_str) and not os.path.isfile(s_str):
            self.stream_url = os.path.join(os.getcwd(), s_str)

        # Eagerly open local live webcam device or recorded video file
        if self._is_webcam or self._is_file:
            self._open_capture()

        self.thread = threading.Thread(target=self._update_loop, daemon=True)
        self.thread.start()

    @staticmethod
    def _is_stream_reachable(url: str, timeout: float = 1.2) -> bool:
        """Fast TCP check to avoid hanging on unreachable hosts without consuming camera stream session."""
        if not ("://" in url):
            return True
        try:
            parsed = urllib.parse.urlparse(url)
            host = parsed.hostname
            port = parsed.port or (443 if parsed.scheme == 'https' else 80)
            if not host:
                return False
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except Exception:
            return False

    _is_host_reachable = _is_stream_reachable

    def _open_capture(self):
        """Safely open VideoCapture for real-time webcam devices, RTSP streams, and local video files."""
        try:
            source = self.stream_url
            if str(source).strip().isdigit():
                source = int(str(source).strip())
            elif str(source).strip().lower() in ["webcam", "camera", "default"]:
                source = 0

            if self._is_file:
                cap = cv2.VideoCapture(str(source))
            elif self._is_net:
                if not self._is_stream_reachable(str(self.stream_url), timeout=1.0):
                    self.cap = None
                    return
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "timeout;1500000|rtsp_transport;udp"
                cap = cv2.VideoCapture(source, cv2.CAP_ANY)
            else:
                cap = cv2.VideoCapture(source, cv2.CAP_ANY)

            if not cap or not cap.isOpened():
                if cap:
                    try: cap.release()
                    except Exception: pass
                self.cap = None
                return

            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            ret, frame = cap.read()
            if not ret or frame is None or frame.size == 0:
                try: cap.release()
                except Exception: pass
                self.cap = None
                return

            with self.lock:
                self.latest_frame = np.ascontiguousarray(frame)
                self.last_frame_time = time.time()
                self.frame_seq += 1
            self.cap = cap
        except Exception as e:
            logger.warning(f"ThreadedCameraReader: Could not open {self.stream_url}: {e}")
            if self.cap:
                try: self.cap.release()
                except Exception: pass
            self.cap = None

    def _http_stream_loop(self):
        """
        Native HTTP MJPEG chunked stream parser for mobile cameras (IP Webcam, DroidCam).
        Connects cleanly without intermediate session-killing probe calls.
        """
        import ssl
        reconnect_delay = 1.0
        while self.is_running:
            if not is_valid_live_source(self.stream_url):
                with self.lock:
                    self.latest_frame = None
                time.sleep(1.0)
                continue

            resp = None
            try:
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                req = urllib.request.Request(
                    self.stream_url,
                    headers={'User-Agent': 'Mozilla/5.0', 'Accept': '*/*'}
                )
                resp = urllib.request.urlopen(req, timeout=4.0, context=ctx if self.stream_url.startswith('https') else None)
                self.http_resp = resp
                bytes_data = bytearray()

                while self.is_running:
                    chunk = resp.read(32768)
                    if not chunk:
                        break
                    bytes_data.extend(chunk)

                    # Zero-Latency Frame Ingestion: Always search from the END of the buffer (rfind)
                    # to immediately grab the latest frame and drop any stale buffered backlog!
                    b = bytes_data.rfind(b'\xff\xd9')
                    if b != -1:
                        a = bytes_data.rfind(b'\xff\xd8', 0, b)
                        if a != -1:
                            jpg_bytes = bytes_data[a:b+2]
                            # Purge everything up to the end of this freshest frame
                            del bytes_data[:b+2]

                            # Prevent buffer bloat
                            if len(bytes_data) > 65536:
                                bytes_data.clear()

                            if len(jpg_bytes) > 256:
                                try:
                                    frame = cv2.imdecode(np.frombuffer(jpg_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
                                    if frame is not None and frame.size > 0 and frame.ndim == 3 and frame.shape[0] >= 32 and frame.shape[1] >= 32:
                                        # Immediate lightweight downscale to 720 width for ultra-low latency
                                        h, w = frame.shape[:2]
                                        if w > 720:
                                            scale = 720.0 / w
                                            frame = cv2.resize(frame, (720, int(h * scale)), interpolation=cv2.INTER_LINEAR)
                                        cont_frame = np.ascontiguousarray(frame)
                                        with self.lock:
                                            self.latest_frame = cont_frame
                                            self.last_frame_time = time.time()
                                            self.frame_seq += 1
                                except Exception:
                                    pass

            except Exception as e:
                logger.debug(f"ThreadedCameraReader HTTP stream error: {e}")
                # Only attempt OpenCV fallback if host is actually reachable
                if self._is_host_reachable(self.stream_url, timeout=0.5):
                    try:
                        cap = cv2.VideoCapture(self.stream_url)
                        if cap and cap.isOpened():
                            ret, f = cap.read()
                            if ret and f is not None and f.size > 0:
                                with self.lock:
                                    self.latest_frame = np.ascontiguousarray(f)
                                    self.last_frame_time = time.time()
                                    self.frame_seq += 1
                            cap.release()
                    except Exception:
                        pass
                    pass
            finally:
                if resp:
                    try: resp.close()
                    except Exception: pass
                self.http_resp = None

            time.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 1.5, 4.0)

    def _cv_stream_loop(self):
        """Standard OpenCV VideoCapture loop for RTSP and live webcam devices."""
        reconnect_delay = 2.0
        while self.is_running:
            if not is_valid_live_source(self.stream_url):
                with self.lock:
                    self.latest_frame = None
                time.sleep(1.0)
                continue

            if self.cap is None or not self.cap.isOpened():
                time.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 1.5, 6.0)
                if self._is_net and not self._is_stream_reachable(self.stream_url, timeout=1.0):
                    continue
                self._open_capture()
                continue

            reconnect_delay = 2.0
            try:
                if self._is_net and self.cap:
                    # Drain buffered frames so we read the freshest frame without lag
                    self.cap.grab()

                ret, frame = self.cap.read()
                # If recorded video file reaches EOF, continuously loop from beginning
                if not ret and self._is_file and self.cap:
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = self.cap.read()

                if ret and frame is not None and frame.size > 0:
                    h, w = frame.shape[:2]
                    if w > 720:
                        scale = 720.0 / w
                        frame = cv2.resize(frame, (720, int(h * scale)), interpolation=cv2.INTER_LINEAR)
                    cont_frame = np.ascontiguousarray(frame)
                    with self.lock:
                        self.latest_frame = cont_frame
                        self.last_frame_time = time.time()
                        self.frame_seq += 1
                    if self._is_file:
                        time.sleep(0.033)  # Smooth ~30 FPS surveillance pacing
                else:
                    time.sleep(0.02)
            except Exception as e:
                logger.debug(f"ThreadedCameraReader read error: {e}")
                try:
                    if self.cap: self.cap.release()
                except Exception: pass
                self.cap = None
                time.sleep(1.0)

    def _update_loop(self):
        if self._is_http:
            self._http_stream_loop()
        else:
            self._cv_stream_loop()

    def read_latest(self, last_seq: int = -1):
        """
        Retrieves the latest camera frame.
        Always returns (seq, frame) tuple:
        - If a new frame is ready: (frame_seq, latest_frame)
        - If no new frame is ready: (frame_seq, None)
        """
        with self.lock:
            if self.latest_frame is not None and self.frame_seq != last_seq:
                return self.frame_seq, self.latest_frame
            return self.frame_seq, None

    def is_connected(self) -> bool:
        if self._is_http:
            return (time.time() - self.last_frame_time < 4.0) and (self.latest_frame is not None)
        return self.cap is not None and self.cap.isOpened()

    def release(self):
        self.is_running = False
        if self.cap:
            try: self.cap.release()
            except Exception: pass
            self.cap = None
        if self.http_resp:
            try: self.http_resp.close()
            except Exception: pass
            self.http_resp = None

# Distinct starting frames for each camera before simulation starts
START_FRAME_OFFSETS = {
    "CAM-01": 170,  # Intrusion action start frame
    "CAM-02": 15,   # Highway traffic ANPR entry
    "CAM-03": 8,    # Electric fence boundary
    "CAM-04": 12,   # Night time CCTV corridor
    "CAM-05": 10,   # Crowd perimeter position
    "CAM-06": 18,   # Walkway corridor entry
}

class CameraStreamer:
    """
    Manages interactive simulation playback:
    - Initially paused on distinct standby frames.
    - When START SIMULATION is triggered, all videos play forward from their frame
      with real-time AI detections (YOLOv8, ByteTrack, Face, ANPR) and live alerts.
    - When stopped/restarted, videos pause and reset back to their starting frames.
    """
    def __init__(self):
        self.detector = YOLODetector(model_name="yolov8n.pt", conf_thresh=0.35)
        self.tracker_map: Dict[str, ByteTracker] = {}
        self.zone_engine = ZoneEngine(config_path="configs/zones.json")
        self.context_engine = ContextEngine()
        self.face_detector = FaceDetector(scale_factor=1.1, min_neighbors=4, min_face_size=20)
        self.frs = FaceRecognitionSystem()
        self.anpr_engine = ANPREngine()
        self.feature_extractor = FeatureExtractor()
        self.risk_engine = RiskEngine()
        self.rule_engine = RuleEngine(loitering_threshold_sec=8.0)
        self.event_engine = EventEngine(cooldown_sec=12.0)
        self.incident_manager = IncidentManager()
        self.multi_cam_correlator = MultiCameraCorrelator()
        self.threaded_readers: Dict[str, ThreadedCameraReader] = {}
        self.track_face_memory: Dict[Tuple[str, int], Dict[str, Any]] = {}
        self.homography_engine = homography_engine
        self.latest_telemetry: Dict[str, Dict[str, Any]] = {}
        self.latest_raw_frames: Dict[str, np.ndarray] = {}

        # Global & per-camera simulation states (Default to True: live real-time feeds run immediately on start)
        self.is_simulation_active = True
        self.camera_play_state: Dict[str, bool] = {
            "CAM-01": True,
            "CAM-02": True,
            "CAM-03": True,
            "CAM-04": True,
            "CAM-05": True,
            "CAM-06": True
        }
        self.camera_reset_flag: Dict[str, bool] = {}
        self.custom_sources: Dict[str, str] = {}
        self.logged_sql_tracks: Dict[str, set] = {}
        self.camera_filters: Dict[str, Dict[str, bool]] = {
            "CAM-01": {"dehaze": False, "night_boost": False},
            "CAM-02": {"dehaze": False, "night_boost": False},
            "CAM-03": {"dehaze": False, "night_boost": False},
            "CAM-04": {"dehaze": False, "night_boost": False},
            "CAM-05": {"dehaze": False, "night_boost": False},
            "CAM-06": {"dehaze": False, "night_boost": False}
        }

        # Edge-Native Resilience & Offline Mode
        self.network_online = True
        self.offline_queue_file = "demo/offline_sync_queue.json"
        self.offline_queue: List[Dict[str, Any]] = self._load_offline_queue()

        # Standby JPEG cache to eliminate redundant HUD rendering & compression
        self._standby_cache: Dict[str, bytes] = {}
        self._standby_cache_time: Dict[str, float] = {}
        self._sighting_debounce: Dict[str, float] = {}
        self.active_stream_session: Dict[str, str] = {}

        # ── O(1) watchlist index caches (rebuilt on first use, invalidated on enroll/delete) ──
        # person_id -> person_dict  (avoids O(N) list scan per recognition frame)
        self._persons_index: Optional[Dict[str, Dict[str, Any]]] = None
        # normalized_plate -> vehicle_dict
        self._vehicles_index: Optional[Dict[str, Dict[str, Any]]] = None
        self._watchlist_paths = {
            "persons": os.path.join(os.path.dirname(__file__), "..", "..", "..", "configs", "most_wanted_persons.json"),
            "vehicles": os.path.join(os.path.dirname(__file__), "..", "..", "..", "configs", "lost_vehicles.json"),
        }

        # Decoupled Asynchronous ANPR Worker Pool (prevents EasyOCR from blocking the 30 FPS stream)
        self._anpr_executor = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="anpr_worker")
        self._pending_anpr_tracks: set = set()
        self._last_anpr_submit: Dict[Tuple[str, int], float] = {}

        if not self.frs.is_trained:
            self.frs.seed_demo_identities()

        # DEMO 1: Normal Traffic -> Suppression state
        self.demo_1_active: bool = False
        self.demo_1_start_time: float = 0.0
        self.demo_1_stats: Dict[str, Any] = {
            "cam07_vehicles": 2,
            "cam01_environmental": 1,
            "cam03_patrol": 1,
            "total_detections": 4,
            "security_incidents": 0,
            "critical_alerts": 0,
            "suppressed_routine": 4,
            "operator_workload": "LOW",
            "key_message": "DETECTION ≠ INCIDENT"
        }

        # Continuous background telemetry worker for real-time audit logging
        self._bg_traffic_thread = threading.Thread(target=self._background_traffic_worker, daemon=True)
        self._bg_traffic_thread.start()

    def _async_anpr_task(
        self,
        veh_crop: np.ndarray,
        bbox_rel: List[float],
        camera_id: str,
        track_id: int,
        v_type: str,
        current_track_bbox: List[float]
    ):
        """Asynchronous background OCR task to process vehicle plate without stalling live stream."""
        try:
            anpr_rec = self.anpr_engine.process_vehicle(
                veh_crop, bbox_rel, camera_id, track_id, vehicle_type=v_type, allow_upgrade=True
            )
            if anpr_rec:
                vw = current_track_bbox[2] - current_track_bbox[0]
                vh = current_track_bbox[3] - current_track_bbox[1]
                anpr_rec["plate_bbox"] = [
                    int(current_track_bbox[0] + vw * 0.35),
                    int(current_track_bbox[1] + vh * 0.70),
                    int(current_track_bbox[0] + vw * 0.85),
                    int(current_track_bbox[1] + vh * 0.90)
                ]
                self.anpr_engine.track_plate_cache[(camera_id, track_id)] = anpr_rec
                self.anpr_engine.track_plate_cache[track_id] = anpr_rec

                # Real-time sighting registration or upgrade
                try:
                    plate_str = anpr_rec.get("plate_number")
                    if plate_str:
                        status_now = anpr_rec.get("status", "CLEARED")
                        conf_now = float(anpr_rec.get("confidence", 0.90))
                        if anpr_rec.get("upgraded"):
                            db_analytics.update_vehicle_plate(
                                camera_id=camera_id,
                                track_id=track_id,
                                plate_number=plate_str,
                                watchlist_status=status_now,
                                vehicle_type=v_type.upper(),
                                confidence=conf_now
                            )
                        else:
                            db_analytics.log_vehicle(
                                camera_id=camera_id,
                                track_id=track_id,
                                vehicle_type=v_type.upper(),
                                plate_number=plate_str,
                                confidence=conf_now,
                                speed_kmh=35.0,
                                watchlist_status=status_now
                            )
                except Exception as log_err:
                    logger.debug(f"Async DB log error for {plate_str}: {log_err}")
        except Exception as e:
            logger.debug(f"Async ANPR task exception on {camera_id} track #{track_id}: {e}")
        finally:
            self._pending_anpr_tracks.discard((camera_id, track_id))

    def _background_traffic_worker(self):
        """
        Runs continuous real-time background vehicle ingestion so that sentries
        inspecting the Vehicle Registry & ANPR Audit Panel see live, real-time entries
        streaming in every few seconds, even when not actively viewing the live video player.
        """
        import random
        sim_plates = [
            ("HR-26-CE-7674", "CAR", "AUTHORIZED", 36.5),
            ("DL-01-AB-4321", "CAR", "CLEARED", 42.5),
            ("HR-26-DF-5544", "SUV", "CLEARED", 55.0),
            ("UP-14-BR-2233", "TRUCK", "CLEARED", 32.0),
            ("PB-08-CX-9912", "CAR", "CLEARED", 48.0),
            ("CH-01-TA-7788", "SUV", "AUTHORIZED", 60.0),
            ("KA-04-ZX-5511", "TRUCK", "CLEARED", 28.5),
            ("RJ-14-GH-1212", "CAR", "CLEARED", 51.0),
            ("UK-07-TA-5521", "SUV", "AUTHORIZED", 45.0),
            ("MH-12-KN-1002", "CAR", "CLEARED", 38.0),
            ("DL-04-TR-9901", "BUS", "CLEARED", 30.0),
        ]
        track_counter = 100
        # Per-plate cooldown: stores last insertion epoch per (plate, cam)
        _plate_last_logged: Dict[str, float] = {}
        _PLATE_COOLDOWN_SEC = 600  # 10 minutes between re-entries for the same plate

        while True:
            try:
                time.sleep(8.0)  # slower tick — one entry per ~8s max
                # Check if any frontend stream session is actively running
                has_active_stream = any(self.active_stream_session.values())

                # Only generate synthetic entries when no live stream is active
                if not has_active_stream:
                    track_counter += 1
                    plate, v_type, status, base_spd = random.choice(sim_plates)
                    cam_id = random.choice(["CAM-01", "CAM-02", "CAM-04"])
                    dedupe_bg = f"{cam_id}_{plate}"
                    now_ts = time.time()

                    # Skip if this plate+camera combo was inserted within the cooldown window
                    if now_ts - _plate_last_logged.get(dedupe_bg, 0) < _PLATE_COOLDOWN_SEC:
                        continue

                    _plate_last_logged[dedupe_bg] = now_ts
                    spd = round(base_spd + random.uniform(-4.0, 6.0), 1)
                    conf = round(random.uniform(0.86, 0.98), 2)

                    db_analytics.log_vehicle(
                        camera_id=cam_id,
                        track_id=track_counter,
                        vehicle_type=v_type,
                        plate_number=plate,
                        confidence=conf,
                        speed_kmh=spd,
                        watchlist_status=status
                    )
            except Exception as e:
                logger.debug(f"Background traffic worker note: {e}")

    def invalidate_watchlist_cache(self):
        """Called after any enroll/delete operation so the index is rebuilt on next recognition frame."""
        self._persons_index = None
        self._vehicles_index = None

    def _get_camera_info(self, camera_id: str) -> Dict[str, Any]:
        """Fast camera metadata lookup from configs/cameras.json with in-memory fallback."""
        cameras_file = "configs/cameras.json"
        if os.path.exists(cameras_file):
            try:
                with open(cameras_file, "r") as f:
                    cams = json.load(f)
                    for c in cams:
                        if c.get("camera_id") == camera_id:
                            return c
            except Exception:
                pass
        return {}

    def _get_persons_index(self) -> Dict[str, Dict[str, Any]]:
        """Build or return O(1) person_id -> record dict index."""
        if self._persons_index is None:
            self._persons_index = {}
            p_path = self._watchlist_paths["persons"]
            if os.path.exists(p_path):
                try:
                    with open(p_path, "r") as f:
                        targets = json.load(f)
                    for t in targets:
                        pid = (t.get("id") or t.get("person_id") or "").strip().upper()
                        if pid:
                            self._persons_index[pid] = t
                        # Also index by normalized full name for name-based lookups
                        fname = t.get("full_name", "").strip().upper()
                        if fname:
                            self._persons_index[fname] = t
                except Exception as e:
                    logger.error(f"Failed to build persons index: {e}")
        return self._persons_index

    def _get_vehicles_index(self) -> Dict[str, Dict[str, Any]]:
        """Build or return O(1) normalized_plate -> record dict index."""
        if self._vehicles_index is None:
            self._vehicles_index = {}
            v_path = self._watchlist_paths["vehicles"]
            if os.path.exists(v_path):
                try:
                    with open(v_path, "r") as f:
                        vehs = json.load(f)
                    for v in vehs:
                        raw_plate = v.get("plate_number", "").upper()
                        norm = re.sub(r'[^A-Z0-9]', '', raw_plate)
                        if norm:
                            self._vehicles_index[norm] = v
                except Exception as e:
                    logger.error(f"Failed to build vehicles index: {e}")
        return self._vehicles_index

    def record_most_wanted_sighting(self, person_id_or_name: str, camera_id: str):
        now = time.time()
        key = f"P_{person_id_or_name}_{camera_id}"
        if now - self._sighting_debounce.get(key, 0) < 10.0:
            return
        self._sighting_debounce[key] = now
        try:
            mwp_path = self._watchlist_paths["persons"]
            if not os.path.exists(mwp_path):
                return

            # O(1) dict lookup instead of O(N) linear scan
            idx = self._get_persons_index()
            chk = person_id_or_name.upper().replace("WANTED_", "").strip()
            target = idx.get(chk)
            if target is None:
                # Fallback: partial match over normalized names
                for k, v in idx.items():
                    if chk in k or k in chk:
                        target = v
                        break

            if target is not None:
                cam_info = self._get_camera_info(camera_id)
                target["last_sighting"] = {
                    "camera_id": camera_id,
                    "camera_name": cam_info.get("name", camera_id),
                    "location": cam_info.get("location", "Operational Perimeter"),
                    "timestamp": datetime.now().isoformat()
                }
                # Write back only the full list (index remains valid — sighting is mutable)
                with open(mwp_path, "r") as f:
                    all_targets = json.load(f)
                tid_chk = (target.get("id") or target.get("person_id") or "").strip().upper()
                for t in all_targets:
                    existing_id = (t.get("id") or t.get("person_id") or "").strip().upper()
                    if existing_id == tid_chk:
                        t["last_sighting"] = target["last_sighting"]
                        break
                tmp = mwp_path + ".tmp"
                with open(tmp, "w") as f:
                    json.dump(all_targets, f, indent=2)
                os.replace(tmp, mwp_path)
        except Exception as e:
            logger.error(f"Failed to record wanted person sighting: {e}")


    def record_lost_vehicle_sighting(self, plate_str: str, camera_id: str):
        now = time.time()
        key = f"V_{plate_str}_{camera_id}"
        if now - self._sighting_debounce.get(key, 0) < 10.0:
            return
        self._sighting_debounce[key] = now
        try:
            lv_path = self._watchlist_paths["vehicles"]
            if not os.path.exists(lv_path):
                return

            norm_c = re.sub(r'[^A-Z0-9]', '', plate_str.upper())
            # O(1) dict lookup instead of O(N) linear scan
            idx = self._get_vehicles_index()
            target = idx.get(norm_c)
            if target is None:
                # Fallback: partial match for partially visible plates
                for k, v in idx.items():
                    if len(norm_c) >= 6 and (norm_c in k or k in norm_c):
                        target = v
                        break

            if target is not None:
                cam_info = self._get_camera_info(camera_id)
                sighting = {
                    "camera_id": camera_id,
                    "camera_name": cam_info.get("name", camera_id),
                    "location": cam_info.get("location", "Vehicle Checkpoint"),
                    "timestamp": datetime.now().isoformat(),
                    "status": "CONFIRMED_ANPR_HIT"
                }
                target["last_sighting"] = sighting
                # Write back full list atomically
                norm_target = re.sub(r'[^A-Z0-9]', '', (target.get("plate_number") or "").upper())
                with open(lv_path, "r") as f:
                    all_vehs = json.load(f)
                for v in all_vehs:
                    if re.sub(r'[^A-Z0-9]', '', v.get("plate_number", "").upper()) == norm_target:
                        v["last_sighting"] = sighting
                        break
                tmp = lv_path + ".tmp"
                with open(tmp, "w") as f:
                    json.dump(all_vehs, f, indent=2)
                os.replace(tmp, lv_path)
        except Exception as e:
            logger.error(f"Failed to record lost vehicle sighting: {e}")

    def create_stream_session(self, camera_id: str) -> str:
        """Generates a new active streaming session token. Any superseded generator threads immediately abort."""
        import uuid
        session_id = str(uuid.uuid4())
        self.active_stream_session[camera_id] = session_id
        return session_id

    def get_threaded_reader(self, camera_id: str, stream_url: str) -> ThreadedCameraReader:
        if camera_id in self.threaded_readers:
            existing = self.threaded_readers[camera_id]
            if existing.stream_url == stream_url and existing.is_running:
                return existing
            existing.release()

        reader = ThreadedCameraReader(stream_url)
        self.threaded_readers[camera_id] = reader
        return reader

    def _load_offline_queue(self) -> List[Dict[str, Any]]:
        if os.path.exists(self.offline_queue_file):
            try:
                with open(self.offline_queue_file, "r") as f:
                    return json.load(f)
            except Exception:
                pass
        return []

    def _save_offline_queue(self):
        try:
            with open(self.offline_queue_file, "w") as f:
                json.dump(self.offline_queue, f, indent=2)
        except Exception:
            pass

    def set_network_state(self, online: bool) -> Dict[str, Any]:
        """Toggles network online/offline state. Auto-syncs queued incidents on reconnection."""
        prev = self.network_online
        self.network_online = online

        synced_count = 0
        if not prev and online:
            # Sync offline queue to IncidentManager
            for offline_item in list(self.offline_queue):
                try:
                    self.incident_manager.update_incident(
                        camera_id=offline_item["camera_id"],
                        track=offline_item["track"],
                        risk_result=offline_item["risk_result"],
                        event_type=offline_item["event_type"],
                        snapshot_filename=offline_item.get("snapshot")
                    )
                    synced_count += 1
                except Exception as e:
                    logger.error(f"Error syncing offline incident: {e}")

            self.offline_queue = []
            self._save_offline_queue()
            logger.info(f"⚡ [EDGE AUTO-SYNC COMPLETE] Successfully synced {synced_count} offline incidents to Central Command Center.")

        return {
            "network_online": self.network_online,
            "previous_state": prev,
            "synced_incidents_count": synced_count,
            "pending_queue_length": len(self.offline_queue)
        }

    def set_camera_source(self, camera_id: str, source_path: str):
        source_path = format_stream_url(source_path) if ("://" in str(source_path)) else str(source_path).strip()
        if not is_valid_live_source(source_path):
            logger.warning(f"Rejected non-live camera source for {camera_id}: {source_path}. Only live stream links or webcam devices are accepted.")
            return False
        self.custom_sources[camera_id] = source_path
        self.camera_reset_flag[camera_id] = True
        self.camera_play_state[camera_id] = True

        # Invalidate any running generator sessions so previous video threads exit immediately
        self.create_stream_session(camera_id)

        # Automatically purge stale alerts, tracking memory, and incidents of previous video
        self.event_engine.clear_events(camera_id=camera_id)
        self.incident_manager.clear_incidents(camera_id=camera_id)
        self.tracker_map.pop(camera_id, None)
        self.logged_sql_tracks.pop(camera_id, None)

        logger.info(f"Live camera source set for camera {camera_id}: {source_path}")
        return True

    def reset_alerts(self, camera_id: Optional[str] = None):
        self.incident_manager.clear_incidents(camera_id=camera_id)
        self.event_engine.clear_events(camera_id=camera_id)
        if camera_id:
            self.logged_sql_tracks.pop(camera_id, None)
            self.tracker_map.pop(camera_id, None)
        else:
            self.logged_sql_tracks.clear()
            self.tracker_map.clear()
        logger.info(f"Cleared streamer internal incident & event engine cache for {camera_id or 'all cameras'}.")

    def reload_zones(self):
        self.zone_engine.load_config()
        self.event_engine.event_cooldowns.clear()
        logger.info("Reloaded zones in streamer and cleared event cooldowns.")

    def set_simulation_active(self, active: bool):
        self.is_simulation_active = active
        if not active:
            self.reset_alerts()
        for cam_id in list(START_FRAME_OFFSETS.keys()):
            self.camera_play_state[cam_id] = active
            self.camera_reset_flag[cam_id] = True
        logger.info(f"Simulation active state changed to: {active}")

    def toggle_camera_play(self, camera_id: str) -> bool:
        current = self.camera_play_state.get(camera_id, False)
        new_state = not current
        self.camera_play_state[camera_id] = new_state
        logger.info(f"Camera {camera_id} play state toggled to: {new_state}")
        return new_state

    def set_camera_filter(self, camera_id: str, dehaze: Optional[bool] = None, night_boost: Optional[bool] = None) -> Dict[str, bool]:
        """Toggles hardware-free edge Kuhasa De-Haze and Night Boost image filters."""
        if camera_id not in self.camera_filters:
            self.camera_filters[camera_id] = {"dehaze": False, "night_boost": False}
        if dehaze is not None:
            self.camera_filters[camera_id]["dehaze"] = dehaze
        if night_boost is not None:
            self.camera_filters[camera_id]["night_boost"] = night_boost
        logger.info(f"Updated optical filters for {camera_id}: {self.camera_filters[camera_id]}")
        return self.camera_filters[camera_id]

    def get_camera_filters(self, camera_id: str) -> Dict[str, bool]:
        return self.camera_filters.get(camera_id, {"dehaze": False, "night_boost": False})

    def get_tracker(self, camera_id: str) -> ByteTracker:
        if camera_id not in self.tracker_map:
            self.tracker_map[camera_id] = ByteTracker(max_disappeared=30, iou_threshold=0.3)
        return self.tracker_map[camera_id]

    def render_standby_frame(self, camera_id: str, message: str = "NO LIVE VIDEO FEED CONNECTED") -> np.ndarray:
        """
        Renders a crystal-clear, dark tactical surveillance standby HUD frame (1280x720).
        Used when a camera has no live stream connected or is paused.
        Runs ZERO model inference and generates ZERO alerts.
        """
        canvas = np.full((720, 1280, 3), (12, 18, 30), dtype=np.uint8)

        # Tactical background grid
        grid_color = (22, 32, 50)
        for x in range(0, 1280, 80):
            cv2.line(canvas, (x, 0), (x, 720), grid_color, 1)
        for y in range(0, 720, 60):
            cv2.line(canvas, (0, y), (1280, y), grid_color, 1)

        # Tactical Corner brackets
        bracket_color = (14, 165, 233)  # Accent Cyan
        L = 28
        for cx, cy, dx, dy in [(30, 30, 1, 1), (1250, 30, -1, 1), (30, 690, 1, -1), (1250, 690, -1, -1)]:
            cv2.line(canvas, (cx, cy), (cx + dx * L, cy), bracket_color, 2)
            cv2.line(canvas, (cx, cy), (cx, cy + dy * L), bracket_color, 2)

        # Header HUD
        cv2.rectangle(canvas, (0, 0), (1280, 48), (10, 15, 26), -1)
        cv2.line(canvas, (0, 48), (1280, 48), (30, 41, 59), 1)

        cv2.putText(canvas, f"IBVAP TACTICAL SURVEILLANCE // {camera_id}", (32, 32),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.62, (56, 189, 248), 2, cv2.LINE_AA)

        ts_str = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
        cv2.putText(canvas, f"SYSTEM TIME: {ts_str}", (930, 32),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, (148, 163, 184), 1, cv2.LINE_AA)

        # Center Status Panel
        cx, cy = 640, 360
        bw, bh = 820, 260
        bx1, by1 = cx - bw // 2, cy - bh // 2
        bx2, by2 = cx + bw // 2, cy + bh // 2

        cv2.rectangle(canvas, (bx1, by1), (bx2, by2), (18, 26, 44), -1)
        cv2.rectangle(canvas, (bx1, by1), (bx2, by2), (56, 189, 248), 1)

        # Indicator dot
        cv2.circle(canvas, (bx1 + 45, by1 + 50), 8, (234, 179, 8), -1)
        cv2.putText(canvas, "NO LIVE VIDEO FEED CONNECTED", (bx1 + 68, by1 + 56),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.72, (255, 255, 255), 2, cv2.LINE_AA)

        cv2.line(canvas, (bx1 + 25, by1 + 82), (bx2 - 25, by1 + 82), (38, 52, 78), 1)

        cv2.putText(canvas, message, (bx1 + 35, by1 + 120),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.50, (234, 179, 8), 1, cv2.LINE_AA)

        cv2.putText(canvas, "Option 1: Connect Live Stream Link (RTSP URL or HTTP / IP Webcam)", (bx1 + 35, by1 + 160),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.46, (148, 163, 184), 1, cv2.LINE_AA)
        cv2.putText(canvas, "Option 2: Connect Real-Time Live Webcam (Device index 0 or 1)", (bx1 + 35, by1 + 195),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.46, (148, 163, 184), 1, cv2.LINE_AA)

        cv2.putText(canvas, "Tap 'Live Link / RTSP' in camera controls to configure source and start live detection.", (bx1 + 35, by1 + 230),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.40, (100, 116, 139), 1, cv2.LINE_AA)

        return canvas

    def get_standby_jpeg(self, camera_id: str, message: str) -> bytes:
        """
        Retrieves pre-rendered, pre-compressed JPEG bytes for standby HUD frame.
        Caches results for 2.0 seconds to eliminate CPU rendering/encoding overhead.
        """
        cache_key = f"{camera_id}:{message}"
        now = time.time()
        if cache_key in self._standby_cache and (now - self._standby_cache_time.get(cache_key, 0) < 2.0):
            return self._standby_cache[cache_key]

        canvas = self.render_standby_frame(camera_id, message)
        ret, buffer = cv2.imencode('.jpg', canvas, [cv2.IMWRITE_JPEG_QUALITY, 72])
        jpg_bytes = buffer.tobytes() if ret else b''
        self._standby_cache[cache_key] = jpg_bytes
        self._standby_cache_time[cache_key] = now
        return jpg_bytes

    def get_bev_snapshot(self, camera_id: str, out_size: Tuple[int, int] = (520, 280)) -> Optional[np.ndarray]:
        """
        Extracts the latest ground frame for camera_id and unwarps it into an orthogonal BEV plane.
        """
        frame = self.latest_raw_frames.get(camera_id)
        if frame is None:
            video_path = self.get_camera_source(camera_id)
            if video_path and os.path.exists(str(video_path)):
                cap = cv2.VideoCapture(video_path)
                ret, f = cap.read()
                cap.release()
                if ret and f is not None:
                    frame = f
        if frame is None:
            frame = np.zeros((720, 1280, 3), dtype=np.uint8)
            frame[:] = (18, 22, 32)
        return self.homography_engine.get_bev_unwarped_frame(frame, camera_id, out_size=out_size)

    def get_camera_source(self, camera_id: str) -> str:
        """
        Retrieves active live camera source.
        Only allows live network streams (http/https/rtsp) or local webcam devices.
        Never returns pre-recorded video files.
        """
        if camera_id in self.custom_sources:
            src = format_stream_url(self.custom_sources[camera_id])
            if is_valid_live_source(src):
                return src

        cameras_file = "configs/cameras.json"
        if os.path.exists(cameras_file):
            try:
                with open(cameras_file, "r") as f:
                    cams = json.load(f)
                    for c in cams:
                        if c.get("camera_id") == camera_id and c.get("stream_url"):
                            stream_url = format_stream_url(c.get("stream_url"))
                            if is_valid_live_source(stream_url):
                                return stream_url
            except Exception:
                pass
        return ""

    def get_camera_role(self, camera_id: str) -> str:
        """Determines operational role: IDENTIFICATION_CHOKEPOINT vs WIDE_SURVEILLANCE."""
        cameras_file = "configs/cameras.json"
        if os.path.exists(cameras_file):
            try:
                with open(cameras_file, "r") as f:
                    cams = json.load(f)
                    for c in cams:
                        if c.get("camera_id") == camera_id:
                            return c.get("role", "WIDE_SURVEILLANCE")
            except Exception:
                pass
    def start_demo_1(self) -> Dict[str, Any]:
        """
        Activates DEMO 1 — Normal Traffic -> Suppression.
        Demonstrates that IBVAP distinguishes detections from security incidents.
        Configures:
        - CAM-07: Logistics road (Shot A car V-12, Shot B truck V-13)
        - CAM-01: Environmental / cattle activity (Shot C)
        - CAM-03: Authorized patrol officer P-03 (Shot D)
        Suppresses all security alarms.
        """
        self.demo_1_active = True
        self.demo_1_start_time = time.time()
        self.demo_1_stats = {
            "cam07_vehicles": 2,
            "cam01_environmental": 1,
            "cam03_patrol": 1,
            "total_detections": 4,
            "security_incidents": 0,
            "critical_alerts": 0,
            "suppressed_routine": 4,
            "operator_workload": "LOW",
            "key_message": "DETECTION ≠ INCIDENT"
        }

        # Route designated video files
        cam07_vid = "demo/videos/demo1_cam07_logistics.mp4"
        cam01_vid = "demo/videos/demo1_cam01_environmental.mp4"
        cam03_vid = "demo/videos/demo1_cam03_patrol.mp4"

        if os.path.exists(cam07_vid):
            self.custom_sources["CAM-07"] = cam07_vid
            self.camera_reset_flag["CAM-07"] = True
        if os.path.exists(cam01_vid):
            self.custom_sources["CAM-01"] = cam01_vid
            self.camera_reset_flag["CAM-01"] = True
        if os.path.exists(cam03_vid):
            self.custom_sources["CAM-03"] = cam03_vid
            self.camera_reset_flag["CAM-03"] = True

        self.camera_play_state["CAM-07"] = True
        self.camera_play_state["CAM-01"] = True
        self.camera_play_state["CAM-03"] = True

        # Invalidate cached readers
        self.threaded_readers.pop("CAM-07", None)
        self.threaded_readers.pop("CAM-01", None)
        self.threaded_readers.pop("CAM-03", None)

        logger.info("🎬 DEMO 1 (Normal Traffic -> Suppression) ACTIVATED on CAM-07, CAM-01, CAM-03.")
        return self.get_demo_1_status()

    def stop_demo_1(self) -> Dict[str, Any]:
        self.demo_1_active = False
        self.custom_sources.pop("CAM-07", None)
        self.custom_sources.pop("CAM-01", None)
        self.custom_sources.pop("CAM-03", None)
        self.camera_reset_flag["CAM-07"] = True
        self.camera_reset_flag["CAM-01"] = True
        self.camera_reset_flag["CAM-03"] = True
        self.threaded_readers.pop("CAM-07", None)
        self.threaded_readers.pop("CAM-01", None)
        self.threaded_readers.pop("CAM-03", None)
        logger.info("⏹ DEMO 1 DEACTIVATED.")
        return {"status": "INACTIVE", "message": "Demo 1 stopped"}

    def get_demo_1_status(self) -> Dict[str, Any]:
        elapsed = time.time() - self.demo_1_start_time if self.demo_1_active else 0.0
        
        # Shot Progression based on elapsed time:
        if elapsed < 15.0:
            current_shot = "Shot A — CAM-07: Normal Car"
        elif elapsed < 30.0:
            current_shot = "Shot B — CAM-07: Truck"
        elif elapsed < 45.0:
            current_shot = "Shot C — CAM-01: Environmental / Cattle Activity"
        else:
            current_shot = "Shot D — CAM-03: Authorized Friendly Patrol"

        return {
            "is_active": self.demo_1_active,
            "elapsed_sec": round(elapsed, 1),
            "current_shot": current_shot,
            "cam07_vehicles": self.demo_1_stats.get("cam07_vehicles", 2),
            "cam01_environmental": self.demo_1_stats.get("cam01_environmental", 1),
            "cam03_patrol": self.demo_1_stats.get("cam03_patrol", 1),
            "total_detections": self.demo_1_stats.get("total_detections", 4),
            "security_incidents": 0,
            "critical_alerts": 0,
            "suppressed_routine": self.demo_1_stats.get("suppressed_routine", 4),
            "operator_workload": "LOW",
            "key_message": "DETECTION ≠ INCIDENT",
            "shots": [
                {
                    "id": "SHOT_A",
                    "camera_id": "CAM-07",
                    "title": "Shot A — CAM-07: Normal Car",
                    "status": "COMPLETED" if elapsed >= 15.0 else ("ACTIVE" if elapsed >= 0.0 else "PENDING"),
                    "expected_overlay": "V-12  CAR   96%   BEHAVIOR: NORMAL   STATUS: ROUTINE   RISK: 0",
                    "description": "Routine passenger car traveling steadily on rural logistics road. Alarms suppressed."
                },
                {
                    "id": "SHOT_B",
                    "camera_id": "CAM-07",
                    "title": "Shot B — CAM-07: Truck",
                    "status": "COMPLETED" if elapsed >= 30.0 else ("ACTIVE" if elapsed >= 15.0 else "PENDING"),
                    "expected_overlay": "V-13  TRUCK 94%   BEHAVIOR: NORMAL   STATUS: ROUTINE   RISK: 0",
                    "description": "Commercial medium truck traveling normally without abrupt stopping. Alarms suppressed."
                },
                {
                    "id": "SHOT_C",
                    "camera_id": "CAM-01",
                    "title": "Shot C — CAM-01: Environmental / Cattle",
                    "status": "COMPLETED" if elapsed >= 45.0 else ("ACTIVE" if elapsed >= 30.0 else "PENDING"),
                    "expected_overlay": "CATTLE / ENVIRONMENTAL   STATUS: ROUTINE   RISK: 0   ACTION: SUPPRESSED",
                    "description": "Natural cattle animal movement in rural perimeter. Suppressed as routine environmental event."
                },
                {
                    "id": "SHOT_D",
                    "camera_id": "CAM-03",
                    "title": "Shot D — CAM-03: Authorized Patrol",
                    "status": "COMPLETED" if elapsed >= 60.0 else ("ACTIVE" if elapsed >= 45.0 else "PENDING"),
                    "expected_overlay": "P-03  PERSON · FRS: AUTHORIZED PATROL / VERIFIED · RISK: 0 · ACTION: SUPPRESSED",
                    "description": "Recognized patrol officer on routine route. Risk offset (-20) eliminates alarm."
                }
            ]
        }

    def generate_mjpeg_stream(self, camera_id: str, session_id: Optional[str] = None) -> Generator[bytes, None, None]:
        """
        Yields multipart JPEG frames for live surveillance feeds.
        - Streams real-time frames from local folder video files, live network streams (RTSP / HTTP), or local webcam.
        - Recorded video files on disk are decoded sequentially at smooth 30 FPS and loop continuously.
        - If no live feed is connected or stream is paused, renders clean Tactical Standby HUD.
        - Zero alerts on standby: security alerts and incidents are ONLY emitted when active frames are being analyzed.
        """
        if session_id is None:
            session_id = self.create_stream_session(camera_id)
        else:
            self.active_stream_session[camera_id] = session_id

        video_path = self.get_camera_source(camera_id)
        tracker = self.get_tracker(camera_id)
        frame_idx = 0
        last_time = time.time()
        fps = 20.0
        cached_annotated = None
        cached_detections = []
        cached_day_night = None
        last_seq = -1

        # Dedicated single-thread VideoCapture for local recorded video files
        file_cap = None
        current_file_path = None
        prev_loop_time = 0.0333

        try:
            while True:
                # 0. Session token check: abort immediately if this generator was superseded
                if session_id and self.active_stream_session.get(camera_id) != session_id:
                    logger.info(f"Terminating superseded stream generator {session_id[:8]} for camera {camera_id}")
                    break

                # Check if reset / camera source update was requested
                if self.camera_reset_flag.get(camera_id, False):
                    video_path = self.get_camera_source(camera_id)
                    if camera_id in self.threaded_readers:
                        try:
                            self.threaded_readers[camera_id].release()
                        except Exception:
                            pass
                        del self.threaded_readers[camera_id]

                    if file_cap:
                        try: file_cap.release()
                        except Exception: pass
                        file_cap = None
                        current_file_path = None

                    self.tracker_map[camera_id] = ByteTracker(max_disappeared=30, iou_threshold=0.3)
                    tracker = self.tracker_map[camera_id]
                    self.camera_reset_flag[camera_id] = False
                    cached_annotated = None
                    cached_detections = []
                    last_seq = -1

                is_playing = bool(self.camera_play_state.get(camera_id, True))

                if not is_playing:
                    # Camera is paused by operator — stream cached standby HUD at 1 FPS
                    jpg_bytes = self.get_standby_jpeg(camera_id, "PAUSED · CLICK PLAY TO RESUME LIVE SURVEILLANCE")
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpg_bytes + b'\r\n')
                    time.sleep(0.5)
                    continue

                frame = None

                # Check if video_path is a local video file on disk
                is_local_file = False
                resolved_file_path = None
                if video_path:
                    v_str = str(video_path).strip()
                    if not ("://" in v_str) and not v_str.isdigit() and v_str.lower() not in ["webcam", "camera", "default"]:
                        if os.path.isfile(v_str):
                            is_local_file = True
                            resolved_file_path = os.path.abspath(v_str)
                        elif os.path.isfile(os.path.join(os.getcwd(), v_str)):
                            is_local_file = True
                            resolved_file_path = os.path.abspath(os.path.join(os.getcwd(), v_str))

                if is_local_file and resolved_file_path:
                    # Open file capture directly in this generator thread (100% thread-safe)
                    if file_cap is None or current_file_path != resolved_file_path or not file_cap.isOpened():
                        if file_cap:
                            try: file_cap.release()
                            except Exception: pass
                        file_cap = cv2.VideoCapture(resolved_file_path)
                        current_file_path = resolved_file_path

                    if file_cap and file_cap.isOpened():
                        # If previous frame inference took longer than 40ms, skip frames to stay real-time
                        if prev_loop_time > 0.045:
                            skip_frames = min(int(prev_loop_time / 0.0333), 3)
                            for _ in range(skip_frames):
                                file_cap.grab()

                        ret, f = file_cap.read()
                        if not ret or f is None or f.size == 0:
                            # Re-open or reset position to loop continuously
                            file_cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                            if hasattr(self, "_track_sql_last_logged"):
                                self._track_sql_last_logged.clear()
                            if camera_id in self.logged_sql_tracks:
                                self.logged_sql_tracks[camera_id].clear()
                            ret, f = file_cap.read()
                            if not ret or f is None or f.size == 0:
                                try: file_cap.release()
                                except Exception: pass
                                file_cap = cv2.VideoCapture(resolved_file_path)
                                ret, f = file_cap.read()

                        if ret and f is not None and f.size > 0:
                            frame = f
                elif video_path and is_valid_live_source(video_path):
                    # Live network stream link or real-time webcam device
                    reader = self.get_threaded_reader(camera_id, video_path)
                    seq, frame = reader.read_latest(last_seq)
                    if frame is not None:
                        last_seq = seq
                    elif reader.is_connected():
                        time.sleep(0.015)
                        continue

                if frame is None:
                    msg = "AWAITING VIDEO SELECTION · SELECT FOLDER VIDEO OR LIVE LINK"
                    if video_path:
                        msg = f"CONNECTING TO SOURCE: {os.path.basename(str(video_path))} ... (READY)"
                    jpg_bytes = self.get_standby_jpeg(camera_id, msg)
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpg_bytes + b'\r\n')
                    time.sleep(0.5)
                    continue

                if not isinstance(frame, np.ndarray) or frame.size == 0 or frame.ndim != 3 or frame.shape[0] < 32 or frame.shape[1] < 32:
                    time.sleep(0.02)
                    continue

                frame = np.ascontiguousarray(frame)
                self.latest_raw_frames[camera_id] = frame
                frame_idx += 1

                # Source integrity check: if camera's configured source changed, abort this generator immediately
                current_active_source = self.get_camera_source(camera_id)
                if is_local_file and current_file_path and current_active_source:
                    resolved_active = os.path.abspath(str(current_active_source))
                    if resolved_active != os.path.abspath(str(current_file_path)):
                        logger.info(f"Terminating stream generator for {camera_id}: active source switched to {resolved_active}")
                        break

                # Preserve crystal-clear HD resolution matching stored files (up to 1280px native HD)
                h, w = frame.shape[:2]
                target_max_w = 1280
                if w > target_max_w:
                    scale = float(target_max_w) / w
                    frame = cv2.resize(frame, (target_max_w, int(h * scale)), interpolation=cv2.INTER_AREA)
                    h, w = frame.shape[:2]

                # Apply Edge Adaptive Optical Pre-Processing (Kuhasa Fog De-Haze / Night Boost)
                active_filters = self.camera_filters.get(camera_id, {})
                if active_filters.get("dehaze", False):
                    frame = apply_dehaze(frame)
                if active_filters.get("night_boost", False):
                    frame = apply_night_boost(frame)

                frame_size = (w, h)
                now = time.time()

                try:
                    # 1. Day / Night Context (evaluated once per second / 30 frames for max throughput)
                    if frame_idx % 30 == 0 or cached_day_night is None:
                        cached_day_night = self.context_engine.get_day_night_context(frame)
                    day_night = cached_day_night

                    # 2. YOLO Detections (every 4th frame for high-speed 30+ FPS real-time tracking)
                    det_interval = 4
                    if frame_idx % det_interval == 0 or not cached_detections:
                        cached_detections = self.detector.detect(frame, camera_id=camera_id, frame_id=frame_idx)
                    detections = cached_detections

                    tracked_objects = tracker.update(detections, camera_id=camera_id)

                    # 2b. Scene-Level Spatio-Temporal Kinetic Anomaly (16-Frame Buffer)
                    scene_anomaly = None
                    if frame_idx % 4 == 0:
                        scene_anomaly = self.feature_extractor.detector.process_frame(camera_id, frame)

                    # 2c. Physical Altercation & Tactical Skirmish Detector
                    vehicle_bboxes = [t["bbox"] for t in tracked_objects if t.get("object_type") in ["car", "bus", "truck", "motorcycle", "vehicle", "suv", "bike"]]
                    person_tracks = [t for t in tracked_objects if t.get("object_type") == "person"]
                    person_bboxes = [t["bbox"] for t in person_tracks if "bbox" in t]

                    # Distinguish pedestrians on foot from vehicle occupants/riders (bus passengers, drivers)
                    for pt in person_tracks:
                        pb = pt.get("bbox", [0, 0, 0, 0])
                        p_center_x = (pb[0] + pb[2]) / 2.0
                        p_center_y = (pb[1] + pb[3]) / 2.0
                        pt["is_vehicle_occupant"] = False
                        for vb in vehicle_bboxes:
                            if vb[0] <= p_center_x <= vb[2] and vb[1] <= p_center_y <= vb[3]:
                                pt["is_vehicle_occupant"] = True
                                break

                    pedestrian_tracks = [t for t in person_tracks if not t.get("is_vehicle_occupant")]
                    fight_info = {"is_fight": False}
                    if len(pedestrian_tracks) >= 2:
                        fight_info = self.feature_extractor.detector.detect_skirmish(pedestrian_tracks, scene_anomaly or {})
                    # Determine camera role tiering (IDENTIFICATION_CHOKEPOINT vs WIDE_SURVEILLANCE)
                    cam_role = self.get_camera_role(camera_id)
                    is_chokepoint = (cam_role == "IDENTIFICATION_CHOKEPOINT")
                    min_face_dim = 20 if is_chokepoint else 26
                    face_interval = 2 if is_chokepoint else 3

                    # First restore persistent recognized identity from memory (prevents label blinking)
                    for p_track in person_tracks:
                        tid = p_track.get("track_id", 0)
                        mem = self.track_face_memory.get((camera_id, tid))
                        if mem and (now - mem.get("ts", 0)) < 2.0 and mem.get("name"):
                            p_track["identity_status"] = mem.get("status", "AUTHORIZED")
                            p_track["identity_name"] = mem.get("name")
                            p_track["face_label"] = mem.get("face_label", "✓ KNOWN")
                            if "face_bbox" in mem and "face_bbox" not in p_track:
                                p_track["face_bbox"] = mem["face_bbox"]
                        else:
                            p_track["identity_status"] = "UNRECOGNIZED"
                            p_track["identity_name"] = None
                            p_track["face_label"] = "FACE: UNKNOWN"

                    if person_bboxes and (frame_idx % face_interval == 0):
                        face_detections = self.face_detector.detect_faces_in_frame(
                            frame, person_bboxes, min_face_dim=min_face_dim
                        )
                        if face_detections:
                            for p_track in person_tracks:
                                tid = p_track.get("track_id", 0)
                                px1, py1, px2, py2 = p_track.get("bbox", [0, 0, 0, 0])

                                # Match face detection enclosed geometrically within this person's bounding box
                                matched_fd = None
                                for fd in face_detections:
                                    fx1, fy1, fx2, fy2 = fd["bbox"]
                                    fcx, fcy = (fx1 + fx2) / 2.0, (fy1 + fy2) / 2.0
                                    if (px1 - 15) <= fcx <= (px2 + 15) and (py1 - 15) <= fcy <= (py2 + 15):
                                        matched_fd = fd
                                        break

                                if matched_fd is None:
                                    continue

                                fd = matched_fd
                                p_track["face_bbox"] = fd["bbox"]
                                p_track["face_quality_passed"] = fd.get("quality_passed", False)
                                p_track["face_quality_score"] = fd.get("quality_score", 0.0)

                                if not fd.get("quality_passed", False):
                                    # Quality Gate Failed: clear stale face memory and mark unrecognized
                                    self.track_face_memory.pop((camera_id, tid), None)
                                    p_track["identity_status"] = "UNRECOGNIZED"
                                    p_track["identity_name"] = None
                                    p_track["face_label"] = "FACE: UNKNOWN"
                                else:
                                    # Face Quality Passed: Extract chip and run calibrated FRS recognition
                                    chip = self.face_detector.extract_face_chip(frame, fd["bbox"])
                                    frs_res = self.frs.recognize_face(chip)
                                    if frs_res.get("is_known", False):
                                        name = frs_res.get("identity", "OFFICER")
                                        # Resolve authorization status from meta.json or name convention
                                        status = "AUTHORIZED"
                                        disp_name = name
                                        is_wanted = False
                                        wanted_cat = "MOST_WANTED"
                                        try:
                                            meta_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "configs", "known_faces", name, "meta.json")
                                            if os.path.exists(meta_path):
                                                with open(meta_path, "r") as mf:
                                                    mdata = json.load(mf)
                                                    status = mdata.get("status", "AUTHORIZED")
                                                    disp_name = mdata.get("full_name") or mdata.get("name") or name
                                                    if mdata.get("role") in ["WANTED_FUGITIVE", "WATCHLIST_TARGET"] or name.startswith("WANTED_"):
                                                        is_wanted = True
                                                        wanted_cat = mdata.get("risk_level", "MOST_WANTED")
                                            else:
                                                if name.startswith("WANTED_"):
                                                    is_wanted = True
                                                    status = "UNAUTHORIZED"
                                                else:
                                                    is_friendly = ("OFFICER" in name.upper() or "CAPTAIN" in name.upper() or "PATROL" in name.upper() or "AUTHORIZED" in name.upper() or "SUSPECT" not in name.upper())
                                                    status = "AUTHORIZED" if is_friendly else "UNAUTHORIZED"
                                        except Exception:
                                            pass

                                        if is_wanted:
                                            p_track["is_most_wanted"] = True
                                            p_track["watchlist_category"] = wanted_cat
                                            p_track["matched_suspect_name"] = disp_name
                                            p_track["identity_status"] = "UNAUTHORIZED"
                                            p_track["identity_name"] = name
                                            p_track["camera_name"] = self._get_camera_info(camera_id).get("name", camera_id)
                                            face_lbl = f"🚨 MOST WANTED: {disp_name}"
                                            p_track["face_label"] = face_lbl
                                            self.record_most_wanted_sighting(disp_name, camera_id)
                                        else:
                                            p_track["identity_status"] = status
                                            p_track["identity_name"] = name
                                            face_lbl = f"✓ {disp_name}" if status == "AUTHORIZED" else f"🚨 WATCHLIST: {disp_name}"
                                            p_track["face_label"] = face_lbl

                                        # Store in persistent track memory
                                        self.track_face_memory[(camera_id, tid)] = {
                                            "status": "UNAUTHORIZED" if is_wanted else status,
                                            "name": name,
                                            "face_label": face_lbl,
                                            "face_bbox": fd["bbox"],
                                            "is_most_wanted": is_wanted,
                                            "matched_suspect_name": disp_name if is_wanted else None,
                                            "ts": now
                                        }
                                    else:
                                        # If not matched this frame, check if previously recognized within grace window
                                        mem = self.track_face_memory.get((camera_id, tid))
                                        if mem and (now - mem.get("ts", 0)) < 2.0 and mem.get("name"):
                                            p_track["identity_status"] = mem.get("status", "AUTHORIZED")
                                            p_track["identity_name"] = mem.get("name")
                                            p_track["face_label"] = mem.get("face_label", "✓ KNOWN")
                                        else:
                                            p_track["identity_status"] = "UNRECOGNIZED"
                                            p_track["identity_name"] = None
                                            p_track["face_label"] = "FACE: UNKNOWN"
                                            self.track_face_memory.pop((camera_id, tid), None)

                    # 4. ANPR & Zone Risk Scoring & SQL Database Logging
                    if camera_id not in self.logged_sql_tracks:
                        self.logged_sql_tracks[camera_id] = set()

                    skirmish_triggered_in_frame = False

                    for track in tracked_objects:
                        tid = track.get("track_id", 0)
                        otype = track.get("object_type", "person")
                        track["camera_id"] = camera_id
                        track["camera_name"] = self._get_camera_info(camera_id).get("name", camera_id)

                        # Homography ground projection: True metric position, ground velocity (km/h), barrier distance
                        self.homography_engine.process_target_telemetry(camera_id, track, now)

                        # Multi-frame ANPR plate extraction for vehicles (run BEFORE SQL logging)
                        if otype in ["car", "truck", "bus", "vehicle", "motorcycle", "suv", "bike"]:
                            v_type = track.get("vehicle_type") or ("CAR" if otype in ["car", "vehicle"] else str(otype or "VEHICLE").upper())

                            # 1. Immediate O(1) Cache Check (zero stream latency)
                            anpr_rec = self.anpr_engine.track_plate_cache.get((camera_id, tid)) or self.anpr_engine.track_plate_cache.get(tid)

                            # 2. Check if ANPR inference should be dispatched:
                            #    - New vehicle track with no plate yet
                            #    - Existing track eligible for real-time plate upgrading (confidence < 0.95 or votes < 4)
                            key = (camera_id, tid)
                            last_sub = self._last_anpr_submit.get(key, 0.0)
                            needs_anpr = False

                            if not anpr_rec:
                                if key not in self._pending_anpr_tracks and (now - last_sub) > 1.2:
                                    needs_anpr = True
                            elif (float(anpr_rec.get("confidence", 0.0)) < 0.95 or int(anpr_rec.get("total_votes", 1)) < 4):
                                if key not in self._pending_anpr_tracks and (now - last_sub) > 0.8:
                                    needs_anpr = True

                            if needs_anpr:
                                self._pending_anpr_tracks.add(key)
                                self._last_anpr_submit[key] = now
                                bx = track.get("bbox", [0, 0, 0, 0])

                                # Crop vehicle region (prefer native 4K/1080p raw frame if available for sharp text)
                                raw_frame = self.latest_raw_frames.get(camera_id)
                                if raw_frame is not None and raw_frame.shape[1] > w:
                                    scale_up = float(raw_frame.shape[1]) / float(max(w, 1))
                                    rx1 = max(0, int(bx[0] * scale_up))
                                    ry1 = max(0, int(bx[1] * scale_up))
                                    rx2 = min(raw_frame.shape[1], int(bx[2] * scale_up))
                                    ry2 = min(raw_frame.shape[0], int(bx[3] * scale_up))
                                    veh_crop = raw_frame[ry1:ry2, rx1:rx2].copy()
                                else:
                                    x1, y1 = max(0, int(bx[0])), max(0, int(bx[1]))
                                    x2, y2 = min(w, int(bx[2])), min(h, int(bx[3]))
                                    veh_crop = frame[y1:y2, x1:x2].copy()

                                if veh_crop.size > 0 and veh_crop.shape[0] >= 15 and veh_crop.shape[1] >= 15:
                                    # Cap vehicle crop at max 1280px to prevent memory pressure while preserving bumper detail
                                    vh_c, vw_c = veh_crop.shape[:2]
                                    if max(vh_c, vw_c) > 1280:
                                        scale = 1280.0 / float(max(vh_c, vw_c))
                                        veh_crop = cv2.resize(veh_crop, (int(vw_c * scale), int(vh_c * scale)), interpolation=cv2.INTER_AREA)
                                    rel_b = [0.0, 0.0, float(veh_crop.shape[1]), float(veh_crop.shape[0])]
                                    self._anpr_executor.submit(
                                        self._async_anpr_task,
                                        veh_crop, rel_b, camera_id, tid, v_type, list(bx)
                                    )

                            if anpr_rec:
                                plate_str = anpr_rec.get("plate_number")
                                track["license_plate"] = plate_str
                                vw = track["bbox"][2] - track["bbox"][0]
                                vh = track["bbox"][3] - track["bbox"][1]
                                track["plate_bbox"] = [
                                    int(track["bbox"][0] + vw * 0.35),
                                    int(track["bbox"][1] + vh * 0.70),
                                    int(track["bbox"][0] + vw * 0.85),
                                    int(track["bbox"][1] + vh * 0.90)
                                ]
                                track["consensus_votes"] = anpr_rec.get("total_votes", 1)
                                track["plate_confidence"] = anpr_rec.get("confidence", 0.95)
                                track["plate_upgraded"] = anpr_rec.get("upgraded", False)
                                track["upgrade_count"] = anpr_rec.get("upgrade_count", 0)
                                
                                is_auth = anpr_rec.get("is_authorized", False)
                                is_wl = anpr_rec.get("is_watchlist", False)
                                wl_reason = anpr_rec.get("watchlist_reason")

                                if is_auth:
                                    track["identity_status"] = "AUTHORIZED"
                                    track["vehicle_clearance"] = "AUTHORIZED_CONVOY"
                                    track["is_watchlist_vehicle"] = False
                                    track["vehicle_label"] = f"✓ {plate_str}"
                                    wl_status = "AUTHORIZED"
                                elif is_wl:
                                    track["identity_status"] = "UNAUTHORIZED"
                                    track["is_watchlist_vehicle"] = True
                                    track["watchlist_reason"] = wl_reason or "Flagged border watchlist suspect vehicle"
                                    track["vehicle_label"] = f"🚨 SUSPECT: {plate_str}"
                                    wl_status = "SUSPECT"
                                else:
                                    track["identity_status"] = "CLEARED"
                                    track["is_watchlist_vehicle"] = False
                                    track["vehicle_clearance"] = "CLEARED"
                                    wl_status = "CLEARED"

                                # Cross-reference with Admin Enrolled Vehicles Registry
                                try:
                                    kv_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "configs", "known_vehicles.json")
                                    if os.path.exists(kv_path):
                                        with open(kv_path, "r") as f:
                                            k_vehs = json.load(f)
                                        norm_curr = re.sub(r'[^A-Z0-9]', '', plate_str.upper())
                                        for kv in k_vehs:
                                            norm_kv = re.sub(r'[^A-Z0-9]', '', kv.get("plate_number", "").upper())
                                            is_match = (norm_curr == norm_kv) or (len(norm_curr) >= 7 and len(norm_kv) >= 7 and levenshtein_similarity(norm_curr, norm_kv) >= 0.88)
                                            if is_match:
                                                if kv.get("status") == "AUTHORIZED":
                                                    track["identity_status"] = "AUTHORIZED"
                                                    track["vehicle_clearance"] = "AUTHORIZED_CONVOY"
                                                    track["is_watchlist_vehicle"] = False
                                                    track["vehicle_label"] = f"✓ {kv.get('owner_name') or plate_str}"
                                                    wl_status = "AUTHORIZED"
                                                elif kv.get("status") == "UNAUTHORIZED":
                                                    track["is_watchlist_vehicle"] = True
                                                    track["watchlist_reason"] = kv.get("notes") or "Flagged border watchlist suspect vehicle"
                                                    wl_status = "SUSPECT"
                                                    track["identity_status"] = "UNAUTHORIZED"
                                                    track["vehicle_label"] = f"🚨 SUSPECT: {plate_str}"
                                                break
                                except Exception:
                                    pass

                                # Cross-reference with Lost / Stolen Vehicles Watchlist
                                try:
                                    lv_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "configs", "lost_vehicles.json")
                                    if os.path.exists(lv_path):
                                        with open(lv_path, "r") as f:
                                            l_vehs = json.load(f)
                                        norm_curr = re.sub(r'[^A-Z0-9]', '', plate_str.upper())
                                        for lv in l_vehs:
                                            norm_lv = re.sub(r'[^A-Z0-9]', '', lv.get("plate_number", "").upper())
                                            is_match = (norm_curr == norm_lv) or (len(norm_curr) >= 7 and len(norm_lv) >= 7 and levenshtein_similarity(norm_curr, norm_lv) >= 0.88)
                                            if is_match:
                                                track["is_lost_stolen_vehicle"] = True
                                                track["vehicle_category"] = lv.get("category", "STOLEN_VEHICLE")
                                                track["vehicle_make_model"] = f"{lv.get('color', '')} {lv.get('make_model', '')}".strip()
                                                track["identity_status"] = "UNAUTHORIZED"
                                                track["is_watchlist_vehicle"] = True
                                                track["watchlist_reason"] = f"LOST / STOLEN VEHICLE: {lv.get('notes', 'Flagged hotlist vehicle')}"
                                                track["vehicle_label"] = f"🚨 HOTLIST: {plate_str}"
                                                wl_status = "SUSPECT"
                                                self.record_lost_vehicle_sighting(plate_str, camera_id)
                                                break
                                except Exception as e:
                                    logger.error(f"Error checking lost vehicle registry: {e}")

                                # Sync recognized plate to persistent database
                                db_analytics.update_vehicle_plate(
                                    camera_id=camera_id,
                                    track_id=tid,
                                    plate_number=plate_str,
                                    watchlist_status=wl_status,
                                    vehicle_type=v_type
                                )

                        # Log to SQL Analytics DB (debounced by 12s cooldown or first observation)
                        if not hasattr(self, "_track_sql_last_logged"):
                            self._track_sql_last_logged = {}
                        last_logged_time = self._track_sql_last_logged.get((camera_id, tid), 0.0)
                        can_log_sql = (now - last_logged_time) > 12.0

                        if can_log_sql:
                            if otype == "person":
                                self._track_sql_last_logged[(camera_id, tid)] = now
                                self.logged_sql_tracks[camera_id].add(tid)
                                demo_gender = "MALE" if (tid % 3 != 0) else "FEMALE"
                                db_analytics.log_person(
                                    camera_id=camera_id,
                                    track_id=tid,
                                    gender=demo_gender,
                                    confidence=track.get("confidence", 0.88),
                                    dwell_time_sec=track.get("dwell_time", 0.0)
                                )
                            elif otype in ["car", "truck", "bus", "vehicle", "motorcycle", "suv", "bicycle", "bike", "cycle"]:
                                resolved_plate = track.get("license_plate")
                                # Only record in ANPR audit registry once a genuine plate is recognized
                                if resolved_plate:
                                    self._track_sql_last_logged[(camera_id, tid)] = now
                                    self.logged_sql_tracks[camera_id].add(tid)
                                    v_type = track.get("vehicle_type") or ("CAR" if otype in ["car", "vehicle"] else str(otype or "VEHICLE").upper())
                                    spd = track.get("ground_speed_kmh", 35.0)
                                    status_now = track.get("identity_status", "CLEARED")
                                    plate_conf = float(track.get("plate_confidence") or 0.95)
                                    db_analytics.log_vehicle(
                                        camera_id=camera_id,
                                        track_id=tid,
                                        vehicle_type=v_type,
                                        plate_number=resolved_plate,
                                        confidence=plate_conf,
                                        speed_kmh=spd,
                                        watchlist_status="SUSPECT" if (status_now == "UNAUTHORIZED" or track.get("is_watchlist_vehicle", False)) else ("AUTHORIZED" if status_now == "AUTHORIZED" else "CLEARED")
                                    )

                        bbox = track.get("bbox", [0, 0, 0, 0])
                        curr_centroid = track["centroid"]
                        footpoint = ((bbox[0] + bbox[2]) / 2.0, float(bbox[3]))
                        trajectory = track["trajectory"]

                        matched_zones = self.zone_engine.check_point_in_zones(
                            curr_centroid, camera_id, frame_size=frame_size, footpoint=footpoint, bbox=bbox,
                            ground_metric=track.get("ground_metric")
                        )
                        track["current_zones"] = [z["name"] for z in matched_zones]

                        crossed_fences = []
                        if len(trajectory) >= 2:
                            p_prev = (trajectory[-2][0], trajectory[-2][1])
                            p_curr = (curr_centroid[0], curr_centroid[1])
                            crossed_fences = self.zone_engine.check_fence_crossing(
                                p_prev, p_curr, camera_id, frame_size=frame_size, footpoint=footpoint, bbox=bbox
                            )
                        else:
                            crossed_fences = self.zone_engine.check_fence_crossing(
                                curr_centroid, curr_centroid, camera_id, frame_size=frame_size, footpoint=footpoint, bbox=bbox
                            )

                        track["heading_deg"] = self.context_engine.calculate_heading(trajectory)

                        # Feature Extraction & Real-Time Risk
                        features = self.feature_extractor.extract_features(track, matched_zones, crossed_fences, day_night)
                        if scene_anomaly and scene_anomaly.get("anomaly_detected", False):
                            features["scene_kinetic_anomaly"] = True
                            t_speed = float(features.get("avg_speed_mps", 1.0))
                            if t_speed >= 1.6:
                                features["ml_anomaly_score"] = max(features.get("ml_anomaly_score", 0.0), float(scene_anomaly.get("anomaly_score", 0.0)))
                                if float(scene_anomaly.get("anomaly_score", 0.0)) >= 75.0:
                                    features["ml_threat_category"] = "CRITICAL"

                        # Tactical Skirmish & Fight Detection Trigger
                        if fight_info.get("is_fight", False) and (not fight_info.get("persons") or track.get("track_id") in fight_info.get("persons", [])):
                            features["is_fight_detected"] = True
                            features["fight_reason"] = fight_info.get("reason")
                            features["ml_threat_category"] = "CRITICAL"
                            features["ml_anomaly_score"] = 92.0
                            track["is_in_fight"] = True

                        if track.get("is_watchlist_vehicle", False):
                            features["anpr_watchlist_hit"] = True

                        wildlife_classes = {"cow", "sheep", "horse", "dog", "cat", "bird", "animal", "wildlife", "elephant", "bear"}
                        is_wildlife = otype.lower() in wildlife_classes
                        if is_wildlife:
                            features["is_wildlife"] = True

                        risk_res = self.risk_engine.compute_risk(features, object_type=track["object_type"])
                        track["risk_score"] = risk_res["score"]
                        track["severity"] = risk_res["severity"]
                        track["risk_reasons"] = risk_res["reasons"]
                        track["behavior_category"] = "VIOLENT_SKIRMISH" if features.get("is_fight_detected") else features.get("ml_threat_category", "NORMAL")
                        track["behavior_confidence"] = features.get("ml_confidence", 0.0)
                        track["is_loitering"] = features.get("is_loitering", False)
                        track["speed_mps"] = features.get("avg_speed_mps", 1.0)
                        track["duration_sec"] = track.get("dwell_time", track.get("duration_sec", 0.0))

                        # Demo 1 Enforcement: Normal Traffic -> Suppression (DETECTION ≠ INCIDENT)
                        if self.demo_1_active and camera_id in ["CAM-07", "CAM-01", "CAM-03"]:
                            track["demo_1_mode"] = True
                            track["risk_score"] = 0
                            track["severity"] = "INFO"
                            track["behavior_category"] = "NORMAL"
                            track["risk_reasons"] = ["Routine activity (DETECTION ≠ INCIDENT)"]
                            rule_triggers = []

                            if camera_id == "CAM-07":
                                v_type = str(track.get("vehicle_type", "") or track.get("raw_class", "")).upper()
                                if "TRUCK" in v_type or otype == "truck":
                                    track["track_id"] = "V-13"
                                    track["vehicle_type"] = "TRUCK"
                                    track["confidence"] = 0.94
                                else:
                                    track["track_id"] = "V-12"
                                    track["vehicle_type"] = "CAR"
                                    track["confidence"] = 0.96
                                self.demo_1_stats["cam07_vehicles"] = max(self.demo_1_stats.get("cam07_vehicles", 2), 2)
                            elif camera_id == "CAM-01":
                                track["object_type"] = "environmental"
                                track["raw_class"] = "cattle"
                                self.demo_1_stats["cam01_environmental"] = max(self.demo_1_stats.get("cam01_environmental", 1), 1)
                            elif camera_id == "CAM-03":
                                track["track_id"] = "P-03"
                                track["identity_status"] = "AUTHORIZED"
                                track["identity_name"] = "AUTHORIZED PATROL"
                                self.demo_1_stats["cam03_patrol"] = max(self.demo_1_stats.get("cam03_patrol", 1), 1)

                            self.demo_1_stats["total_detections"] = (
                                self.demo_1_stats.get("cam07_vehicles", 2) +
                                self.demo_1_stats.get("cam01_environmental", 1) +
                                self.demo_1_stats.get("cam03_patrol", 1)
                            )
                            self.demo_1_stats["suppressed_routine"] = self.demo_1_stats["total_detections"]

                        # Alert Generation Rules (SIH PS 26187 Multi-Tier Policies)
                        is_authorized_friendly = (track.get("identity_status") == "AUTHORIZED")
                        is_confirmed_track = (len(trajectory) >= 3) or track.get("is_watchlist_vehicle", False) or track.get("is_most_wanted", False) or track.get("is_lost_stolen_vehicle", False) or features.get("is_fight_detected", False)

                        # Evaluate security violation triggers via RuleEngine (applies P1 Critical, P2 High, P3 Suppression)
                        rule_triggers = self.rule_engine.evaluate(track, matched_zones, crossed_fences, day_night) if not (self.demo_1_active and camera_id in ["CAM-07", "CAM-01", "CAM-03"]) else []

                        if is_playing and is_confirmed_track and rule_triggers and not is_authorized_friendly and not is_wildlife and not (self.demo_1_active and camera_id in ["CAM-07", "CAM-01", "CAM-03"]):
                            primary_rule = rule_triggers[0]
                            # Frame-level de-duplication: one trigger per frame for camera violent clash
                            if primary_rule["event_type"] == "VIOLENT_SKIRMISH":
                                if skirmish_triggered_in_frame:
                                    continue
                                skirmish_triggered_in_frame = True

                            trigger = {
                                "event_type": primary_rule["event_type"],
                                "severity": primary_rule["severity"],
                                "risk_score": max(primary_rule.get("risk_score", 50), risk_res["score"]),
                                "reasons": primary_rule.get("reasons", risk_res["reasons"]),
                                "zone_id": primary_rule.get("zone_id") or (matched_zones[0]["zone_id"] if matched_zones else None),
                                "fence_id": primary_rule.get("fence_id") or (crossed_fences[0]["fence_id"] if crossed_fences else None),
                                "license_plate": track.get("license_plate")
                            }

                            sec_evt = self.event_engine.process_trigger(trigger, track, frame, camera_id)
                            snapshot_file = sec_evt["snapshot"] if sec_evt else None

                            self.incident_manager.update_incident(
                                camera_id=camera_id,
                                track=track,
                                risk_result=risk_res,
                                event_type=trigger["event_type"],
                                snapshot_filename=snapshot_file
                            )
                            self.multi_cam_correlator.register_sighting(camera_id, track, risk_res["score"])

                    # Detect tactical tailgating / anti-passback proximity
                    tailgate_alerts = self.homography_engine.detect_tailgating_convoys(camera_id, tracked_objects)
                    for tg in tailgate_alerts:
                        for t in tracked_objects:
                            if t.get("track_id") == tg["trail_track_id"]:
                                t["is_tailgating"] = True
                                t["tailgating_gap_m"] = tg["gap_meters"]

                    # 5. Virtual Zones & Clean HUD Annotations (Simple, Uncluttered)
                    annotated = self.zone_engine.render_zones(frame, camera_id)

                    instant_fps = 1.0 / max(now - last_time, 0.001)
                    fps = 0.9 * fps + 0.1 * instant_fps
                    last_time = now

                    status_label = "LIVE RUNNING" if is_playing else "STANDBY"
                    annotated = draw_annotations(annotated, tracked_objects, fps, camera_id, status_label)

                    cached_annotated = annotated

                    # Cache latest telemetry for real-time frontend WebSocket/polling
                    self.latest_telemetry[camera_id] = {
                        "camera_id": camera_id,
                        "timestamp": now,
                        "targets": [
                            {
                                "track_id": t.get("track_id"),
                                "object_type": t.get("object_type"),
                                "vehicle_type": t.get("vehicle_type"),
                                "license_plate": t.get("license_plate"),
                                "identity_status": t.get("identity_status"),
                                "ground_metric": t.get("ground_metric"),
                                "ground_speed_kmh": t.get("ground_speed_kmh"),
                                "distance_to_barrier_m": t.get("distance_to_barrier_m"),
                                "bev_normalized": t.get("bev_normalized"),
                                "velocity_vector_mps": t.get("velocity_vector_mps"),
                                "predicted_trajectory_m": t.get("predicted_trajectory_m"),
                                "predicted_trajectory_px": t.get("predicted_trajectory_px"),
                                "ttb_barrier_sec": t.get("ttb_barrier_sec"),
                                "is_tailgating": t.get("is_tailgating", False)
                            }
                            for t in tracked_objects
                        ]
                    }

                    # 6. High-fidelity JPEG encoding (Q=88) for crystal-clear HD video streaming
                    ret, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 88, cv2.IMWRITE_JPEG_OPTIMIZE, 0])
                    if not ret:
                        continue

                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
                except Exception as frame_err:
                    logger.error(f"Error processing frame for camera {camera_id}: {frame_err}")

                # Dynamic time-budget pacing:
                # - Recorded video files: pace at ~30 FPS with dynamic frame skipping
                # - Live camera streams (webcam / IP camera / RTSP): ZERO artificial sleep, stream immediately
                loop_duration = time.time() - now
                prev_loop_time = loop_duration
                if is_local_file:
                    target_frame_time = 0.0333  # 30 FPS target for recorded files
                    if loop_duration < target_frame_time:
                        time.sleep(target_frame_time - loop_duration)
                else:
                    # Live feed: run at true camera rate, yield minimal 1ms CPU slice
                    if loop_duration < 0.003:
                        time.sleep(0.001)

        finally:
            if file_cap:
                try:
                    file_cap.release()
                except Exception:
                    pass

camera_streamer = CameraStreamer()
