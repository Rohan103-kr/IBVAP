import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.app.core.feedback_store import FeedbackStore

class TestFeedbackStore(unittest.TestCase):
    def setUp(self):
        self.fs = FeedbackStore(filepath="demo/test_feedback.json")

    def tearDown(self):
        if os.path.exists("demo/test_feedback.json"):
            os.remove("demo/test_feedback.json")

    def test_add_and_get_feedback(self):
        entry = self.fs.add_feedback("INC-1001", "VALID_INCIDENT", "Confirmed breach by patrol", "Operator-Alpha")
        self.assertEqual(entry["incident_id"], "INC-1001")
        self.assertEqual(entry["feedback_type"], "VALID_INCIDENT")

        retrieved = self.fs.get_feedback_for_incident("INC-1001")
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved["operator_notes"], "Confirmed breach by patrol")

if __name__ == "__main__":
    unittest.main()
