import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.app.core.multi_camera_correlator import MultiCameraCorrelator

TEST_CORR_FILE = "demo/test_correlations.json"

class TestMultiCameraCorrelator(unittest.TestCase):
    def setUp(self):
        if os.path.exists(TEST_CORR_FILE):
            os.remove(TEST_CORR_FILE)
        self.mc = MultiCameraCorrelator(time_window_sec=60.0)
        self.mc.active_correlations = []

    def tearDown(self):
        if os.path.exists(TEST_CORR_FILE):
            os.remove(TEST_CORR_FILE)

    def test_cross_camera_correlation_chain(self):
        track1 = {"track_id": 10, "object_type": "person"}
        track2 = {"track_id": 25, "object_type": "person"}

        # 1. Sighting on CAM-01
        corr1 = self.mc.register_sighting("CAM-01", track1, risk_score=85)
        self.assertIn("CAM-01", corr1["camera_chain"])

        # 2. Sequential Sighting on adjacent CAM-02 links to same correlation
        corr2 = self.mc.register_sighting("CAM-02", track2, risk_score=90)
        self.assertEqual(corr2["correlation_id"], corr1["correlation_id"])
        self.assertEqual(corr2["camera_chain"], ["CAM-01", "CAM-02"])
        self.assertEqual(corr2["total_cameras"], 2)
        self.assertIn("time_deltas", corr2)
        self.assertIn("Cross-camera chain", corr2["summary"])

if __name__ == "__main__":
    unittest.main()
