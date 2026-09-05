import cv2
import numpy as np
import time
import math
from typing import List, Dict, Any, Tuple

class ContextEngine:
    """
    Computes spatial and temporal context metrics:
    - Day / Night context from average frame brightness or time of day
    - Heading direction (degrees)
    - Dwell / Loitering duration
    - Distance to border fence line
    """
    def __init__(self, night_threshold_brightness: float = 65.0):
        self.night_threshold_brightness = night_threshold_brightness

    def get_day_night_context(self, frame: np.ndarray) -> str:
        """Evaluate whether current video frame is DAY or NIGHT based on mean brightness."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mean_brightness = float(np.mean(gray))
        return "NIGHT" if mean_brightness < self.night_threshold_brightness else "DAY"

    def calculate_heading(self, trajectory: List[List[float]]) -> float:
        """Calculate movement heading angle in degrees (0 = East, 90 = South, 180 = West, 270 = North)."""
        if len(trajectory) < 2:
            return 0.0

        p_start = trajectory[0]
        p_end = trajectory[-1]

        dx = p_end[0] - p_start[0]
        dy = p_end[1] - p_start[1]

        if dx == 0 and dy == 0:
            return 0.0

        angle_rad = math.atan2(dy, dx)
        angle_deg = math.degrees(angle_rad) % 360.0
        return round(angle_deg, 1)

    def calculate_fence_distance(self, centroid: Tuple[float, float], fence_line: List[List[int]]) -> float:
        """Perpendicular distance from centroid to fence line segment (x1, y1)-(x2, y2)."""
        p = np.array(centroid)
        a = np.array(fence_line[0])
        b = np.array(fence_line[1])

        # Distance from point p to line segment ab
        if np.array_equal(a, b):
            return float(np.linalg.norm(p - a))

        l2 = float(np.sum((b - a) ** 2))
        t = max(0, min(1, float(np.dot(p - a, b - a) / l2)))
        projection = a + t * (b - a)
        return round(float(np.linalg.norm(p - projection)), 1)
