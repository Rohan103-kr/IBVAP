import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.app.core.incident_manager import IncidentManager

class TestIncidentManager(unittest.TestCase):
    def setUp(self):
        self.im = IncidentManager(timeout_sec=10.0)
        self.track = {"track_id": 77, "object_type": "person"}
        self.risk_high = {
            "score": 75,
            "severity": "HIGH",
            "reasons": ["Restricted zone entry"],
            "explanation": "HIGH risk event"
        }
        self.risk_critical = {
            "score": 95,
            "severity": "CRITICAL",
            "reasons": ["Fence crossing", "Night condition"],
            "explanation": "CRITICAL risk event"
        }

    def test_incident_aggregation_and_escalation(self):
        # 1. First trigger creates Incident
        inc1 = self.im.update_incident("CAM-01", self.track, self.risk_high, "ZONE_ENTRY", "snap1.jpg")
        inc_id = inc1["incident_id"]

        self.assertEqual(inc1["max_risk_score"], 75)
        self.assertEqual(inc1["highest_severity"], "HIGH")
        self.assertEqual(len(inc1["timeline"]), 1)

        # 2. Sequential higher severity trigger updates SAME incident (aggregated)
        inc2 = self.im.update_incident("CAM-01", self.track, self.risk_critical, "FENCE_CROSSING", "snap2.jpg")
        self.assertEqual(inc2["incident_id"], inc_id)
        self.assertEqual(inc2["max_risk_score"], 95)
        self.assertEqual(inc2["highest_severity"], "CRITICAL")
        self.assertEqual(len(inc2["timeline"]), 2)
        self.assertEqual(len(inc2["snapshots"]), 2)
        self.assertIn("ai_summary", inc2)
        self.assertIn("point_breakdown", inc2)
        self.assertEqual(inc2["identity_status"], "UNRECOGNIZED")

if __name__ == "__main__":
    unittest.main()
