import unittest
import numpy as np
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ai.camera_health import CameraHealthMonitor

class TestCameraHealthMonitor(unittest.TestCase):
    def setUp(self):
        self.ch = CameraHealthMonitor("CAM-TEST", max_frozen_frames=3)

    def test_stream_disconnect(self):
        res = self.ch.inspect_frame(None)
        self.assertEqual(res["status"], "OFFLINE")
        self.assertEqual(res["event_trigger"], "CAMERA_OFFLINE")

    def test_frozen_frame_detection(self):
        frame = np.full((720, 1280, 3), 100, dtype=np.uint8)

        # Inspect static identical frame multiple times
        self.ch.inspect_frame(frame)
        self.ch.inspect_frame(frame)
        self.ch.inspect_frame(frame)
        res = self.ch.inspect_frame(frame)

        self.assertTrue(res["is_frozen"])
        self.assertEqual(res["status"], "DEGRADED")

    def test_sector_coverage_math(self):
        from ai.camera_health import SectorCoverageMonitor
        statuses = {
            "CAM-01": "ONLINE",
            "CAM-02": "ONLINE",
            "CAM-03": "OFFLINE",  # Sector B coverage drops to 50%
            "CAM-04": "ONLINE",
            "CAM-05": "ONLINE",
            "CAM-06": "ONLINE"
        }
        res = SectorCoverageMonitor.compute_sector_coverage(statuses)
        self.assertIn("sectors", res)
        self.assertIn("Sector B (Fence Line)", res["sectors"])
        sec_b = res["sectors"]["Sector B (Fence Line)"]
        self.assertEqual(sec_b["coverage_pct"], 50.0)
        self.assertEqual(len(res["coverage_gaps"]), 1)
        self.assertIn("Sector B", res["coverage_gaps"][0]["sector"])

if __name__ == "__main__":
    unittest.main()
