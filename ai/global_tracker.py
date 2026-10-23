import time
import os
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
import numpy as np

from ai.reid import FeatureExtractor
from backend.database import update_person_presence, close_inactive_sightings


class GlobalPerson:
    def __init__(
        self,
        global_id: str,
        body_feat: np.ndarray,
        face_feat: Optional[np.ndarray] = None,
        face_snapshot: str = "",
        body_snapshot: str = ""
    ):
        self.global_id = global_id
        self.body_feat = body_feat
        self.face_feat = face_feat
        self.face_snapshot = face_snapshot
        self.body_snapshot = body_snapshot
        
        self.last_camera_id: str = ""
        self.last_camera_name: str = ""
        self.last_seen: datetime = datetime.now()
        self.active_camera_id: Optional[str] = None
        self.active_camera_name: Optional[str] = None

    def update_features(self, body_feat: np.ndarray, face_feat: Optional[np.ndarray], face_snap: str, body_snap: str):
        if body_feat is not None:
            self.body_feat = 0.85 * self.body_feat + 0.15 * body_feat
            norm = np.linalg.norm(self.body_feat)
            if norm > 0:
                self.body_feat /= norm

        if face_feat is not None:
            if self.face_feat is None:
                self.face_feat = face_feat
            else:
                self.face_feat = 0.80 * self.face_feat + 0.20 * face_feat
                norm = np.linalg.norm(self.face_feat)
                if norm > 0:
                    self.face_feat /= norm

        if face_snap and not self.face_snapshot:
            self.face_snapshot = face_snap
        if body_snap and not self.body_snapshot:
            self.body_snapshot = body_snap


class CrossCameraGlobalTracker:
    def __init__(
        self,
        feature_extractor: FeatureExtractor,
        reid_threshold: float = 0.65,
        face_match_threshold: float = 0.68,
        inactivity_timeout: float = 3.5
    ):
        self.extractor = feature_extractor
        self.reid_threshold = reid_threshold
        self.face_match_threshold = face_match_threshold
        self.inactivity_timeout = inactivity_timeout

        self.persons: Dict[str, GlobalPerson] = {}
        self._next_person_num = 1
        self._last_cleanup_time = time.time()

    def process_camera_tracks(
        self,
        camera_id: str,
        camera_name: str,
        active_tracks: list
    ) -> List[Dict[str, Any]]:
        """
        Processes active local tracks for a given camera, associates each track with
        a persistent Global ID across all CCTV cameras, and updates the journey database.
        """
        now = datetime.now()
        results = []

        for track in active_tracks:
            global_id = track.global_person_id

            # 1. If track already assigned a global ID in this camera, continue tracking
            if global_id is not None and global_id in self.persons:
                person = self.persons[global_id]
                new_face_snap = ""
                new_body_snap = ""

                # If face was just detected or improved, save new snapshot
                if track.face_detected and (not person.face_snapshot or person.face_feat is None):
                    new_face_snap = self.extractor.save_snapshot(track.face_crop, prefix=f"face_{global_id}")

                person.update_features(track.body_feat, track.face_feat, new_face_snap, new_body_snap)
                person.last_camera_id = camera_id
                person.last_camera_name = camera_name
                person.active_camera_id = camera_id
                person.active_camera_name = camera_name
                person.last_seen = now

                # Update database interval
                update_person_presence(
                    person_id=global_id,
                    camera_id=camera_id,
                    camera_name=camera_name,
                    face_snapshot=new_face_snap if new_face_snap else person.face_snapshot,
                    body_snapshot=person.body_snapshot,
                    confidence=track.confidence,
                    timestamp=now
                )

                results.append({
                    "track_id": track.track_id,
                    "global_id": global_id,
                    "bbox": track.bbox,
                    "confidence": track.confidence,
                    "face_detected": track.face_detected,
                    "face_bbox": track.face_bbox,
                    "face_snapshot": person.face_snapshot,
                    "body_snapshot": person.body_snapshot,
                    "camera_id": camera_id,
                    "camera_name": camera_name,
                    "status": "UNDER_CCTV"
                })
                continue

            # 2. Local track has no global ID yet -> Search Global Person Gallery for Re-Identification!
            best_match_id = None
            best_score = 0.0
            match_details = {}

            for pid, person in self.persons.items():
                # Avoid matching with another person currently actively visible in the exact same camera at a different spot
                if person.active_camera_id == camera_id and (now - person.last_seen).total_seconds() < 1.0:
                    continue

                score, details = self.extractor.match_identity(
                    candidate_body_feat=track.body_feat,
                    candidate_face_feat=track.face_feat,
                    target_body_feat=person.body_feat,
                    target_face_feat=person.face_feat
                )

                # Prioritize face match if available
                if details["has_face_match"] and details["face_sim"] >= self.face_match_threshold:
                    if score > best_score:
                        best_score = score
                        best_match_id = pid
                        match_details = details
                elif score >= self.reid_threshold:
                    if score > best_score:
                        best_score = score
                        best_match_id = pid
                        match_details = details

            if best_match_id is not None:
                # RE-IDENTIFIED! Person walked from another camera into this camera
                global_id = best_match_id
                person = self.persons[global_id]
                
                new_face_snap = ""
                new_body_snap = ""
                if track.face_detected and not person.face_snapshot:
                    new_face_snap = self.extractor.save_snapshot(track.face_crop, prefix=f"face_{global_id}")
                if not person.body_snapshot:
                    new_body_snap = self.extractor.save_snapshot(track.body_crop, prefix=f"body_{global_id}")

                person.update_features(track.body_feat, track.face_feat, new_face_snap, new_body_snap)
                person.last_camera_id = camera_id
                person.last_camera_name = camera_name
                person.active_camera_id = camera_id
                person.active_camera_name = camera_name
                person.last_seen = now
                track.global_person_id = global_id

            else:
                # NEW PERSON DISCOVERED! Create brand new Global Identity
                global_id = f"Person_{self._next_person_num}"
                self._next_person_num += 1

                # Save thumbnails
                body_snap = self.extractor.save_snapshot(track.body_crop, prefix=f"body_{global_id}")
                face_snap = ""
                if track.face_detected:
                    face_snap = self.extractor.save_snapshot(track.face_crop, prefix=f"face_{global_id}")

                person = GlobalPerson(
                    global_id=global_id,
                    body_feat=track.body_feat,
                    face_feat=track.face_feat,
                    face_snapshot=face_snap,
                    body_snapshot=body_snap
                )
                person.last_camera_id = camera_id
                person.last_camera_name = camera_name
                person.active_camera_id = camera_id
                person.active_camera_name = camera_name
                person.last_seen = now

                self.persons[global_id] = person
                track.global_person_id = global_id

            # Save / update sighting interval in SQLite database
            update_person_presence(
                person_id=global_id,
                camera_id=camera_id,
                camera_name=camera_name,
                face_snapshot=person.face_snapshot,
                body_snapshot=person.body_snapshot,
                confidence=track.confidence,
                timestamp=now
            )

            results.append({
                "track_id": track.track_id,
                "global_id": global_id,
                "bbox": track.bbox,
                "confidence": track.confidence,
                "face_detected": track.face_detected,
                "face_bbox": track.face_bbox,
                "face_snapshot": person.face_snapshot,
                "body_snapshot": person.body_snapshot,
                "camera_id": camera_id,
                "camera_name": camera_name,
                "status": "UNDER_CCTV"
            })

        # Periodic cleanup of departed sightings
        if time.time() - self._last_cleanup_time > 1.5:
            self._last_cleanup_time = time.time()
            close_inactive_sightings(timeout_seconds=self.inactivity_timeout)
            
            # Update in-memory active states
            for pid, p in self.persons.items():
                if (now - p.last_seen).total_seconds() > self.inactivity_timeout:
                    p.active_camera_id = None
                    p.active_camera_name = None

        return results
