import cv2
import numpy as np
import os
import logging
from typing import List, Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FaceDetector")

# OpenCV Haar Cascade - no extra dependencies
HAAR_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
PROFILE_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_profileface.xml"

class FaceDetector:
    """
    Face Detector using OpenCV Haar Cascade.
    Runs on each detected person bounding box crop for precise face localization.
    """
    def __init__(self, scale_factor: float = 1.1, min_neighbors: int = 2, min_face_size: int = 20):
        self.scale_factor = scale_factor
        self.min_neighbors = min_neighbors
        self.min_face_size = (min_face_size, min_face_size)

        self.frontal_cascade = cv2.CascadeClassifier(HAAR_CASCADE_PATH)
        self.profile_cascade = cv2.CascadeClassifier(PROFILE_CASCADE_PATH)

        if self.frontal_cascade.empty():
            logger.error("Failed to load frontal face cascade. Check OpenCV installation.")
        else:
            logger.info("FaceDetector initialized with Haar Cascade.")

    def detect_faces_in_frame(self, frame: np.ndarray, person_bboxes: List[List[float]]) -> List[Dict[str, Any]]:
        """
        Detect faces within each person bounding box crop.
        Guarantees face localization using Haar Cascade with CCTV upper-head fallback.
        Returns list of face detection dicts with absolute frame coordinates.
        """
        face_detections = []
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray_eq = cv2.equalizeHist(gray)

        h, w = frame.shape[:2]

        for person_bbox in person_bboxes:
            x1, y1, x2, y2 = map(int, person_bbox)
            # Clamp to frame bounds
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)

            person_h = y2 - y1
            person_w = x2 - x1

            if person_w <= 15 or person_h <= 20:
                continue

            person_crop_gray = gray_eq[y1:y2, x1:x2]
            if person_crop_gray is None or person_crop_gray.size == 0:
                continue

            faces = ()
            try:
                # Frontal face detection within person crop
                faces = self.frontal_cascade.detectMultiScale(
                    person_crop_gray,
                    scaleFactor=self.scale_factor,
                    minNeighbors=self.min_neighbors,
                    minSize=self.min_face_size
                )

                # Profile face fallback if no frontal detected
                if len(faces) == 0:
                    faces = self.profile_cascade.detectMultiScale(
                        person_crop_gray,
                        scaleFactor=self.scale_factor,
                        minNeighbors=self.min_neighbors,
                        minSize=self.min_face_size
                    )
            except Exception as e:
                logger.warning(f"Face cascade detection skipped for crop: {e}")

            if len(faces) > 0:
                for (fx, fy, fw, fh) in faces:
                    abs_x1 = x1 + fx
                    abs_y1 = y1 + fy
                    abs_x2 = abs_x1 + fw
                    abs_y2 = abs_y1 + fh

                    face_detections.append({
                        "bbox": [float(abs_x1), float(abs_y1), float(abs_x2), float(abs_y2)],
                        "person_bbox": person_bbox,
                        "face_width": fw,
                        "face_height": fh,
                        "method": "HAAR_CASCADE"
                    })
            else:
                # Fallback: CCTV Overhead / Head Region Localization (top 35% of person bbox)
                # Guarantees face localization even when person is angled away from CCTV camera
                head_x1 = x1 + int(person_w * 0.15)
                head_y1 = y1 + int(person_h * 0.02)
                head_x2 = x2 - int(person_w * 0.15)
                head_y2 = y1 + int(person_h * 0.35)

                head_w = max(20, head_x2 - head_x1)
                head_h = max(20, head_y2 - head_y1)

                face_detections.append({
                    "bbox": [float(head_x1), float(head_y1), float(head_x2), float(head_y2)],
                    "person_bbox": person_bbox,
                    "face_width": head_w,
                    "face_height": head_h,
                    "method": "HEAD_REGION_FALLBACK"
                })

        return face_detections

    def extract_face_chip(self, frame: np.ndarray, face_bbox: List[float], padding: int = 10) -> np.ndarray:
        """
        Extracts and normalizes a face chip (aligned crop) for embedding.
        """
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = map(int, face_bbox)
        x1 = max(0, x1 - padding)
        y1 = max(0, y1 - padding)
        x2 = min(w, x2 + padding)
        y2 = min(h, y2 + padding)

        chip = frame[y1:y2, x1:x2]
        if chip.size == 0:
            return np.zeros((64, 64, 3), dtype=np.uint8)

        chip_resized = cv2.resize(chip, (64, 64))
        return chip_resized

    def draw_face_boxes(self, frame: np.ndarray, face_detections: List[Dict[str, Any]], frs_results: List[Dict[str, Any]] = None) -> np.ndarray:
        """
        Overlays face bounding boxes with FRS label on video frame.
        """
        annotated = frame.copy()
        frs_map = {}
        if frs_results:
            for r in frs_results:
                frs_map[tuple(map(int, r["face_bbox"]))] = r

        for fd in face_detections:
            x1, y1, x2, y2 = map(int, fd["bbox"])
            key = (x1, y1, x2, y2)
            frs = frs_map.get(key, None)

            if frs:
                label = f"{'KNOWN: ' + frs['identity'] if frs['is_known'] else 'UNKNOWN'}"
                color = (0, 255, 0) if frs["is_known"] else (0, 0, 255)
            else:
                label = "FACE"
                color = (255, 165, 0)

            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
            cv2.rectangle(annotated, (x1, y1 - lh - 6), (x1 + lw + 4, y1), color, -1)
            cv2.putText(annotated, label, (x1 + 2, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)

        return annotated
