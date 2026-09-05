import json
import os
import logging
from typing import Dict, Any, List, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RiskEngine")

CONFIG_PATH = "configs/risk_config.json"

class RiskEngine:
    """
    Transparent Weighted Risk Model.
    Computes risk score S ∈ [0, 100], maps severity levels, and generates explainability text.
    """
    def __init__(self, config_path: str = CONFIG_PATH):
        self.config_path = config_path
        self.weights = {
            "fence_crossed": 30,
            "restricted_zone": 25,
            "night_time": 20,
            "toward_border": 15,
            "loitering": 10,
            "multi_camera": 15,
            "confidence_factor": 10
        }
        self.severity_thresholds = {
            "INFO": (0, 30),
            "WARNING": (31, 60),
            "HIGH": (61, 80),
            "CRITICAL": (81, 100)
        }
        self.load_config()

    def load_config(self):
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r") as f:
                    cfg = json.load(f)
                    self.weights = cfg.get("weights", self.weights)
            except Exception as e:
                logger.error(f"Error loading risk config: {e}")

    def compute_risk(self, features: Dict[str, Any], object_type: str = "person") -> Dict[str, Any]:
        """
        Calculates risk score (0-100), severity level, and plain-English explainability reasons.
        """
        score = 0
        reasons = []
        applied_weights = {}

        # 1. Fence Crossing (+35)
        if features.get("fence_crossed", False):
            w = max(self.weights.get("fence_crossed", 35), 35)
            score += w
            applied_weights["Fence Crossing"] = w
            reasons.append(f"Primary border fence line crossed (+{w})")

        # 2. Restricted Zone (+55 — guarantee immediate alert trigger when entered)
        if features.get("restricted_zone", False):
            w = max(self.weights.get("restricted_zone", 55), 55)
            score += w
            applied_weights["Restricted Zone"] = w
            reasons.append(f"Unauthorized intrusion in restricted zone (+{w})")

        # 3. Night-time (+20)
        if features.get("night_time", False):
            w = self.weights.get("night_time", 20)
            score += w
            applied_weights["Night Condition"] = w
            reasons.append(f"Night-time low visibility window (+{w})")

        # 4. Heading Toward Border (+15)
        if features.get("toward_border", False):
            w = self.weights.get("toward_border", 15)
            score += w
            applied_weights["Direction Toward Border"] = w
            reasons.append(f"Trajectory heading toward sensitive perimeter (+{w})")

        # 5. Loitering (+10)
        if features.get("is_loitering", False):
            w = self.weights.get("loitering", 10)
            duration = features.get("loitering_duration", 0.0)
            score += w
            applied_weights["Loitering"] = w
            reasons.append(f"Persistent loitering dwell time ({duration:.1f}s) (+{w})")

        # 6. Multi-camera appearance (+15)
        if features.get("multi_camera_appearances", 1) > 1:
            w = self.weights.get("multi_camera", 15)
            score += w
            applied_weights["Multi-Camera"] = w
            reasons.append(f"Spotted across multiple camera feeds (+{w})")

        # 7. Confidence Score (+10 max)
        conf = features.get("confidence_score", 0.8)
        conf_w = int(conf * self.weights.get("confidence_factor", 10))
        score += conf_w
        applied_weights["Detection Confidence"] = conf_w

        # 8. ML Behavioral Anomaly Score (+20 max)
        ml_score = features.get("ml_anomaly_score", 0.0)
        ml_cat = features.get("ml_threat_category", "NORMAL")
        if ml_score > 40.0:
            ml_w = int(min(20, (ml_score / 100.0) * 20))
            score += ml_w
            applied_weights["ML Behavioral Anomaly"] = ml_w
            reasons.append(f"AI Behavior Model detected {ml_cat} pattern ({ml_score:.1f}% confidence) (+{ml_w})")

        # 9. Identity Intelligence Context (+30 / +15 / -20)
        ident_status = features.get("identity_status", "UNRECOGNIZED")
        if ident_status == "UNAUTHORIZED":
            w = 30
            score += w
            applied_weights["Watchlist Identity Threat"] = w
            reasons.append(f"Matched watchlist suspect identity (+{w})")
        elif ident_status == "UNRECOGNIZED" and (features.get("restricted_zone") or features.get("fence_crossed")):
            w = 15
            score += w
            applied_weights["Unrecognized Identity"] = w
            reasons.append(f"Unrecognized person in restricted zone (+{w})")
        elif ident_status == "AUTHORIZED":
            w = -20
            score += w
            applied_weights["Authorized Friendly Patrol"] = w
            reasons.append(f"Recognized authorized friendly patrol (-20)")

        # 10. Object Specific Threats (Drones, Unattended Bags, Robots)
        if object_type == "drone":
            w = 35
            score += w
            applied_weights["Drone Aerial Threat"] = w
            reasons.append(f"Unidentified aerial drone threat in airspace (+{w})")
        elif object_type == "unattended_bag":
            w = 25
            score += w
            applied_weights["Unattended Luggage"] = w
            reasons.append(f"Unattended bag / luggage left in security zone (+{w})")
        elif object_type == "robot_device":
            w = 30
            score += w
            applied_weights["Unidentified UGV Robot"] = w
            reasons.append(f"Unidentified robotic / electronic ground device (+{w})")

        # False-Alarm Suppression: Suppress score for recognized authorized personnel or low confidence noise
        ident_status = features.get("identity_status", "UNRECOGNIZED")
        conf = features.get("confidence_score", 0.8)

        if ident_status == "AUTHORIZED":
            score = 0
            severity = "INFO"
            return {
                "score": 0,
                "severity": "INFO",
                "reasons": ["Recognized authorized friendly BSF patrol — False Alarm Suppressed"],
                "weights_applied": {"Authorized Patrol": 0},
                "point_breakdown": {"Authorized Patrol": 0},
                "explanation": "INFO: Recognized authorized friendly BSF patrol — False Alarm Suppressed"
            }

        if conf < 0.45:
            return {
                "score": 0,
                "severity": "INFO",
                "reasons": ["Low confidence detection noise (< 0.45) — Suppressed"],
                "weights_applied": {"Low Confidence Noise": 0},
                "point_breakdown": {"Low Confidence Noise": 0},
                "explanation": "INFO: Low confidence noise suppressed"
            }

        # Clamp score between 0 and 100
        score = max(0, min(score, 100))

        # Severity Mapping (WARNING strictly for risk score > 50)
        if score >= 81:
            severity = "CRITICAL"
        elif score >= 61:
            severity = "HIGH"
        elif score > 50:
            severity = "WARNING"
        else:
            severity = "INFO"

        # Generate Explainability Sentence ("WHY Engine")
        if len(reasons) > 0:
            explanation = f"{severity} risk event (Score: {score}/100) triggered by: " + " + ".join([r.split(" (+")[0] for r in reasons])
        else:
            explanation = f"{severity} routine object detection (Score: {score}/100)"

        return {
            "score": score,
            "severity": severity,
            "reasons": reasons,
            "weights_applied": applied_weights,
            "point_breakdown": applied_weights,
            "explanation": explanation
        }

