import os
import unittest
import numpy as np
from datetime import datetime

from backend.database import (
    init_db,
    get_db_connection,
    update_person_presence,
    close_inactive_sightings,
    get_active_under_cctv,
    get_all_persons,
    get_person_journey,
    export_journey_csv
)
from ai.reid import FeatureExtractor
from ai.tracker import compute_iou, SingleCameraTracker
from ai.detector import PersonFaceDetector


class TestSurveillanceReIDSystem(unittest.TestCase):
    def setUp(self):
        init_db()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM camera_sightings WHERE person_id = 'Subject_A'")
        cursor.execute("DELETE FROM movement_logs WHERE person_id = 'Subject_A'")
        cursor.execute("DELETE FROM persons WHERE person_id = 'Subject_A'")
        conn.commit()
        conn.close()

    def test_database_interval_and_handoff(self):
        """
        Verify the core requirement:
        'that person 1 this time to this time from this camera to this camera till under the cctvs'
        """
        t1 = datetime(2026, 9, 5, 10, 0, 0)
        t2 = datetime(2026, 9, 5, 10, 2, 0)
        t3 = datetime(2026, 9, 5, 10, 2, 10)
        t4 = datetime(2026, 9, 5, 10, 5, 0)

        # 1. Person 1 appears in Camera 1
        update_person_presence(
            person_id="Subject_A",
            camera_id="cam_entry",
            camera_name="Main Gate (CAM-01)",
            timestamp=t1
        )
        # Stayed until t2 in Camera 1
        update_person_presence(
            person_id="Subject_A",
            camera_id="cam_entry",
            camera_name="Main Gate (CAM-01)",
            timestamp=t2
        )

        # Check journey after Cam 1
        journey = get_person_journey("Subject_A")
        self.assertEqual(len(journey["sightings"]), 1)
        s1 = journey["sightings"][0]
        self.assertEqual(s1["camera_id"], "cam_entry")
        self.assertEqual(s1["start_time"], "2026-09-05 10:00:00")
        self.assertEqual(s1["end_time"], "2026-09-05 10:02:00")
        self.assertEqual(s1["is_active"], 1)

        # 2. Person 1 transfers from Camera 1 to Camera 2 (Corridor)
        update_person_presence(
            person_id="Subject_A",
            camera_id="cam_corridor",
            camera_name="Corridor Beta (CAM-02)",
            timestamp=t3
        )
        # Stayed in Camera 2 until t4
        update_person_presence(
            person_id="Subject_A",
            camera_id="cam_corridor",
            camera_name="Corridor Beta (CAM-02)",
            timestamp=t4
        )

        # Verify cross-camera transition
        journey = get_person_journey("Subject_A")
        self.assertEqual(len(journey["sightings"]), 2)

        # First interval in Cam 1 must now be closed (is_active=0)
        self.assertEqual(journey["sightings"][0]["is_active"], 0)
        # Second interval in Cam 2 must be active (is_active=1)
        self.assertEqual(journey["sightings"][1]["camera_id"], "cam_corridor")
        self.assertEqual(journey["sightings"][1]["is_active"], 1)
        self.assertTrue(journey["is_currently_under_cctv"])

        # Check CSV export contains intervals
        csv_out = export_journey_csv()
        self.assertIn("Subject_A", csv_out)
        self.assertIn("Main Gate (CAM-01)", csv_out)
        self.assertIn("Corridor Beta (CAM-02)", csv_out)

    def test_feature_extractor(self):
        extractor = FeatureExtractor()
        # Random dummy person crop
        dummy_person = np.random.randint(0, 255, (120, 60, 3), dtype=np.uint8)
        body_feat = extractor.extract_body_features(dummy_person)
        self.assertEqual(len(body_feat), 576)
        self.assertAlmostEqual(np.linalg.norm(body_feat), 1.0, places=4)

        # Random dummy face crop
        dummy_face = np.random.randint(0, 255, (40, 40, 3), dtype=np.uint8)
        face_feat = extractor.extract_face_features(dummy_face)
        self.assertIsNotNone(face_feat)
        self.assertAlmostEqual(np.linalg.norm(face_feat), 1.0, places=4)

        # Similarity with itself must be ~1.0
        sim = extractor.compute_similarity(body_feat, body_feat)
        self.assertAlmostEqual(sim, 1.0, places=3)

    def test_iou_computation(self):
        box1 = [10, 10, 50, 50]
        box2 = [10, 10, 50, 50]
        self.assertAlmostEqual(compute_iou(box1, box2), 1.0)

        box3 = [100, 100, 150, 150]
        self.assertAlmostEqual(compute_iou(box1, box3), 0.0)

    def test_detector_initialization(self):
        detector = PersonFaceDetector("yolov8n.pt")
        self.assertIsNotNone(detector.yolo)
        self.assertIsNotNone(detector.face_cascade)


if __name__ == "__main__":
    unittest.main()
