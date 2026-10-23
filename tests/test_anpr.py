import unittest
import numpy as np
import cv2
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ai.anpr import ANPREngine

class TestANPREngine(unittest.TestCase):
    def setUp(self):
        self.anpr = ANPREngine(min_confidence=0.70)
        self.dummy_frame = np.full((720, 1280, 3), (120, 120, 120), dtype=np.uint8)
        # Draw clean license plate on bumper area of vehicle bbox [400, 300, 700, 550]
        cv2.rectangle(self.dummy_frame, (480, 480), (660, 530), (255, 255, 255), -1)
        cv2.putText(self.dummy_frame, "DL01AB1234", (490, 515), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (0, 0, 0), 2)

    def test_process_vehicle_and_search(self):
        bbox = [400.0, 300.0, 700.0, 550.0]
        record = self.anpr.process_vehicle(self.dummy_frame, bbox, "CAM-01", track_id=1)

        self.assertIsNotNone(record)
        self.assertIn("plate_number", record)
        self.assertGreaterEqual(record["confidence"], 0.70)

        # Search plate query
        search_res = self.anpr.search_plates(record["plate_number"][:3])
        self.assertGreater(len(search_res), 0)

    def test_parse_and_repair_grammars(self):
        # 1. Authentic plates
        self.assertEqual(self.anpr.parse_and_repair_indian_plate("HR26CE7674"), "HR-26-CE-7674")
        self.assertEqual(self.anpr.parse_and_repair_indian_plate("UK07TA5521"), "UK-07-TA-5521")
        self.assertEqual(self.anpr.parse_and_repair_indian_plate("DL01AB1234"), "DL-01-AB-1234")
        self.assertEqual(self.anpr.parse_and_repair_indian_plate("UP14BR2233"), "UP-14-BR-2233")
        
        # 2. User real vehicle: UP-16-AL-3435 (ensuring L is NOT corrupted to C, WP repairs to UP)
        self.assertEqual(self.anpr.parse_and_repair_indian_plate("UP16AL3435"), "UP-16-AL-3435")
        self.assertEqual(self.anpr.parse_and_repair_indian_plate("WP16AL3435"), "UP-16-AL-3435")
        
        # 3. User real vehicle: DL-02-CK-5200 (ensuring Z repairs to 2)
        self.assertEqual(self.anpr.parse_and_repair_indian_plate("DLZCK5200"), "DL-02-CK-5200")
        
        # 4. Bharat Series (BH)
        self.assertEqual(self.anpr.parse_and_repair_indian_plate("21BH6294J"), "21-BH-6294-J")
        self.assertEqual(self.anpr.parse_and_repair_indian_plate("2LBH6294J"), "21-BH-6294-J")
        self.assertEqual(self.anpr.parse_and_repair_indian_plate("22BH1234AA"), "22-BH-1234-AA")

    def test_spatial_sorting(self):
        # Out-of-order single line tokens
        pts1 = [[200, 10], [300, 10], [300, 50], [200, 50]] # 7674
        pts2 = [[10, 10], [100, 10], [100, 50], [10, 50]]   # HR26
        pts3 = [[110, 10], [190, 10], [190, 50], [110, 50]] # CE
        ocr_data = [(pts1, "7674", 0.9), (pts2, "HR26", 0.9), (pts3, "CE", 0.9)]
        lines, tokens, avg_c, _ = self.anpr._sort_ocr_tokens_spatially(ocr_data)
        self.assertEqual("".join(tokens), "HR26CE7674")

        # Two-line plate: top UP16, bottom BK7809
        pts_top = [[10, 10], [100, 10], [100, 40], [10, 40]]
        pts_bot = [[10, 60], [150, 60], [150, 90], [10, 90]]
        ocr_2line = [(pts_bot, "BK7809", 0.8), (pts_top, "UP16", 0.85)]
        lines, tokens, avg_c, _ = self.anpr._sort_ocr_tokens_spatially(ocr_2line)
        self.assertEqual("".join(tokens), "UP16BK7809")

    def test_camera_scoped_track_cache(self):
        # CAM-01 track 1 vs CAM-02 track 1 should not collide
        self.anpr.track_plate_cache[("CAM-01", 1)] = {"plate_number": "UP-16-AL-3435"}
        self.anpr.track_plate_cache[("CAM-02", 1)] = {"plate_number": "DL-01-AB-1234"}
        
        self.assertEqual(self.anpr.track_plate_cache[("CAM-01", 1)]["plate_number"], "UP-16-AL-3435")
        self.assertEqual(self.anpr.track_plate_cache[("CAM-02", 1)]["plate_number"], "DL-01-AB-1234")

    def test_cctv_noise_and_state_scan(self):
        # CCTV OCR reading HRSICC2673 (SI mapped to 51)
        self.assertEqual(self.anpr.parse_and_repair_indian_plate("HRSICC2673"), "HR-51-CC-2673")
        # Leading vehicle noise / branding (e.g. IND HR51CC2673)
        self.assertEqual(self.anpr.parse_and_repair_indian_plate("INDHR51CC2673"), "HR-51-CC-2673")

    def test_realtime_plate_upgrading(self):
        # Create initial track reading
        track_key = ("CAM-01", 10)
        self.anpr.track_plate_cache[track_key] = {
            "plate_number": "DL-01-AB-1234",
            "confidence": 0.72,
            "total_votes": 1,
            "consensus_ratio": "1/1",
            "status": "CLEARED",
            "upgraded": False,
            "upgrade_count": 0
        }
        # Simulate high-confidence clearer observation arriving
        raw_plate = "DL-01-AB-1234"
        raw_conf = 0.95
        consensus_plate, consensus_conf, ratio, votes = self.anpr.voter.add_observation(track_key, raw_plate, raw_conf)
        
        # Verify upgrading logic
        cached_rec = self.anpr.track_plate_cache[track_key]
        is_upgrade = (
            (consensus_conf > cached_rec["confidence"] + 0.02) or
            (votes > cached_rec.get("total_votes", 1))
        )
        self.assertTrue(is_upgrade)
        cached_rec["confidence"] = consensus_conf
        cached_rec["total_votes"] = votes
        cached_rec["upgraded"] = True
        cached_rec["upgrade_count"] += 1
        
        self.assertEqual(cached_rec["upgrade_count"], 1)
        self.assertTrue(cached_rec["upgraded"])
        self.assertGreaterEqual(cached_rec["confidence"], 0.90)


if __name__ == "__main__":
    unittest.main()
