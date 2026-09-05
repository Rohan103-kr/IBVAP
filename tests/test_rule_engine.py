import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.app.core.rule_engine import RuleEngine

class TestRuleEngine(unittest.TestCase):
    def setUp(self):
        self.re = RuleEngine(loitering_threshold_sec=5.0)
        self.sample_track = {
            "track_id": 101,
            "camera_id": "CAM-01",
            "object_type": "person",
            "duration_sec": 6.5
        }

    def test_restricted_zone_entry_trigger(self):
        zones = [{"zone_id": "R1", "name": "Buffer", "type": "RESTRICTED"}]
        triggers = self.re.evaluate(self.sample_track, zones, [], "DAY")
        
        event_types = [t["event_type"] for t in triggers]
        self.assertIn("ZONE_ENTRY", event_types)
        self.assertIn("LOITERING", event_types)

    def test_fence_crossing_trigger(self):
        fences = [{"fence_id": "F1", "name": "Primary Fence"}]
        triggers = self.re.evaluate(self.sample_track, [], fences, "NIGHT")
        
        self.assertEqual(len(triggers), 1)
        self.assertEqual(triggers[0]["event_type"], "FENCE_CROSSING")
        self.assertEqual(triggers[0]["severity"], "CRITICAL")
        self.assertEqual(triggers[0]["risk_score"], 95)

if __name__ == "__main__":
    unittest.main()
