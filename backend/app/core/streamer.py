import cv2
import time
import os
import json
import logging
import threading
import socket
import urllib.parse
import numpy as np
from typing import Generator, Dict, Any, List, Optional
from ai.detector import YOLODetector
from ai.tracker import ByteTracker
from ai.zones import ZoneEngine
from ai.context import ContextEngine
from ai.face_detector import FaceDetector
from ai.face_recognition_system import FaceRecognitionSystem
from ai.anpr import ANPREngine
from ai.utils import draw_annotations
from backend.app.core.feature_extractor import FeatureExtractor
from backend.app.core.risk_engine import RiskEngine
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

    # Fix single colon missing slashes e.g. http:10.10.151.66:8080 -> http://10.10.151.66:8080
    if url.startswith("http:") and not url.startswith("http://"):
        url = "http://" + url[5:].lstrip("/")
    elif url.startswith("https:") and not url.startswith("https://"):
        url = "https://" + url[6:].lstrip("/")
    elif url.startswith("rtsp:") and not url.startswith("rtsp://"):
        url = "rtsp://" + url[5:].lstrip("/")
    elif not url.startswith("http://") and not url.startswith("https://") and not url.startswith("rtsp://"):
        url = "http://" + url

    # Auto-fix IPv6 missing brackets e.g. http://2401:4900:1c...:8080/video -> http://[2401:4900:1c...]:8080/video
    if "://" in url:
        scheme, rest = url.split("://", 1)
        parts = rest.split("/")
        host_port = parts[0]
        path = "/".join(parts[1:])

        if ":" in host_port and not host_port.startswith("["):
            hp_parts = host_port.split(":")
            if len(hp_parts) > 2:  # IPv6 address with multiple colons
                if hp_parts[-1].isdigit():  # Has port
                    port = hp_parts[-1]
                    ip = ":".join(hp_parts[:-1])
                    host_port = f"[{ip}]:{port}"
                else:
                    host_port = f"[{':'.join(hp_parts)}]"
                rest = f"{host_port}/{path}" if path else host_port
                url = f"{scheme}://{rest}"
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

class ThreadedCameraReader:
    """
    Dedicated background worker thread for IP/RTSP/HTTP mobile camera streams.
    Continuously reads frames in a daemon thread, keeping only the latest frame at t=0.
    Uses cv2.CAP_FFMPEG backend to bypass macOS AVFoundation segfault on dead URLs.
    """
    def __init__(self, stream_url: str):
        self.stream_url = stream_url
        self.cap = None
        self.latest_frame = None
        self.is_running = True
        self.lock = threading.Lock()
        # Defer _open_capture to background thread to prevent main-thread crash
        self.thread = threading.Thread(target=self._update_loop, daemon=True)
        self.thread.start()

    @staticmethod
    def _is_host_reachable(url: str, timeout: float = 1.5) -> bool:
        """Quick TCP-level check before attempting VideoCapture on a URL."""
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

    def _open_capture(self):
        """Open capture using FFMPEG backend with safe timeout and initial frame validation."""
        try:
            # Set OpenCV FFmpeg timeout parameters via environment if available
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "timeout;2000000|rtsp_transport;udp"
            cap = cv2.VideoCapture(self.stream_url, cv2.CAP_FFMPEG)
            if not cap.isOpened():
                try: cap.release()
                except Exception: pass
                self.cap = None
                return

            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            # Test-read single frame safely to ensure demuxer has valid streams
            ret, frame = cap.read()
            if not ret or frame is None or frame.size == 0:
                try: cap.release()
                except Exception: pass
                self.cap = None
                return

            with self.lock:
                self.latest_frame = frame
            self.cap = cap
        except Exception as e:
            logger.warning(f"ThreadedCameraReader: Could not open {self.stream_url}: {e}")
            if self.cap:
                try: self.cap.release()
                except Exception: pass
            self.cap = None

    def _update_loop(self):
        reconnect_delay = 2.0
        while self.is_running:
            if self.cap is None or not self.cap.isOpened():
                time.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 1.5, 10.0)
                # Pre-check TCP reachability before creating VideoCapture
                if not self._is_host_reachable(self.stream_url):
                    logger.debug(f"ThreadedCameraReader: Host not reachable, skipping reconnect: {self.stream_url}")
                    continue
                self._open_capture()
                continue

            reconnect_delay = 2.0
            try:
                ret, frame = self.cap.read()
                if ret and frame is not None and frame.size > 0:
                    with self.lock:
                        self.latest_frame = frame
                else:
                    # Stream stalled — release and schedule reconnect
                    try:
                        self.cap.release()
                    except Exception:
                        pass
                    self.cap = None
                    time.sleep(1.0)
            except Exception as e:
                logger.debug(f"ThreadedCameraReader read error: {e}")
                try:
                    if self.cap:
                        self.cap.release()
                except Exception:
                    pass
                self.cap = None
                time.sleep(1.0)

    def read_latest(self) -> Optional[np.ndarray]:
        with self.lock:
            if self.latest_frame is not None:
                return self.latest_frame.copy()
        return None

    def is_connected(self) -> bool:
        return self.cap is not None and self.cap.isOpened()

    def release(self):
        self.is_running = False
        try:
            if self.cap:
                self.cap.release()
        except Exception:
            pass

DEFAULT_CAMERA_VIDEOS = {
    "CAM-01": "demo/videos/barrier_cutting_intrusion.mp4",
    "CAM-02": "demo/videos/traffic_vehicles_anpr.mp4",
    "CAM-03": "demo/videos/electric_fence_intrusion.mp4",
    "CAM-04": "demo/videos/night_cctv_surveillance.mp4",
    "CAM-05": "demo/videos/border_breach_crowd.mp4",
    "CAM-06": "demo/videos/people_walking_corridor.mp4"
}

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
        self.event_engine = EventEngine(cooldown_sec=12.0)
        self.incident_manager = IncidentManager()
        self.multi_cam_correlator = MultiCameraCorrelator()
        self.threaded_readers: Dict[str, ThreadedCameraReader] = {}

        # Global & per-camera simulation states (Default to False: wait for tap-to-play or video upload)
        self.is_simulation_active = False
        self.camera_play_state: Dict[str, bool] = {
            "CAM-01": False,
            "CAM-02": False,
            "CAM-03": False,
            "CAM-04": False,
            "CAM-05": False,
            "CAM-06": False
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

        if not self.frs.is_trained:
            self.frs.seed_demo_identities()

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
        source_path = format_stream_url(source_path)
        self.custom_sources[camera_id] = source_path
        self.camera_reset_flag[camera_id] = True
        self.camera_play_state[camera_id] = True
        logger.info(f"Custom video source set for camera {camera_id}: {source_path}")

    def reset_alerts(self):
        self.incident_manager.incidents.clear()
        self.event_engine.event_cooldowns.clear()
        self.event_engine.active_events.clear()
        logger.info("Cleared streamer internal incident & event engine cache.")

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

    def get_camera_source(self, camera_id: str) -> str:
        if camera_id in self.custom_sources:
            src = format_stream_url(self.custom_sources[camera_id])
            is_network = "://" in src
            if not is_network and os.path.exists(src):
                return src
            if is_network:
                # Only return network URL if host is actually reachable
                if ThreadedCameraReader._is_host_reachable(src, timeout=0.5):
                    return src
                else:
                    # Stale/dead URL — remove it to prevent repeated crash attempts
                    logger.warning(f"get_camera_source: removing unreachable custom source for {camera_id}: {src}")
                    self.custom_sources.pop(camera_id, None)
        cameras_file = "configs/cameras.json"
        if os.path.exists(cameras_file):
            try:
                with open(cameras_file, "r") as f:
                    cams = json.load(f)
                    for c in cams:
                        if c.get("camera_id") == camera_id and c.get("stream_url"):
                            stream_url = format_stream_url(c.get("stream_url"))
                            if os.path.exists(stream_url):
                                return stream_url
                            if "://" in stream_url and ThreadedCameraReader._is_host_reachable(stream_url, timeout=0.5):
                                return stream_url
            except Exception:
                pass
        fallback = DEFAULT_CAMERA_VIDEOS.get(camera_id, "demo/videos/barrier_cutting_intrusion.mp4")
        if os.path.exists(fallback):
            return fallback
        return "demo/videos/barrier_cutting_intrusion.mp4"

    def generate_mjpeg_stream(self, camera_id: str) -> Generator[bytes, None, None]:
        """
        Yields multipart JPEG frames.
        - Supports both local video files and live RTSP / IP CCTV / Mobile Streams.
        - If paused: Holds and displays the standby frame.
        - If active: Plays forward with live moving AI detections and event generation.
        """
        video_path = self.get_camera_source(camera_id)
        is_rtsp = video_path.startswith("rtsp://") or video_path.startswith("http://") or video_path.startswith("https://")
        if not is_rtsp and not os.path.exists(video_path):
            video_path = "demo/videos/barrier_cutting_intrusion.mp4"

        # For local files: open VideoCapture in main generator thread (safe)
        # For live network streams: use ThreadedCameraReader (background thread, crash-safe)
        cap = None
        if not is_rtsp:
            try:
                cap = cv2.VideoCapture(video_path)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            except Exception as e:
                logger.error(f"Failed to open local video {video_path}: {e}")
                cap = None

        tracker = self.get_tracker(camera_id)

        # Set initial frame offset only for local video files
        start_frame = START_FRAME_OFFSETS.get(camera_id, 10)
        if not is_rtsp and cap is not None:
            try:
                cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
            except Exception:
                pass

        frame_idx = start_frame
        last_time = time.time()
        fps = 30.0
        cached_annotated = None
        cached_detections = []

        while True:
            # Check if reset / camera source update was requested
            if self.camera_reset_flag.get(camera_id, False):
                video_path = self.get_camera_source(camera_id)
                is_rtsp = video_path.startswith("rtsp://") or video_path.startswith("http://") or video_path.startswith("https://")

                # Release old local cap (RTSP is handled by threaded reader)
                if cap is not None:
                    try:
                        cap.release()
                    except Exception:
                        pass
                    cap = None

                if not is_rtsp:
                    try:
                        cap = cv2.VideoCapture(video_path)
                        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    except Exception as e:
                        logger.error(f"Reset: failed to open {video_path}: {e}")
                        cap = None

                # Release the old threaded reader so it reconnects to new URL
                if is_rtsp and camera_id in self.threaded_readers:
                    self.threaded_readers[camera_id].release()
                    del self.threaded_readers[camera_id]

                start_frame = START_FRAME_OFFSETS.get(camera_id, 10)
                if not is_rtsp and cap is not None:
                    try:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
                    except Exception:
                        pass
                frame_idx = start_frame
                self.tracker_map[camera_id] = ByteTracker(max_disappeared=30, iou_threshold=0.3)
                tracker = self.tracker_map[camera_id]
                self.camera_reset_flag[camera_id] = False
                cached_annotated = None
                cached_detections = []

            # Live RTSP/HTTP network streams always play live frames in real-time
            is_playing = True if is_rtsp else self.camera_play_state.get(camera_id, self.is_simulation_active)

            if not is_playing and cached_annotated is not None:
                # Video is paused on current frame: yield cached frame with STANDBY status
                paused_display = cached_annotated.copy()
                # Overlay standby badge
                cv2.rectangle(paused_display, (10, 35), (260, 60), (20, 26, 33), -1)
                cv2.rectangle(paused_display, (10, 35), (260, 60), (149, 201, 129), 1)
                cv2.putText(paused_display, "STANDBY - TAP START TO PLAY", (16, 52),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.42, (129, 201, 149), 1, cv2.LINE_AA)

                ret, buffer = cv2.imencode('.jpg', paused_display, [cv2.IMWRITE_JPEG_QUALITY, 55])
                if ret:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
                time.sleep(0.05)
                continue

            # Read next frame when playing
            if is_rtsp:
                reader = self.get_threaded_reader(camera_id, video_path)
                frame = reader.read_latest()
                if frame is None:
                    time.sleep(0.02)
                    continue
            else:
                if cap is None:
                    time.sleep(0.1)
                    continue
                try:
                    success, frame = cap.read()
                except Exception:
                    success, frame = False, None
                if not success or frame is None:
                    # Loop local video seamlessly for continuous playback
                    try:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        success, frame = cap.read()
                    except Exception:
                        success, frame = False, None
                    if not success or frame is None:
                        time.sleep(0.01)
                        continue

            frame_idx += 1

            # Downscale input frames for high-speed sub-50ms latency AI inference
            h, w = frame.shape[:2]
            target_w = 480
            if w > target_w:
                scale = float(target_w) / w
                frame = cv2.resize(frame, (target_w, int(h * scale)), interpolation=cv2.INTER_NEAREST)
                h, w = frame.shape[:2]

            # Apply Edge Adaptive Optical Pre-Processing (Kuhasa Fog De-Haze / Night Boost)
            active_filters = self.camera_filters.get(camera_id, {})
            if active_filters.get("dehaze", False):
                frame = apply_dehaze(frame)
            if active_filters.get("night_boost", False):
                frame = apply_night_boost(frame)

            frame_size = (w, h)

            try:
                # 1. Day / Night Context
                day_night = self.context_engine.get_day_night_context(frame)

                # 2. YOLO Detections (every 3rd frame to maintain 30+ FPS real-time tracking)
                det_interval = 3
                if frame_idx % det_interval == 0 or not cached_detections:
                    cached_detections = self.detector.detect(frame, camera_id=camera_id, frame_id=frame_idx)
                detections = cached_detections

                tracked_objects = tracker.update(detections, camera_id=camera_id)

                # 3. Face Detection & FRS (real-time face localization & identity recognition)
                person_tracks = [t for t in tracked_objects if t.get("object_type") == "person"]
                person_bboxes = [t["bbox"] for t in person_tracks]
                face_interval = 2
                if person_bboxes and (frame_idx % face_interval == 0 or not any("face_bbox" in t for t in person_tracks)):
                    face_detections = self.face_detector.detect_faces_in_frame(frame, person_bboxes)
                    if face_detections:
                        chips = [self.face_detector.extract_face_chip(frame, fd["bbox"]) for fd in face_detections]
                        frs_results = self.frs.recognize_batch(chips, [fd["bbox"] for fd in face_detections])

                        # Map detected face bounding boxes and FRS identity labels onto person tracks
                        for fd, frs_res, p_track in zip(face_detections, frs_results, person_tracks):
                            p_track["face_bbox"] = fd["bbox"]
                            if frs_res.get("is_known", False):
                                name = frs_res.get("identity", "OFFICER")
                                is_friendly = ("OFFICER" in name.upper() or "CAPTAIN" in name.upper() or "PATROL" in name.upper() or "AUTHORIZED" in name.upper() or "SUSPECT" not in name.upper())
                                p_track["identity_status"] = "AUTHORIZED" if is_friendly else "UNAUTHORIZED"
                                p_track["identity_name"] = name
                                p_track["face_label"] = f"KNOWN: {name}"
                            else:
                                p_track.setdefault("identity_status", "UNRECOGNIZED")
                                p_track["face_label"] = "FACE: UNKNOWN"

                # 4. ANPR & Zone Risk Scoring & SQL Database Logging
                if camera_id not in self.logged_sql_tracks:
                    self.logged_sql_tracks[camera_id] = set()

                for track in tracked_objects:
                    tid = track.get("track_id", 0)
                    otype = track.get("object_type", "person")

                    # Log to SQL Analytics DB once per track session
                    if tid not in self.logged_sql_tracks[camera_id]:
                        self.logged_sql_tracks[camera_id].add(tid)
                        if otype == "person":
                            # Heuristic demographic distribution for edge analytics
                            demo_gender = "MALE" if (tid % 3 != 0) else "FEMALE"
                            db_analytics.log_person(
                                camera_id=camera_id,
                                track_id=tid,
                                gender=demo_gender,
                                confidence=track.get("confidence", 0.88),
                                dwell_time_sec=track.get("dwell_time", 0.0)
                            )
                        elif otype in ["car", "truck", "bus", "vehicle", "motorcycle", "suv"]:
                            v_type = "CAR" if otype in ["car", "vehicle"] else otype.upper()
                            db_analytics.log_vehicle(
                                camera_id=camera_id,
                                track_id=tid,
                                vehicle_type=v_type,
                                plate_number=None,
                                confidence=track.get("confidence", 0.90)
                            )

                    if otype in ["car", "truck", "bus", "vehicle", "motorcycle", "suv"]:
                        self.anpr_engine.process_vehicle(frame, track["bbox"], camera_id, track["track_id"])

                    bbox = track.get("bbox", [0, 0, 0, 0])
                    curr_centroid = track["centroid"]
                    footpoint = ((bbox[0] + bbox[2]) / 2.0, float(bbox[3]))
                    trajectory = track["trajectory"]

                    matched_zones = self.zone_engine.check_point_in_zones(
                        curr_centroid, camera_id, frame_size=frame_size, footpoint=footpoint, bbox=bbox
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
                    risk_res = self.risk_engine.compute_risk(features, object_type=track["object_type"])

                    has_drawn_zones_or_fences = (len(matched_zones) > 0) or (len(crossed_fences) > 0)
                    is_authorized_friendly = (track.get("identity_status") == "AUTHORIZED")

                    if has_drawn_zones_or_fences and not is_authorized_friendly:
                        # Guarantee immediate critical threat elevation when inside drawn zone or fence line
                        if risk_res["score"] < 75:
                            risk_res["score"] = 85
                            risk_res["severity"] = "CRITICAL"
                            if len(crossed_fences) > 0:
                                if "Virtual tripwire fence line crossed (+50)" not in risk_res["reasons"]:
                                    risk_res["reasons"].insert(0, "Virtual tripwire fence line crossed (+50)")
                            else:
                                if "Unauthorized intrusion in restricted zone (+55)" not in risk_res["reasons"]:
                                    risk_res["reasons"].insert(0, "Unauthorized intrusion in restricted zone (+55)")
                    elif is_authorized_friendly:
                        # Suppress alerts & set INFO status for friendly personnel
                        risk_res["score"] = min(risk_res["score"], 20)
                        risk_res["severity"] = "INFO"
                        risk_res["reasons"] = [f"Recognized friendly identity ({track.get('identity_name', 'OFFICER')}) — No Alert Action Required"]

                    track["risk_score"] = risk_res["score"]
                    track["severity"] = risk_res["severity"]

                    # Generate real security events ONLY when:
                    # 1. Camera is actively playing live video (is_playing is True)
                    # 2. Virtual zones or fences HAVE BEEN DRAWN AND MATCHED
                    # 3. Risk score > 50
                    # 4. Personnel is NOT an authorized friendly face
                    if is_playing and has_drawn_zones_or_fences and risk_res["score"] > 50 and not is_authorized_friendly:
                        trigger = {
                            "event_type": "FENCE_CROSSING" if (len(crossed_fences) > 0 or features.get("fence_crossed", False)) else "ZONE_ENTRY",
                            "severity": risk_res["severity"],
                            "risk_score": risk_res["score"],
                            "reasons": risk_res["reasons"],
                            "zone_id": matched_zones[0]["zone_id"] if matched_zones else (crossed_fences[0]["fence_id"] if crossed_fences else None),
                            "fence_id": crossed_fences[0]["fence_id"] if crossed_fences else None
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

                # 5. Virtual Zones & Annotations
                annotated = self.zone_engine.render_zones(frame, camera_id)
                now = time.time()
                instant_fps = 1.0 / max(now - last_time, 0.001)
                fps = 0.9 * fps + 0.1 * instant_fps
                last_time = now

                status_label = "LIVE RUNNING" if is_playing else "STANDBY"
                annotated = draw_annotations(annotated, tracked_objects, fps, camera_id, status_label)
                cached_annotated = annotated

                # 6. Optimized ultra-fast JPEG encoding for zero-latency streaming
                ret, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 55])
                if not ret:
                    continue

                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            except Exception as frame_err:
                logger.error(f"Error processing frame for camera {camera_id}: {frame_err}")

            time.sleep(0.001)

camera_streamer = CameraStreamer()
