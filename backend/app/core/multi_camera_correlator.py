import time
import json
import os
import uuid
import logging
from typing import List, Dict, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MultiCameraCorrelator")

CORRELATIONS_FILE = "demo/correlations.json"

# Camera spatial topology (CAM-01 is adjacent to CAM-02, etc.)
CAMERA_TOPOLOGY = {
    "CAM-01": ["CAM-02"],
    "CAM-02": ["CAM-01", "CAM-03"],
    "CAM-03": ["CAM-02"]
}

class MultiCameraCorrelator:
    """
    Correlates target sightings across sequential camera feeds.
    Produces a unified CrossCameraTimeline (CAM-01 -> CAM-02) instead of disconnected alerts.
    """
    def __init__(self, time_window_sec: float = 60.0):
        self.time_window_sec = time_window_sec
        self.active_correlations: List[Dict[str, Any]] = []
        self._load()

    def _load(self):
        if os.path.exists(CORRELATIONS_FILE):
            try:
                with open(CORRELATIONS_FILE, "r") as f:
                    self.active_correlations = json.load(f)
            except Exception as e:
                logger.error(f"Error loading correlations file: {e}")

    def _save(self):
        try:
            with open(CORRELATIONS_FILE, "w") as f:
                json.dump(self.active_correlations, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving correlations file: {e}")

    def register_sighting(self, camera_id: str, track: Dict[str, Any], risk_score: int) -> Dict[str, Any]:
        """
        Registers object sighting. Checks if it correlates with recent sightings on adjacent cameras.
        """
        now = time.time()
        timestamp_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))
        obj_type = track["object_type"]
        track_id = track["track_id"]

        adjacent_cams = CAMERA_TOPOLOGY.get(camera_id, [])

        # Check for matching active correlation on adjacent cameras
        matched_corr = None
        for corr in self.active_correlations:
            if corr["object_type"] == obj_type:
                last_node = corr["route"][-1]
                if last_node["camera_id"] in adjacent_cams:
                    time_delta = now - last_node["timestamp_ts"]
                    if time_delta <= self.time_window_sec:
                        matched_corr = corr
                        break

        if matched_corr:
            # Append node to existing correlation
            time_delta = round(now - matched_corr["route"][-1]["timestamp_ts"], 1)
            node = {
                "camera_id": camera_id,
                "track_id": track_id,
                "timestamp": timestamp_str,
                "timestamp_ts": now,
                "risk_score": risk_score,
                "time_delta_sec": time_delta
            }
            matched_corr["route"].append(node)
            matched_corr["camera_chain"].append(camera_id)
            matched_corr.setdefault("time_deltas", []).append(time_delta)
            matched_corr["last_seen"] = timestamp_str
            matched_corr["total_cameras"] = len(set(matched_corr["camera_chain"]))
            chain_str = " ➔ ".join(matched_corr["camera_chain"])
            matched_corr["summary"] = f"Cross-camera chain: {chain_str} ({len(matched_corr['camera_chain'])} cameras, total time {round(now - matched_corr['route'][0]['timestamp_ts'], 1)}s)"
            if track.get("license_plate"):
                matched_corr["linked_anpr_plate"] = track["license_plate"]
            logger.info(f"🔗 [CROSS-CAMERA CORRELATION] Linked {camera_id} (Track #{track_id}) to chain {chain_str}")

        else:
            # Create new Multi-Camera Correlation
            corr_id = f"CORR-{int(now)}-{uuid.uuid4().hex[:6]}"
            matched_corr = {
                "correlation_id": corr_id,
                "object_type": obj_type,
                "camera_chain": [camera_id],
                "time_deltas": [0.0],
                "total_cameras": 1,
                "linked_anpr_plate": track.get("license_plate", None),
                "route": [
                    {
                        "camera_id": camera_id,
                        "track_id": track_id,
                        "timestamp": timestamp_str,
                        "timestamp_ts": now,
                        "risk_score": risk_score,
                        "time_delta_sec": 0.0
                    }
                ],
                "first_seen": timestamp_str,
                "last_seen": timestamp_str,
                "summary": f"Cross-camera movement initiated on {camera_id}"
            }
            self.active_correlations.insert(0, matched_corr)

        self._save()
        return matched_corr

    def get_correlations(self) -> List[Dict[str, Any]]:
        return self.active_correlations
