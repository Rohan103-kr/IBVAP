import unittest
import numpy as np
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ai.anpr import ANPREngine, TemporalPlateVoter
from backend.app.core.multi_camera_correlator import MultiCameraCorrelator
from backend.app.core.feature_extractor import FeatureExtractor
from backend.app.core.risk_engine import RiskEngine
from backend.app.core.rule_engine import RuleEngine


class TestANPRIntelligenceSIH26187(unittest.TestCase):
    def setUp(self):
        self.anpr = ANPREngine()
        self.voter = TemporalPlateVoter(window_size=5)
        self.correlator = MultiCameraCorrelator(time_window_sec=60.0)
        self.correlator.active_correlations = []
        self.feature_extractor = FeatureExtractor()
        self.risk_engine = RiskEngine()
        self.rule_engine = RuleEngine()
        self.dummy_frame = np.full((720, 1280, 3), 128, dtype=np.uint8)

    def test_temporal_plate_voter_majority_consensus(self):
        """Noisy OCR frames must resolve to majority consensus and boosted confidence."""
        track_id = 42
        # Frame 1: HR26AB1234
        self.voter.add_observation(track_id, "HR26AB1234", 0.88)
        # Frame 2: HR26AB1234
        self.voter.add_observation(track_id, "HR26AB1234", 0.90)
        # Frame 3: Blurry noise HR26A81234 ('8' instead of 'B')
        self.voter.add_observation(track_id, "HR26A81234", 0.75)
        # Frame 4: HR26AB1234
        self.voter.add_observation(track_id, "HR26AB1234", 0.92)
        # Frame 5: HR26AB1234
        plate, conf, ratio, total = self.voter.add_observation(track_id, "HR26AB1234", 0.91)

        self.assertEqual(plate, "HR26AB1234")
        self.assertEqual(ratio, "4/5")
        self.assertEqual(total, 5)
        self.assertGreaterEqual(conf, 0.88)

    def test_direct_plate_cross_camera_reid(self):
        """Vehicles sharing the same plate across disjoint cameras must unify into one movement chain."""
        # Sight 1 on CAM-01
        track1 = {
            "track_id": 101,
            "object_type": "vehicle",
            "license_plate": "KA-05-NB-9912"
        }
        corr1 = self.correlator.register_sighting("CAM-01", track1, risk_score=75)
        self.assertIn("CAM-01", corr1["camera_chain"])

        # Sight 2 on CAM-03 (non-adjacent to CAM-01 in topology) with same plate
        track2 = {
            "track_id": 202,
            "object_type": "vehicle",
            "license_plate": "KA 05 NB 9912"  # Slight space variation
        }
        corr2 = self.correlator.register_sighting("CAM-03", track2, risk_score=85)

        # Must merge into single correlation chain!
        self.assertEqual(corr1["correlation_id"], corr2["correlation_id"])
        self.assertEqual(corr2["camera_chain"], ["CAM-01", "CAM-03"])
        self.assertEqual(corr2["total_cameras"], 2)

    def test_feature_extractor_anpr_watchlist_propagation(self):
        """Watchlist vehicle track must propagate anpr_watchlist_hit to feature extractor and risk engine."""
        track = {
            "track_id": 303,
            "object_type": "car",
            "bbox": [100.0, 100.0, 300.0, 300.0],
            "centroid": [200.0, 200.0],
            "trajectory": [[200.0, 200.0]],
            "speed_mps": 5.0,
            "is_watchlist_vehicle": True,
            "license_plate": "DL-01-AB-1234"
        }

        features = self.feature_extractor.extract_features(track, matched_zones=[], crossed_fences=[], day_night_context="DAY")
        self.assertTrue(features.get("anpr_watchlist_hit", False))
        self.assertEqual(features.get("license_plate"), "DL-01-AB-1234")

        risk_res = self.risk_engine.compute_risk(features, object_type="car")
        self.assertGreaterEqual(risk_res["score"], 40)
        self.assertEqual(risk_res["weights_applied"].get("ANPR Watchlist Match"), 40)
        self.assertTrue(any("watchlist" in r.lower() for r in risk_res["reasons"]))

    def test_checkpoint_driver_mismatch_fusion_rule(self):
        """Authorized vehicle with an unrecognized/mismatched driver must trigger CHECKPOINT_DRIVER_MISMATCH."""
        track = {
            "track_id": 404,
            "object_type": "vehicle",
            "license_plate": "HR-26-DK-8392",
            "is_driver_mismatch": True,
            "driver_name": "Unregistered Sentry Suspect"
        }

        triggers = self.rule_engine.evaluate(track, zones=[], crossed_fences=[], day_night_context="DAY")
        mismatch_triggers = [t for t in triggers if t["event_type"] == "CHECKPOINT_DRIVER_MISMATCH"]

        self.assertEqual(len(mismatch_triggers), 1)
        trig = mismatch_triggers[0]
        self.assertEqual(trig["severity"], "HIGH")
        self.assertEqual(trig["risk_score"], 85)
        self.assertEqual(trig["license_plate"], "HR-26-DK-8392")
        self.assertTrue(any("mismatch" in r.lower() for r in trig["reasons"]))


if __name__ == "__main__":
    unittest.main()
