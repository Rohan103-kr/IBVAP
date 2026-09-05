import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.app.main import DEMO_SCENARIOS, trigger_demo_scenario

class TestScenarioSimulator(unittest.TestCase):
    def test_demo_scenarios_count(self):
        self.assertEqual(len(DEMO_SCENARIOS), 8)

    def test_trigger_scenario_01(self):
        res = trigger_demo_scenario("SCENARIO_01_PERIMETER_INTRUSION")
        self.assertEqual(res["status"], "SUCCESS")
        self.assertEqual(res["incident"]["camera_id"], "CAM-01")
        self.assertEqual(res["incident"]["max_risk_score"], 92)

    def test_trigger_scenario_05_cross_camera(self):
        res = trigger_demo_scenario("SCENARIO_05_CROSS_CAMERA_CHAIN")
        self.assertEqual(res["status"], "SUCCESS")
        self.assertEqual(res["incident"]["max_risk_score"], 88)

if __name__ == "__main__":
    unittest.main()
