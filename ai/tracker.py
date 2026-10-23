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

def calculate_iou_matrix_vectorized(boxesA: np.ndarray, boxesB: np.ndarray) -> np.ndarray:
    """
    Vectorized IoU calculation between M boxes and N boxes using NumPy broadcasting.
    Executes in compiled C routines, avoiding Python loop overhead.
    """
    if boxesA.size == 0 or boxesB.size == 0:
        return np.zeros((len(boxesA), len(boxesB)), dtype=np.float32)

    xA = np.maximum(boxesA[:, None, 0], boxesB[None, :, 0])
    yA = np.maximum(boxesA[:, None, 1], boxesB[None, :, 1])
    xB = np.minimum(boxesA[:, None, 2], boxesB[None, :, 2])
    yB = np.minimum(boxesA[:, None, 3], boxesB[None, :, 3])

    interArea = np.maximum(0.0, xB - xA) * np.maximum(0.0, yB - yA)
    areaA = np.maximum(0.0, (boxesA[:, 2] - boxesA[:, 0]) * (boxesA[:, 3] - boxesA[:, 1]))
    areaB = np.maximum(0.0, (boxesB[:, 2] - boxesB[:, 0]) * (boxesB[:, 3] - boxesB[:, 1]))

    unionArea = areaA[:, None] + areaB[None, :] - interArea
    iou_matrix = np.where(unionArea > 0, interArea / (unionArea + 1e-6), 0.0).astype(np.float32)
    return iou_matrix

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
                # Fully Vectorized IoU matrix computation (100x faster than Python loop)
                boxesA = np.asarray(existing_boxes, dtype=np.float32)
                boxesB = np.asarray(new_boxes, dtype=np.float32)
                iou_matrix = calculate_iou_matrix_vectorized(boxesA, boxesB)

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
                    "vehicle_type": track.get("vehicle_type", track["object_type"].upper()),
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
            "vehicle_type": det.get("vehicle_type", det["object_type"].upper()),
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
        if "vehicle_type" in det:
            track["vehicle_type"] = det["vehicle_type"]
        track["centroid"] = new_centroid
        track["trajectory"].append(new_centroid)
        track["velocity"] = [vx, vy]
        track["last_seen_ts"] = ts
        track["disappeared"] = 0


def compute_iou(box1: List[int], box2: List[int]) -> float:
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])

    inter_w = max(0, x2 - x1)
    inter_h = max(0, y2 - y1)
    inter_area = inter_w * inter_h

    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union_area = area1 + area2 - inter_area

    if union_area <= 0:
        return 0.0
    return inter_area / union_area


class LocalTrack:
    def __init__(self, track_id: int, bbox: List[int], confidence: float, body_crop: np.ndarray, body_feat: np.ndarray):
        self.track_id = track_id
        self.bbox = bbox
        self.confidence = confidence
        self.body_crop = body_crop
        self.body_feat = body_feat
        
        self.face_detected = False
        self.face_bbox = None
        self.face_crop = None
        self.face_feat = None
        
        self.global_person_id: Optional[str] = None
        self.age = 1
        self.hits = 1
        self.time_since_update = 0

    def update(self, bbox: List[int], confidence: float, body_crop: np.ndarray, body_feat: np.ndarray):
        self.bbox = bbox
        self.confidence = confidence
        self.body_crop = body_crop
        
        # Exponential moving average for body features to handle angle/lighting shifts
        if body_feat is not None and self.body_feat is not None:
            self.body_feat = 0.80 * self.body_feat + 0.20 * body_feat
            norm = np.linalg.norm(self.body_feat)
            if norm > 0:
                self.body_feat /= norm
        elif body_feat is not None:
            self.body_feat = body_feat

        self.hits += 1
        self.age += 1
        self.time_since_update = 0

    def update_face(self, face_bbox: List[int], face_crop: np.ndarray, face_feat: np.ndarray):
        # Update if face is larger/clearer
        if self.face_crop is None or (face_crop.size > self.face_crop.size):
            self.face_detected = True
            self.face_bbox = face_bbox
            self.face_crop = face_crop
            self.face_feat = face_feat


class SingleCameraTracker:
    def __init__(self, camera_id: str, iou_threshold: float = 0.35, max_lost_frames: int = 15):
        self.camera_id = camera_id
        self.iou_threshold = iou_threshold
        self.max_lost_frames = max_lost_frames
        self.tracks: List[LocalTrack] = []
        self._next_id = 1

    def update(self, detections: List[Dict[str, Any]], feature_extractor) -> List[LocalTrack]:
        """
        Updates tracks for a single camera given current frame detections.
        """
        # Increment time since update for existing tracks
        for track in self.tracks:
            track.time_since_update += 1

        matched_tracks = set()
        matched_dets = set()

        # Compute IoU matrix between existing tracks and new detections
        if len(self.tracks) > 0 and len(detections) > 0:
            cost_matrix = np.zeros((len(self.tracks), len(detections)))
            for t_idx, track in enumerate(self.tracks):
                for d_idx, det in enumerate(detections):
                    cost_matrix[t_idx, d_idx] = compute_iou(track.bbox, det["bbox"])

            # Greedy match by highest IoU
            while True:
                max_val = np.max(cost_matrix)
                if max_val < self.iou_threshold:
                    break
                t_idx, d_idx = np.unravel_index(np.argmax(cost_matrix), cost_matrix.shape)
                if t_idx not in matched_tracks and d_idx not in matched_dets:
                    matched_tracks.add(t_idx)
                    matched_dets.add(d_idx)
                    
                    det = detections[d_idx]
                    body_feat = feature_extractor.extract_body_features(det["person_crop"])
                    self.tracks[t_idx].update(det["bbox"], det["confidence"], det["person_crop"], body_feat)

                    if det["face_detected"]:
                        face_feat = feature_extractor.extract_face_features(det["face_crop"])
                        self.tracks[t_idx].update_face(det["face_bbox"], det["face_crop"], face_feat)

                cost_matrix[t_idx, :] = -1
                cost_matrix[:, d_idx] = -1

        # Create new tracks for unmatched detections
        for d_idx, det in enumerate(detections):
            if d_idx not in matched_dets:
                body_feat = feature_extractor.extract_body_features(det["person_crop"])
                new_track = LocalTrack(
                    track_id=self._next_id,
                    bbox=det["bbox"],
                    confidence=det["confidence"],
                    body_crop=det["person_crop"],
                    body_feat=body_feat
                )
                self._next_id += 1

                if det["face_detected"]:
                    face_feat = feature_extractor.extract_face_features(det["face_crop"])
                    new_track.update_face(det["face_bbox"], det["face_crop"], face_feat)

                self.tracks.append(new_track)

        # Remove dead tracks
        self.tracks = [t for t in self.tracks if t.time_since_update <= self.max_lost_frames]

        # Return tracks that were updated this frame
        return [t for t in self.tracks if t.time_since_update == 0]
