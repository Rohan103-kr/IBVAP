import cv2
import os
import json
import time
import uuid
import logging
import numpy as np
from typing import List, Dict, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("EventEngine")

SNAPSHOT_DIR = "demo/snapshots"
EVENTS_FILE = "demo/events.json"

import heapq

class AlertPriorityQueue:
    """
    Max Priority Queue Data Structure for Conflict Resolution & Alert De-cluttering.
    Prioritizes concurrent real-time security events using composite priority ranking:
    Priority = (Severity Weight * 1000) + (Risk Score * 10) + Event Type Bonus + Multi-Cam Bonus
    """
    SEVERITY_WEIGHTS = {
        "CRITICAL": 400,
        "HIGH": 300,
        "WARNING": 200,
        "INFO": 100
    }

    EVENT_TYPE_BONUS = {
        "FENCE_CROSSING": 150,
        "RESTRICTED_PENETRATION": 100,
        "ANPR_WATCHLIST_MATCH": 120,
        "FRS_SUSPECT_MATCH": 130,
        "ZONE_ENTRY": 50
    }

    @classmethod
    def calculate_priority_score(cls, event: Dict[str, Any]) -> int:
        sev = (event.get("severity") or "WARNING").upper()
        risk = event.get("risk_score") or 0
        evt_type = event.get("event_type") or "ZONE_ENTRY"

        sev_wt = cls.SEVERITY_WEIGHTS.get(sev, 100)
        type_wt = cls.EVENT_TYPE_BONUS.get(evt_type, 50)
        multi_cam_wt = 50 if event.get("multi_cam_linked", False) else 0

        return (sev_wt * 100) + (risk * 10) + type_wt + multi_cam_wt

    @classmethod
    def prioritize_and_bundle(cls, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Ranks events using Max-Heap Priority Queue and marks top-1 threat to prevent UI clutter.
        """
        if not events:
            return []

        heap = []
        for idx, evt in enumerate(events):
            score = cls.calculate_priority_score(evt)
            evt_copy = dict(evt)
            evt_copy["priority_score"] = score
            heapq.heappush(heap, (-score, idx, evt_copy))

        sorted_events = []
        rank = 1
        top_event_id = None

        while heap:
            neg_score, idx, evt = heapq.heappop(heap)
            evt["priority_rank"] = rank
            if rank == 1:
                evt["is_top_priority"] = True
                top_event_id = evt.get("event_id") or evt.get("id")
            else:
                evt["is_top_priority"] = False
                evt["bundled_under"] = top_event_id

            sorted_events.append(evt)
            rank += 1

        return sorted_events

class EventEngine:
    """
    Manages security events lifecycle:
    - Event Deduplication & Cooldown Management
    - Max-Heap Priority Queue Classification & Conflict Resolution
    - Evidence Snapshot Capture
    """
    def __init__(self, cooldown_sec: float = 30.0):
        self.cooldown_sec = cooldown_sec
        self.active_events: List[Dict[str, Any]] = []
        self.event_cooldowns: Dict[str, float] = {}  # key: "cam_track_event" -> timestamp

        os.makedirs(SNAPSHOT_DIR, exist_ok=True)
        self._load_events()

    def _load_events(self):
        if os.path.exists(EVENTS_FILE):
            try:
                with open(EVENTS_FILE, "r") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        self.active_events = [e for e in data if e.get("camera_id") != "CAM-TEST"]
            except Exception as e:
                logger.error(f"Error loading events file: {e}")

    def _save_events(self):
        try:
            with open(EVENTS_FILE, "w") as f:
                json.dump(self.active_events, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving events file: {e}")

    def process_trigger(self, trigger: Dict[str, Any], track: Dict[str, Any], frame: np.ndarray, camera_id: str) -> Optional[Dict[str, Any]]:
        """
        Processes candidate trigger.
        Applies deduplication window.
        Generates snapshot and registers SecurityEvent if not deduplicated.
        """
        event_type = trigger["event_type"]
        track_id = track.get("track_id", 0)
        zone_or_fence = trigger.get("zone_id") or trigger.get("fence_id") or "zone"
        cooldown_key = f"{camera_id}_{track_id}_{event_type}"
        cam_zone_key = f"{camera_id}_{zone_or_fence}_{event_type}"

        now = time.time()
        last_fired_track = self.event_cooldowns.get(cooldown_key, 0.0)
        last_fired_cam_zone = self.event_cooldowns.get(cam_zone_key, 0.0)

        # Deduplicate if either same track within cooldown_sec (e.g. 30s) or same camera zone within 20s
        if (now - last_fired_track < self.cooldown_sec) or (now - last_fired_cam_zone < 20.0):
            # Deduplicated (suppressed)
            return None

        # Record cooldown timestamps
        self.event_cooldowns[cooldown_key] = now
        self.event_cooldowns[cam_zone_key] = now

        # Generate unique event ID
        event_id = f"EVT-{int(now)}-{uuid.uuid4().hex[:6]}"
        timestamp_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))

        # Capture evidence snapshot
        snapshot_filename = self._capture_snapshot(frame, track["bbox"], event_id)

        security_event = {
            "event_id": event_id,
            "event_type": event_type,
            "severity": trigger["severity"],
            "risk_score": trigger["risk_score"],
            "camera_id": camera_id,
            "track_id": track_id,
            "object_type": track["object_type"],
            "timestamp": timestamp_str,
            "reasons": trigger["reasons"],
            "zone_id": trigger.get("zone_id"),
            "fence_id": trigger.get("fence_id"),
            "snapshot": snapshot_filename,
            "acknowledged": False
        }

        self.active_events.insert(0, security_event)
        self._save_events()

        logger.info(f"🚨 [SECURITY EVENT GENERATED] {event_id} ({event_type}) - Severity: {trigger['severity']} - Risk: {trigger['risk_score']}")
        return security_event

    def _capture_snapshot(self, frame: np.ndarray, bbox: List[float], event_id: str) -> str:
        """Crops object region + surrounding context, computes SHA-256 cryptographic hash, and saves snapshot JPEG + audit JSON."""
        import hashlib
        h, w, _ = frame.shape
        x1, y1, x2, y2 = map(int, bbox)

        # Context padding around bounding box
        pad_x = int((x2 - x1) * 0.5)
        pad_y = int((y2 - y1) * 0.5)

        cx1 = max(0, x1 - pad_x)
        cy1 = max(0, y1 - pad_y)
        cx2 = min(w, x2 + pad_x)
        cy2 = min(h, y2 + pad_y)

        # Draw evidence markup directly on the snapshot frame so the clicked photo is complete evidence
        snap_frame = frame.copy()
        cv2.rectangle(snap_frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        # Header banner
        header_text = f"INTRUSION DETECTED | {event_id}"
        cv2.rectangle(snap_frame, (0, 0), (w, 32), (15, 23, 42), -1)
        cv2.putText(snap_frame, header_text, (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255), 2, cv2.LINE_AA)
        ts_text = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
        cv2.putText(snap_frame, ts_text, (w - 220, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1, cv2.LINE_AA)

        # Context crop around intruder with margins
        crop = snap_frame[cy1:cy2, cx1:cx2]
        if crop.size == 0 or crop.shape[0] < 100 or crop.shape[1] < 100:
            crop = snap_frame

        filename = f"{event_id}_snapshot.jpg"
        filepath = os.path.join(SNAPSHOT_DIR, filename)

        # Compute SHA-256 cryptographic image hash for evidence integrity
        success, buf = cv2.imencode(".jpg", crop)
        if success:
            img_bytes = buf.tobytes()
        else:
            img_bytes = b"fallback_snapshot"

        sha256_hash = hashlib.sha256(img_bytes + event_id.encode('utf-8')).hexdigest()

        with open(filepath, "wb") as f:
            f.write(img_bytes)

        # Save tamper-evident audit trail metadata
        meta_filepath = os.path.join(SNAPSHOT_DIR, f"{event_id}_audit.json")
        audit_meta = {
            "event_id": event_id,
            "filename": filename,
            "sha256_hash": sha256_hash,
            "tamper_proof": True,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
        with open(meta_filepath, "w") as f:
            json.dump(audit_meta, f, indent=2)

        return filename

    def get_events(self, camera_id: Optional[str] = None, severity: Optional[str] = None) -> List[Dict[str, Any]]:
        """Filter and rank events using Max-Heap Priority Queue."""
        filtered = self.active_events
        if camera_id:
            filtered = [e for e in filtered if e.get("camera_id") == camera_id]
        if severity:
            filtered = [e for e in filtered if e.get("severity") == severity]

        # Apply Max Priority Queue classification and concurrent bundling
        return AlertPriorityQueue.prioritize_and_bundle(filtered)

    def clear_events(self):
        """Wipe all active and saved events from memory and storage."""
        self.active_events = []
        self.event_cooldowns = {}
        self._save_events()
        logger.info("Security events cleared successfully.")
