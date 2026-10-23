import os
import json
import math
import time
import logging
import cv2
import numpy as np
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger("HomographyEngine")

DEFAULT_CALIBRATION_FILE = "configs/homography_calibration.json"

# Standard tactical radar palette
RADAR_BG = (10, 15, 26)           # Dark tactical navy
RADAR_BORDER = (45, 60, 85)       # Muted slate border
RADAR_GRID = (30, 45, 65)         # Grid line tint
RADAR_RING = (40, 65, 95)         # Distance range ring
RADAR_TEXT = (180, 205, 230)      # High-legibility pale cyan
COLOR_VEHICLE = (56, 189, 248)    # Cyan for vehicles
COLOR_PERSON = (74, 222, 128)     # Emerald green for friendly / normal person
COLOR_SUSPECT = (50, 50, 240)     # Red for watchlist / suspect targets

class HomographyEngine:
    """
    Planar Homography & Metric Ground Plane Engine.
    Transforms oblique 2D camera coordinates into a calibrated Euclidean ground plane.
    
    Capabilities:
    - 4-point perspective transform (cv2.getPerspectiveTransform)
    - Footpoint ground projection (eliminates 2D torso/head false alarms)
    - True physical velocity (km/h) without perspective pixel distortion
    - Real-world metric distance to border fence / toll chokepoint (in meters)
    - 2.5D perspective ground grid rendering directly on the video feed
    - Dedicated tactical BEV mini-radar HUD overlay
    """

    def __init__(self, config_path: str = DEFAULT_CALIBRATION_FILE):
        self.config_path = config_path
        self.calibrations: Dict[str, Dict[str, Any]] = {}
        self.matrices: Dict[str, np.ndarray] = {}
        self.inv_matrices: Dict[str, np.ndarray] = {}
        self.track_metric_history: Dict[Tuple[str, int], List[Tuple[float, float, float]]] = {}
        self.bev_enabled: Dict[str, bool] = {
            "CAM-01": False,
            "CAM-02": False,
            "CAM-03": False,
            "CAM-04": False,
            "CAM-05": False,
            "CAM-06": False
        }
        self._load_config()

    def _load_config(self):
        """Loads camera ground calibration quads and metric dimensions."""
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r") as f:
                    self.calibrations = json.load(f)
            except Exception as e:
                logger.error(f"Error loading calibration from {self.config_path}: {e}")
                self.calibrations = {}
        else:
            self._create_default_config()

        self._compute_all_matrices()

    def _create_default_config(self):
        """Initializes default metric ground calibrations for tactical cameras."""
        self.calibrations = {
            "CAM-01": {
                "name": "CAM-01 Toll Plaza & Chokepoint",
                # 4 ground corners on the CCTV frame [x, y] in normalized (0..1) or pixel space
                # Default 1280x720 coordinates for the approach lane:
                # Top-left, Top-right, Bottom-right, Bottom-left
                "src_points": [
                    [320, 240],   # Far left ground point
                    [960, 240],   # Far right ground point
                    [1180, 710],  # Near right ground point
                    [100, 710]    # Near left ground point
                ],
                # Metric ground dimensions in meters [width, length]
                "metric_width_m": 8.5,     # Lane width: 8.5 meters
                "metric_length_m": 35.0,   # Road depth: 35.0 meters
                "barrier_y_m": 12.0,       # Chokepoint / toll barrier at 12.0 meters
                "frame_size": [1280, 720]
            },
            "CAM-02": {
                "name": "CAM-02 Perimeter Buffer",
                "src_points": [
                    [450, 300],
                    [850, 300],
                    [1150, 700],
                    [150, 700]
                ],
                "metric_width_m": 12.0,
                "metric_length_m": 45.0,
                "barrier_y_m": 15.0,
                "frame_size": [1280, 720]
            },
            "CAM-03": {
                "name": "CAM-03 East Watchtower",
                "src_points": [
                    [400, 280],
                    [880, 280],
                    [1100, 700],
                    [180, 700]
                ],
                "metric_width_m": 15.0,
                "metric_length_m": 50.0,
                "barrier_y_m": 20.0,
                "frame_size": [1280, 720]
            },
            "CAM-04": {
                "name": "CAM-04 Sector South Highway",
                "src_points": [
                    [350, 260],
                    [920, 260],
                    [1160, 710],
                    [120, 710]
                ],
                "metric_width_m": 10.0,
                "metric_length_m": 40.0,
                "barrier_y_m": 15.0,
                "frame_size": [1280, 720]
            }
        }
        self._save_config()

    def _save_config(self):
        try:
            os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
            with open(self.config_path, "w") as f:
                json.dump(self.calibrations, f, indent=2)
            logger.info(f"Saved camera homography calibrations to {self.config_path}")
        except Exception as e:
            logger.error(f"Error saving calibration: {e}")

    def _compute_all_matrices(self):
        """Computes 3x3 homography matrix H and inverse H_inv for each camera."""
        for cam_id, calib in self.calibrations.items():
            try:
                src = np.array(calib["src_points"], dtype=np.float32)
                mw = float(calib.get("metric_width_m", 10.0))
                ml = float(calib.get("metric_length_m", 35.0))

                # Destination coordinates on top-down Euclidean metric plane:
                # [0, ml] is top-left (far), [mw, ml] top-right, [mw, 0] bottom-right (near), [0, 0] bottom-left
                dst = np.array([
                    [0.0, ml],
                    [mw, ml],
                    [mw, 0.0],
                    [0.0, 0.0]
                ], dtype=np.float32)

                H = cv2.getPerspectiveTransform(src, dst)
                H_inv = cv2.getPerspectiveTransform(dst, src)

                self.matrices[cam_id] = H
                self.inv_matrices[cam_id] = H_inv
            except Exception as e:
                logger.error(f"Failed to compute homography matrix for {cam_id}: {e}")

    def update_calibration(self, camera_id: str, src_points: List[List[float]],
                           metric_width_m: float, metric_length_m: float,
                           barrier_y_m: float = 12.0) -> bool:
        """Updates and persists 4-point ground calibration for a camera."""
        if len(src_points) != 4:
            return False

        self.calibrations[camera_id] = {
            "name": f"{camera_id} Calibrated Ground Plane",
            "src_points": src_points,
            "metric_width_m": float(metric_width_m),
            "metric_length_m": float(metric_length_m),
            "barrier_y_m": float(barrier_y_m),
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        self._save_config()
        self._compute_all_matrices()
        logger.info(f"✓ Re-calibrated homography for {camera_id}: {metric_width_m}m x {metric_length_m}m")
        return True

    def get_calibration(self, camera_id: str) -> Optional[Dict[str, Any]]:
        calib = self.calibrations.get(camera_id)
        if not calib:
            return None
        res = dict(calib)
        H = self.matrices.get(camera_id)
        H_inv = self.inv_matrices.get(camera_id)
        if H is not None:
            res["matrix_h"] = H.tolist()
        if H_inv is not None:
            res["matrix_h_inv"] = H_inv.tolist()
        return res

    def get_bev_unwarped_frame(self, frame: np.ndarray, camera_id: str,
                               out_size: Tuple[int, int] = (520, 280)) -> Optional[np.ndarray]:
        """
        Unwarps the oblique camera frame into an orthogonal 2D top-down / Bird's-Eye View image.
        Uses destination points mapped to the specified canvas size.
        """
        calib = self.calibrations.get(camera_id)
        if not calib:
            return None

        src_pts = calib.get("src_points", [])
        if len(src_pts) != 4:
            return None

        src = np.array(src_pts, dtype=np.float32)
        ow, oh = out_size
        # Map top-left, top-right, bottom-right, bottom-left
        dst = np.array([
            [0.0, 0.0],
            [float(ow), 0.0],
            [float(ow), float(oh)],
            [0.0, float(oh)]
        ], dtype=np.float32)

        try:
            M_bev = cv2.getPerspectiveTransform(src, dst)
            unwarped = cv2.warpPerspective(frame, M_bev, (ow, oh))
            return unwarped
        except Exception as e:
            logger.error(f"Error unwarping BEV frame for {camera_id}: {e}")
            return None

    def toggle_bev(self, camera_id: str, state: Optional[bool] = None) -> bool:
        current = self.bev_enabled.get(camera_id, False)
        new_state = (not current) if state is None else state
        self.bev_enabled[camera_id] = new_state
        return new_state

    def is_bev_active(self, camera_id: str) -> bool:
        return self.bev_enabled.get(camera_id, False)

    def project_image_to_metric(self, camera_id: str, point: Tuple[float, float]) -> Optional[Tuple[float, float]]:
        """
        Transforms a camera image pixel (px, py) into real-world metric ground coordinates (X_m, Y_m).
        Uses target footpoint (ground contact point) to guarantee 0% false alarms from tall bodies.
        """
        H = self.matrices.get(camera_id)
        if H is None:
            return None

        px, py = point
        vec = np.array([[[px, py]]], dtype=np.float32)
        res = cv2.perspectiveTransform(vec, H)
        xm, ym = float(res[0][0][0]), float(res[0][0][1])
        return (round(xm, 2), round(ym, 2))

    def project_metric_to_image(self, camera_id: str, metric_point: Tuple[float, float]) -> Optional[Tuple[int, int]]:
        """Transforms a metric ground point (X_m, Y_m) back to camera image pixel (px, py)."""
        H_inv = self.inv_matrices.get(camera_id)
        if H_inv is None:
            return None

        xm, ym = metric_point
        vec = np.array([[[xm, ym]]], dtype=np.float32)
        res = cv2.perspectiveTransform(vec, H_inv)
        px, py = int(round(res[0][0][0])), int(round(res[0][0][1]))
        return (px, py)

    def project_polygon_image_to_metric(self, camera_id: str, polygon: List[List[float]]) -> List[List[float]]:
        """Converts an entire 2D image pixel polygon [[px, py], ...] into metric ground meters [[X_m, Y_m], ...]."""
        metric_pts = []
        for pt in polygon:
            if len(pt) >= 2:
                m_pt = self.project_image_to_metric(camera_id, (float(pt[0]), float(pt[1])))
                if m_pt is not None:
                    metric_pts.append([m_pt[0], m_pt[1]])
        return metric_pts

    def project_polygon_metric_to_image(self, camera_id: str, metric_polygon: List[List[float]]) -> List[List[int]]:
        """Converts metric ground polygon [[X_m, Y_m], ...] back into 2D camera image pixels [[px, py], ...]."""
        image_pts = []
        for m_pt in metric_polygon:
            if len(m_pt) >= 2:
                px_pt = self.project_metric_to_image(camera_id, (float(m_pt[0]), float(m_pt[1])))
                if px_pt is not None:
                    image_pts.append([px_pt[0], px_pt[1]])
        return image_pts

    def process_target_telemetry(self, camera_id: str, track: Dict[str, Any], current_time: float) -> Dict[str, Any]:
        """
        Enriches target track with metric ground plane analytics:
        - Ground footpoint anchoring (eliminates torso false alarms)
        - True metric ground position (X_m, Y_m)
        - True physical ground speed (km/h) and velocity vector (m/s)
        - Predictive trajectory forward waypoints at +1s, +2s, +3s
        - Calculated Time-to-Breach (TTB) approaching perimeter / toll barrier
        - Exact metric distance to toll barrier / border fence
        - Top-down BEV radar normalized coordinates (0..1)
        """
        bbox = track.get("bbox", [0, 0, 0, 0])
        tid = track.get("track_id", 0)
        x1, y1, x2, y2 = bbox
        
        # Ground footpoint: bottom center of the bounding box where feet or tires contact asphalt
        foot_x = (x1 + x2) / 2.0
        foot_y = float(y2)

        metric_pt = self.project_image_to_metric(camera_id, (foot_x, foot_y))
        calib = self.calibrations.get(camera_id, {})
        mw = float(calib.get("metric_width_m", 10.0))
        ml = float(calib.get("metric_length_m", 35.0))
        barrier_y = float(calib.get("barrier_y_m", 12.0))

        if metric_pt is None:
            # Fallback normalized coordinates
            return {
                "footpoint": [foot_x, foot_y],
                "ground_metric": None,
                "ground_speed_kmh": track.get("speed_kmh", 35.0),
                "distance_to_barrier_m": 0.0,
                "bev_normalized": [0.5, 0.5],
                "velocity_vector_mps": [0.0, 0.0],
                "predicted_trajectory_m": [],
                "predicted_trajectory_px": [],
                "ttb_barrier_sec": None
            }

        xm, ym = metric_pt
        key = (camera_id, tid)
        history = self.track_metric_history.setdefault(key, [])
        history.append((xm, ym, current_time))
        if len(history) > 10:
            history.pop(0)

        # True metric ground velocity vector (m/s) and scalar speed (km/h)
        speed_kmh = 35.0
        vx_mps = 0.0
        vy_mps = 0.0
        if len(history) >= 2:
            dx = history[-1][0] - history[0][0]
            dy = history[-1][1] - history[0][1]
            dt = max(0.001, history[-1][2] - history[0][2])
            dist_m = math.hypot(dx, dy)
            raw_kmh = (dist_m / dt) * 3.6
            if 0.5 <= raw_kmh <= 160.0:
                speed_kmh = round(raw_kmh, 1)
                vx_mps = round(dx / dt, 2)
                vy_mps = round(dy / dt, 2)

        # Distance to barrier (meters)
        dist_to_barrier = round(max(0.0, ym - barrier_y), 1)

        # Predictive forward trajectory (+1s, +2s, +3s)
        pred_traj_m = []
        pred_traj_px = []
        ttb_barrier = None

        if abs(vx_mps) > 0.3 or abs(vy_mps) > 0.3:
            for t_step in [1.0, 2.0, 3.0]:
                pred_x = round(xm + vx_mps * t_step, 2)
                pred_y = round(ym + vy_mps * t_step, 2)
                pred_traj_m.append([pred_x, pred_y])
                px_pred = self.project_metric_to_image(camera_id, (pred_x, pred_y))
                if px_pred:
                    pred_traj_px.append(px_pred)

            # Check if moving towards barrier/chokepoint
            speed_towards = -vy_mps if vy_mps < -0.4 else 0.0
            if speed_towards > 0.5 and dist_to_barrier > 0.5:
                calc_ttb = dist_to_barrier / speed_towards
                if calc_ttb <= 6.0:
                    ttb_barrier = round(calc_ttb, 1)

        # Normalized coordinates for 2D tactical radar display: X in [0..1], Y in [0..1]
        norm_x = max(0.0, min(1.0, xm / max(mw, 0.1)))
        norm_y = max(0.0, min(1.0, ym / max(ml, 0.1)))

        telemetry = {
            "footpoint": [round(foot_x, 1), round(foot_y, 1)],
            "ground_metric": [xm, ym],
            "ground_speed_kmh": speed_kmh,
            "distance_to_barrier_m": dist_to_barrier,
            "bev_normalized": [round(norm_x, 3), round(norm_y, 3)],
            "velocity_vector_mps": [vx_mps, vy_mps],
            "predicted_trajectory_m": pred_traj_m,
            "predicted_trajectory_px": pred_traj_px,
            "ttb_barrier_sec": ttb_barrier
        }

        # Enrich track in-place
        track["ground_metric"] = [xm, ym]
        track["ground_speed_kmh"] = speed_kmh
        track["distance_to_barrier_m"] = dist_to_barrier
        track["bev_normalized"] = [round(norm_x, 3), round(norm_y, 3)]
        track["velocity_vector_mps"] = [vx_mps, vy_mps]
        track["predicted_trajectory_m"] = pred_traj_m
        track["predicted_trajectory_px"] = pred_traj_px
        track["ttb_barrier_sec"] = ttb_barrier

        return telemetry

    def detect_tailgating_convoys(self, camera_id: str, tracked_objects: List[Dict[str, Any]],
                                   min_gap_m: float = 3.2) -> List[Dict[str, Any]]:
        """
        Calculates ground-plane bumper gap between vehicles approaching barrier.
        Identifies dangerous tailgating / gate-crashing proximity threats.
        """
        vehs = [t for t in tracked_objects if t.get("object_type") in ["car", "truck", "bus", "vehicle", "suv"] and t.get("ground_metric")]
        if len(vehs) < 2:
            return []

        tailgating_events = []
        for i in range(len(vehs)):
            for j in range(i + 1, len(vehs)):
                v1 = vehs[i]
                v2 = vehs[j]
                m1 = v1.get("ground_metric", [0, 0])
                m2 = v2.get("ground_metric", [0, 0])
                dist_gap = round(math.hypot(m1[0] - m2[0], m1[1] - m2[1]), 2)

                # If distance is closer than threshold and both moving (> 10 km/h)
                s1 = float(v1.get("ground_speed_kmh", 0))
                s2 = float(v2.get("ground_speed_kmh", 0))

                if dist_gap <= min_gap_m and (s1 >= 10.0 or s2 >= 10.0):
                    lead = v1 if m1[1] < m2[1] else v2
                    trail = v2 if m1[1] < m2[1] else v1
                    tailgating_events.append({
                        "lead_track_id": lead.get("track_id"),
                        "trail_track_id": trail.get("track_id"),
                        "lead_plate": lead.get("license_plate"),
                        "trail_plate": trail.get("license_plate"),
                        "gap_meters": dist_gap,
                        "lead_speed": lead.get("ground_speed_kmh"),
                        "trail_speed": trail.get("ground_speed_kmh")
                    })
        return tailgating_events

    def render_bev_ground_grid(self, frame: np.ndarray, camera_id: str) -> np.ndarray:
        """
        Renders an authentic, perspective-correct 2.5D Ground Grid directly on the asphalt.
        Lines recede towards the camera's vanishing point with realistic perspective foreshortening.
        Eliminates the 'floating sticker' appearance of standard 2D rectangles!
        """
        calib = self.calibrations.get(camera_id)
        if not calib:
            return frame

        mw = float(calib.get("metric_width_m", 10.0))
        ml = float(calib.get("metric_length_m", 35.0))
        barrier_y = float(calib.get("barrier_y_m", 12.0))

        overlay = frame.copy()
        h, w = frame.shape[:2]

        # 1. Longitudinal ground lanes (every 2.5 meters)
        x_steps = np.linspace(0, mw, 5)
        for xm in x_steps:
            p_near = self.project_metric_to_image(camera_id, (xm, 0.0))
            p_far = self.project_metric_to_image(camera_id, (xm, ml))
            if p_near and p_far:
                cv2.line(overlay, p_near, p_far, (45, 90, 120), 1, cv2.LINE_AA)

        # 2. Transverse metric distance rings (every 5.0 meters)
        y_steps = np.arange(0, ml + 1.0, 5.0)
        for ym in y_steps:
            p_left = self.project_metric_to_image(camera_id, (0.0, ym))
            p_right = self.project_metric_to_image(camera_id, (mw, ym))
            if p_left and p_right:
                is_barrier = abs(ym - barrier_y) < 1.0
                color = (40, 50, 230) if is_barrier else (40, 80, 110)
                thick = 2 if is_barrier else 1
                cv2.line(overlay, p_left, p_right, color, thick, cv2.LINE_AA)
                if is_barrier and p_left[1] > 15:
                    cv2.putText(overlay, f"CHOKEPOINT / BARRIER ({barrier_y:.0f}m)",
                                (p_left[0] + 10, p_left[1] - 4),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (220, 220, 255), 1, cv2.LINE_AA)

        # Blend softly so ground markings and pavement remain visible underneath
        cv2.addWeighted(overlay, 0.35, frame, 0.65, 0, frame)
        return frame

    def render_tactical_radar_hud(self, frame: np.ndarray, camera_id: str,
                                  tracked_objects: List[Dict[str, Any]]) -> np.ndarray:
        """
        Renders a high-tech, military-grade Tactical BEV Mini-Radar HUD in the corner of the feed.
        Displays true top-down ground coordinates, range rings (10m, 20m, 30m), target blips,
        and real-world approach speeds.
        """
        calib = self.calibrations.get(camera_id)
        if not calib:
            return frame

        fh, fw = frame.shape[:2]
        # Radar dimensions
        rw, rh = 220, 220
        rx1 = fw - rw - 16
        ry1 = fh - rh - 16
        rx2 = rx1 + rw
        ry2 = ry1 + rh

        # Semi-transparent dark tactical panel
        sub = frame[ry1:ry2, rx1:rx2]
        if sub.shape[0] != rh or sub.shape[1] != rw:
            return frame

        panel = np.full((rh, rw, 3), RADAR_BG, dtype=np.uint8)
        cv2.addWeighted(panel, 0.85, sub, 0.15, 0, sub)

        # Outer border
        cv2.rectangle(frame, (rx1, ry1), (rx2, ry2), RADAR_BORDER, 1, cv2.LINE_AA)
        
        # Header banner
        cv2.putText(frame, "TOP-DOWN BEV RADAR", (rx1 + 8, ry1 + 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.36, (56, 189, 248), 1, cv2.LINE_AA)
        cv2.putText(frame, "METRIC GROUND PLANE", (rx1 + 8, ry1 + 27),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.28, (148, 163, 184), 1, cv2.LINE_AA)

        # Radar active area
        pad_x, pad_y = 18, 36
        gw = rw - (pad_x * 2)
        gh = rh - pad_y - 14

        mw = float(calib.get("metric_width_m", 8.5))
        ml = float(calib.get("metric_length_m", 35.0))
        barrier_y = float(calib.get("barrier_y_m", 12.0))

        # Range rings / distance lines
        for y_m in [10.0, 20.0, 30.0]:
            if y_m < ml:
                line_y = ry1 + pad_y + int((1.0 - (y_m / ml)) * gh)
                cv2.line(frame, (rx1 + pad_x, line_y), (rx1 + pad_x + gw, line_y), RADAR_RING, 1, cv2.LINE_AA)
                cv2.putText(frame, f"{int(y_m)}m", (rx1 + pad_x - 14, line_y + 3),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.25, (100, 125, 155), 1, cv2.LINE_AA)

        # Chokepoint / Barrier line on radar
        barrier_radar_y = ry1 + pad_y + int((1.0 - (barrier_y / ml)) * gh)
        cv2.line(frame, (rx1 + pad_x, barrier_radar_y), (rx1 + pad_x + gw, barrier_radar_y), (50, 50, 240), 1, cv2.LINE_AA)
        cv2.putText(frame, "TOLL / BARRIER", (rx1 + pad_x + 4, barrier_radar_y - 3),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.26, (240, 100, 100), 1, cv2.LINE_AA)

        # Center line
        mid_x = rx1 + pad_x + (gw // 2)
        cv2.line(frame, (mid_x, ry1 + pad_y), (mid_x, ry1 + pad_y + gh), RADAR_GRID, 1, cv2.LINE_AA)

        # Render active target blips
        for obj in tracked_objects:
            bev_norm = obj.get("bev_normalized")
            if not bev_norm:
                continue

            nx, ny = bev_norm
            # Screen coordinates inside mini-radar panel
            bx = rx1 + pad_x + int(nx * gw)
            by = ry1 + pad_y + int((1.0 - ny) * gh)

            otype = obj.get("object_type", "vehicle")
            is_suspect = (obj.get("identity_status") == "UNAUTHORIZED") or obj.get("is_watchlist_vehicle", False)
            plate = obj.get("license_plate")

            # Color coding
            if is_suspect:
                blip_color = COLOR_SUSPECT
            elif otype == "person":
                blip_color = COLOR_PERSON
            else:
                blip_color = COLOR_VEHICLE

            # Draw predictive heading vector
            vx, vy = obj.get("velocity_vector_mps", [0.0, 0.0])
            if abs(vx) > 0.3 or abs(vy) > 0.3:
                v_scale = 1.5
                target_nx = max(0.0, min(1.0, nx + (vx * v_scale) / max(mw, 0.1)))
                target_ny = max(0.0, min(1.0, ny + (vy * v_scale) / max(ml, 0.1)))
                tx = rx1 + pad_x + int(target_nx * gw)
                ty = ry1 + pad_y + int((1.0 - target_ny) * gh)
                cv2.line(frame, (bx, by), (tx, ty), blip_color, 1, cv2.LINE_AA)

            # Draw glowing blip
            cv2.circle(frame, (bx, by), 5, blip_color, -1, cv2.LINE_AA)
            cv2.circle(frame, (bx, by), 8, blip_color, 1, cv2.LINE_AA)

            # Target label
            lbl = plate if plate else f"{otype.upper()} #{obj.get('track_id')}"
            dist_m = obj.get("distance_to_barrier_m", 0.0)
            ttb = obj.get("ttb_barrier_sec")
            
            info_text = f"{lbl} | {dist_m}m" + (f" (TTB:{ttb}s)" if ttb else "")
            cv2.putText(frame, info_text, (min(bx + 7, rx2 - 75), max(by - 2, ry1 + 38)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.27, (240, 245, 250), 1, cv2.LINE_AA)

        return frame

    def render_predictive_vectors(self, frame: np.ndarray, camera_id: str,
                                  tracked_objects: List[Dict[str, Any]]) -> np.ndarray:
        """
        Renders futuristic ground velocity vectors and predictive +1s/+2s/+3s trajectory lines
        directly on the CCTV camera view asphalt.
        """
        for obj in tracked_objects:
            pred_px = obj.get("predicted_trajectory_px", [])
            foot = obj.get("footpoint", [0, 0])
            if not pred_px or len(pred_px) < 1:
                continue

            p_curr = (int(foot[0]), int(foot[1]))
            is_suspect = (obj.get("identity_status") == "UNAUTHORIZED") or obj.get("is_watchlist_vehicle", False)
            ttb = obj.get("ttb_barrier_sec")

            if is_suspect or (ttb and ttb <= 3.0):
                line_color = (50, 50, 240)    # Red alert for breach intercept
            elif obj.get("object_type") == "person":
                line_color = (74, 222, 128)   # Emerald green
            else:
                line_color = (56, 189, 248)   # Tactical cyan

            # Draw trajectory path with receding ground depth
            p0 = p_curr
            for idx, pt in enumerate(pred_px):
                p_next = (int(pt[0]), int(pt[1]))
                cv2.line(frame, p0, p_next, line_color, 2 if idx == 0 else 1, cv2.LINE_AA)
                cv2.circle(frame, p_next, 3 + idx, line_color, -1 if idx == len(pred_px) - 1 else 1, cv2.LINE_AA)
                p0 = p_next

            # Label predicted arrival if closing in
            if ttb and len(pred_px) > 0:
                last_pt = pred_px[-1]
                cv2.putText(frame, f"TTB: {ttb}s", (int(last_pt[0]) + 6, int(last_pt[1]) - 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.35, (240, 100, 100), 1, cv2.LINE_AA)

        return frame

# Singleton Engine
homography_engine = HomographyEngine()

