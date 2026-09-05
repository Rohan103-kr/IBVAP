import unittest
import numpy as np
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ai.detector import YOLODetector

class TestDetector(unittest.TestCase):
    def test_detector_initialization(self):
        detector = YOLODetector(model_name="yolov8n.pt", conf_thresh=0.35)
        self.assertIsNotNone(detector)

    def test_detector_on_blank_frame(self):
        detector = YOLODetector(model_name="yolov8n.pt", conf_thresh=0.35)
        blank_frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        detections = detector.detect(blank_frame, camera_id="CAM-TEST", frame_id=1)

        self.assertIsInstance(detections, list)
        for det in detections:
            self.assertIn("camera_id", det)
            self.assertIn("object_type", det)
            self.assertIn("confidence", det)
            self.assertIn("bbox", det)
            self.assertEqual(len(det["bbox"]), 4)

if __name__ == "__main__":
    unittest.main()
