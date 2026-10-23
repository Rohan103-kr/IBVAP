import unittest
import numpy as np
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ai.anomaly_detector import AnomalyDetector
from backend.app.core.feature_extractor import FeatureExtractor
from backend.app.core.rule_engine import RuleEngine

class TestAnomalyAccuracy(unittest.TestCase):
    def setUp(self):
        self.detector = AnomalyDetector()
        self.extractor = FeatureExtractor()
        self.rule_engine = RuleEngine()

    def test_trajectory_jitter_resistance(self):
        """Simulate straight-line walking with 1-2 pixel YOLO centroid noise.
        Must result in 0 direction changes."""
        # Person walking along x-axis from x=100 to x=300 with 1px y-jitter
        noisy_trajectory = []
        for i in range(25):
            x = 100.0 + i * 8.0
            y = 200.0 + (1.0 if i % 2 == 0 else -1.0)
            noisy_trajectory.append([x, y])

        track = {
            "track_id": 1,
            "duration_sec": 10.0,
            "speed_mps": 1.3,
            "trajectory": noisy_trajectory,
            "confidence": 0.9
        }

        features = self.extractor.extract_features(
            track=track,
            matched_zones=[],
            crossed_fences=[],
            day_night_context="DAY"
        )

        # Before fix, this would have produced 15-20 direction changes.
        # Now it should be <= 1 (ideally 0) because waypoints are distance-filtered
        self.assertLessEqual(features["direction_changes_count"], 1)

    def test_pedestrian_passby_does_not_trigger_skirmish(self):
        """Two pedestrians passing by each other at normal speed (1.3 m/s) with low kinetic flux
        must NOT trigger a violent skirmish alert."""
        person1 = {
            "track_id": 10,
            "bbox": [100, 100, 150, 200],
            "speed_mps": 1.3
        }
        person2 = {
            "track_id": 11,
            "bbox": [140, 100, 190, 200],  # Close proximity: gap < 50px
            "speed_mps": 1.3
        }

        kinetic_res = {
            "anomaly_detected": False,
            "anomaly_score": 15.0,
            "mean_flux": 0.003  # Normal calm surveillance background
        }

        res = self.detector.detect_skirmish([person1, person2], kinetic_res)
        self.assertFalse(res["is_fight"])

    def test_high_kinetic_grappling_triggers_skirmish(self):
        """Two individuals grappling in close proximity with elevated kinetic flux
        must trigger a violent skirmish alert."""
        person1 = {
            "track_id": 20,
            "bbox": [200, 200, 260, 320],
            "speed_mps": 1.8
        }
        person2 = {
            "track_id": 21,
            "bbox": [220, 210, 280, 330],  # Overlapping / interlocking boxes
            "speed_mps": 1.9
        }

        kinetic_res = {
            "anomaly_detected": True,
            "anomaly_score": 75.0,
            "mean_flux": 0.013  # Violent physical altercation flux
        }

        # Frame 1: registers skirmish
        res = self.detector.detect_skirmish([person1, person2], kinetic_res)
        self.assertTrue(res["is_fight"])
        self.assertIn("skirmish", res["reason"].lower())

    def test_calibrated_ml_prediction_normal_track(self):
        """Normal walking vector must return NORMAL category and low anomaly score."""
        normal_vec = {
            "track_duration_sec": 12.0,
            "avg_speed_mps": 1.2,
            "max_speed_mps": 1.5,
            "direction_changes_count": 0,
            "distance_to_fence_m": 60.0,
            "loitering_duration_sec": 0.0,
            "in_restricted_zone": 0,
            "in_buffer_zone": 0,
            "fence_crossed": 0,
            "night_context": 0,
            "multi_camera_appearances": 1
        }
        pred = self.detector.predict_track_features(normal_vec)
        self.assertEqual(pred["threat_category"], "NORMAL")
        self.assertLess(pred["anomaly_score"], 40.0)

    def test_calibrated_ml_prediction_critical_breach(self):
        """Critical breach vector must return CRITICAL category with high anomaly score."""
        critical_vec = {
            "track_duration_sec": 45.0,
            "avg_speed_mps": 4.5,
            "max_speed_mps": 6.8,
            "direction_changes_count": 4,
            "distance_to_fence_m": 0.0,
            "loitering_duration_sec": 20.0,
            "in_restricted_zone": 1,
            "in_buffer_zone": 1,
            "fence_crossed": 1,
            "night_context": 1,
            "multi_camera_appearances": 2
        }
        pred = self.detector.predict_track_features(critical_vec)
        self.assertEqual(pred["threat_category"], "CRITICAL")
        self.assertGreaterEqual(pred["anomaly_score"], 70.0)

    def test_rule_engine_emits_behavioral_anomaly(self):
        """When a track exhibits confirmed behavioral anomaly without being in a marked zone,
        RuleEngine must emit a BEHAVIORAL_ANOMALY event."""
        track = {
            "track_id": 99,
            "camera_id": "CAM-01",
            "object_type": "person",
            "duration_sec": 15.0,
            "behavior_category": "CRITICAL",
            "behavior_confidence": 0.88,
            "risk_score": 85
        }
        triggers = self.rule_engine.evaluate(
            track=track,
            zones=[],
            crossed_fences=[],
            day_night_context="DAY"
        )
        self.assertEqual(len(triggers), 1)
        self.assertEqual(triggers[0]["event_type"], "BEHAVIORAL_ANOMALY")
        self.assertEqual(triggers[0]["severity"], "CRITICAL")
        self.assertIn("Tactical AI Anomaly", triggers[0]["reasons"][0])

if __name__ == "__main__":
    unittest.main()
