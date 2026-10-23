import math
from typing import List, Dict, Any, Tuple
from ai.anomaly_detector import AnomalyDetector

# Global shared ML Anomaly Detector instance
ml_anomaly_detector = AnomalyDetector()

class FeatureExtractor:
    """
    Extracts operational feature signals and computes ML Behavioral Anomaly Scores:
    1. Night-time (yes/no)
    2. Restricted zone (yes/no)
    3. Fence crossed (yes/no)
    4. Loitering duration (seconds)
    5. Direction toward sensitive area/border (yes/no)
    6. Multiple camera appearances (count)
    7. Object detection confidence (0.0 to 1.0)
    8. Event persistence (frame count)
    9. ML Behavior Anomaly Score & Threat Category (XGBoost / Random Forest ONNX)
    """
    def __init__(self):
        self.detector = ml_anomaly_detector

    def extract_features(
        self,
        track: Dict[str, Any],
        matched_zones: List[Dict[str, Any]],
        crossed_fences: List[Dict[str, Any]],
        day_night_context: str,
        loitering_threshold_sec: float = 5.0
    ) -> Dict[str, Any]:

        heading = track.get("heading_deg", 0.0)
        duration = track.get("duration_sec", 0.0)
        trajectory = track.get("trajectory", [])

        # 1. Night-time
        is_night = (day_night_context == "NIGHT")

        # 2. Restricted zone & Buffer zone
        in_restricted = any(z.get("type") == "RESTRICTED" for z in matched_zones)
        in_buffer = any(z.get("type") == "WATCH" or z.get("type") == "BUFFER" for z in matched_zones)

        # 3. Fence crossed
        is_fence_crossed = len(crossed_fences) > 0

        # 4. Loitering duration (dwell time analysis)
        # Evaluates loitering when inside a marked zone OR on general live camera when stationary/lingering >= 6.0s
        # Trajectory Bounding Radius (Displacement from start point) to detect confined pacing
        max_displacement = 0.0
        if len(trajectory) >= 2:
            p0 = trajectory[0]
            max_displacement = max(math.sqrt((p[0] - p0[0])**2 + (p[1] - p0[1])**2) for p in trajectory)

        is_confined_pacing = (duration >= 5.5 and max_displacement < 125.0 and len(trajectory) >= 5)

        has_marked_zones = len(matched_zones) > 0
        if has_marked_zones:
            is_loitering = (duration >= loitering_threshold_sec) and (in_restricted or in_buffer or any(z.get("type") == "WATCH" for z in matched_zones))
        else:
            avg_speed_temp = float(track.get("speed_mps", 1.0))
            is_loitering = ((duration >= 6.0) and (avg_speed_temp <= 1.1)) or is_confined_pacing

        # 5. Direction toward sensitive area / border fence
        is_toward_border = False
        if len(trajectory) >= 3 and (in_restricted or is_fence_crossed or len(matched_zones) > 0):
            is_toward_border = (30.0 <= heading <= 150.0)

        # 6. Trajectory Dynamics (Speed & Jitter-Filtered Direction Changes)
        avg_speed = float(track.get("speed_mps", 1.2))
        max_speed = float(track.get("max_speed_mps", avg_speed * 1.25))
        
        # Jitter-Resistant Direction Analysis:
        # Only evaluate waypoints with meaningful spatial displacement (>= 12px)
        direction_changes = 0
        if len(trajectory) >= 3:
            filtered_points = [trajectory[0]]
            for pt in trajectory[1:]:
                dx = pt[0] - filtered_points[-1][0]
                dy = pt[1] - filtered_points[-1][1]
                if (dx * dx + dy * dy) >= 144.0:  # >= 12px displacement
                    filtered_points.append(pt)

            if len(filtered_points) >= 3:
                for i in range(1, len(filtered_points) - 1):
                    p0, p1, p2 = filtered_points[i-1], filtered_points[i], filtered_points[i+1]
                    v1 = (p1[0] - p0[0], p1[1] - p0[1])
                    v2 = (p2[0] - p1[0], p2[1] - p1[1])
                    angle1 = math.atan2(v1[1], v1[0])
                    angle2 = math.atan2(v2[1], v2[0])
                    diff = abs(math.degrees(angle2 - angle1)) % 360
                    # Tactical evasive turn (> 50 deg and < 310 deg)
                    if 50.0 < diff < 310.0:
                        direction_changes += 1

        # Fence Minimum Distance Estimation
        distance_to_fence = 50.0 if not is_fence_crossed else 0.0
        if in_restricted:
            distance_to_fence = min(distance_to_fence, 10.0)

        # 7. Multiple camera appearances
        multi_camera_count = track.get("multi_camera_appearances", 1)

        # 8. Object confidence & persistence
        conf = float(track.get("confidence", 0.8))
        persistence_frames = len(trajectory)

        # 9. ML Behavioral Anomaly Evaluation (Step 1 Trained Random Forest / ONNX)
        feature_vector_dict = {
            "track_duration_sec": duration,
            "avg_speed_mps": avg_speed,
            "max_speed_mps": max_speed,
            "direction_changes_count": direction_changes,
            "distance_to_fence_m": distance_to_fence,
            "loitering_duration_sec": duration if is_loitering else 0.0,
            "in_restricted_zone": 1 if in_restricted else 0,
            "in_buffer_zone": 1 if in_buffer else 0,
            "fence_crossed": 1 if is_fence_crossed else 0,
            "night_context": 1 if is_night else 0,
            "multi_camera_appearances": multi_camera_count
        }
        
        ml_prediction = self.detector.predict_track_features(feature_vector_dict)

        return {
            "night_time": is_night,
            "restricted_zone": in_restricted,
            "in_buffer_zone": in_buffer,
            "fence_crossed": is_fence_crossed,
            "loitering_duration": duration,
            "is_loitering": is_loitering,
            "toward_border": is_toward_border,
            "avg_speed_mps": avg_speed,
            "max_speed_mps": max_speed,
            "direction_changes_count": direction_changes,
            "distance_to_fence_m": distance_to_fence,
            "multi_camera_appearances": multi_camera_count,
            "confidence_score": conf,
            "event_persistence_frames": persistence_frames,
            "ml_anomaly_detected": ml_prediction.get("anomaly_detected", False),
            "ml_anomaly_score": ml_prediction.get("anomaly_score", 0.0),
            "ml_threat_category": ml_prediction.get("threat_category", "NORMAL"),
            "ml_confidence": ml_prediction.get("confidence", 0.0),
            "anpr_watchlist_hit": track.get("is_watchlist_vehicle", False),
            "is_watchlist_vehicle": track.get("is_watchlist_vehicle", False),
            "license_plate": track.get("license_plate", None)
        }
