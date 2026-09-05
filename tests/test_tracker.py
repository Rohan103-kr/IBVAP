import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ai.tracker import ByteTracker, calculate_iou

class TestTracker(unittest.TestCase):
    def test_calculate_iou(self):
        box1 = [10.0, 10.0, 50.0, 50.0]
        box2 = [10.0, 10.0, 50.0, 50.0]
        self.assertAlmostEqual(calculate_iou(box1, box2), 1.0, places=2)

        box3 = [100.0, 100.0, 150.0, 150.0]
        self.assertEqual(calculate_iou(box1, box3), 0.0)

    def test_tracker_persistent_ids(self):
        tracker = ByteTracker(max_disappeared=5, iou_threshold=0.3)

        # Frame 1 detections
        dets_f1 = [
            {"camera_id": "CAM-01", "object_type": "person", "confidence": 0.9, "bbox": [10.0, 10.0, 50.0, 100.0]}
        ]
        tracked_f1 = tracker.update(dets_f1, camera_id="CAM-01")
        self.assertEqual(len(tracked_f1), 1)
        initial_id = tracked_f1[0]["track_id"]

        # Frame 2 slightly shifted detection
        dets_f2 = [
            {"camera_id": "CAM-01", "object_type": "person", "confidence": 0.92, "bbox": [12.0, 12.0, 52.0, 102.0]}
        ]
        tracked_f2 = tracker.update(dets_f2, camera_id="CAM-01")
        self.assertEqual(len(tracked_f2), 1)
        self.assertEqual(tracked_f2[0]["track_id"], initial_id)
        self.assertEqual(len(tracked_f2[0]["trajectory"]), 2)

if __name__ == "__main__":
    unittest.main()
