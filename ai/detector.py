import cv2
import numpy as np
import time
import logging
from typing import List, Dict, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("YOLODetector")

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
        self.class_names = {
            0: "person",
            2: "car", 3: "motorcycle", 5: "bus", 7: "truck",
            4: "drone",         # COCO 4 airplane mapped to drone
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
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        detections = []

        if self.is_initialized and self.model is not None:
            try:
                results = self.model.predict(frame, conf=self.conf_thresh, imgsz=480, verbose=False, device=self.device)
                for r in results:
                    boxes = r.boxes
                    for box in boxes:
                        cls_id = int(box.cls[0].item())
                        conf = float(box.conf[0].item())
                        
                        if cls_id in self.class_names:
                            obj_type = self.class_names[cls_id]
                            if obj_type in ["car", "motorcycle", "bus", "truck"]:
                                normalized_type = "vehicle"
                            elif obj_type in ["drone", "unattended_bag", "robot_device"]:
                                normalized_type = obj_type
                            else:
                                normalized_type = "person"

                            xyxy = box.xyxy[0].cpu().numpy().tolist()
                            
                            detections.append({
                                "camera_id": camera_id,
                                "timestamp": timestamp,
                                "frame_id": frame_id,
                                "object_type": normalized_type,
                                "raw_class": obj_type,
                                "confidence": round(conf, 3),
                                "bbox": [round(val, 1) for val in xyxy]
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
