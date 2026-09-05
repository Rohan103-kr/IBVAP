import numpy as np
import time
import math
from typing import List, Dict, Any, Tuple
from ai.utils import get_centroid

def calculate_iou(boxA: List[float], boxB: List[float]) -> float:
    """Calculate Intersection over Union (IoU) of two bounding boxes."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])

    iou = interArea / float(boxAArea + boxBArea - interArea + 1e-6)
    return iou

class ByteTracker:
    """
    ByteTrack / IoU-based Multi-Object Tracker.
    Associates detection bboxes across sequential frames and maintains track states.
    """
    def __init__(self, max_disappeared: int = 30, iou_threshold: float = 0.3):
        self.next_track_id = 1
        self.tracks: Dict[int, Dict[str, Any]] = {}
        self.max_disappeared = max_disappeared
        self.iou_threshold = iou_threshold

    def update(self, detections: List[Dict[str, Any]], camera_id: str = "CAM-01") -> List[Dict[str, Any]]:
        """
        Update tracker with current frame detections.
        Returns active tracked objects matching TrackedObject schema.
        """
        current_time = time.time()
        timestamp_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(current_time))

        if len(self.tracks) == 0:
            # Register all initial detections as new tracks
            for det in detections:
                self._register_track(det, camera_id, current_time, timestamp_str)
        else:
            track_ids = list(self.tracks.keys())
            existing_boxes = [self.tracks[tid]["bbox"] for tid in track_ids]
            new_boxes = [det["bbox"] for det in detections]

            if len(new_boxes) > 0 and len(existing_boxes) > 0:
                # Compute IoU matrix between existing tracks and new detections
                iou_matrix = np.zeros((len(track_ids), len(new_boxes)), dtype=np.float32)
                for i, t_box in enumerate(existing_boxes):
                    for j, d_box in enumerate(new_boxes):
                        iou_matrix[i, j] = calculate_iou(t_box, d_box)

                # Greedy matching based on max IoU
                matched_tracks = set()
                matched_dets = set()

                # Sort matches by highest IoU
                match_indices = np.unravel_index(np.argsort(-iou_matrix, axis=None), iou_matrix.shape)
                for r, c in zip(match_indices[0], match_indices[1]):
                    if r in matched_tracks or c in matched_dets:
                        continue
                    if iou_matrix[r, c] >= self.iou_threshold:
                        tid = track_ids[r]
                        det = detections[c]
                        self._update_track(tid, det, current_time, timestamp_str)
                        matched_tracks.add(r)
                        matched_dets.add(c)

                # Register unmatched detections as new tracks
                for j, det in enumerate(detections):
                    if j not in matched_dets:
                        self._register_track(det, camera_id, current_time, timestamp_str)

                # Increment disappeared count for unmatched tracks
                for i, tid in enumerate(track_ids):
                    if i not in matched_tracks:
                        self.tracks[tid]["disappeared"] += 1

            else:
                # Increment disappeared for all tracks if no detections
                for tid in track_ids:
                    self.tracks[tid]["disappeared"] += 1

        # Purge stale tracks that exceeded max_disappeared frames
        stale_ids = [tid for tid, track in self.tracks.items() if track["disappeared"] > self.max_disappeared]
        for tid in stale_ids:
            del self.tracks[tid]

        # Prepare list of active tracked objects
        active_tracked = []
        for tid, track in self.tracks.items():
            if track["disappeared"] == 0:  # Currently visible in current frame
                duration = round(current_time - track["first_seen_ts"], 1)
                active_tracked.append({
                    "camera_id": camera_id,
                    "track_id": tid,
                    "object_type": track["object_type"],
                    "confidence": track["confidence"],
                    "bbox": track["bbox"],
                    "centroid": track["centroid"],
                    "trajectory": track["trajectory"][-20:],  # Last 20 trajectory points
                    "velocity": track["velocity"],
                    "first_seen": track["first_seen_str"],
                    "last_seen": timestamp_str,
                    "duration_sec": duration
                })

        return active_tracked

    def _register_track(self, det: Dict[str, Any], camera_id: str, ts: float, ts_str: str):
        centroid = get_centroid(det["bbox"])
        self.tracks[self.next_track_id] = {
            "track_id": self.next_track_id,
            "camera_id": camera_id,
            "object_type": det["object_type"],
            "confidence": det["confidence"],
            "bbox": det["bbox"],
            "centroid": centroid,
            "trajectory": [centroid],
            "velocity": [0.0, 0.0],
            "first_seen_ts": ts,
            "first_seen_str": ts_str,
            "last_seen_ts": ts,
            "disappeared": 0
        }
        self.next_track_id += 1

    def _update_track(self, tid: int, det: Dict[str, Any], ts: float, ts_str: str):
        track = self.tracks[tid]
        old_centroid = track["centroid"]
        new_centroid = get_centroid(det["bbox"])
        dt = max(ts - track["last_seen_ts"], 0.033)

        vx = round((new_centroid[0] - old_centroid[0]) / dt, 1)
        vy = round((new_centroid[1] - old_centroid[1]) / dt, 1)

        track["bbox"] = det["bbox"]
        track["confidence"] = det["confidence"]
        track["centroid"] = new_centroid
        track["trajectory"].append(new_centroid)
        track["velocity"] = [vx, vy]
        track["last_seen_ts"] = ts
        track["disappeared"] = 0
