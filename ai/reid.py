import os
import cv2
import numpy as np
from datetime import datetime
from typing import Optional, Tuple, Dict, Any

SNAPSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "snapshots")


class FeatureExtractor:
    def __init__(self):
        os.makedirs(SNAPSHOT_DIR, exist_ok=True)
        # 64x64 HOG for face features
        self.face_hog = cv2.HOGDescriptor((64, 64), (16, 16), (8, 8), (8, 8), 9)

    def extract_body_features(self, person_crop: np.ndarray) -> np.ndarray:
        """
        Extracts multi-region spatial color and texture descriptors for clothing & appearance.
        Divides body into 3 regions:
          - Upper (0-20%): head/collar/shoulders
          - Torso (20-60%): shirt/jacket/upper garments
          - Lower (60-100%): pants/jeans/skirt/lower garments
        """
        if person_crop is None or person_crop.size == 0:
            return np.zeros(576, dtype=np.float32)

        # Standardize size (width=64, height=128)
        resized = cv2.resize(person_crop, (64, 128))
        h = 128

        regions = [
            resized[0:int(0.20 * h), :],
            resized[int(0.20 * h):int(0.60 * h), :],
            resized[int(0.60 * h):, :]
        ]

        features = []
        for reg in regions:
            if reg.size == 0:
                features.extend([0.0] * 192)
                continue

            # 1. HSV 2D Color Histogram (Hue: 16 bins, Saturation: 8 bins) = 128
            hsv = cv2.cvtColor(reg, cv2.COLOR_BGR2HSV)
            hist_hsv = cv2.calcHist([hsv], [0, 1], None, [16, 8], [0, 180, 0, 256])
            cv2.normalize(hist_hsv, hist_hsv)
            features.extend(hist_hsv.flatten())

            # 2. Lab Color Histogram (a & b channels: 8x8 bins) = 64
            lab = cv2.cvtColor(reg, cv2.COLOR_BGR2LAB)
            hist_lab = cv2.calcHist([lab], [1, 2], None, [8, 8], [0, 256, 0, 256])
            cv2.normalize(hist_lab, hist_lab)
            features.extend(hist_lab.flatten())

        feat_vec = np.array(features, dtype=np.float32)
        norm = np.linalg.norm(feat_vec)
        if norm > 1e-6:
            feat_vec /= norm
        return feat_vec

    def extract_face_features(self, face_crop: Optional[np.ndarray]) -> Optional[np.ndarray]:
        """
        Extracts facial biometric feature vector combining HOG texture and facial color tone.
        """
        if face_crop is None or face_crop.size == 0:
            return None

        # Standardize face crop
        face_resized = cv2.resize(face_crop, (64, 64))
        gray = cv2.cvtColor(face_resized, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)

        try:
            hog_feats = self.face_hog.compute(gray).flatten()
        except Exception:
            return None

        # HSV tone
        hsv = cv2.cvtColor(face_resized, cv2.COLOR_BGR2HSV)
        hist_hsv = cv2.calcHist([hsv], [0, 1], None, [8, 8], [0, 180, 0, 256]).flatten()

        combined = np.concatenate([hog_feats, hist_hsv]).astype(np.float32)
        norm = np.linalg.norm(combined)
        if norm > 1e-6:
            combined /= norm
        return combined

    @staticmethod
    def compute_similarity(feat1: Optional[np.ndarray], feat2: Optional[np.ndarray]) -> float:
        """
        Computes cosine similarity between two normalized feature vectors.
        Returns value between 0.0 and 1.0.
        """
        if feat1 is None or feat2 is None or len(feat1) == 0 or len(feat2) == 0:
            return 0.0
        dot = float(np.dot(feat1, feat2))
        return max(0.0, min(1.0, dot))

    def match_identity(
        self,
        candidate_body_feat: np.ndarray,
        candidate_face_feat: Optional[np.ndarray],
        target_body_feat: np.ndarray,
        target_face_feat: Optional[np.ndarray]
    ) -> Tuple[float, Dict[str, float]]:
        """
        Computes joint re-identification confidence matching score.
        """
        body_sim = self.compute_similarity(candidate_body_feat, target_body_feat)
        face_sim = 0.0
        has_both_faces = (candidate_face_feat is not None and target_face_feat is not None)

        if has_both_faces:
            face_sim = self.compute_similarity(candidate_face_feat, target_face_feat)
            # When face is verified, face match carries high weight
            combined_score = 0.55 * face_sim + 0.45 * body_sim
        else:
            combined_score = body_sim

        return combined_score, {
            "combined": combined_score,
            "body_sim": body_sim,
            "face_sim": face_sim,
            "has_face_match": has_both_faces
        }

    @staticmethod
    def save_snapshot(image: np.ndarray, prefix: str = "body") -> str:
        """
        Saves a thumbnail image to data/snapshots and returns relative web path.
        """
        if image is None or image.size == 0:
            return ""
        os.makedirs(SNAPSHOT_DIR, exist_ok=True)
        ts_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]
        filename = f"{prefix}_{ts_str}.jpg"
        full_path = os.path.join(SNAPSHOT_DIR, filename)
        cv2.imwrite(full_path, image, [cv2.IMWRITE_JPEG_QUALITY, 88])
        return f"/data/snapshots/{filename}"
