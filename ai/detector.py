import os
import cv2
import numpy as np
import time
import logging
import threading
from typing import List, Dict, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("YOLODetector")

# Global Haar Cascade thread lock to prevent C++ thread safety issues
_CASCADE_LOCK = threading.Lock()

class YOLODetector:
    """
    YOLO Object Detector wrapper for person, vehicle, drone, unattended bag, and robot classes.
    Falls back gracefully if Ultralytics model load fails or in fallback demo mode.
    """
    def __init__(self, model_name: str = "yolov8n.pt", conf_thresh: float = 0.35, device: str = "cpu"):
        self.conf_thresh = conf_thresh
        self.device = device
        self.model_name = model_name
        self.model = None
        self._lock = threading.Lock()
        self.class_names = {
            0: "person",
            1: "bicycle",       # Cycle / Bicycle
            2: "car",
            3: "motorcycle",    # Bike / Motorcycle
            5: "bus",
            7: "truck",
            4: "drone",         # COCO 4 airplane mapped to drone
            16: "animal",       # Dog / small animal
            17: "cattle",       # Sheep / cattle
            18: "cattle",       # Horse / cattle
            19: "cattle",       # Cow / cattle
            24: "unattended_bag", 26: "unattended_bag", 28: "unattended_bag", # backpack, handbag, suitcase
            77: "robot_device"  # teddy bear / small electronic device mapped to robot
        }
        self.is_initialized = False
        
        self._init_model()

    def _init_model(self):
        try:
            from ultralytics import YOLO
            logger.info(f"Loading YOLO model: {self.model_name}...")
            self.model = YOLO(self.model_name)
            self.is_initialized = True
            logger.info(f"YOLO detector initialized successfully on device={self.device}.")
        except Exception as e:
            logger.warning(f"Could not load Ultralytics YOLO ({e}). Initializing fallback detector.")
            self.is_initialized = False

    def detect(self, frame: np.ndarray, camera_id: str = "CAM-01", frame_id: int = 0) -> List[Dict[str, Any]]:
        """
        Run object detection on an BGR frame.
        Returns list of detection dictionaries matching DetectionEvent schema.
        """
        if frame is None or frame.size == 0:
            return []

        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        detections = []

        if self.is_initialized and self.model is not None:
            try:
                with self._lock:
                    results = self.model.predict(frame, conf=self.conf_thresh, imgsz=320, verbose=False, device=self.device)
                for r in results:
                    boxes = r.boxes
                    if boxes is None or len(boxes) == 0:
                        continue
                    xyxy_arr = boxes.xyxy.cpu().numpy()
                    conf_arr = boxes.conf.cpu().numpy()
                    cls_arr = boxes.cls.cpu().numpy().astype(int)

                    for idx in range(len(cls_arr)):
                        cls_id = int(cls_arr[idx])
                        if cls_id in self.class_names:
                            obj_type = self.class_names[cls_id]
                            conf = float(conf_arr[idx])
                            xyxy = xyxy_arr[idx]
                            x1, y1, x2, y2 = float(xyxy[0]), float(xyxy[1]), float(xyxy[2]), float(xyxy[3])
                            bw = max(1.0, x2 - x1)
                            bh = max(1.0, y2 - y1)

                            v_sub_type = None
                            if obj_type in ["car", "motorcycle", "bus", "truck", "bicycle"]:
                                normalized_type = "vehicle"
                                if obj_type == "car":
                                    # Height-to-width ratio check: Boxier/taller cabin profile indicates an SUV
                                    v_sub_type = "SUV" if ((bh / bw) >= 0.68 and (bw * bh) >= 15000) else "CAR"
                                elif obj_type == "truck":
                                    v_sub_type = "TRUCK"
                                elif obj_type == "motorcycle":
                                    v_sub_type = "MOTORCYCLE"
                                elif obj_type == "bicycle":
                                    v_sub_type = "BICYCLE"
                                elif obj_type == "bus":
                                    v_sub_type = "BUS"
                                else:
                                    v_sub_type = "CAR"
                            elif obj_type in ["cattle", "animal"]:
                                normalized_type = "environmental"
                                v_sub_type = "CATTLE"
                            elif obj_type in ["drone", "unattended_bag", "robot_device"]:
                                normalized_type = obj_type
                            else:
                                normalized_type = "person"

                            detections.append({
                                "camera_id": camera_id,
                                "timestamp": timestamp,
                                "frame_id": frame_id,
                                "object_type": normalized_type,
                                "vehicle_type": v_sub_type,
                                "raw_class": obj_type,
                                "confidence": round(conf, 3),
                                "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)]
                            })
                return detections
            except Exception as e:
                logger.error(f"YOLO detection error: {e}")

        # Fallback simulated detection for testing when no YOLO model or sample frame
        return self._fallback_detect(frame, camera_id, frame_id, timestamp)

    def _fallback_detect(self, frame: np.ndarray, camera_id: str, frame_id: int, timestamp: str) -> List[Dict[str, Any]]:
        """Fallback mock detector for testing when model files are offline."""
        h, w, _ = frame.shape
        detections = []
        
        # Simulate moving person box
        t = frame_id % 300
        px1 = int((w * 0.2) + (t * 2) % (w * 0.6))
        py1 = int(h * 0.4)
        px2 = px1 + 60
        py2 = py1 + 140
        
        detections.append({
            "camera_id": camera_id,
            "timestamp": timestamp,
            "frame_id": frame_id,
            "object_type": "person",
            "raw_class": "person",
            "confidence": 0.88,
            "bbox": [float(px1), float(py1), float(px2), float(py2)]
        })

        # Simulate stationary vehicle box
        vx1 = int(w * 0.7)
        vy1 = int(h * 0.6)
        vx2 = vx1 + 160
        vy2 = vy1 + 100
        
        detections.append({
            "camera_id": camera_id,
            "timestamp": timestamp,
            "frame_id": frame_id,
            "object_type": "vehicle",
            "raw_class": "car",
            "confidence": 0.94,
            "bbox": [float(vx1), float(vy1), float(vx2), float(vy2)]
        })

        # Simulate drone aerial threat on CAM-04 or periodically
        if frame_id % 150 < 75:
            dx1 = int(w * 0.4 + (frame_id * 3) % 200)
            dy1 = int(h * 0.15 + np.sin(frame_id / 10.0) * 20)
            detections.append({
                "camera_id": camera_id,
                "timestamp": timestamp,
                "frame_id": frame_id,
                "object_type": "drone",
                "raw_class": "drone",
                "confidence": 0.91,
                "bbox": [float(dx1), float(dy1), float(dx1 + 70), float(dy1 + 45)]
            })

        # Simulate unattended bag on CAM-01 or periodically
        if frame_id % 200 > 100:
            bx1 = int(w * 0.35)
            by1 = int(h * 0.72)
            detections.append({
                "camera_id": camera_id,
                "timestamp": timestamp,
                "frame_id": frame_id,
                "object_type": "unattended_bag",
                "raw_class": "unattended_bag",
                "confidence": 0.86,
                "bbox": [float(bx1), float(by1), float(bx1 + 45), float(by1 + 40)]
            })

        return detections


class PersonFaceDetector:
    def __init__(self, model_path: str = "yolov8n.pt", conf_threshold: float = 0.45):
        self.conf_threshold = conf_threshold
        # Load YOLO model
        if not os.path.exists(model_path):
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            local_model = os.path.join(base_dir, model_path)
            if os.path.exists(local_model):
                model_path = local_model
        
        from ultralytics import YOLO
        self.yolo = YOLO(model_path)
        
        # Load OpenCV Face Detector
        cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
        self.face_cascade = cv2.CascadeClassifier(cascade_path)
        
        # Profile face cascade as fallback for sideways views
        profile_path = os.path.join(cv2.data.haarcascades, "haarcascade_profileface.xml")
        self.profile_cascade = cv2.CascadeClassifier(profile_path) if os.path.exists(profile_path) else None

    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Detects all persons in frame, crops the person, searches the upper body for faces,
        and returns structured detections.
        """
        if frame is None or frame.size == 0:
            return []

        h_frame, w_frame = frame.shape[:2]
        # Class 0 is person in COCO
        results = self.yolo(frame, classes=[0], conf=self.conf_threshold, verbose=False)[0]

        detections = []
        for box in results.boxes:
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
            conf = float(box.conf[0])

            # Clamp bounding box inside image bounds
            x1 = max(0, min(w_frame - 1, x1))
            y1 = max(0, min(h_frame - 1, y1))
            x2 = max(0, min(w_frame, x2))
            y2 = max(0, min(h_frame, y2))

            bw = x2 - x1
            bh = y2 - y1
            if bw < 25 or bh < 50:
                continue  # Filter tiny noise

            person_crop = frame[y1:y2, x1:x2].copy()

            # Search upper 40% of body for face
            head_h = max(20, int(bh * 0.40))
            head_crop = frame[y1:y1 + head_h, x1:x2]
            
            face_detected = False
            face_bbox = None
            face_crop = None

            if head_crop.shape[0] >= 28 and head_crop.shape[1] >= 28:
                try:
                    gray_head = cv2.cvtColor(head_crop, cv2.COLOR_BGR2GRAY)
                    gray_head = np.ascontiguousarray(cv2.equalizeHist(gray_head))
                    
                    min_dim = min(gray_head.shape[0], gray_head.shape[1])
                    min_s = max(16, min(24, int(min_dim * 0.35)))
                    max_s = max(min_s + 10, int(min_dim * 0.95))

                    with _CASCADE_LOCK:
                        faces = self.face_cascade.detectMultiScale(
                            gray_head,
                            scaleFactor=1.15,
                            minNeighbors=3,
                            minSize=(min_s, min_s),
                            maxSize=(max_s, max_s)
                        )
                        
                        # If frontal face not found, try profile face
                        if (faces is None or len(faces) == 0) and self.profile_cascade is not None:
                            faces = self.profile_cascade.detectMultiScale(
                                gray_head,
                                scaleFactor=1.15,
                                minNeighbors=3,
                                minSize=(min_s, min_s),
                                maxSize=(max_s, max_s)
                            )

                    if faces is not None and len(faces) > 0:
                        # Select largest face in head region
                        best_face = max(faces, key=lambda f: f[2] * f[3])
                        fx, fy, fw, fh = best_face
                        
                        # Convert to full frame coordinates
                        global_fx1 = x1 + fx
                        global_fy1 = y1 + fy
                        global_fx2 = global_fx1 + fw
                        global_fy2 = global_fy1 + fh

                        face_detected = True
                        face_bbox = [global_fx1, global_fy1, global_fx2, global_fy2]
                        face_crop = frame[global_fy1:global_fy2, global_fx1:global_fx2].copy()
                except Exception:
                    pass

            detections.append({
                "bbox": [x1, y1, x2, y2],
                "confidence": conf,
                "person_crop": person_crop,
                "face_detected": face_detected,
                "face_bbox": face_bbox,
                "face_crop": face_crop
            })

        return detections
