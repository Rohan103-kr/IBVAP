import unittest
import numpy as np
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.app.core.risk_engine import RiskEngine
from backend.app.core.event_engine import EventEngine
from backend.app.core.incident_manager import IncidentManager
from ai.anpr import ANPREngine

class TestAlertSystemSIH26187(unittest.TestCase):
    def setUp(self):
        self.risk_engine = RiskEngine()
        self.event_engine = EventEngine(cooldown_sec=10.0)
        self.incident_manager = IncidentManager()
        self.anpr_engine = ANPREngine()
        self.dummy_frame = np.zeros((720, 1280, 3), dtype=np.uint8)

    def test_wildlife_suppression(self):
        """Wildlife/cattle near perimeter must be suppressed to INFO with score 0."""
        features = {
            "fence_crossed": True,
            "restricted_zone": True,
            "is_wildlife": True
        }
        res = self.risk_engine.compute_risk(features, object_type="cow")
        self.assertEqual(res["score"], 0)
        self.assertEqual(res["severity"], "INFO")
        self.assertTrue(any("wildlife" in r.lower() or "cattle" in r.lower() for r in res["reasons"]))

    def test_anpr_watchlist_threat_elevation(self):
        """ANPR plate matching watchlist triggers CRITICAL severity and elevated score."""
        is_wl, reason = self.anpr_engine.is_watchlist_plate("DL 01 AB 1234")
        self.assertTrue(is_wl)
        self.assertIn("Suspect", reason)

        features = {
            "anpr_watchlist_hit": True,
            "confidence_score": 0.9
        }
        res = self.risk_engine.compute_risk(features, object_type="car")
        self.assertGreaterEqual(res["score"], 40)
        self.assertTrue(any("watchlist" in r.lower() for r in res["reasons"]))

    def test_smart_cooldown_escalation_bypass(self):
        """If a track escalates from WARNING to CRITICAL, cooldown must be bypassed immediately."""
        track = {
            "track_id": 105,
            "object_type": "person",
            "bbox": [50.0, 50.0, 150.0, 250.0]
        }
        trigger_warning = {
            "event_type": "LOITERING",
            "severity": "WARNING",
            "risk_score": 45,
            "reasons": ["Loitering near perimeter buffer"]
        }
        trigger_critical = {
            "event_type": "FENCE_CROSSING",
            "severity": "CRITICAL",
            "risk_score": 90,
            "reasons": ["Barbed wire fence breached"]
        }

        # First alert fires as WARNING
        evt1 = self.event_engine.process_trigger(trigger_warning, track, self.dummy_frame, "CAM-TEST")
        self.assertIsNotNone(evt1)
        self.assertEqual(evt1["severity"], "WARNING")

        # Second alert of same severity should be deduplicated / suppressed
        evt_dup = self.event_engine.process_trigger(trigger_warning, track, self.dummy_frame, "CAM-TEST")
        self.assertIsNone(evt_dup)

        # Escalation to CRITICAL should BYPASS cooldown immediately!
        evt_escalated = self.event_engine.process_trigger(trigger_critical, track, self.dummy_frame, "CAM-TEST")
        self.assertIsNotNone(evt_escalated, "Escalated threat should bypass cooldown immediately!")
        self.assertEqual(evt_escalated["severity"], "CRITICAL")
        self.assertTrue(evt_escalated.get("is_escalation", False))

    def test_incident_sop_recommendation(self):
        """Critical fence crossing incident must contain QRF SOP dispatch recommendation and ESCALATED status."""
        track = {
            "track_id": 204,
            "object_type": "person",
            "identity_status": "UNRECOGNIZED"
        }
        risk_res = {
            "score": 92,
            "severity": "CRITICAL",
            "reasons": ["Fence line crossed (+50)", "Night Condition (+20)"],
            "explanation": "CRITICAL border breach detected on CAM-01",
            "point_breakdown": {"Fence Crossing": 50, "Night": 20}
        }
        inc = self.incident_manager.update_incident("CAM-TEST", track, risk_res, "FENCE_CROSSING")
        self.assertEqual(inc["status"], "ESCALATED")
        self.assertIn("Quick Reaction Force", inc["sop_recommendation"])

if __name__ == "__main__":
    unittest.main()
