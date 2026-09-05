import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.app.core.risk_engine import RiskEngine

class TestRiskEngine(unittest.TestCase):
    def setUp(self):
        self.re = RiskEngine()

    def test_critical_risk_scoring_and_explainability(self):
        features = {
            "fence_crossed": True,      # +30
            "restricted_zone": True,    # +25
            "night_time": True,         # +20
            "toward_border": True,      # +15
            "is_loitering": False,
            "confidence_score": 0.9     # +9
        }
        res = self.re.compute_risk(features, object_type="person")

        self.assertGreaterEqual(res["score"], 81)
        self.assertEqual(res["severity"], "CRITICAL")
        self.assertIn("Fence Crossing", res["weights_applied"])
        self.assertIn("point_breakdown", res)
        self.assertIn("Restricted Zone", res["point_breakdown"])
        self.assertIn("CRITICAL risk event", res["explanation"])

    def test_info_severity(self):
        features = {
            "fence_crossed": False,
            "restricted_zone": False,
            "night_time": False,
            "toward_border": False,
            "is_loitering": False,
            "confidence_score": 0.8
        }
        res = self.re.compute_risk(features, object_type="car")

        self.assertLessEqual(res["score"], 30)
        self.assertEqual(res["severity"], "INFO")

if __name__ == "__main__":
    unittest.main()
