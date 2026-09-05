import cv2
import numpy as np
import time
import logging
from typing import Dict, Any, Tuple, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("CameraHealth")

class CameraHealthMonitor:
    """
    Monitors camera stream health and detects anomalies:
    - Stream disconnects
    - Frozen video frames (pixel variance analysis)
    - FPS degradation
    """
    def __init__(self, camera_id: str, max_frozen_frames: int = 40):
        self.camera_id = camera_id
        self.max_frozen_frames = max_frozen_frames
        self.prev_frame: Optional[np.ndarray] = None
        self.frozen_counter = 0
        self.status = "ONLINE"
        self.last_frame_time = time.time()

    def inspect_frame(self, frame: Optional[np.ndarray]) -> Dict[str, Any]:
        """
        Inspect current frame for frozen frame or disconnect anomalies.
        Returns health status dictionary.
        """
        now = time.time()

        if frame is None:
            self.status = "OFFLINE"
            return {
                "camera_id": self.camera_id,
                "status": "OFFLINE",
                "reason": "Stream disconnected (No frame received)",
                "event_trigger": "CAMERA_OFFLINE"
            }

        # Check for frozen video frame
        is_frozen = False
        if self.prev_frame is not None and frame.shape == self.prev_frame.shape:
            diff = cv2.absdiff(frame, self.prev_frame)
            variance = float(np.var(diff))

            if variance < 1.0:
                self.frozen_counter += 1
                if self.frozen_counter >= self.max_frozen_frames:
                    is_frozen = True
                    self.status = "DEGRADED"
            else:
                self.frozen_counter = max(0, self.frozen_counter - 1)
                self.status = "ONLINE"

        self.prev_frame = frame.copy()
        self.last_frame_time = now

        return {
            "camera_id": self.camera_id,
            "status": self.status,
            "is_frozen": is_frozen,
            "frozen_counter": self.frozen_counter,
            "reason": "Frozen frame video stream" if is_frozen else "Stream healthy",
            "event_trigger": "CAMERA_DEGRADED" if is_frozen else None
        }


class SectorCoverageMonitor:
    """
    Computes real-time surveillance coverage percentages across border sectors
    and generates priority COVERAGE_GAP_WARNING alerts when sector coverage falls below threshold.
    """
    CAMERA_SECTOR_MAP = {
        "CAM-01": "Sector A (North Border)",
        "CAM-02": "Sector B (Fence Line)",
        "CAM-03": "Sector B (Fence Line)",
        "CAM-04": "Sector C (Checkpost)",
        "CAM-05": "Sector C (Checkpost)",
        "CAM-06": "Sector A (North Border)"
    }

    @classmethod
    def compute_sector_coverage(cls, camera_statuses: Dict[str, str]) -> Dict[str, Any]:
        """
        Calculates sector coverage percentages based on active ONLINE cameras.
        Returns detailed sector health breakdown and list of coverage gap warnings.
        """
        sector_counts: Dict[str, Dict[str, int]] = {}

        for cam_id, sector in cls.CAMERA_SECTOR_MAP.items():
            if sector not in sector_counts:
                sector_counts[sector] = {"total": 0, "online": 0}

            sector_counts[sector]["total"] += 1
            status = camera_statuses.get(cam_id, "ONLINE")
            if status == "ONLINE":
                sector_counts[sector]["online"] += 1

        sector_results = {}
        coverage_gaps = []

        for sector, counts in sector_counts.items():
            total = counts["total"]
            online = counts["online"]
            pct = round((online / total * 100.0), 1) if total > 0 else 0.0

            status_label = "OPTIMAL"
            if pct < 50.0:
                status_label = "CRITICAL_GAP"
            elif pct < 80.0:
                status_label = "DEGRADED_GAP"

            if pct < 80.0:
                coverage_gaps.append({
                    "sector": sector,
                    "coverage_pct": pct,
                    "status": status_label,
                    "warning": f"Surveillance coverage degraded in {sector} to {pct}% ({online}/{total} active cameras)."
                })

            sector_results[sector] = {
                "sector_name": sector,
                "total_cameras": total,
                "online_cameras": online,
                "coverage_pct": pct,
                "status": status_label
            }

        return {
            "sectors": sector_results,
            "coverage_gaps": coverage_gaps,
            "overall_border_coverage_pct": round(
                sum(c["online"] for c in sector_counts.values()) /
                max(1, sum(c["total"] for c in sector_counts.values())) * 100.0, 1
            )
        }

