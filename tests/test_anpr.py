import unittest
import numpy as np
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ai.anpr import ANPREngine

class TestANPREngine(unittest.TestCase):
    def setUp(self):
        self.anpr = ANPREngine(min_confidence=0.70)
        self.dummy_frame = np.full((720, 1280, 3), (120, 120, 120), dtype=np.uint8)

    def test_process_vehicle_and_search(self):
        bbox = [400.0, 300.0, 700.0, 550.0]
        record = self.anpr.process_vehicle(self.dummy_frame, bbox, "CAM-01", track_id=1)

        self.assertIsNotNone(record)
        self.assertIn("plate_number", record)
        self.assertGreaterEqual(record["confidence"], 0.70)

        # Search plate query
        search_res = self.anpr.search_plates(record["plate_number"][:3])
        self.assertGreater(len(search_res), 0)

if __name__ == "__main__":
    unittest.main()
