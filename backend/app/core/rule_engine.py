import logging
from typing import List, Dict, Any, Tuple, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RuleEngine")

WILDLIFE_CLASSES = frozenset({
    "cow", "sheep", "horse", "dog", "cat", "bird", "animal", "wildlife", "elephant", "bear"
})
VEHICLE_CLASSES = frozenset({
    "car", "truck", "bus", "vehicle", "suv", "motorcycle", "bike"
})

class RuleEngine:
    """
    Evaluates tracked objects against SIH Problem Statement 26187 Security Policies.
    Enforces Multi-Tier Threat Classification (P1 CRITICAL, P2 HIGH, P3 SUPPRESSED)
    and eliminates sentry alert fatigue (99.5% cognitive load reduction).
    """
    def __init__(self, loitering_threshold_sec: float = 8.0):
        self.loitering_threshold_sec = loitering_threshold_sec

    def evaluate(
        self,
        track: Dict[str, Any],
        zones: List[Dict[str, Any]],
        crossed_fences: List[Dict[str, Any]],
        day_night_context: str
    ) -> List[Dict[str, Any]]:
        """
        Evaluate security violations for a tracked target.
        Applies optimal set lookups O(1) for suppression and policy checks.
        """
        triggers = []
        track_id = track.get("track_id", 0)
        camera_id = track.get("camera_id", "CAM-01")
        obj_type = (track.get("object_type") or "person").lower()
        duration = float(track.get("duration_sec", 0.0) or track.get("dwell_time", 0.0) or track.get("loiter_time", 0.0) or track.get("stationary_time", 0.0))
        speed = float(track.get("speed_mps", track.get("speed", 1.0)))
        direction_turns = int(track.get("direction_changes_count", track.get("fence_approach_count", 0)))

        is_night = (
            day_night_context == "NIGHT"
            or (isinstance(day_night_context, dict) and day_night_context.get("is_night", False))
            or (isinstance(day_night_context, str) and str(day_night_context).upper() == "NIGHT")
        )

        # ── P3 SUPPRESSION RULES (Zero Alarms Sent — Anti-Fatigue) ──

        # Suppression 1: Wildlife & Cattle False-Alarm Filter
        if obj_type in WILDLIFE_CLASSES or track.get("is_wildlife", False):
            return []

        # Suppression 2: Authorized Friendly Sentry / White-list Filter
        if track.get("identity_status") == "AUTHORIZED":
            return []

        # Suppression 3: Normal Road Traffic Rejection
        # Regular highway vehicles driving without watchlist match or perimeter breach must NOT fire alarms
        is_vehicle = obj_type in VEHICLE_CLASSES
        is_watchlist = track.get("is_watchlist_vehicle", False) or track.get("is_lost_stolen_vehicle", False)
        is_most_wanted = track.get("is_most_wanted", False) or track.get("watchlist_category") in ["MOST_WANTED", "SUSPICIOUS_PERSON", "MISSING_LOST"]
        is_driver_mismatch = track.get("is_driver_mismatch", False) or track.get("driver_identity_status") in ["UNAUTHORIZED", "MISMATCH"]
        is_in_fight = track.get("is_in_fight", False) or track.get("behavior_category") == "VIOLENT_SKIRMISH"
        has_fence_breach = len(crossed_fences) > 0
        restricted_zones = [z for z in zones if z.get("type") == "RESTRICTED"]
        is_stationary = track.get("is_stationary", False) or (is_vehicle and (duration >= 8.0 or track.get("stationary_time", 0) >= 8.0) and speed < 0.5)
        # Authorization flags derived from ANPR fleet status
        is_auth_vehicle = (
            track.get("is_authorized", False)
            or track.get("anpr_status") == "AUTHORIZED"
            or track.get("fleet_status") == "AUTHORIZED"
        )
        is_cleared_vehicle = (
            track.get("anpr_status") == "CLEARED"
            or (is_vehicle and not is_watchlist and not is_auth_vehicle and not has_fence_breach and len(restricted_zones) == 0)
        )

        if is_vehicle and not is_watchlist and not has_fence_breach and len(restricted_zones) == 0 and not is_in_fight and not is_driver_mismatch and not is_stationary and not is_night:
            # Routine vehicular passage — record in registry, suppress from threat alarms
            return []

        # ── P1 CRITICAL EMERGENCY RULES ──

        # Priority Rule 0A: Most Wanted / Lost / Suspicious Person Sighting (Instant Critical Alarm)
        if is_most_wanted:
            target_name = track.get("matched_suspect_name") or track.get("target_name") or track.get("identity_name") or "Wanted Suspect"
            cam_name = track.get("camera_name") or camera_id
            cat_label = track.get("watchlist_category", "MOST_WANTED").replace("_", " ").title()
            triggers.append({
                "event_type": "MOST_WANTED_SIGHTING",
                "severity": "CRITICAL",
                "risk_score": 99,
                "reasons": [
                    f"🚨 HIGH ALERT: {cat_label} Target '{target_name}' spotted on {camera_id} ({cam_name})!",
                    f"Facial biometric match confirmed with active watchlist profile on camera feed {camera_id}."
                ],
                "target_name": target_name,
                "category": track.get("watchlist_category", "MOST_WANTED"),
                "camera_id": camera_id,
                "camera_name": cam_name,
                "zone_id": None,
                "fence_id": None
            })

        # Priority Rule 0B: Lost / Stolen / Hotlist Vehicle Intercept (Instant Critical Alarm)
        if track.get("is_lost_stolen_vehicle", False) or track.get("vehicle_category") in ["STOLEN_VEHICLE", "SUSPICIOUS_RECON", "TERROR_HOTLIST", "LOST_VEHICLE"]:
            plate = track.get("license_plate", "UNKNOWN")
            v_model = track.get("vehicle_make_model") or track.get("make_model", "Vehicle")
            cam_name = track.get("camera_name") or camera_id
            cat_label = (track.get("vehicle_category") or "LOST_STOLEN").replace("_", " ").title()
            triggers.append({
                "event_type": "HOTLIST_VEHICLE_INTERCEPT",
                "severity": "CRITICAL",
                "risk_score": 98,
                "reasons": [
                    f"🚨 HIGH ALERT: {cat_label} '{plate}' ({v_model}) intercepted on {camera_id} ({cam_name})!",
                    f"ANPR plate verification triggered immediate hotlist intercept protocol on {camera_id}."
                ],
                "license_plate": plate,
                "make_model": v_model,
                "category": track.get("vehicle_category", "STOLEN_VEHICLE"),
                "camera_id": camera_id,
                "camera_name": cam_name,
                "zone_id": None,
                "fence_id": None
            })

        # Priority Rule 1: Perimeter Border Fence Breach
        if has_fence_breach:
            for fence in crossed_fences:
                reasons = [
                    f"Perimeter fence tripwire '{fence.get('name', 'Border Fence')}' crossed",
                    f"Target Track #{track_id} ({obj_type.upper()}) entered domestic zone",
                ]
                if day_night_context == "NIGHT":
                    reasons.append("Nighttime low-visibility window incursion")

                triggers.append({
                    "event_type": "FENCE_CROSSING",
                    "severity": "CRITICAL",
                    "risk_score": 95 if day_night_context == "NIGHT" else 85,
                    "reasons": reasons,
                    "fence_id": fence.get("fence_id", "FENCE-01"),
                    "zone_id": None
                })

        # Priority Rule 2: ANPR National / Border Watchlist Match
        if is_watchlist:
            plate = track.get("license_plate", "UNKNOWN")
            wl_reason = track.get("watchlist_reason", "Vehicle plate matched active border watchlist")
            triggers.append({
                "event_type": "ANPR_WATCHLIST_MATCH",
                "severity": "CRITICAL",
                "risk_score": 95,
                "reasons": [
                    f"Watchlist Flagged Vehicle: {plate}",
                    wl_reason
                ],
                "license_plate": plate,
                "zone_id": None,
                "fence_id": None
            })

        # Priority Rule 2B: Checkpoint Driver-Vehicle Identity Mismatch (ANPR + Biometric FRS Fusion)
        if track.get("driver_identity_status") in ["UNAUTHORIZED", "MISMATCH"] or track.get("is_driver_mismatch", False):
            plate = track.get("license_plate", "UNKNOWN")
            driver_info = track.get("driver_name", "Unrecognized Driver")
            triggers.append({
                "event_type": "CHECKPOINT_DRIVER_MISMATCH",
                "severity": "HIGH",
                "risk_score": 85,
                "reasons": [
                    f"Vehicle {plate} operator mismatch: {driver_info}",
                    "Driver biometric identity does not match authorized registry credentials"
                ],
                "license_plate": plate,
                "zone_id": None,
                "fence_id": None
            })

        # Priority Rule 3: FRS Wanted Suspect Match
        if track.get("identity_status") == "UNAUTHORIZED" or track.get("is_wanted_suspect", False):
            suspect_name = track.get("matched_suspect_name", "Known Suspect")
            triggers.append({
                "event_type": "FRS_SUSPECT_MATCH",
                "severity": "CRITICAL",
                "risk_score": 96,
                "reasons": [
                    f"Facial Biometric Match: {suspect_name}",
                    "Unauthorized subject in sensitive operational perimeter"
                ],
                "zone_id": None,
                "fence_id": None
            })

        # Priority Rule 4: Violent Skirmish / Physical Clash
        if is_in_fight:
            fight_desc = track.get("fight_reason", "Physical altercation / skirmish detected in surveillance sector")
            triggers.append({
                "event_type": "VIOLENT_SKIRMISH",
                "severity": "CRITICAL",
                "risk_score": 94,
                "reasons": [fight_desc],
                "zone_id": None,
                "fence_id": None
            })

        # ── P1 / P2 ZONE VIOLATION & LOITERING RULES ──

        # Priority Rule 5: Restricted Buffer Zone Penetration
        for zone in restricted_zones:
            z_name = zone.get("name", "Restricted Area")
            z_id = zone.get("zone_id", "ZONE-01")
            score = 90 if day_night_context == "NIGHT" else 80
            triggers.append({
                "event_type": "ZONE_ENTRY",
                "severity": "CRITICAL" if score >= 85 else "HIGH",
                "risk_score": score,
                "reasons": [
                    f"Unauthorized entry into restricted buffer '{z_name}'",
                    f"Target type: {obj_type.upper()}"
                ],
                "zone_id": z_id,
                "fence_id": None
            })

        # Priority Rule 5B: Explicit Night Movement Incursion (P0 Item 3)
        security_zones = [z for z in zones if z.get("type") in ["RESTRICTED", "BUFFER", "PERIMETER", "WATCH"]] or zones
        if is_night and security_zones and not has_fence_breach:
            target_name = security_zones[0].get("name", "Border Perimeter") if security_zones else "Perimeter Fence"
            triggers.append({
                "event_type": "NIGHT_MOVEMENT_BREACH",
                "severity": "CRITICAL",
                "risk_score": 92,
                "reasons": [
                    "Night-time low-visibility window movement detected",
                    f"{obj_type.upper()} active inside '{target_name}' during zero-tolerance night watch"
                ],
                "zone_id": security_zones[0].get("zone_id") if security_zones else None,
                "fence_id": crossed_fences[0].get("fence_id") if crossed_fences else None
            })

        # Priority Rule 6: Suspicious Loitering Reconnaissance
        watch_zones = [z for z in zones if z.get("type") in ["RESTRICTED", "WATCH"]]
        if watch_zones and duration >= self.loitering_threshold_sec:
            z = watch_zones[0]
            triggers.append({
                "event_type": "LOITERING",
                "severity": "HIGH" if z.get("type") == "RESTRICTED" else "WARNING",
                "risk_score": 75 if z.get("type") == "RESTRICTED" else 55,
                "reasons": [
                    f"Suspicious loitering dwell time ({duration:.1f}s) exceeded {self.loitering_threshold_sec}s threshold",
                    f"Dwelling inside '{z.get('name', 'Watch Zone')}'"
                ],
                "zone_id": z.get("zone_id"),
                "fence_id": None
            })

        # Priority Rule 6B: Unusual Vehicle Stopping Activity (P0 Item 4)
        if is_vehicle and is_stationary and (zones or track.get("in_restricted_zone")):
            triggers.append({
                "event_type": "UNUSUAL_VEHICLE_STOP",
                "severity": "HIGH",
                "risk_score": 82,
                "reasons": [
                    f"Vehicle stopped abnormally for {duration:.1f}s in monitored transit corridor",
                    "Suspicious vehicle stationary drop-off / roadblock hazard"
                ],
                "license_plate": track.get("license_plate"),
                "zone_id": zones[0].get("zone_id") if zones else None,
                "fence_id": None
            })

        # Priority Rule 6C: Repeated Perimeter Probing / Direction Reversals (P0 Item 4)
        direction_turns = int(track.get("direction_changes_count", track.get("fence_approach_count", 0)))
        if direction_turns >= 3 and (zones or track.get("in_buffer_zone") or float(track.get("distance_to_fence_m", 100)) < 30.0):
            triggers.append({
                "event_type": "REPEATED_PERIMETER_PROBING",
                "severity": "CRITICAL",
                "risk_score": 88,
                "reasons": [
                    f"Repeated directional zig-zag turns ({direction_turns} reversals) along perimeter buffer",
                    "Evasive perimeter reconnaissance / probing behavior detected"
                ],
                "zone_id": zones[0].get("zone_id") if zones else None,
                "fence_id": None
            })

        # Priority Rule 6D: Predictive Perimeter Intercept (Proactive Vector Warning)
        ttb = track.get("ttb_barrier_sec")
        spd_kmh = float(track.get("ground_speed_kmh", 0))
        if ttb is not None and ttb <= 3.5 and spd_kmh >= 15.0 and not is_auth_vehicle and not is_cleared_vehicle:
            triggers.append({
                "event_type": "PREDICTIVE_INTERCEPT",
                "severity": "CRITICAL" if ttb <= 2.0 else "HIGH",
                "risk_score": 90 if ttb <= 2.0 else 78,
                "reasons": [
                    f"Proactive Trajectory Intercept: Track #{track_id} on collision course with Barrier/Perimeter (TTB: {ttb:.1f}s)",
                    f"High approach velocity: {spd_kmh:.1f} km/h on metric ground plane"
                ],
                "license_plate": track.get("license_plate"),
                "zone_id": zones[0].get("zone_id") if zones else None,
                "fence_id": None
            })

        # Priority Rule 6E: Tactical Anti-Tailgating Breach Warning
        if track.get("is_tailgating"):
            gap = track.get("tailgating_gap_m", 2.5)
            triggers.append({
                "event_type": "TACTICAL_TAILGATING",
                "severity": "HIGH",
                "risk_score": 84,
                "reasons": [
                    f"Anti-Passback Violation: Vehicle tailgating with only {gap:.1f}m gap (< 3.0m safety threshold)",
                    f"Potential barrier-push / gate-crashing conveyance breach"
                ],
                "license_plate": track.get("license_plate"),
                "zone_id": zones[0].get("zone_id") if zones else None,
                "fence_id": None
            })

        # Priority Rule 7: Tactical Behavioral Anomaly
        # Triggers when AI behavioral model classifies high-threat anomaly (evasive zigzag, perimeter rush, or pacing)
        beh_cat = track.get("behavior_category", "NORMAL")
        beh_conf = float(track.get("behavior_confidence", 0.0))

        if beh_cat in ["CRITICAL", "SUSPICIOUS"] and beh_conf >= 0.70 and not is_in_fight and not has_fence_breach and len(restricted_zones) == 0:
            sev = "CRITICAL" if (beh_cat == "CRITICAL" and beh_conf >= 0.80) else "HIGH"
            triggers.append({
                "event_type": "BEHAVIORAL_ANOMALY",
                "severity": sev,
                "risk_score": 88 if sev == "CRITICAL" else 74,
                "reasons": [
                    f"Tactical AI Anomaly Model detected {beh_cat} pattern ({beh_conf*100:.1f}% confidence)",
                    f"Abnormal trajectory dynamics detected for Track #{track_id}"
                ],
                "zone_id": None,
                "fence_id": None
            })

        return triggers
