import unittest
import numpy as np
import cv2
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ai.face_detector import FaceDetector
from backend.app.core.risk_engine import RiskEngine
from backend.app.core.rule_engine import RuleEngine
from backend.app.core.streamer import CameraStreamer


class TestFRSQualityGateSIH26187(unittest.TestCase):
    def setUp(self):
        self.face_detector = FaceDetector()
        self.risk_engine = RiskEngine()
        self.rule_engine = RuleEngine()
        self.streamer = CameraStreamer()

    def test_face_quality_gate_sharp_vs_blurry(self):
        """Sharp face chip must pass the quality gate; heavily blurred chip must be rejected."""
        # 1. Create sharp high-contrast texture simulating face landmarks
        sharp_face = np.full((64, 64, 3), 128, dtype=np.uint8)
        # Draw high-contrast facial features (eyes, eyebrows, mouth)
        cv2.rectangle(sharp_face, (16, 20), (26, 26), (20, 20, 20), -1)
        cv2.rectangle(sharp_face, (38, 20), (48, 26), (20, 20, 20), -1)
        cv2.line(sharp_face, (20, 48), (44, 48), (30, 30, 30), 3)

        is_pass, score, reason = FaceDetector.assess_face_quality(sharp_face, min_dim=32, min_laplacian=50.0)
        self.assertTrue(is_pass, f"Sharp face failed quality gate: {reason}")
        self.assertEqual(reason, "QUALITY_ACCEPTABLE")
        self.assertGreaterEqual(score, 0.70)

        # 2. Heavily blurred face (simulating 50m distance / low-light night camera)
        blurry_face = cv2.GaussianBlur(sharp_face, (15, 15), 5.0)
        is_pass_b, score_b, reason_b = FaceDetector.assess_face_quality(blurry_face, min_dim=32, min_laplacian=50.0)
        self.assertFalse(is_pass_b, "Blurry face should have failed quality gate")
        self.assertIn("BLURRY", reason_b)

    def test_face_quality_gate_too_small(self):
        """Tiny crop (distant person) must fail the resolution gate."""
        tiny_crop = np.full((20, 20, 3), 128, dtype=np.uint8)
        is_pass, score, reason = FaceDetector.assess_face_quality(tiny_crop, min_dim=36)
        self.assertFalse(is_pass)
        self.assertIn("TOO_SMALL", reason)

    def test_camera_role_tiering(self):
        """Verify camera roles (CAM-02 is choke point, CAM-01 is wide surveillance)."""
        role_c2 = self.streamer.get_camera_role("CAM-02")
        self.assertEqual(role_c2, "IDENTIFICATION_CHOKEPOINT")

        role_c1 = self.streamer.get_camera_role("CAM-01")
        self.assertEqual(role_c1, "WIDE_SURVEILLANCE")

    def test_identity_risk_case1_authorized_patrol(self):
        """Case 1: Recognized friendly patrol receives -20 risk deduction and alarm suppression."""
        features = {
            "identity_status": "AUTHORIZED",
            "restricted_zone": True,
            "confidence_score": 0.90
        }
        res = self.risk_engine.compute_risk(features, object_type="person")
        self.assertEqual(res["score"], 0)
        self.assertEqual(res["severity"], "INFO")
        self.assertTrue(any("friendly" in r.lower() or "patrol" in r.lower() for r in res["reasons"]))

        # Rule engine must suppress alarm
        track = {"track_id": 1, "object_type": "person", "identity_status": "AUTHORIZED"}
        triggers = self.rule_engine.evaluate(track, zones=[], crossed_fences=[], day_night_context="DAY")
        self.assertEqual(len(triggers), 0)

    def test_identity_risk_case2_unknown_in_restricted_zone(self):
        """Case 2: Unknown person in restricted zone receives +15 penalty."""
        features = {
            "identity_status": "UNRECOGNIZED",
            "restricted_zone": True,
            "fence_crossed": False,
            "confidence_score": 0.90
        }
        res = self.risk_engine.compute_risk(features, object_type="person")
        self.assertEqual(res["weights_applied"].get("Unrecognized Identity"), 15)
        self.assertTrue(any("unrecognized person in restricted" in r.lower() for r in res["reasons"]))

    def test_identity_risk_case3_watchlist_match(self):
        """Case 3: Wanted suspect match receives +30 penalty and triggers P1 CRITICAL alert."""
        features = {
            "identity_status": "UNAUTHORIZED",
            "confidence_score": 0.90
        }
        res = self.risk_engine.compute_risk(features, object_type="person")
        self.assertEqual(res["weights_applied"].get("Watchlist Identity Threat"), 30)

        # Rule engine fires FRS_SUSPECT_MATCH
        track = {
            "track_id": 7,
            "object_type": "person",
            "identity_status": "UNAUTHORIZED",
            "matched_suspect_name": "Infiltrator-Echo"
        }
        triggers = self.rule_engine.evaluate(track, zones=[], crossed_fences=[], day_night_context="NIGHT")
        suspect_triggers = [t for t in triggers if t["event_type"] == "FRS_SUSPECT_MATCH"]
        self.assertEqual(len(suspect_triggers), 1)
        self.assertEqual(suspect_triggers[0]["severity"], "CRITICAL")
        self.assertEqual(suspect_triggers[0]["risk_score"], 96)


if __name__ == "__main__":
    unittest.main()
