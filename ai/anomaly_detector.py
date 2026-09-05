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
                suspicious_prob = float(probs[1]) if len(probs) > 1 else 0.0
                critical_prob = float(probs[2]) if len(probs) > 2 else 0.0
                anomaly_score = float((suspicious_prob * 0.6 + critical_prob * 1.0) * 100.0)

                pred_class_idx = int(np.argmax(probs))
                labels = ["NORMAL", "SUSPICIOUS", "CRITICAL"]
                category = labels[pred_class_idx] if pred_class_idx < len(labels) else "SUSPICIOUS"

                return {
                    "anomaly_detected": category != "NORMAL",
                    "anomaly_score": round(anomaly_score, 1),
                    "threat_category": category,
                    "confidence": round(float(probs[pred_class_idx]), 3),
                    "probabilities": {
                        "normal": round(float(probs[0]), 3),
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

        diffs = [np.mean(np.abs(clip_frames[i] - clip_frames[i-1])) for i in range(1, len(clip_frames))]
        kinetic_energy = float(np.std(diffs) * 10.0 + np.mean(diffs) * 5.0)
        score = min(1.0, max(0.0, kinetic_energy))

        is_anomaly = score >= self.threat_threshold
        return {
            "anomaly_detected": is_anomaly,
            "anomaly_score": round(score * 100, 1),
            "threat_category": "HIGH_KINETIC_MOTION" if is_anomaly else "NORMAL",
            "confidence": round(score, 2)
        }
