import cv2
import numpy as np
import time
from typing import List, Tuple, Dict, Any

CLASS_COLORS = {
    "person": (0, 255, 127),      # Spring green
    "vehicle": (255, 165, 0),     # Orange
    "car": (255, 165, 0),
    "truck": (255, 69, 0),
    "bus": (255, 215, 0),
    "motorcycle": (186, 85, 211)
}

def get_centroid(bbox: List[float]) -> List[float]:
    """Calculate centroid [cx, cy] of bounding box [x1, y1, x2, y2]."""
    x1, y1, x2, y2 = bbox
    return [(x1 + x2) / 2.0, (y1 + y2) / 2.0]

def draw_light_corner_box(img: np.ndarray, bbox: Tuple[int, int, int, int], color: Tuple[int, int, int], line_len: int = 7, thickness: int = 1):
    """
    Draws a sleek, tactical 1px box with subtle corner brackets.
    Non-intrusive and lightweight so it never obscures or heavily overlays the video.
    """
    x1, y1, x2, y2 = bbox
    # 1px thin crisp rectangle
    cv2.rectangle(img, (x1, y1), (x2, y2), color, thickness, cv2.LINE_AA)
    # Corner brackets (4 corners) for tactical aesthetic
    d = min(line_len, max(3, (x2 - x1) // 4), max(3, (y2 - y1) // 4))
    cv2.line(img, (x1, y1), (x1 + d, y1), color, thickness + 1, cv2.LINE_AA)
    cv2.line(img, (x1, y1), (x1, y1 + d), color, thickness + 1, cv2.LINE_AA)
    cv2.line(img, (x2, y1), (x2 - d, y1), color, thickness + 1, cv2.LINE_AA)
    cv2.line(img, (x2, y1), (x2, y1 + d), color, thickness + 1, cv2.LINE_AA)
    cv2.line(img, (x1, y2), (x1 + d, y2), color, thickness + 1, cv2.LINE_AA)
    cv2.line(img, (x1, y2), (x1, y2 - d), color, thickness + 1, cv2.LINE_AA)
    cv2.line(img, (x2, y2), (x2 - d, y2), color, thickness + 1, cv2.LINE_AA)
    cv2.line(img, (x2, y2), (x2, y2 - d), color, thickness + 1, cv2.LINE_AA)

def draw_subtle_label(img: np.ndarray, text: str, pos: Tuple[int, int], text_color: Tuple[int, int, int], bg_color: Tuple[int, int, int] = (15, 23, 42), font_scale: float = 0.36):
    """
    Draws a clean, non-intrusive micro-pill label with translucent dark background.
    Never obstructs facial features or scene context.
    """
    (tw, th), baseline = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, 1)
    x, y = pos
    x2 = min(img.shape[1] - 2, x + tw + 6)
    y1 = max(2, y - th - 5)
    y2 = min(img.shape[0] - 2, y + 2)

    # Semi-transparent dark pill so video is still visible underneath
    sub = img[y1:y2, x:x2]
    if sub.shape[0] > 0 and sub.shape[1] > 0:
        dark_rect = np.full(sub.shape, bg_color, dtype=np.uint8)
        cv2.addWeighted(dark_rect, 0.65, sub, 0.35, 0, sub)
        img[y1:y2, x:x2] = sub
        cv2.rectangle(img, (x, y1), (x2, y2), (80, 95, 115), 1, cv2.LINE_AA)

    cv2.putText(img, text, (x + 3, y - 2), cv2.FONT_HERSHEY_SIMPLEX, font_scale, text_color, 1, cv2.LINE_AA)

def draw_tactical_plate_badge(img: np.ndarray, bbox: Tuple[int, int, int, int], plate_text: str, is_auth: bool = False, is_watchlist: bool = False, is_upgraded: bool = False):
    """
    Dedicated High-Security HSRP License Plate HUD Badge:
    - Real-time plate display with IND blue holographic band
    - Color-coded security borders (Red for Watchlist, Green for Authorized Fleet, Dark Slate for Cleared)
    - Emerald verification pip if plate was refined via real-time progressive upgrade
    """
    px1, py1, px2, py2 = bbox
    pw, ph = px2 - px1, py2 - py1
    if pw < 20 or ph < 8:
        return

    # Draw filled white plate rectangle
    cv2.rectangle(img, (px1, py1), (px2, py2), (255, 255, 255), -1)

    # Border color: Green for authorized or upgraded, Red for watchlist, Dark for normal
    border_color = (74, 222, 128) if is_auth else ((30, 30, 245) if is_watchlist else ((74, 222, 128) if is_upgraded else (15, 23, 42)))
    cv2.rectangle(img, (px1, py1), (px2, py2), border_color, 2, cv2.LINE_AA)

    # Left IND blue stripe
    sw = max(6, int(pw * 0.12))
    cv2.rectangle(img, (px1, py1), (px1 + sw, py2), (153, 51, 0), -1) # BGR for IND blue (0, 51, 153)

    # "IND" label
    ind_font_scale = max(0.20, min(0.32, ph * 0.025))
    cv2.putText(img, "IND", (px1 + 2, py1 + int(ph * 0.70)), cv2.FONT_HERSHEY_SIMPLEX, ind_font_scale, (255, 255, 255), 1, cv2.LINE_AA)

    # License Plate Text
    text_x = px1 + sw + 4
    text_y = py1 + int(ph * 0.72)
    font_scale = max(0.30, min(0.55, (pw - sw - 6) / (max(len(plate_text), 1) * 11)))
    cv2.putText(img, plate_text, (text_x, text_y), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (15, 23, 42), 2, cv2.LINE_AA)

    # If upgraded in real time, draw subtle emerald verification dot
    if is_upgraded:
        cv2.circle(img, (px2 - 7, py1 + ph // 2), 3, (74, 222, 128), -1, cv2.LINE_AA)

def draw_annotations(frame: np.ndarray, tracked_objects: List[Dict[str, Any]], fps: float, camera_id: str, status: str) -> np.ndarray:
    """
    Clean, non-intrusive HUD annotations:
    - Persons: Single clean box on face with LBPH recognition tag and behavior telemetry.
    - Vehicles: Dedicated tactical license plate badge on bumper with clearance status.
    """
    annotated = frame
    h, w, _ = annotated.shape

    # Draw Tracked Objects
    for obj in tracked_objects:
        bbox = obj["bbox"]
        track_id = obj.get("track_id", -1)
        obj_type = obj.get("object_type", "object")
        trajectory = obj.get("trajectory", [])
        ident_status = str(obj.get("identity_status") or "UNRECOGNIZED")
        ident_name = str(obj.get("identity_name") or "")

        x1, y1, x2, y2 = map(int, bbox)
        pw, ph = x2 - x1, y2 - y1

        is_demo_1 = bool(obj.get("demo_1_mode", False))

        if obj_type == "person":
            # Check if person is Authorized Friendly Patrol / Known Face
            is_authorized = (ident_status == "AUTHORIZED") or (ident_name and any(k in ident_name.upper() for k in ["OFFICER", "CAPTAIN", "PATROL", "AUTHORIZED"]) or "AUTHORIZED" in ident_status.upper()) or is_demo_1

            # ── ONLY ONE BOX ON THE FACE (No body box, no duplicate nested boxes) ──
            face_bbox = obj.get("face_bbox", None)
            if not face_bbox:
                # Precise face/head region: upper 28% of person body
                face_bbox = [
                    x1 + int(pw * 0.18),
                    y1 + int(ph * 0.03),
                    x2 - int(pw * 0.18),
                    y1 + int(ph * 0.28)
                ]

            fx1, fy1, fx2, fy2 = map(int, face_bbox)
            fx1, fy1 = max(0, fx1), max(0, fy1)
            fx2, fy2 = min(w, fx2), min(h, fy2)

            is_most_wanted = obj.get("is_most_wanted", False)

            if (fx2 - fx1) >= 8 and (fy2 - fy1) >= 8:
                if is_demo_1 and camera_id == "CAM-03":
                    box_color = (74, 222, 128)     # Emerald Green
                    label_text = "P-03  PERSON · FRS: AUTHORIZED PATROL / VERIFIED"
                    text_color = (187, 247, 208)
                    beh_str = "BASE: +20 | PATROL OFFSET: -20 | FINAL RISK: 0 | ACTION: SUPPRESSED"
                    beh_col = (74, 222, 128)
                elif is_most_wanted:
                    box_color = (20, 20, 255)      # Intense Tactical Red
                    label_text = f"🚨 MOST WANTED: {ident_name if ident_name else 'TARGET'}"
                    text_color = (255, 255, 255)
                    beh_str = f"HIGH ALERT SIGHTING · {camera_id}"
                    beh_col = (20, 20, 255)
                elif is_authorized:
                    box_color = (74, 222, 128)    # Light emerald green
                    label_text = f"{ident_name if ident_name else 'AUTHORIZED'}"
                    text_color = (187, 247, 208)
                    beh_str = "AUTHORIZED PATROL · ALARMS SUPPRESSED"
                    beh_col = (74, 222, 128)
                elif ident_status == "UNAUTHORIZED":
                    box_color = (96, 96, 239)     # Light soft red / suspect
                    label_text = f"SUSPECT: {ident_name if ident_name else 'WATCHLIST'}"
                    text_color = (254, 202, 202)
                    beh_str = "WATCHLIST SUSPECT"
                    beh_col = (96, 96, 239)
                else:
                    box_color = (200, 215, 230)   # Light soft silver / clean white
                    label_text = f"FACE #{track_id}"
                    text_color = (241, 245, 249)
                    beh_cat = obj.get("behavior_category", "NORMAL")
                    is_loit = obj.get("is_loitering", False)
                    is_fight = obj.get("is_in_fight", False) or (beh_cat == "VIOLENT_SKIRMISH")
                    dur = float(obj.get("duration_sec", obj.get("dwell_time", 0.0)))
                    speed = float(obj.get("speed_mps", 1.0))
                    if is_fight:
                        beh_str = "VIOLENT SKIRMISH / FIGHT DETECTED"
                        beh_col = (30, 30, 245)
                    elif is_loit or dur >= 8.0:
                        beh_str = f"LOITERING ({dur:.0f}s)"
                        beh_col = (250, 204, 21)
                    elif beh_cat in ["SUSPICIOUS", "CRITICAL"]:
                        beh_str = f"AI BEHAVIOR: {beh_cat}"
                        beh_col = (96, 96, 239) if beh_cat == "CRITICAL" else (249, 115, 22)
                    else:
                        beh_str = f"NORMAL ({speed:.1f} m/s)"
                        beh_col = (148, 163, 184)

                # Draw single, sleek, light corner box around face
                draw_light_corner_box(annotated, (fx1, fy1, fx2, fy2), box_color, line_len=8 if is_most_wanted else 6, thickness=2 if (is_most_wanted or is_demo_1) else 1)

                # Draw minimal translucent micro-pill above face
                lbl_y = max(12, fy1 - 3)
                draw_subtle_label(annotated, label_text, (fx1, lbl_y), text_color=text_color)

                beh_y = min(h - 6, fy2 + 13)
                draw_subtle_label(annotated, beh_str, (fx1, beh_y), text_color=beh_col)

        elif obj_type in ["car", "truck", "bus", "vehicle", "suv", "motorcycle", "bike"]:
            # ── VEHICLE & CONVOY HUD ANNOTATION ──
            is_lost_stolen = obj.get("is_lost_stolen_vehicle", False)
            is_veh_auth = (ident_status == "AUTHORIZED") or (obj.get("vehicle_clearance") == "AUTHORIZED_CONVOY")
            is_veh_watchlist = obj.get("is_watchlist_vehicle", False) or (ident_status == "UNAUTHORIZED")
            plate = obj.get("license_plate", None)
            v_type = str(obj.get("vehicle_type") or obj_type or "VEHICLE").upper()

            if is_demo_1 and camera_id == "CAM-07":
                box_color = (56, 189, 248)  # Tactical Sky Blue
                if v_type == "TRUCK" or "TRUCK" in str(obj.get("raw_class", "")).upper():
                    label_text = "V-13  TRUCK 94%   BEHAVIOR: NORMAL   STATUS: ROUTINE   RISK: 0"
                    sub_label = "STATUS: ROUTINE · MEDIUM COMMERCIAL TRUCK · ALARMS SUPPRESSED"
                else:
                    label_text = "V-12  CAR   96%   BEHAVIOR: NORMAL   STATUS: ROUTINE   RISK: 0"
                    sub_label = "STATUS: ROUTINE · LOGISTICS SUPPLY ROAD · NO INCIDENT"
                text_color = (241, 245, 249)
                sub_color = (148, 163, 184)
            elif is_lost_stolen:
                box_color = (20, 20, 255)       # Tactical high-alert red
                label_text = f"🚨 LOST/STOLEN: {plate if plate else 'HOTLIST'}"
                text_color = (255, 255, 255)
                sub_label = f"HIGH ALERT: INTERCEPT ORDER AT {camera_id}"
                sub_color = (20, 20, 255)
            elif is_veh_auth:
                box_color = (74, 222, 128)      # Emerald green
                label_text = f"✓ AUTHORIZED CONVOY: {plate if plate else v_type}"
                text_color = (187, 247, 208)
                sub_label = "ZONE EXEMPT: Alarms Suppressed"
                sub_color = (74, 222, 128)
            elif is_veh_watchlist:
                box_color = (30, 30, 245)       # Tactical red
                label_text = f"🚨 WATCHLIST HIT: {plate if plate else 'SUSPECT'}"
                text_color = (254, 202, 202)
                sub_label = f"CRITICAL: {obj.get('watchlist_reason', 'Flagged Vehicle')}"
                sub_color = (30, 30, 245)
            else:
                box_color = (56, 189, 248)      # Sky blue / Cyan
                is_upgraded = bool(obj.get("plate_upgraded", False))
                label_text = f"{v_type} #{track_id}" + (f" · {plate}" if plate else "") + (" [UPGRADED ✓]" if is_upgraded else "")
                text_color = (241, 245, 249)
                sub_label = "STATUS: CLEARED"
                sub_color = (148, 163, 184)

            # Draw sleek corner box around vehicle
            draw_light_corner_box(annotated, (x1, y1, x2, y2), box_color, line_len=12, thickness=2 if (is_lost_stolen or is_veh_auth or is_veh_watchlist or is_demo_1) else 1)

            # Top header pill
            draw_subtle_label(annotated, label_text, (x1, max(14, y1 - 4)), text_color=text_color)

            # Bottom directive pill if clearance, alert, or demo 1 active
            if is_lost_stolen or is_veh_auth or is_veh_watchlist or is_demo_1:
                draw_subtle_label(annotated, sub_label, (x1, min(h - 8, y2 + 13)), text_color=sub_color)

            # Draw dedicated License Plate badge on vehicle bumper
            if plate and not is_demo_1:
                plate_box = obj.get("plate_bbox", None)
                if not plate_box:
                    bw = int(pw * 0.40)
                    bh = max(18, int(ph * 0.12))
                    bx1 = x1 + (pw - bw) // 2
                    by1 = y1 + int(ph * 0.78)
                    plate_box = [bx1, by1, bx1 + bw, by1 + bh]

                px1, py1, px2, py2 = map(int, plate_box)
                px1, py1 = max(0, px1), max(0, py1)
                px2, py2 = min(w, px2), min(h, py2)
                if (px2 - px1) >= 28 and (py2 - py1) >= 10:
                    is_upg = bool(obj.get("plate_upgraded", False))
                    draw_tactical_plate_badge(annotated, (px1, py1, px2, py2), plate, is_auth=is_veh_auth, is_watchlist=is_veh_watchlist, is_upgraded=is_upg)

        elif obj_type in ["environmental", "cattle", "animal"]:
            # ── CATTLE & ENVIRONMENTAL SUPPRESSION HUD ──
            box_color = (148, 163, 184)  # Slate / Silver
            draw_light_corner_box(annotated, (x1, y1, x2, y2), box_color, line_len=10, thickness=1)
            label_text = "CATTLE / ENVIRONMENTAL · ROUTINE ACTIVITY"
            sub_label = "STATUS: ROUTINE · RISK: 0 · ACTION: SUPPRESSED"
            draw_subtle_label(annotated, label_text, (x1, max(14, y1 - 4)), text_color=(241, 245, 249))
            draw_subtle_label(annotated, sub_label, (x1, min(h - 8, y2 + 13)), text_color=(148, 163, 184))

        else:
            # Other objects (Drone, Baggage, Wildlife): single slim 1px box
            color = CLASS_COLORS.get(obj_type, (220, 200, 100))
            draw_light_corner_box(annotated, (x1, y1, x2, y2), color, line_len=10, thickness=1)
            label = f"{str(obj_type or 'OBJECT').upper()} #{track_id}"
            draw_subtle_label(annotated, label, (x1, max(12, y1 - 3)), text_color=(240, 240, 240))

        # Draw subtle fine trajectory tail (1px)
        if len(trajectory) > 2:
            points = np.array(trajectory[-8:], dtype=np.int32).reshape((-1, 1, 2))
            is_auth_any = (ident_status == "AUTHORIZED") or (obj.get("vehicle_clearance") == "AUTHORIZED_CONVOY")
            trail_color = (74, 222, 128) if is_auth_any else (160, 175, 190)
            cv2.polylines(annotated, [points], isClosed=False, color=trail_color, thickness=1, lineType=cv2.LINE_AA)

    return annotated
