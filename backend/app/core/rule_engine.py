import logging
from typing import List, Dict, Any, Tuple, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RuleEngine")

class RuleEngine:
    """
    Evaluates tracked objects against security policies.
    Determines severity (INFO, WARNING, HIGH, CRITICAL) and risk score (0-100).
    """
    def __init__(self, loitering_threshold_sec: float = 10.0):
        self.loitering_threshold_sec = loitering_threshold_sec

    def evaluate(self, track: Dict[str, Any], zones: List[Dict[str, Any]], crossed_fences: List[Dict[str, Any]], day_night_context: str) -> List[Dict[str, Any]]:
        """
        Evaluate candidate security violations for a single tracked object.
        Returns list of rule violation triggers.
        """
        triggers = []
        track_id = track["track_id"]
        camera_id = track["camera_id"]
        obj_type = track["object_type"]
        duration = track.get("duration_sec", 0.0)

        # 1. Virtual Fence Crossing Rule (Highest Severity)
        if len(crossed_fences) > 0:
            for fence in crossed_fences:
                reasons = [
                    f"Crossed perimeter line '{fence['name']}'",
                    f"Track #{track_id} ({obj_type}) active for {duration}s"
                ]
                if day_night_context == "NIGHT":
                    reasons.append("Nighttime low-light conditions")

                triggers.append({
                    "event_type": "FENCE_CROSSING",
                    "severity": "CRITICAL" if day_night_context == "NIGHT" else "HIGH",
                    "risk_score": 95 if day_night_context == "NIGHT" else 85,
                    "reasons": reasons,
                    "fence_id": fence.get("fence_id", "FENCE-01"),
                    "zone_id": None
                })

        # 2. Restricted Zone Entry Rule
        for zone in zones:
            z_type = zone.get("type", "SAFE")
            z_name = zone.get("name", "Zone")
            z_id = zone.get("zone_id", "ZONE-01")

            if z_type == "RESTRICTED":
                reasons = [
                    f"Unauthorized entry into restricted zone '{z_name}'",
                    f"Object type: {obj_type.upper()}"
                ]
                score = 75
                severity = "HIGH"

                if day_night_context == "NIGHT":
                    reasons.append("Nighttime intrusion detected")
                    score += 15
                    severity = "CRITICAL"

                triggers.append({
                    "event_type": "ZONE_ENTRY",
                    "severity": severity,
                    "risk_score": min(score, 100),
                    "reasons": reasons,
                    "zone_id": z_id,
                    "fence_id": None
                })

            # 3. Loitering Rule (Dwelling > threshold in RESTRICTED or WATCH zone)
            if z_type in ["RESTRICTED", "WATCH"] and duration >= self.loitering_threshold_sec:
                reasons = [
                    f"Loitering duration ({duration:.1f}s) exceeded threshold ({self.loitering_threshold_sec}s)",
                    f"Present inside '{z_name}' zone"
                ]
                triggers.append({
                    "event_type": "LOITERING",
                    "severity": "HIGH" if z_type == "RESTRICTED" else "WARNING",
                    "risk_score": 80 if z_type == "RESTRICTED" else 55,
                    "reasons": reasons,
                    "zone_id": z_id,
                    "fence_id": None
                })

        # 4. Night Movement Rule (in public/watch areas)
        if day_night_context == "NIGHT" and len(zones) == 0 and len(crossed_fences) == 0 and duration > 3.0:
            triggers.append({
                "event_type": "NIGHT_MOVEMENT",
                "severity": "WARNING",
                "risk_score": 45,
                "reasons": [f"Unusual nighttime movement detected for Track #{track_id}"],
                "zone_id": None,
                "fence_id": None
            })

        return triggers
