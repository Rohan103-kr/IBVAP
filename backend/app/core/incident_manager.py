import json
import os
import time
import uuid
import logging
import threading
from typing import List, Dict, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("IncidentManager")

INCIDENTS_FILE = "demo/incidents.json"

SEVERITY_ORDER = {"INFO": 0, "WARNING": 1, "HIGH": 2, "CRITICAL": 3}

class IncidentManager:
    """
    Consolidates raw detections and triggers into unified security Incidents.
    Suppresses alert spam and maintains an incident timeline and evidence gallery.
    """
    def __init__(self, timeout_sec: float = 45.0):
        self.timeout_sec = timeout_sec
        self.incidents: Dict[str, Dict[str, Any]] = {}  # key: "camera_id_track_id"
        self.saved_incidents: List[Dict[str, Any]] = []
        self._last_save_time = 0.0
        self._save_lock = threading.Lock()
        self._load_incidents()

    def _load_incidents(self):
        if os.path.exists(INCIDENTS_FILE):
            try:
                with open(INCIDENTS_FILE, "r") as f:
                    self.saved_incidents = json.load(f)[:50]
            except Exception as e:
                logger.error(f"Error loading incidents file: {e}")
                self.saved_incidents = []

    def _save_incidents(self, force: bool = False):
        now = time.time()
        if not force and (now - self._last_save_time < 2.0):
            return
        self._last_save_time = now
        self.saved_incidents = self.saved_incidents[:50]
        data = list(self.saved_incidents)

        def _write():
            with self._save_lock:
                try:
                    os.makedirs(os.path.dirname(INCIDENTS_FILE) or ".", exist_ok=True)
                    tmp_file = f"{INCIDENTS_FILE}.tmp_{uuid.uuid4().hex[:6]}"
                    with open(tmp_file, "w") as f:
                        json.dump(data, f, indent=2)
                    os.replace(tmp_file, INCIDENTS_FILE)
                except Exception as e:
                    logger.error(f"Error saving incidents file: {e}")

        threading.Thread(target=_write, daemon=True).start()

    def _generate_ai_summary(
        self,
        camera_id: str,
        object_type: str,
        track_id: int,
        reasons: List[str],
        severity: str,
        score: int,
        identity_status: str = "UNRECOGNIZED"
    ) -> str:
        ident_str = f"{identity_status.lower().capitalize()} {object_type}"
        clean_reasons = [r.split(" (+")[0] for r in reasons]
        reason_text = " + ".join(clean_reasons) if clean_reasons else "routine observation"
        return f"{severity} Incident ({score}/100) on {camera_id} involving {ident_str} (Track #{track_id}). Primary indicators: {reason_text}."

    def update_incident(
        self,
        camera_id: str,
        track: Dict[str, Any],
        risk_result: Dict[str, Any],
        event_type: str,
        snapshot_filename: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Updates active incident for track, or creates new incident if none exists.
        Returns consolidated Incident dictionary with BIIE 5-question framework fields.
        """
        track_id = track["track_id"]
        key = f"{camera_id}_{track_id}"
        now_ts = time.time()
        timestamp_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now_ts))

        severity = risk_result["severity"]
        score = risk_result["score"]
        reasons = risk_result["reasons"]
        explanation = risk_result["explanation"]
        point_bd = risk_result.get("point_breakdown", risk_result.get("weights_applied", {}))
        identity_status = track.get("identity_status", "UNRECOGNIZED")

        if key in self.incidents:
            # Update existing active incident
            inc = self.incidents[key]
            inc["last_seen"] = timestamp_str
            inc["identity_status"] = identity_status

            # Update max risk score & highest severity
            if score > inc["max_risk_score"]:
                inc["max_risk_score"] = score

            if SEVERITY_ORDER.get(severity, 0) > SEVERITY_ORDER.get(inc["highest_severity"], 0):
                inc["highest_severity"] = severity
                inc["primary_event_type"] = event_type
                inc["explanation"] = explanation

            # Merge point breakdown (keep highest points per factor)
            current_bd = inc.setdefault("point_breakdown", {})
            for k, v in point_bd.items():
                current_bd[k] = max(current_bd.get(k, 0), v)

            # Append unique reasons
            for r in reasons:
                if r not in inc["reasons"]:
                    inc["reasons"].append(r)

            # Update AI summary
            inc["ai_summary"] = self._generate_ai_summary(
                camera_id, inc["object_type"], track_id, inc["reasons"], inc["highest_severity"], inc["max_risk_score"], identity_status
            )

            # Update SOP recommendation if escalated
            if inc["highest_severity"] == "CRITICAL" and inc["status"] != "RESOLVED":
                inc["status"] = "ESCALATED"
            inc["sop_recommendation"] = self._get_sop_recommendation(inc["primary_event_type"], inc["highest_severity"])

            # Append snapshot if provided
            if snapshot_filename and snapshot_filename not in inc["snapshots"]:
                inc["snapshots"].append(snapshot_filename)

            # Append timeline entry
            timeline_entry = {
                "timestamp": timestamp_str,
                "event_type": event_type,
                "camera_id": camera_id,
                "risk_score": score,
                "description": f"Track #{track_id} triggered {event_type} (Risk Score: {score})"
            }
            inc["timeline"].append(timeline_entry)

        else:
            # Create new Incident
            inc_id = f"INC-{int(now_ts)}-{uuid.uuid4().hex[:6]}"
            ai_sum = self._generate_ai_summary(
                camera_id, track["object_type"], track_id, reasons, severity, score, identity_status
            )
            init_status = "ESCALATED" if severity == "CRITICAL" else "ACTIVE"
            sop_action = self._get_sop_recommendation(event_type, severity)

            inc = {
                "incident_id": inc_id,
                "camera_id": camera_id,
                "track_id": track_id,
                "object_type": track["object_type"],
                "primary_event_type": event_type,
                "highest_severity": severity,
                "max_risk_score": score,
                "explanation": explanation,
                "ai_summary": ai_sum,
                "sop_recommendation": sop_action,
                "reasons": list(reasons),
                "point_breakdown": dict(point_bd),
                "identity_status": identity_status,
                "snapshots": [snapshot_filename] if snapshot_filename else [],
                "timeline": [
                    {
                        "timestamp": timestamp_str,
                        "event_type": event_type,
                        "camera_id": camera_id,
                        "risk_score": score,
                        "description": f"Incident initiated: {explanation}"
                    }
                ],
                "first_seen": timestamp_str,
                "last_seen": timestamp_str,
                "status": init_status,
                "operator_notes": ""
            }
            self.incidents[key] = inc
            self.saved_incidents.insert(0, inc)
            logger.info(f"🛡️ [INCIDENT INITIATED] {inc_id} ({event_type}) - Severity: {severity} - Max Risk: {score}")

        self._save_incidents()
        return inc

    def _get_sop_recommendation(self, event_type: str, severity: str) -> str:
        """Generates frontline SSB/BSF SOP action recommendation based on event type."""
        evt = (event_type or "").upper()
        if "NIGHT_MOVEMENT" in evt or "NIGHT" in evt:
            return "Activate high-intensity thermal spotlights on target quadrant, deploy sentry night patrol with night-vision optics."
        elif "PROBING" in evt:
            return "Lock PTZ auto-tracker onto target, alert perimeter towers of potential tactical breach reconnaissance."
        elif "STOP" in evt or "UNUSUAL_VEHICLE" in evt:
            return "Dispatch checkpoint sentry patrol to investigate stationary vehicle, verify driver manifest."
        elif "SPATIAL" in evt:
            return "Sound perimeter alarm, vector Quick Reaction Force (QRF) along correlated multi-camera trajectory."
        elif "FENCE" in evt or evt == "FENCE_CROSSING":
            return "Deploy Quick Reaction Force (QRF) to boundary perimeter, sound border horn, illuminate sector spotlights."
        elif "MISMATCH" in evt or "DRIVER" in evt:
            return "Halt vehicle at inspection bay, verify driver biometrics, cross-examine credentials against vehicle registration."
        elif "ANPR" in evt or "WATCHLIST" in evt:
            return "Seal Checkpoint Gates Alpha & Bravo, alert roadblock detachment, intercept suspect vehicle."
        elif "RESTRICTED" in evt or evt == "ZONE_ENTRY":
            if severity == "CRITICAL":
                return "Alert sentry bunker, dispatch tactical intercept team to restricted quadrant."
            return "Monitor PTZ optical zoom, verify authorization, issue loudspeaker warning if unmoving."
        elif "LOITERING" in evt:
            return "Activate border loudspeaker challenge, instruct subject to vacate buffer zone immediately."
        elif "PERIMETER" in evt or "APPROACH" in evt:
            return "Lock camera target tracking, notify adjacent watchtower sentry of incoming vector."
        return "Maintain visual tracking and log target telemetry in station duty register."


    def get_incidents(self, status: Optional[str] = None, severity: Optional[str] = None) -> List[Dict[str, Any]]:
        """Filter incidents by status or severity."""
        filtered = self.saved_incidents
        if status:
            filtered = [i for i in filtered if i.get("status") == status]
        if severity:
            filtered = [i for i in filtered if i.get("highest_severity") == severity]
        return filtered

    def update_incident_status(self, incident_id: str, status: str, notes: Optional[str] = None) -> bool:
        """Update operator status (ACTIVE, ACKNOWLEDGED, RESOLVED)."""
        for inc in self.saved_incidents:
            if inc["incident_id"] == incident_id:
                inc["status"] = status
                if notes is not None:
                    inc["operator_notes"] = notes
                self._save_incidents()
                return True
        return False

    def clear_incidents(self, camera_id: Optional[str] = None):
        """Clears active and saved incidents from memory and storage, optionally filtered by camera."""
        with self._save_lock:
            if camera_id:
                self.incidents = {
                    k: v for k, v in self.incidents.items()
                    if not k.startswith(f"{camera_id}_")
                }
                self.saved_incidents = [
                    inc for inc in self.saved_incidents
                    if inc.get("camera_id") != camera_id
                ]
                logger.info(f"Incidents for camera {camera_id} cleared successfully.")
            else:
                self.incidents.clear()
                self.saved_incidents.clear()
                logger.info("All incidents cleared successfully.")
        self._save_incidents(force=True)

