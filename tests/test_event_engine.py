import unittest
import numpy as np
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.app.core.event_engine import EventEngine

class TestEventEngine(unittest.TestCase):
    def setUp(self):
        self.ee = EventEngine(cooldown_sec=5.0)
        self.dummy_frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        self.dummy_track = {
            "track_id": 42,
            "object_type": "person",
            "bbox": [100.0, 100.0, 200.0, 300.0]
        }
        self.dummy_trigger = {
            "event_type": "ZONE_ENTRY",
            "severity": "HIGH",
            "risk_score": 85,
            "reasons": ["Test intrusion"],
            "zone_id": "RESTRICTED-01"
        }

    def test_event_generation_and_deduplication(self):
        # First trigger should generate event
        evt1 = self.ee.process_trigger(self.dummy_trigger, self.dummy_track, self.dummy_frame, "CAM-TEST")
        self.assertIsNotNone(evt1)
        self.assertEqual(evt1["event_type"], "ZONE_ENTRY")
        self.assertTrue(os.path.exists(os.path.join("demo/snapshots", evt1["snapshot"])))
        audit_file = os.path.join("demo/snapshots", f"{evt1['event_id']}_audit.json")
        self.assertTrue(os.path.exists(audit_file))

        # Immediate second trigger for same track & event_type should be deduplicated (None)
        evt2 = self.ee.process_trigger(self.dummy_trigger, self.dummy_track, self.dummy_frame, "CAM-TEST")
        self.assertIsNone(evt2)

if __name__ == "__main__":
    unittest.main()
