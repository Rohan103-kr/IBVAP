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

def draw_annotations(frame: np.ndarray, tracked_objects: List[Dict[str, Any]], fps: float, camera_id: str, status: str) -> np.ndarray:
    """Overlay bounding boxes, track IDs, trajectories, and status bar on frame."""
    annotated = frame.copy()
    h, w, _ = annotated.shape

    # Top Status Bar
    overlay = annotated.copy()
    cv2.rectangle(overlay, (0, 0), (w, 40), (20, 24, 33), -1)
    cv2.addWeighted(overlay, 0.75, annotated, 0.25, 0, annotated)

    status_color = (0, 255, 0) if status == "ONLINE" else (0, 165, 255) if status == "DEGRADED" else (0, 0, 255)
    cv2.putText(annotated, f"CAMERA: {camera_id} | STATUS: {status}", (15, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.6, status_color, 2)
    cv2.putText(annotated, f"FPS: {fps:.1f} | TRACKED OBJECTS: {len(tracked_objects)}", (w - 320, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

    # Draw Tracked Objects
    for obj in tracked_objects:
        bbox = obj["bbox"]
        track_id = obj.get("track_id", -1)
        obj_type = obj.get("object_type", "object")
        conf = obj.get("confidence", 0.0)
        trajectory = obj.get("trajectory", [])
        ident_status = obj.get("identity_status", "UNRECOGNIZED")
        ident_name = obj.get("identity_name", None)

        x1, y1, x2, y2 = map(int, bbox)

        # Check if person is Authorized Friendly Patrol / Known Face
        is_authorized = (ident_status == "AUTHORIZED") or (ident_name and ("OFFICER" in ident_name.upper() or "CAPTAIN" in ident_name.upper() or "PATROL" in ident_name.upper() or "AUTHORIZED" in ident_status.upper()))

        if is_authorized:
            color = (16, 185, 129)  # Emerald Green for Authorized Known Personnel
            disp_name = ident_name if ident_name else f"AUTHORIZED PERSON #{track_id}"
            label = f"✓ {disp_name}"
        else:
            color = CLASS_COLORS.get(obj_type, (0, 255, 255))
            label = f"#{track_id} {obj_type.upper()} {conf:.2f}"

        # Draw Bounding Box
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

        # Label Header
        (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(annotated, (x1, max(0, y1 - lh - 8)), (x1 + lw + 10, y1), color, -1)
        cv2.putText(annotated, label, (x1 + 4, max(lh + 2, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)

        # Draw Face Bounding Box & FRS Overlay for Persons
        face_bbox = obj.get("face_bbox", None)
        if obj_type == "person" and not face_bbox:
            # Fallback face box calculation on head region (top 30% of body)
            pw, ph = x2 - x1, y2 - y1
            if pw > 15 and ph > 20:
                face_bbox = [x1 + int(pw * 0.15), y1 + int(ph * 0.03), x2 - int(pw * 0.15), y1 + int(ph * 0.32)]

        if face_bbox:
            fx1, fy1, fx2, fy2 = map(int, face_bbox)
            fx1, fy1 = max(0, fx1), max(0, fy1)
            fx2, fy2 = min(w, fx2), min(h, fy2)

            if is_authorized:
                f_color = (16, 185, 129)  # Emerald green for known face
                f_label = f"✓ KNOWN: {ident_name if ident_name else 'AUTHORIZED'}"
            elif ident_status == "UNAUTHORIZED":
                f_color = (0, 0, 255)      # Red for suspect face
                f_label = f"🚨 SUSPECT: {ident_name if ident_name else 'WATCHLIST'}"
            else:
                f_color = (255, 255, 0)    # Cyan / Yellow for unknown face
                f_label = "FACE: UNKNOWN"

            cv2.rectangle(annotated, (fx1, fy1), (fx2, fy2), f_color, 2)
            (flw, flh), _ = cv2.getTextSize(f_label, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
            cv2.rectangle(annotated, (fx1, max(0, fy1 - flh - 6)), (fx1 + flw + 6, fy1), f_color, -1)
            cv2.putText(annotated, f_label, (fx1 + 3, max(flh + 1, fy1 - 3)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)

        # Draw Trajectory Tail
        if len(trajectory) > 1:
            points = np.array(trajectory, dtype=np.int32).reshape((-1, 1, 2))
            cv2.polylines(annotated, [points], isClosed=False, color=color, thickness=2)

    return annotated
