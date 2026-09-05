import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.app.core.feature_extractor import FeatureExtractor

class TestFeatureExtractor(unittest.TestCase):
    def setUp(self):
        self.fe = FeatureExtractor()
        self.track = {
            "track_id": 1,
            "object_type": "person",
            "confidence": 0.95,
            "duration_sec": 12.0,
            "heading_deg": 90.0,
            "trajectory": [[100, 100], [100, 110], [100, 120]]
        }

    def test_feature_extraction(self):
        matched_zones = [{"zone_id": "Z1", "type": "RESTRICTED"}]
        crossed_fences = [{"fence_id": "F1"}]
        
        feats = self.fe.extract_features(self.track, matched_zones, crossed_fences, "NIGHT")
        
        self.assertTrue(feats["night_time"])
        self.assertTrue(feats["restricted_zone"])
        self.assertTrue(feats["fence_crossed"])
        self.assertTrue(feats["is_loitering"])
        self.assertTrue(feats["toward_border"])
        self.assertEqual(feats["confidence_score"], 0.95)

if __name__ == "__main__":
    unittest.main()
