import math
import json
import os
import logging
import cv2
import numpy as np
from typing import List, Dict, Any, Tuple

logger = logging.getLogger("ZoneEngine")

def point_in_polygon(point: Tuple[float, float], polygon: List[Tuple[float, float]]) -> bool:
    """Ray-casting algorithm for point-in-polygon containment test."""
    x, y = point
    n = len(polygon)
    inside = False
    p1x, p1y = polygon[0]
    for i in range(n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def line_intersects(p1: Tuple[float, float], p2: Tuple[float, float],
                    p3: Tuple[float, float], p4: Tuple[float, float]) -> bool:
    """Vector cross-product test for 2D line segment intersection."""
    def ccw(A, B, C):
        return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])
    return ccw(p1, p3, p4) != ccw(p2, p3, p4) and ccw(p1, p2, p3) != ccw(p1, p2, p4)

line_intersection = lambda l1, l2: line_intersects(l1[0], l1[1], l2[0], l2[1])

def point_to_segment_distance(pt: Tuple[float, float], p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    """Computes minimum Euclidean distance from a 2D point to a line segment."""
    px, py = pt
    x1, y1 = p1
    x2, y2 = p2
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(px - x1, py - y1)
    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return math.hypot(px - proj_x, py - proj_y)

class ZoneEngine:
    def __init__(self, config_path: str = "configs/zones.json"):
        self.config_path = config_path
        self.camera_zones: Dict[str, List[Dict[str, Any]]] = {}
        self.camera_fences: Dict[str, List[Dict[str, Any]]] = {}
        self._scaled_zone_cache: Dict[Tuple[str, Tuple[int, int]], List[Dict[str, Any]]] = {}
        self._scaled_fence_cache: Dict[Tuple[str, Tuple[int, int]], List[Dict[str, Any]]] = {}
        self.load_config()

    def load_config(self):
        """Load camera zone polygons & virtual fences from JSON config."""
        if not os.path.exists(self.config_path):
            logger.warning(f"Zone config file not found: {self.config_path}")
            return

        try:
            with open(self.config_path, "r") as f:
                data = json.load(f)
                for cam_id, config in data.items():
                    self.camera_zones[cam_id] = config.get("zones", [])
                    self.camera_fences[cam_id] = config.get("fences", [])
            self._scaled_zone_cache.clear()
            self._scaled_fence_cache.clear()
            logger.info(f"Loaded zone configurations for {len(self.camera_zones)} cameras.")
        except Exception as e:
            logger.error(f"Error loading zone config: {e}")

    def _scale_polygon(self, polygon: List[List[float]], frame_size: Tuple[int, int]) -> np.ndarray:
        """Scales polygon points from 1280x720 reference frame to target frame size."""
        w, h = frame_size
        scaled = []
        for pt in polygon:
            x, y = pt[0], pt[1]
            if x <= 1.0 and y <= 1.0:
                scaled.append([int(x * w), int(y * h)])
            else:
                scaled.append([int((x / 1280.0) * w), int((y / 720.0) * h)])
        return np.array(scaled, dtype=np.int32)

    def _get_scaled_zones(self, camera_id: str, frame_size: Tuple[int, int]) -> List[Dict[str, Any]]:
        """
        Retrieves pre-computed scaled zones with spatial Axis-Aligned Bounding Boxes (AABB).
        Eliminates per-frame polygon re-scaling and min/max scans.
        """
        cache_key = (camera_id, frame_size)
        if cache_key in self._scaled_zone_cache:
            return self._scaled_zone_cache[cache_key]

        zones = self.camera_zones.get(camera_id, [])
        scaled_list = []
        for zone in zones:
            pts = self._scale_polygon(zone.get("polygon", []), frame_size)
            if len(pts) < 3:
                continue
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            min_x, max_x = float(min(xs)), float(max(xs))
            min_y, max_y = float(min(ys)), float(max(ys))
            poly_tuples = [(float(p[0]), float(p[1])) for p in pts]
            scaled_list.append({
                "zone": zone,
                "pts": pts,
                "poly_tuples": poly_tuples,
                "bbox": (min_x, min_y, max_x, max_y)
            })

        self._scaled_zone_cache[cache_key] = scaled_list
        return scaled_list

    def _scale_line(self, line: List[List[float]], frame_size: Tuple[int, int]) -> Tuple[Tuple[float, float], Tuple[float, float]]:
        w, h = frame_size
        p1, p2 = line[0], line[1]
        x1 = (p1[0] / 1280.0) * w if p1[0] > 1.0 else p1[0] * w
        y1 = (p1[1] / 720.0) * h if p1[1] > 1.0 else p1[1] * h
        x2 = (p2[0] / 1280.0) * w if p2[0] > 1.0 else p2[0] * w
        y2 = (p2[1] / 720.0) * h if p2[1] > 1.0 else p2[1] * h
        return ((x1, y1), (x2, y2))

    def check_point_in_zones(self, point: Tuple[float, float], camera_id: str,
                             frame_size: Tuple[int, int] = (1280, 720),
                             footpoint: Tuple[float, float] = None,
                             bbox: List[float] = None,
                             ground_metric: Tuple[float, float] = None) -> List[Dict[str, Any]]:
        """
        High-performance spatial check with O(1) AABB pre-filtering and
        dual-mode metric ground plane evaluation (Euclidean meter coordinates).
        """
        matched = []
        cached_zones = self._get_scaled_zones(camera_id, frame_size)
        if not cached_zones:
            return matched

        bx1, by1, bx2, by2 = None, None, None, None
        if bbox is not None and len(bbox) >= 4:
            bx1, by1, bx2, by2 = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])

        # Priority test points: footpoint first, then centroid
        priority_points = []
        if footpoint is not None:
            priority_points.append((float(footpoint[0]), float(footpoint[1])))
        if point is not None:
            priority_points.append((float(point[0]), float(point[1])))

        for item in cached_zones:
            # 1. Primary Test: If zone has calibrated Euclidean metric_polygon and target has ground_metric
            metric_poly = item["zone"].get("metric_polygon")
            if metric_poly and len(metric_poly) >= 3 and ground_metric is not None:
                poly_tuples_m = [(float(p[0]), float(p[1])) for p in metric_poly]
                if point_in_polygon(ground_metric, poly_tuples_m):
                    matched.append(item["zone"])
                    continue

            min_x, min_y, max_x, max_y = item["bbox"]

            # $O(1)$ Fast AABB rejection: If target bbox does not overlap with zone AABB, skip immediately!
            if bx1 is not None:
                if bx2 < min_x - 5.0 or bx1 > max_x + 5.0 or by2 < min_y - 5.0 or by1 > max_y + 5.0:
                    continue
            elif priority_points:
                px, py = priority_points[0]
                if px < min_x - 5.0 or px > max_x + 5.0 or py < min_y - 5.0 or py > max_y + 5.0:
                    continue

            pts = item["pts"]
            poly_tuples = item["poly_tuples"]
            is_inside = False

            # Test primary points (footpoint / centroid)
            for pt in priority_points:
                if point_in_polygon(pt, poly_tuples):
                    is_inside = True
                    break
                try:
                    if cv2.pointPolygonTest(pts, pt, False) >= 0:
                        is_inside = True
                        break
                except Exception:
                    pass

            # Fallback to key body points only if primary points outside and bbox intersects
            if not is_inside and bx1 is not None:
                mid_x = (bx1 + bx2) * 0.5
                secondary_points = [
                    (mid_x, by2),                         # bottom center
                    (mid_x, by1 + (by2 - by1) * 0.75),   # lower body
                    (mid_x, (by1 + by2) * 0.5),          # center
                ]
                for pt in secondary_points:
                    if pt[0] < min_x - 5.0 or pt[0] > max_x + 5.0 or pt[1] < min_y - 5.0 or pt[1] > max_y + 5.0:
                        continue
                    if point_in_polygon(pt, poly_tuples):
                        is_inside = True
                        break

            if is_inside:
                matched.append(item["zone"])

        return matched

    def check_fence_crossing(self, p_prev: Tuple[float, float], p_curr: Tuple[float, float],
                             camera_id: str, frame_size: Tuple[int, int] = (1280, 720),
                             footpoint: Tuple[float, float] = None,
                             bbox: List[float] = None) -> List[Dict[str, Any]]:
        """Check if target movement trajectory line crosses or touches virtual tripwire fence line."""
        crossed = []
        fences = self.camera_fences.get(camera_id, [])
        if not fences:
            return crossed

        traj_line = (p_prev, p_curr)

        # Collect target points for proximity / contact check
        check_points = [p_curr]
        if footpoint is not None:
            check_points.append(footpoint)
        if bbox is not None and len(bbox) >= 4:
            x1, y1, x2, y2 = bbox
            mid_x = (x1 + x2) / 2.0
            check_points.append((mid_x, y2))
            check_points.append((mid_x, (y1 + y2) / 2.0))

        for fence in fences:
            f1, f2 = self._scale_line(fence.get("line", [[0, 0], [0, 0]]), frame_size)
            fence_line = (f1, f2)

            # 1. Line segment intersection with movement trajectory
            if line_intersects(traj_line[0], traj_line[1], fence_line[0], fence_line[1]):
                crossed.append(fence)
                continue

            # 2. Proximity / touch check (within 20px threshold of the fence line)
            is_touching = False
            for cp in check_points:
                dist = point_to_segment_distance(cp, f1, f2)
                if dist <= 20.0:
                    is_touching = True
                    break

            if is_touching:
                crossed.append(fence)

        return crossed

    def render_zones(self, frame: np.ndarray, camera_id: str) -> np.ndarray:
        """
        Transparent on main dashboard video feed.
        Drawn zones are rendered exclusively inside the interactive Zone Drawer window.
        """
        return frame
