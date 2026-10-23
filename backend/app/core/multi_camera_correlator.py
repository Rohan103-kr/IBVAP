import time
import json
import os
import uuid
import re
import logging
import threading
from typing import List, Dict, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MultiCameraCorrelator")

CORRELATIONS_FILE = "demo/correlations.json"

# Tactical spatial roles assigned across border sectors
CAMERA_SPATIAL_ROLES = {
    "CAM-01": "APPROACH",
    "CAM-02": "FENCE_TRIPWIRE",
    "CAM-03": "ZERO_LINE_CORE",
    "CAM-04": "PERIMETER_FLIR",
    "CAM-05": "OUTPOST_DELTA",
    "CAM-06": "RESERVE_SECTOR"
}

# Camera spatial topology (CAM-01 is adjacent to CAM-02, etc.)
CAMERA_TOPOLOGY = {
    "CAM-01": ["CAM-02"],
    "CAM-02": ["CAM-01", "CAM-03"],
    "CAM-03": ["CAM-02", "CAM-04"],
    "CAM-04": ["CAM-03", "CAM-05"],
    "CAM-05": ["CAM-04", "CAM-06"],
    "CAM-06": ["CAM-05"]
}

class MultiCameraCorrelator:
    """
    Correlates target sightings across sequential camera feeds.
    Produces a unified CrossCameraTimeline (CAM-01 -> CAM-02) instead of disconnected alerts.
    """
    def __init__(self, time_window_sec: float = 60.0):
        self.time_window_sec = time_window_sec
        self.active_correlations: List[Dict[str, Any]] = []
        self._last_save_time = 0.0
        self._load()

    def _load(self):
        if os.path.exists(CORRELATIONS_FILE):
            try:
                with open(CORRELATIONS_FILE, "r") as f:
                    self.active_correlations = json.load(f)[:50]
            except Exception as e:
                logger.error(f"Error loading correlations file: {e}")
                self.active_correlations = []

    def _save(self, force: bool = False):
        now = time.time()
        if not force and (now - self._last_save_time < 2.0):
            return
        self._last_save_time = now
        self.active_correlations = self.active_correlations[:50]
        data = list(self.active_correlations)

        def _write():
            try:
                tmp_file = f"{CORRELATIONS_FILE}.tmp.{os.getpid()}"
                with open(tmp_file, "w") as f:
                    json.dump(data, f, indent=2)
                os.replace(tmp_file, CORRELATIONS_FILE)
            except Exception as e:
                logger.error(f"Error saving correlations file: {e}")

        threading.Thread(target=_write, daemon=True).start()

    def register_sighting(self, camera_id: str, track: Dict[str, Any], risk_score: int) -> Dict[str, Any]:
        """
        Registers object sighting. Checks if it correlates with recent sightings on adjacent cameras.
        """
        now = time.time()
        timestamp_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))
        obj_type = track["object_type"]
        track_id = track["track_id"]

        adjacent_cams = CAMERA_TOPOLOGY.get(camera_id, [])

        # Check for matching active correlation
        matched_corr = None
        track_plate = track.get("license_plate")
        norm_track_plate = re.sub(r'[^A-Z0-9]', '', str(track_plate).upper()) if track_plate else ""

        # Tier 1: Match directly on recognized ANPR license plate across cameras
        if norm_track_plate and len(norm_track_plate) >= 4:
            for corr in self.active_correlations:
                existing_plate = corr.get("linked_anpr_plate")
                if existing_plate:
                    norm_existing = re.sub(r'[^A-Z0-9]', '', str(existing_plate).upper())
                    if norm_track_plate == norm_existing:
                        matched_corr = corr
                        break

        # Tier 2: Fallback to spatial-topology and time-window correlation on adjacent cameras
        if not matched_corr:
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
            
            # Evaluate Multi-Camera Spatial Fence progression
            spatial_eval = self._evaluate_spatial_fence(matched_corr["camera_chain"])
            matched_corr.update(spatial_eval)
            logger.info(f"🔗 [CROSS-CAMERA CORRELATION] Linked {camera_id} (Track #{track_id}) to chain {chain_str} [{spatial_eval['spatial_fence_status']}]")

        else:
            # Create new Multi-Camera Correlation
            corr_id = f"CORR-{int(now)}-{uuid.uuid4().hex[:6]}"
            initial_chain = [camera_id]
            spatial_eval = self._evaluate_spatial_fence(initial_chain)
            matched_corr = {
                "correlation_id": corr_id,
                "object_type": obj_type,
                "camera_chain": initial_chain,
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
            matched_corr.update(spatial_eval)
            self.active_correlations.insert(0, matched_corr)

        self._save()
        return matched_corr

    def _evaluate_spatial_fence(self, camera_chain: List[str]) -> Dict[str, Any]:
        """
        Evaluates cross-camera trajectory against multi-tier perimeter defense:
        - CAM-01 (Approach corridor)
        - CAM-02 (Fence Tripwire chokepoint)
        - CAM-03 (Zero-Line Core border boundary)
        """
        unique_cams = list(dict.fromkeys(camera_chain))
        has_cam1 = "CAM-01" in unique_cams
        has_cam2 = "CAM-02" in unique_cams
        has_cam3 = "CAM-03" in unique_cams

        if has_cam1 and has_cam2 and has_cam3:
            return {
                "spatial_fence_status": "CONFIRMED_SPATIAL_INTRUSION",
                "spatial_alert_level": "CRITICAL",
                "tactical_assessment": "Target has progressed sequentially through Approach (CAM-01) ➔ Fence Tripwire (CAM-02) ➔ Zero-Line Core (CAM-03). Immediate tactical QRF interdiction triggered.",
                "spatial_breach_depth": 3,
                "spatial_chain": " ➔ ".join([f"{c} [{CAMERA_SPATIAL_ROLES.get(c, 'SECTOR')}]" for c in unique_cams])
            }
        elif has_cam2 and has_cam3:
            return {
                "spatial_fence_status": "CONFIRMED_SPATIAL_INTRUSION",
                "spatial_alert_level": "CRITICAL",
                "tactical_assessment": "Target penetrated from Fence Tripwire (CAM-02) directly into Zero-Line Core (CAM-03).",
                "spatial_breach_depth": 3,
                "spatial_chain": " ➔ ".join([f"{c} [{CAMERA_SPATIAL_ROLES.get(c, 'SECTOR')}]" for c in unique_cams])
            }
        elif has_cam3:
            return {
                "spatial_fence_status": "CONFIRMED_SPATIAL_INTRUSION",
                "spatial_alert_level": "CRITICAL",
                "tactical_assessment": "Target detected directly in Zero-Line Core (CAM-03).",
                "spatial_breach_depth": 3,
                "spatial_chain": " ➔ ".join([f"{c} [{CAMERA_SPATIAL_ROLES.get(c, 'SECTOR')}]" for c in unique_cams])
            }
        elif has_cam1 and has_cam2:
            return {
                "spatial_fence_status": "PERIMETER_PROBING",
                "spatial_alert_level": "HIGH",
                "tactical_assessment": "Target moved from outer Approach (CAM-01) inward to Fence Tripwire chokepoint (CAM-02).",
                "spatial_breach_depth": 2,
                "spatial_chain": " ➔ ".join([f"{c} [{CAMERA_SPATIAL_ROLES.get(c, 'SECTOR')}]" for c in unique_cams])
            }
        elif has_cam1:
            return {
                "spatial_fence_status": "MONITORED_APPROACH",
                "spatial_alert_level": "NORMAL",
                "tactical_assessment": "Target tracked in outer approach corridor.",
                "spatial_breach_depth": 1,
                "spatial_chain": f"CAM-01 [{CAMERA_SPATIAL_ROLES['CAM-01']}]"
            }
        else:
            return {
                "spatial_fence_status": "SECTOR_ACTIVITY",
                "spatial_alert_level": "MEDIUM",
                "tactical_assessment": f"Target active in sectors: {', '.join(unique_cams)}.",
                "spatial_breach_depth": len(unique_cams),
                "spatial_chain": " ➔ ".join([f"{c} [{CAMERA_SPATIAL_ROLES.get(c, 'SECTOR')}]" for c in unique_cams])
            }

    def get_correlations(self) -> List[Dict[str, Any]]:
        return self.active_correlations
