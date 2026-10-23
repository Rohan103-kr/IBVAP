import cv2
import threading
import time
import os
from datetime import datetime
from typing import Dict, List, Optional, Any
import numpy as np

from ai.detector import PersonFaceDetector
from ai.reid import FeatureExtractor
from ai.tracker import SingleCameraTracker
from ai.global_tracker import CrossCameraGlobalTracker
from backend.config import (
    YOLO_MODEL_PATH,
    DETECTION_CONF_THRESHOLD,
    REID_SIMILARITY_THRESHOLD,
    FACE_MATCH_THRESHOLD,
    INACTIVITY_TIMEOUT_SECONDS,
    DEFAULT_CAMERAS,
    JPEG_QUALITY
)


def draw_tech_bounding_box(img, pt1, pt2, color, thickness=2, corner_len=14):
    x1, y1 = pt1
    x2, y2 = pt2

    # Draw semi-transparent rectangle
    overlay = img.copy()
    cv2.rectangle(overlay, (x1, y1), (x2, y2), color, 1)
    cv2.addWeighted(overlay, 0.25, img, 0.75, 0, img)

    # Main box
    cv2.rectangle(img, (x1, y1), (x2, y2), color, 1)

    # High-tech corners
    # Top-Left
    cv2.line(img, (x1, y1), (x1 + corner_len, y1), color, thickness + 1)
    cv2.line(img, (x1, y1), (x1, y1 + corner_len), color, thickness + 1)
    # Top-Right
    cv2.line(img, (x2, y1), (x2 - corner_len, y1), color, thickness + 1)
    cv2.line(img, (x2, y1), (x2, y1 + corner_len), color, thickness + 1)
    # Bottom-Left
    cv2.line(img, (x1, y2), (x1 + corner_len, y2), color, thickness + 1)
    cv2.line(img, (x1, y2), (x1, y2 - corner_len), color, thickness + 1)
    # Bottom-Right
    cv2.line(img, (x2, y2), (x2 - corner_len, y2), color, thickness + 1)
    cv2.line(img, (x2, y2), (x2, y2 - corner_len), color, thickness + 1)


class CameraStreamWorker:
    def __init__(
        self,
        camera_id: str,
        camera_name: str,
        source: str,
        location: str,
        detector: PersonFaceDetector,
        extractor: FeatureExtractor,
        global_tracker: CrossCameraGlobalTracker
    ):
        self.camera_id = camera_id
        self.camera_name = camera_name
        self.source = source
        self.location = location
        self.detector = detector
        self.extractor = extractor
        self.global_tracker = global_tracker
        self.local_tracker = SingleCameraTracker(camera_id)

        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.lock = threading.Lock()
        
        self.latest_jpeg: Optional[bytes] = None
        self.latest_results: List[Dict[str, Any]] = []
        self.fps = 0.0
        self.frame_count = 0
        self.is_connected = False

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2.0)

    def _open_capture(self):
        # Check if source is integer (e.g. webcam "0")
        src = self.source
        if isinstance(src, str) and src.isdigit():
            src = int(src)
        cap = cv2.VideoCapture(src)
        if not cap.isOpened():
            return None
        return cap

    def _run_loop(self):
        cap = self._open_capture()
        if cap is None:
            print(f"[{self.camera_name}] Warning: Failed to open source {self.source}")
            self.is_connected = False
        else:
            self.is_connected = True

        last_time = time.time()
        fps_counter = 0

        while self.running:
            if cap is None or not cap.isOpened():
                time.sleep(1.0)
                cap = self._open_capture()
                continue

            ret, frame = cap.read()
            if not ret:
                # If video file reached EOF, restart for continuous monitoring loop
                if isinstance(self.source, str) and not str(self.source).isdigit() and not str(self.source).startswith("rtsp://"):
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    time.sleep(0.05)
                    continue
                else:
                    time.sleep(0.5)
                    continue

            # Resize frames to standard widescreen (854x480) for high-performance processing
            h, w = frame.shape[:2]
            target_w = 854
            target_h = int(h * (target_w / w)) if w > 0 else 480
            frame_resized = cv2.resize(frame, (target_w, target_h))

            # 1. Run Person and Face Detector
            dets = self.detector.detect(frame_resized)

            # 2. Run Local Camera Tracker
            active_local = self.local_tracker.update(dets, self.extractor)

            # 3. Run Global Cross-Camera ReID Fusion
            global_results = self.global_tracker.process_camera_tracks(
                camera_id=self.camera_id,
                camera_name=self.camera_name,
                active_tracks=active_local
            )

            # 4. Render HUD Annotations
            annotated = frame_resized.copy()
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # Header info bar
            cv2.rectangle(annotated, (0, 0), (target_w, 38), (15, 17, 23), -1)
            cv2.line(annotated, (0, 38), (target_w, 38), (56, 189, 248), 1)

            # Red REC dot
            cv2.circle(annotated, (16, 19), 6, (0, 0, 255), -1)
            cv2.putText(annotated, "REC", (28, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

            # Camera name & location
            cv2.putText(
                annotated,
                f"{self.camera_name} | {self.location}",
                (80, 24),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (240, 240, 240),
                1
            )

            # Live Stats
            status_text = f"{now_str} | ACTIVE: {len(global_results)} | FPS: {self.fps:.1f}"
            (tw, _), _ = cv2.getTextSize(status_text, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            cv2.putText(
                annotated,
                status_text,
                (target_w - tw - 12, 24),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (148, 163, 184),
                1
            )

            # Draw Detections
            for res in global_results:
                x1, y1, x2, y2 = res["bbox"]
                gid = res["global_id"]
                conf = res["confidence"]
                face_detected = res["face_detected"]

                # Neon Cyan for person body
                body_color = (255, 200, 0)  # BGR Cyan

                draw_tech_bounding_box(annotated, (x1, y1), (x2, y2), body_color, thickness=2)

                # Label tag at top of body box
                label = f"{gid} [{int(conf * 100)}%]"
                label_y = max(50, y1 - 8)
                (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
                cv2.rectangle(annotated, (x1, label_y - lh - 4), (x1 + lw + 8, label_y + 4), (15, 23, 42), -1)
                cv2.rectangle(annotated, (x1, label_y - lh - 4), (x1 + lw + 8, label_y + 4), body_color, 1)
                cv2.putText(annotated, label, (x1 + 4, label_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

                # Dwell status badge below
                status_tag = "● UNDER CCTV"
                (sw, sh), _ = cv2.getTextSize(status_tag, cv2.FONT_HERSHEY_SIMPLEX, 0.38, 1)
                cv2.rectangle(annotated, (x1, y2 + 2), (x1 + sw + 6, y2 + sh + 8), (10, 30, 20), -1)
                cv2.putText(annotated, status_tag, (x1 + 3, y2 + sh + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (52, 211, 153), 1)

                # Face Bounding Box & Label
                if face_detected and res["face_bbox"]:
                    fx1, fy1, fx2, fy2 = res["face_bbox"]
                    # Neon Violet/Magenta for Face
                    face_color = (255, 0, 200)
                    cv2.rectangle(annotated, (fx1, fy1), (fx2, fy2), face_color, 2)
                    
                    face_tag = "FACE DETECTED"
                    cv2.putText(annotated, face_tag, (fx1, max(45, fy1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.38, face_color, 1)

            # Compress to JPEG
            encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY]
            success, buffer = cv2.imencode(".jpg", annotated, encode_param)
            if success:
                with self.lock:
                    self.latest_jpeg = buffer.tobytes()
                    self.latest_results = global_results

            # Calculate FPS
            fps_counter += 1
            cur_time = time.time()
            if cur_time - last_time >= 1.0:
                self.fps = fps_counter / (cur_time - last_time)
                fps_counter = 0
                last_time = cur_time

            # Regulate frame rate to ~15-20 FPS for smooth CPU usage
            time.sleep(0.04)

        if cap:
            cap.release()
        self.is_connected = False

    def get_latest_frame(self) -> Optional[bytes]:
        with self.lock:
            return self.latest_jpeg

    def get_status(self) -> Dict[str, Any]:
        with self.lock:
            active_count = len(self.latest_results)
            person_ids = [r["global_id"] for r in self.latest_results]
        return {
            "id": self.camera_id,
            "name": self.camera_name,
            "location": self.location,
            "source": str(self.source),
            "is_connected": self.is_connected,
            "fps": round(self.fps, 1),
            "active_persons_count": active_count,
            "active_person_ids": person_ids
        }


class MultiCameraManager:
    def __init__(self):
        self.detector = PersonFaceDetector(YOLO_MODEL_PATH, conf_threshold=DETECTION_CONF_THRESHOLD)
        self.extractor = FeatureExtractor()
        self.global_tracker = CrossCameraGlobalTracker(
            feature_extractor=self.extractor,
            reid_threshold=REID_SIMILARITY_THRESHOLD,
            face_match_threshold=FACE_MATCH_THRESHOLD,
            inactivity_timeout=INACTIVITY_TIMEOUT_SECONDS
        )
        self.workers: Dict[str, CameraStreamWorker] = {}

        # Initialize default cameras
        for cam_cfg in DEFAULT_CAMERAS:
            if cam_cfg.get("enabled", True):
                self.add_camera(
                    camera_id=cam_cfg["id"],
                    camera_name=cam_cfg["name"],
                    source=cam_cfg["source"],
                    location=cam_cfg["location"]
                )

    def add_camera(self, camera_id: str, camera_name: str, source: str, location: str = "Surveillance Zone"):
        if camera_id in self.workers:
            self.workers[camera_id].stop()

        worker = CameraStreamWorker(
            camera_id=camera_id,
            camera_name=camera_name,
            source=source,
            location=location,
            detector=self.detector,
            extractor=self.extractor,
            global_tracker=self.global_tracker
        )
        self.workers[camera_id] = worker
        worker.start()

    def remove_camera(self, camera_id: str):
        if camera_id in self.workers:
            self.workers[camera_id].stop()
            del self.workers[camera_id]

    def get_cameras_info(self) -> List[Dict[str, Any]]:
        return [w.get_status() for w in self.workers.values()]

    def get_frame(self, camera_id: str) -> Optional[bytes]:
        worker = self.workers.get(camera_id)
        if worker:
            return worker.get_latest_frame()
        return None

    def stream_mjpeg(self, camera_id: str):
        worker = self.workers.get(camera_id)
        if not worker:
            return

        while True:
            frame_bytes = worker.get_latest_frame()
            if frame_bytes:
                yield (b"--frame\r\n"
                       b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")
            time.sleep(0.04)

    def shutdown(self):
        for worker in self.workers.values():
            worker.stop()
