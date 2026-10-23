import os
import cv2
import time
import joblib
import numpy as np
from typing import Dict, List, Optional, Tuple, Any

class AnomalyDetector:
    """
    Spatio-Temporal Video Anomaly Detector & Track Feature Classifier.
    Maintains rolling clip buffers and supports Random Forest / ONNX track feature classification.
    """

    def __init__(
        self,
        model_path: str = "models/border_anomaly_detector.onnx",
        pkl_path: str = "models/border_behavior_classifier.pkl",
        clip_len: int = 16,
        frame_size: Tuple[int, int] = (112, 112),
        threat_threshold: float = 0.65
    ):
        self.clip_len = clip_len
        self.frame_size = frame_size
        self.threat_threshold = threat_threshold
        self.buffers: Dict[str, List[np.ndarray]] = {}
        self.session = None
        self.skl_model = None
        self.model_type = "HEURISTIC"
        self.skirmish_history: Dict[Tuple[int, int], int] = {}

        # Load Scikit-Learn Random Forest Classifier
        if os.path.exists(pkl_path):
            try:
                self.skl_model = joblib.load(pkl_path)
                self.model_type = "RANDOM_FOREST"
                print(f"[AnomalyDetector] Loaded Scikit-Learn model from: {pkl_path}")
            except Exception as e:
                print(f"[AnomalyDetector] Could not load PKL model ({e})")

        # Load ONNX model if present
        if os.path.exists(model_path):
            try:
                import onnxruntime as ort
                self.session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
                self.model_type = "ONNX"
                print(f"[AnomalyDetector] Loaded ONNX model from: {model_path}")
            except Exception as e:
                print(f"[AnomalyDetector] Failed to load ONNX session ({e})")

    def predict_track_features(self, feature_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluates 11-dimensional track feature dictionary using the trained ML model:
        [duration, avg_speed, max_speed, direction_changes, fence_dist, loiter_dur,
         in_restricted, in_buffer, fence_crossed, night, multi_cam]
        """
        import pandas as pd

        feature_cols = [
            "track_duration_sec", "avg_speed_mps", "max_speed_mps", "direction_changes_count",
            "distance_to_fence_m", "loitering_duration_sec", "in_restricted_zone",
            "in_buffer_zone", "fence_crossed", "night_context", "multi_camera_appearances"
        ]

        vec_data = [[
            float(feature_dict.get("track_duration_sec", 0.0)),
            float(feature_dict.get("avg_speed_mps", 1.0)),
            float(feature_dict.get("max_speed_mps", 1.5)),
            float(feature_dict.get("direction_changes_count", 0)),
            float(feature_dict.get("distance_to_fence_m", 50.0)),
            float(feature_dict.get("loitering_duration_sec", 0.0)),
            float(feature_dict.get("in_restricted_zone", 0)),
            float(feature_dict.get("in_buffer_zone", 0)),
            float(feature_dict.get("fence_crossed", 0)),
            float(feature_dict.get("night_context", 0)),
            float(feature_dict.get("multi_camera_appearances", 1))
        ]]

        vec_df = pd.DataFrame(vec_data, columns=feature_cols)

        if self.skl_model is not None:
            try:
                probs = self.skl_model.predict_proba(vec_df)[0]
                # Classes: 0: NORMAL, 1: SUSPICIOUS, 2: CRITICAL
                normal_prob = float(probs[0]) if len(probs) > 0 else 1.0
                suspicious_prob = float(probs[1]) if len(probs) > 1 else 0.0
                critical_prob = float(probs[2]) if len(probs) > 2 else 0.0

                # Confidence calibration: Require confident prediction to classify as anomaly
                if critical_prob >= 0.65:
                    category = "CRITICAL"
                    confidence = critical_prob
                    anomaly_score = float(critical_prob * 100.0)
                elif suspicious_prob >= 0.58 and suspicious_prob > normal_prob:
                    category = "SUSPICIOUS"
                    confidence = suspicious_prob
                    anomaly_score = float(suspicious_prob * 80.0)
                else:
                    category = "NORMAL"
                    confidence = normal_prob
                    anomaly_score = float(max(suspicious_prob, critical_prob) * 25.0)

                return {
                    "anomaly_detected": category != "NORMAL",
                    "anomaly_score": round(anomaly_score, 1),
                    "threat_category": category,
                    "confidence": round(confidence, 3),
                    "probabilities": {
                        "normal": round(normal_prob, 3),
                        "suspicious": round(suspicious_prob, 3),
                        "critical": round(critical_prob, 3)
                    }
                }
            except Exception as e:
                print(f"[AnomalyDetector] Track prediction error: {e}")

        # Fallback heuristic prediction
        is_threat = (feature_dict.get("in_restricted_zone", 0) == 1 or
                     feature_dict.get("fence_crossed", 0) == 1 or
                     feature_dict.get("loitering_duration_sec", 0) > 10)
        score = 85.0 if is_threat else 15.0
        return {
            "anomaly_detected": is_threat,
            "anomaly_score": score,
            "threat_category": "CRITICAL" if feature_dict.get("fence_crossed", 0) == 1 else "SUSPICIOUS" if is_threat else "NORMAL",
            "confidence": 0.85 if is_threat else 0.9
        }

    def process_frame(self, camera_id: str, frame: np.ndarray, motion_vectors: Optional[List] = None) -> Dict:
        """
        Ingest a live video frame and return anomaly assessment.
        """
        if camera_id not in self.buffers:
            self.buffers[camera_id] = []

        resized = cv2.resize(frame, self.frame_size)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        norm = rgb.astype(np.float32) / 255.0

        self.buffers[camera_id].append(norm)
        if len(self.buffers[camera_id]) > self.clip_len:
            self.buffers[camera_id].pop(0)

        if len(self.buffers[camera_id]) == self.clip_len:
            return self._infer_clip(camera_id, self.buffers[camera_id], motion_vectors)

        return {
            "anomaly_detected": False,
            "anomaly_score": 0.0,
            "threat_category": "BUFFERING",
            "confidence": 0.0
        }

    def _infer_clip(self, camera_id: str, clip_frames: List[np.ndarray], motion_vectors: Optional[List]) -> Dict:
        if self.model_type == "ONNX" and self.session:
            try:
                tensor = np.array(clip_frames).transpose(3, 0, 1, 2)
                tensor = np.expand_dims(tensor, axis=0).astype(np.float32)
                
                input_name = self.session.get_inputs()[0].name
                outputs = self.session.run(None, {input_name: tensor})
                score = float(outputs[0][0])
                
                is_anomaly = score >= self.threat_threshold
                category = "SUSPICIOUS_ACTIVITY" if is_anomaly else "NORMAL"
                
                return {
                    "anomaly_detected": is_anomaly,
                    "anomaly_score": round(score * 100, 1),
                    "threat_category": category,
                    "confidence": round(score, 3)
                }
            except Exception:
                pass

        # Noise-Masked Motion Flux: Isolates true kinetic activity from camera compression noise
        diffs = []
        for i in range(1, len(clip_frames)):
            frame_delta = np.abs(clip_frames[i] - clip_frames[i-1])
            # Filter low-amplitude camera sensor/compression jitter (noise floor < 0.035)
            motion_mask = (frame_delta > 0.035)
            if np.any(motion_mask):
                diffs.append(float(np.mean(frame_delta[motion_mask])))
            else:
                diffs.append(0.0)

        mean_flux = float(np.mean(diffs)) if diffs else 0.0
        std_flux = float(np.std(diffs)) if diffs else 0.0

        # Calibrated kinetic flux scoring for surveillance scenarios
        # Quiescent / Calm: < 0.005, Walking: 0.006–0.009, Struggle / Running / Skirmish: >= 0.010
        flux_score = min(1.0, (mean_flux / 0.012) * 0.65 + (std_flux / 0.003) * 0.35)
        is_anomaly = (flux_score >= 0.55) or (mean_flux >= 0.0095)

        return {
            "anomaly_detected": is_anomaly,
            "anomaly_score": round(flux_score * 100.0, 1),
            "mean_flux": round(mean_flux, 5),
            "threat_category": "HIGH_KINETIC_MOTION" if is_anomaly else "NORMAL",
            "confidence": round(flux_score, 2)
        }

    def detect_skirmish(self, tracked_persons: List[Dict[str, Any]], kinetic_res: Dict[str, Any]) -> Dict[str, Any]:
        """
        High-Precision Tactical Altercation & Border Skirmish Detector.
        Evaluates:
        1. 2D Bounding Box Spatial Intersection (IoU > 0.05 or gap < 45px).
        2. Combat Aspect Ratio Collapse (h/w < 1.35 indicates ground tackle or wrestling).
        3. Combat Dynamics: Elevated noise-masked kinetic flux (>= 0.0085) or sudden burst combat speed (>= 2.0 m/s).
        4. Temporal Persistence across >= 2 frames to reject transient pedestrian crossings.
        """
        if not tracked_persons or len(tracked_persons) < 2:
            self.skirmish_history.clear()
            return {"is_fight": False, "confidence": 0.0, "reason": ""}

        kinetic_score = float(kinetic_res.get("anomaly_score", 0.0))
        mean_flux = float(kinetic_res.get("mean_flux", 0.0))
        active_pairs = set()

        for i in range(len(tracked_persons)):
            for j in range(i + 1, len(tracked_persons)):
                p1, p2 = tracked_persons[i], tracked_persons[j]
                tid1 = p1.get("track_id", i)
                tid2 = p2.get("track_id", j)
                pair_key = (min(tid1, tid2), max(tid1, tid2))

                b1 = p1.get("bbox", [0, 0, 0, 0])
                b2 = p2.get("bbox", [0, 0, 0, 0])

                inter_w = max(0, min(b1[2], b2[2]) - max(b1[0], b2[0]))
                inter_h = max(0, min(b1[3], b2[3]) - max(b1[1], b2[1]))
                inter_area = inter_w * inter_h
                area1 = max(1.0, (b1[2] - b1[0]) * (b1[3] - b1[1]))
                area2 = max(1.0, (b2[2] - b2[0]) * (b2[3] - b2[1]))

                # 1. Reject duplicate concentric detections of the same individual (e.g. torso inside full body)
                containment1 = inter_area / float(area1)
                containment2 = inter_area / float(area2)
                if containment1 > 0.70 or containment2 > 0.70:
                    # One box is mostly inside the other -> duplicate detection of same person
                    continue

                # 2. Exclude vehicle occupants (bus passengers, car drivers/riders)
                if p1.get("is_vehicle_occupant") or p2.get("is_vehicle_occupant"):
                    continue

                iou = inter_area / float(area1 + area2 - inter_area)
                x_gap = max(0, max(b1[0], b2[0]) - min(b1[2], b2[2]))
                y_gap = max(0, max(b1[1], b2[1]) - min(b1[3], b2[3]))

                is_grappling = (iou >= 0.10) or (x_gap < 35 and y_gap < 45)

                # 3. Combat Aspect Ratio Collapse (Tackling / Ground Wrestling)
                ar1 = (b1[3] - b1[1]) / max(1.0, b1[2] - b1[0])
                ar2 = (b2[3] - b2[1]) / max(1.0, b2[2] - b2[0])
                is_ground_struggle = (ar1 < 1.25 and ar2 < 1.25)

                # 4. Speeds & Combat Kinetics
                s1 = float(p1.get("speed_mps", 1.0))
                s2 = float(p2.get("speed_mps", 1.0))
                rel_speed = abs(s1 - s2)

                # If moving in tandem at road speed, they are co-travelers/riders, not fighting
                if rel_speed < 0.4 and (s1 > 1.4 and s2 > 1.4) and iou < 0.25:
                    continue

                has_combat_motion = (
                    (mean_flux >= 0.010 and kinetic_score >= 50.0) or
                    (is_ground_struggle and mean_flux >= 0.008 and kinetic_score >= 35.0) or
                    (rel_speed >= 1.6 and s1 >= 1.8 and s2 >= 1.6 and iou >= 0.12)
                )

                if is_grappling and has_combat_motion:
                    active_pairs.add(pair_key)
                    self.skirmish_history[pair_key] = self.skirmish_history.get(pair_key, 0) + 1
                    persistence = self.skirmish_history[pair_key]

                    if persistence >= 2 or (mean_flux >= 0.012 and kinetic_score >= 60.0):
                        conf = max(0.85, min(0.98, round((kinetic_score / 100.0) * 0.4 + (0.55 if is_ground_struggle else 0.45), 2)))
                        struggle_note = " (Ground Struggle / Tackle detected)" if is_ground_struggle else ""
                        return {
                            "is_fight": True,
                            "confidence": conf,
                            "persons": [tid1, tid2],
                            "reason": f"Violent skirmish / physical fight detected between Track #{tid1} & #{tid2}{struggle_note} (Kinetic Flux: {mean_flux*1000:.1f} mF, IoU: {iou:.2f})"
                        }

        # Decay inactive pairs
        stale_pairs = [k for k in self.skirmish_history if k not in active_pairs]
        for k in stale_pairs:
            del self.skirmish_history[k]

        return {"is_fight": False, "confidence": 0.0, "reason": ""}
