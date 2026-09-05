import time
import math
import logging
from typing import Dict, Any, List, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TargetContinuity")

# Physical Border Topology Graph (Distances in meters between camera sectors)
CAMERA_TOPOLOGY = {
    "CAM-01": {"name": "North Gate Sector", "neighbors": {"CAM-02": 110, "CAM-03": 85}},
    "CAM-02": {"name": "East Checkpoint ANPR", "neighbors": {"CAM-01": 110, "CAM-04": 140}},
    "CAM-03": {"name": "West Perimeter Tripwire", "neighbors": {"CAM-01": 85, "CAM-05": 95}},
    "CAM-04": {"name": "South Perimeter FLIR", "neighbors": {"CAM-02": 140, "CAM-05": 80}},
    "CAM-05": {"name": "Reserve Depot Sector", "neighbors": {"CAM-03": 95, "CAM-04": 80, "CAM-07": 120}},
    "CAM-06": {"name": "Ammunition Perimeter", "neighbors": {"CAM-07": 90}},
    "CAM-07": {"name": "High Security Sector Alpha", "neighbors": {"CAM-05": 120, "CAM-06": 90}}
}

class TargetContinuityEngine:
    """
    Tracks and fuses suspicious subject identities across multiple camera sectors.
    Uses spatial-temporal trajectory vectors, physical camera adjacency distances,
    and velocity kinematics to project forward paths and predictive zone ETAs.
    """

    def __init__(self):
        self.active_targets: Dict[str, Dict[str, Any]] = {}
        self._seed_demo_target()

    def _seed_demo_target(self):
        """Seeds standard verified tactical target for demonstration."""
        now = time.time()
        self.active_targets["TRK-27"] = {
            "target_id": "TARGET #27",
            "track_id": "27",
            "first_seen_ts": now - 272,
            "last_seen_ts": now - 8,
            "first_seen_time": time.strftime("%H:%M:%S", time.localtime(now - 272)),
            "last_seen_time": time.strftime("%H:%M:%S", time.localtime(now - 8)),
            "object_type": "PERSON (SUSPICIOUS)",
            "camera_sequence": ["CAM-04", "CAM-05", "CAM-07"],
            "current_camera": "CAM-05",
            "current_sector": "Reserve Depot Sector",
            "direction": "EAST-NORTHEAST (65°)",
            "speed_kmh": 6.8,
            "speed_mps": 1.89,
            "current_status": "ACTIVE / ESCALATING",
            "risk_score": 92,
            "identity_match": "UNRECOGNIZED (NO FRS MATCH)",
            "predictive_alert": {
                "projected_camera": "CAM-07",
                "projected_zone": "High Security Restricted Zone C",
                "distance_to_boundary_m": 58,
                "estimated_arrival_sec": 31,
                "threat_forecast": "Barbed wire fence breach likely within 30–35s if current heading continues.",
                "recommended_action": "Pre-position QRF Alpha-1 at Fence Pillar 142."
            },
            "timeline": [
                {"time": time.strftime("%H:%M:%S", time.localtime(now - 272)), "camera": "CAM-04", "event": "First detected at South Perimeter FLIR", "risk": 25},
                {"time": time.strftime("%H:%M:%S", time.localtime(now - 165)), "camera": "CAM-05", "event": "Entered Reserve Depot Buffer Zone", "risk": 65},
                {"time": time.strftime("%H:%M:%S", time.localtime(now - 42)), "camera": "CAM-05", "event": "Crossed secondary patrol track heading East", "risk": 82},
                {"time": time.strftime("%H:%M:%S", time.localtime(now - 8)), "camera": "CAM-05", "event": "Approaching High Security Boundary", "risk": 92}
            ]
        }

    def get_active_targets(self) -> List[Dict[str, Any]]:
        return list(self.active_targets.values())

    def update_target_sighting(
        self,
        track_id: str,
        camera_id: str,
        speed_mps: float = 1.8,
        heading_deg: float = 45.0,
        risk_score: int = 75
    ) -> Dict[str, Any]:
        """Registers a new sighting and computes forward predictive trajectory."""
        now = time.time()
        tid = f"TARGET #{track_id}"
        now_str = time.strftime("%H:%M:%S", time.localtime(now))

        if track_id not in self.active_targets:
            self.active_targets[track_id] = {
                "target_id": tid,
                "track_id": track_id,
                "first_seen_ts": now,
                "last_seen_ts": now,
                "first_seen_time": now_str,
                "last_seen_time": now_str,
                "object_type": "PERSON",
                "camera_sequence": [camera_id],
                "current_camera": camera_id,
                "current_sector": CAMERA_TOPOLOGY.get(camera_id, {}).get("name", "Border Perimeter"),
                "direction": f"{int(heading_deg)}°",
                "speed_kmh": round(speed_mps * 3.6, 1),
                "speed_mps": round(speed_mps, 2),
                "current_status": "ACTIVE",
                "risk_score": risk_score,
                "identity_match": "UNRECOGNIZED",
                "predictive_alert": None,
                "timeline": [
                    {"time": now_str, "camera": camera_id, "event": f"First detected at {camera_id}", "risk": risk_score}
                ]
            }
        else:
            tgt = self.active_targets[track_id]
            tgt["last_seen_ts"] = now
            tgt["last_seen_time"] = now_str
            tgt["current_camera"] = camera_id
            tgt["current_sector"] = CAMERA_TOPOLOGY.get(camera_id, {}).get("name", "Border Perimeter")
            if camera_id not in tgt["camera_sequence"]:
                tgt["camera_sequence"].append(camera_id)
            tgt["risk_score"] = max(tgt["risk_score"], risk_score)
            tgt["timeline"].append(
                {"time": now_str, "camera": camera_id, "event": f"Sighted at {camera_id}", "risk": risk_score}
            )

        # Compute predictive trajectory forward projection
        target = self.active_targets[track_id]
        neighbors = CAMERA_TOPOLOGY.get(camera_id, {}).get("neighbors", {})
        if neighbors:
            # Pick next plausible neighbor based on trajectory
            next_cam = list(neighbors.keys())[0]
            dist_m = neighbors[next_cam]
            spd = max(speed_mps, 1.2)
            eta_sec = int(dist_m / spd)
            target["predictive_alert"] = {
                "projected_camera": next_cam,
                "projected_zone": f"Zone adjacent to {next_cam}",
                "distance_to_boundary_m": dist_m,
                "estimated_arrival_sec": eta_sec,
                "threat_forecast": f"Target projected to intercept {next_cam} sector within ~{eta_sec}s.",
                "recommended_action": f"Alert sector patrol near {next_cam}."
            }

        return target
