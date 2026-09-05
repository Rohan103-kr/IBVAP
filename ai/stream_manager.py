import cv2
import time
import os
import numpy as np
import logging
from typing import Generator, Tuple, Dict, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("StreamManager")

def generate_synthetic_cctv_video(output_path: str, duration_sec: int = 10, fps: int = 20):
    """Generate a synthetic CCTV video file for testing & offline demonstrations."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    w, h = 1280, 720
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    total_frames = duration_sec * fps
    logger.info(f"Generating synthetic CCTV video: {output_path} ({total_frames} frames)...")

    for i in range(total_frames):
        # Create dark CCTV-style security background
        frame = np.full((h, w, 3), (35, 40, 45), dtype=np.uint8)

        # Draw grid lines / timestamp overlay
        cv2.line(frame, (0, 600), (w, 600), (80, 90, 100), 2)  # Fence line
        cv2.putText(frame, f"CAM-01 [NORTH GATE BORDER] - {time.strftime('%Y-%m-%d %H:%M:%S')}", (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 220, 240), 2)

        # Draw moving person (simulated target object)
        t = i / float(total_frames)
        px = int(100 + t * (w - 300))
        py = int(450 + np.sin(t * 6) * 30)

        # Person body & head
        cv2.circle(frame, (px + 20, py - 60), 15, (120, 180, 120), -1)
        cv2.rectangle(frame, (px, py - 40), (px + 40, py + 50), (100, 160, 100), -1)

        # Draw moving vehicle
        vx = int(w - 200 - t * (w - 400))
        vy = int(620)
        cv2.rectangle(frame, (vx, vy), (vx + 140, vy + 60), (80, 120, 200), -1)
        cv2.putText(frame, "CCTV LIVE", (w - 150, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        out.write(frame)

    out.release()
    logger.info(f"Synthetic CCTV video saved: {output_path}")

class StreamManager:
    """
    Video Stream Ingestion & FPS Controller.
    Supports local video files and RTSP streams.
    Tracks stream health state: ONLINE, DEGRADED, OFFLINE.
    """
    def __init__(self, camera_id: str, stream_url: str, target_fps: int = 15):
        self.camera_id = camera_id
        self.stream_url = stream_url
        self.target_fps = target_fps
        self.cap: Optional[cv2.VideoCapture] = None
        self.status = "OFFLINE"
        self.frame_count = 0
        self.actual_fps = 0.0
        self.last_fps_calc = time.time()
        self.fps_frame_counter = 0

    def connect(self) -> bool:
        """Initialize video stream connection."""
        if not os.path.exists(self.stream_url) and not self.stream_url.startswith("rtsp://"):
            logger.info(f"Stream URL {self.stream_url} not found. Creating synthetic video...")
            generate_synthetic_cctv_video(self.stream_url)

        logger.info(f"Connecting to stream for {self.camera_id}: {self.stream_url}")
        self.cap = cv2.VideoCapture(self.stream_url)

        if self.cap and self.cap.isOpened():
            self.status = "ONLINE"
            logger.info(f"Stream {self.camera_id} connected successfully. Status: ONLINE")
            return True
        else:
            self.status = "OFFLINE"
            logger.error(f"Failed to open stream {self.camera_id}: {self.stream_url}")
            return False

    def read_frames(self, loop: bool = True) -> Generator[Tuple[np.ndarray, int, str], None, None]:
        """
        Yields (frame, frame_id, status) at target FPS rate.
        If stream drops or degraded, updates stream status.
        """
        if self.cap is None or not self.cap.isOpened():
            if not self.connect():
                return

        frame_interval = 1.0 / self.target_fps
        last_yield_time = time.time()

        while True:
            if self.cap is None or not self.cap.isOpened():
                self.status = "OFFLINE"
                break

            ret, frame = self.cap.read()

            if not ret or frame is None:
                if loop and os.path.exists(self.stream_url):
                    # Loop video file for continuous testing
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = self.cap.read()
                    if not ret or frame is None:
                        self.status = "OFFLINE"
                        break
                else:
                    self.status = "OFFLINE"
                    break

            self.frame_count += 1
            self.fps_frame_counter += 1

            # Update FPS metric every second
            now = time.time()
            elapsed = now - self.last_fps_calc
            if elapsed >= 1.0:
                self.actual_fps = self.fps_frame_counter / elapsed
                self.fps_frame_counter = 0
                self.last_fps_calc = now

                # Update stream status based on actual FPS performance
                if self.actual_fps < (self.target_fps * 0.5):
                    self.status = "DEGRADED"
                else:
                    self.status = "ONLINE"

            # Frame rate throttle to maintain target FPS
            time_since_last = now - last_yield_time
            if time_since_last < frame_interval:
                time.sleep(frame_interval - time_since_last)

            last_yield_time = time.time()
            yield frame, self.frame_count, self.status

    def release(self):
        """Close video stream."""
        if self.cap and self.cap.isOpened():
            self.cap.release()
        self.status = "OFFLINE"
        logger.info(f"Stream {self.camera_id} released.")
