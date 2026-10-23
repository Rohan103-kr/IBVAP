import cv2
import numpy as np
import os
import logging
from typing import List, Dict, Any, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FaceDetector")

# OpenCV Haar Cascade - no extra dependencies
HAAR_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
PROFILE_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_profileface.xml"

import threading

# Global cascade classifier lock to prevent concurrent multi-threaded data races in OpenCV C++ HaarEvaluator
_CASCADE_LOCK = threading.Lock()

class FaceDetector:
    """
    Face Detector & Quality Gate using OpenCV Haar Cascade.
    Enforces a strict Face Quality Gate (resolution, Laplacian sharpness, contrast)
    so distant (50m) or blurry night surveillance frames cleanly bypass FRS
    rather than forcing erroneous identity matches.
    """
    def __init__(self, scale_factor: float = 1.25, min_neighbors: int = 2, min_face_size: int = 20):
        self.scale_factor = scale_factor
        self.min_neighbors = min_neighbors
        self.min_face_size = (min_face_size, min_face_size)

        with _CASCADE_LOCK:
            self.frontal_cascade = cv2.CascadeClassifier(HAAR_CASCADE_PATH)
            self.profile_cascade = cv2.CascadeClassifier(PROFILE_CASCADE_PATH)

        if self.frontal_cascade.empty():
            logger.error("Failed to load frontal face cascade. Check OpenCV installation.")
        else:
            logger.info("FaceDetector initialized with Haar Cascade.")

    @staticmethod
    def assess_face_quality(chip: np.ndarray, min_dim: int = 24, min_laplacian: float = 38.0) -> Tuple[bool, float, str]:
        """
        Face Quality Gate:
        Evaluates real-pixel dimensions, sharpness (Laplacian variance), and illumination.
        Returns: (is_quality_pass, quality_score, reason)
        """
        if chip is None or chip.size == 0:
            return False, 0.0, "EMPTY_CROP"

        h, w = chip.shape[:2]
        if min(h, w) < min_dim:
            return False, round(float(min(h, w)) / float(min_dim), 2), f"TOO_SMALL ({min(h, w)}px < {min_dim}px)"

        gray = cv2.cvtColor(chip, cv2.COLOR_BGR2GRAY) if len(chip.shape) == 3 else chip

        # 1. Sharpness via Laplacian Variance
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        if lap_var < min_laplacian:
            return False, round(lap_var / 100.0, 2), f"BLURRY (Laplacian {lap_var:.1f} < {min_laplacian:.1f})"

        # 2. Illumination & Contrast
        mean_val = float(np.mean(gray))
        std_val = float(np.std(gray))

        if mean_val < 25.0:
            return False, 0.2, "TOO_DARK"
        if mean_val > 235.0:
            return False, 0.2, "OVEREXPOSED"
        if std_val < 14.0:
            return False, 0.3, "LOW_CONTRAST"

        score = min(0.99, 0.70 + min(0.29, (lap_var / 500.0) * 0.29))
        return True, round(score, 2), "QUALITY_ACCEPTABLE"

    def detect_faces_in_frame(
        self,
        frame: np.ndarray,
        person_bboxes: List[List[float]],
        min_face_dim: int = 32
    ) -> List[Dict[str, Any]]:
        """
        Detect faces within each person bounding box crop and run the Face Quality Gate.
        Enhanced pipeline:
        1. Adaptive CLAHE contrast enhancement for low-light & night surveillance.
        2. Anatomical upper-head ROI search (top 48% of person) to eliminate clothing noise.
        3. Multi-angle detection: Frontal + Left Profile + Right Profile (horizontal mirror).
        4. Reliable CCTV upper-head fallback for distant/profile targets.
        """
        if frame is None or frame.size == 0 or len(person_bboxes) == 0:
            return []

        face_detections = []
        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
            gray_eq = clahe.apply(gray)
        except Exception:
            return []

        h, w = frame.shape[:2]

        for person_bbox in person_bboxes:
            try:
                x1, y1, x2, y2 = map(int, person_bbox)
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w, x2), min(h, y2)

                person_h = y2 - y1
                person_w = x2 - x1

                if person_w <= 15 or person_h <= 20:
                    continue

                # Anatomical Upper-Head ROI: Human heads reside in the upper 48% of the bounding box
                head_crop_y2 = min(y2, y1 + max(28, int(person_h * 0.48)))
                head_crop_gray = np.ascontiguousarray(gray_eq[y1:head_crop_y2, x1:x2])

                if head_crop_gray is None or head_crop_gray.size == 0:
                    continue

                crop_h, crop_w = head_crop_gray.shape[:2]
                detected_faces = []

                if crop_h >= 20 and crop_w >= 20:
                    try:
                        with _CASCADE_LOCK:
                            # 1. Frontal Face Detection
                            f_faces = self.frontal_cascade.detectMultiScale(
                                head_crop_gray,
                                scaleFactor=1.10,
                                minNeighbors=max(2, self.min_neighbors),
                                minSize=(18, 18),
                                flags=cv2.CASCADE_SCALE_IMAGE
                            )
                            if f_faces is not None and len(f_faces) > 0:
                                for (fx, fy, fw_f, fh_f) in f_faces:
                                    detected_faces.append((fx, fy, fw_f, fh_f, "FRONTAL"))

                            # 2. Left Profile Face Detection (if no frontal face found)
                            if not detected_faces:
                                p_faces = self.profile_cascade.detectMultiScale(
                                    head_crop_gray,
                                    scaleFactor=1.12,
                                    minNeighbors=max(2, self.min_neighbors),
                                    minSize=(18, 18)
                                )
                                if p_faces is not None and len(p_faces) > 0:
                                    for (fx, fy, fw_f, fh_f) in p_faces:
                                        detected_faces.append((fx, fy, fw_f, fh_f, "PROFILE_LEFT"))

                            # 3. Right Profile Face Detection via horizontal flip
                            if not detected_faces:
                                flipped_head = cv2.flip(head_crop_gray, 1)
                                r_faces = self.profile_cascade.detectMultiScale(
                                    flipped_head,
                                    scaleFactor=1.12,
                                    minNeighbors=max(2, self.min_neighbors),
                                    minSize=(18, 18)
                                )
                                if r_faces is not None and len(r_faces) > 0:
                                    for (fx_flip, fy, fw_f, fh_f) in r_faces:
                                        fx_orig = crop_w - (fx_flip + fw_f)
                                        detected_faces.append((fx_orig, fy, fw_f, fh_f, "PROFILE_RIGHT"))
                    except Exception as ex:
                        logger.debug(f"Haar cascade detection exception: {ex}")

                if len(detected_faces) > 0:
                    for (fx, fy, fw_f, fh_f, face_type) in detected_faces:
                        abs_x1 = x1 + fx
                        abs_y1 = y1 + fy
                        abs_x2 = abs_x1 + fw_f
                        abs_y2 = abs_y1 + fh_f

                        raw_crop = frame[max(0, abs_y1):min(h, abs_y2), max(0, abs_x1):min(w, abs_x2)]
                        is_pass, q_score, q_reason = self.assess_face_quality(raw_crop, min_dim=min_face_dim)

                        face_detections.append({
                            "bbox": [float(abs_x1), float(abs_y1), float(abs_x2), float(abs_y2)],
                            "person_bbox": person_bbox,
                            "face_width": fw_f,
                            "face_height": fh_f,
                            "method": f"HAAR_{face_type}",
                            "quality_passed": is_pass,
                            "quality_score": q_score,
                            "quality_reason": q_reason
                        })
                else:
                    # Fallback: CCTV Overhead / Anatomical Head Region (top 35% of person bbox)
                    head_x1 = x1 + int(person_w * 0.15)
                    head_y1 = y1 + int(person_h * 0.02)
                    head_x2 = x2 - int(person_w * 0.15)
                    head_y2 = y1 + int(person_h * 0.35)

                    head_w = max(20, head_x2 - head_x1)
                    head_h = max(20, head_y2 - head_y1)

                    raw_crop = frame[max(0, head_y1):min(h, head_y2), max(0, head_x1):min(w, head_x2)]
                    is_pass, q_score, q_reason = self.assess_face_quality(raw_crop, min_dim=min_face_dim)

                    # Anatomical head region fallback is for visual framing only, not biometric matching
                    face_detections.append({
                        "bbox": [float(head_x1), float(head_y1), float(head_x2), float(head_y2)],
                        "person_bbox": person_bbox,
                        "face_width": head_w,
                        "face_height": head_h,
                        "method": "HEAD_REGION_FALLBACK",
                        "quality_passed": False,
                        "quality_score": round(q_score * 0.4, 2),
                        "quality_reason": "NO_FRONTAL_FACE_LANDMARKS"
                    })
            except Exception:
                continue

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
        Overlays face bounding boxes with FRS and quality labels on video frame.
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
            quality_passed = fd.get("quality_passed", True)

            if not quality_passed:
                label = "FACE: LOW QUALITY (FRS SKIPPED)"
                color = (148, 163, 184)  # slate muted
            elif frs:
                label = f"{frs['identity'] if frs['is_known'] else 'UNKNOWN'}"
                color = (74, 222, 128) if frs["is_known"] else (200, 215, 230)
            else:
                label = "FACE: QUALITY OK"
                color = (200, 215, 230)

            # 1px thin outline with corner accents
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 1, cv2.LINE_AA)
            d = min(6, max(3, (x2 - x1) // 4))
            cv2.line(annotated, (x1, y1), (x1 + d, y1), color, 2, cv2.LINE_AA)
            cv2.line(annotated, (x1, y1), (x1, y1 + d), color, 2, cv2.LINE_AA)
            cv2.line(annotated, (x2, y1), (x2 - d, y1), color, 2, cv2.LINE_AA)
            cv2.line(annotated, (x2, y1), (x2, y1 + d), color, 2, cv2.LINE_AA)
            cv2.line(annotated, (x1, y2), (x1 + d, y2), color, 2, cv2.LINE_AA)
            cv2.line(annotated, (x1, y2), (x1, y2 - d), color, 2, cv2.LINE_AA)
            cv2.line(annotated, (x2, y2), (x2 - d, y2), color, 2, cv2.LINE_AA)
            cv2.line(annotated, (x2, y2), (x2 - d, y2), color, 2, cv2.LINE_AA)

            (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.36, 1)
            px2 = min(annotated.shape[1] - 2, x1 + lw + 6)
            py1 = max(2, y1 - lh - 5)
            py2 = min(annotated.shape[0] - 2, y1 + 2)
            sub = annotated[py1:py2, x1:px2]
            if sub.shape[0] > 0 and sub.shape[1] > 0:
                dark_rect = np.full(sub.shape, (15, 23, 42), dtype=np.uint8)
                cv2.addWeighted(dark_rect, 0.60, sub, 0.40, 0, sub)
                annotated[py1:py2, x1:px2] = sub
                cv2.rectangle(annotated, (x1, py1), (px2, py2), (80, 95, 115), 1, cv2.LINE_AA)
            cv2.putText(annotated, label, (x1 + 3, y1 - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.36, color, 1, cv2.LINE_AA)

        return annotated
