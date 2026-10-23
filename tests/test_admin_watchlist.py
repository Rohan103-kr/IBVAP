import unittest
import os
import io
import json
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.rule_engine import RuleEngine
from backend.app.core.streamer import CameraStreamer

class TestAdminWatchlist(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.rule_engine = RuleEngine()
        self.test_person_id = "TEST-WANTED-999"
        self.test_plate = "TEST-99-WL-9999"

    def tearDown(self):
        try:
            self.client.delete(f"/api/v1/admin/watchlist/persons/{self.test_person_id}")
        except Exception:
            pass
        try:
            self.client.delete(f"/api/v1/admin/watchlist/vehicles/{self.test_plate}")
        except Exception:
            pass

    def test_get_watchlist_persons_structure(self):
        resp = self.client.get("/api/v1/admin/watchlist/persons")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("persons", data)
        self.assertIn("count", data)
        self.assertGreaterEqual(len(data["persons"]), 1)

        sample = data["persons"][0]
        self.assertIn("id", sample)
        self.assertIn("full_name", sample)
        self.assertIn("category", sample)
        self.assertIn("threat_level", sample)
        self.assertIn("directives", sample)
        self.assertIn("photos", sample)

    def test_get_watchlist_vehicles_structure(self):
        resp = self.client.get("/api/v1/admin/watchlist/vehicles")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("vehicles", data)
        self.assertIn("count", data)
        self.assertGreaterEqual(len(data["vehicles"]), 1)

        sample = data["vehicles"][0]
        self.assertIn("plate_number", sample)
        self.assertIn("vehicle_type", sample)
        self.assertIn("category", sample)
        self.assertIn("threat_level", sample)
        self.assertIn("directives", sample)
        self.assertIn("photos", sample)

    def test_enroll_and_delete_watchlist_person(self):
        # 1. Enroll test wanted person
        dummy_img = io.BytesIO(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\xff\xd9")
        form_data = {
            "id": self.test_person_id,
            "full_name": "Test Fugitive Target",
            "alias": "Ghost",
            "category": "MOST_WANTED",
            "threat_level": "EXTREME",
            "fir_number": "FIR-TEST-999",
            "reward_inr": "₹1,00,000",
            "directives": "Detain immediately on optical match",
            "notes": "Automated unit test target"
        }
        files = [("photos", ("target.jpg", dummy_img, "image/jpeg"))]
        resp = self.client.post("/api/v1/admin/watchlist/persons", data=form_data, files=files)
        self.assertEqual(resp.status_code, 200)
        res_data = resp.json()
        self.assertEqual(res_data["status"], "SUCCESS")
        self.assertEqual(res_data["person"]["id"], self.test_person_id)

        # 2. Verify in GET list
        get_resp = self.client.get("/api/v1/admin/watchlist/persons")
        ids = [p["id"] for p in get_resp.json()["persons"]]
        self.assertIn(self.test_person_id, ids)

        # 3. Delete target
        del_resp = self.client.delete(f"/api/v1/admin/watchlist/persons/{self.test_person_id}")
        self.assertEqual(del_resp.status_code, 200)

        # 4. Verify gone
        get_resp2 = self.client.get("/api/v1/admin/watchlist/persons")
        ids2 = [p["id"] for p in get_resp2.json()["persons"]]
        self.assertNotIn(self.test_person_id, ids2)

    def test_enroll_and_delete_watchlist_vehicle(self):
        # 1. Enroll test hotlist vehicle
        dummy_img = io.BytesIO(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\xff\xd9")
        form_data = {
            "plate_number": self.test_plate,
            "vehicle_type": "SUV",
            "make_model": "Test Patrol SUV",
            "color": "Matte Black",
            "category": "STOLEN_VEHICLE",
            "threat_level": "EXTREME",
            "fir_number": "FIR-VEH-999",
            "reported_by": "Cyber Police",
            "directives": "Drop gate barricade immediately",
            "notes": "Automated unit test vehicle"
        }
        files = [("photos", ("vehicle.jpg", dummy_img, "image/jpeg"))]
        resp = self.client.post("/api/v1/admin/watchlist/vehicles", data=form_data, files=files)
        self.assertEqual(resp.status_code, 200)
        res_data = resp.json()
        self.assertEqual(res_data["status"], "SUCCESS")
        self.assertEqual(res_data["vehicle"]["plate_number"], self.test_plate)

        # 2. Verify in GET list
        get_resp = self.client.get("/api/v1/admin/watchlist/vehicles")
        plates = [v["plate_number"] for v in get_resp.json()["vehicles"]]
        self.assertIn(self.test_plate, plates)

        # 3. Delete vehicle
        del_resp = self.client.delete(f"/api/v1/admin/watchlist/vehicles/{self.test_plate}")
        self.assertEqual(del_resp.status_code, 200)

        # 4. Verify gone
        get_resp2 = self.client.get("/api/v1/admin/watchlist/vehicles")
        plates2 = [v["plate_number"] for v in get_resp2.json()["vehicles"]]
        self.assertNotIn(self.test_plate, plates2)

    def test_rule_engine_most_wanted_alarm(self):
        """Verify RuleEngine triggers MOST_WANTED_SIGHTING with camera information."""
        track = {
            "track_id": 101,
            "object_type": "person",
            "camera_id": "CAM-03",
            "camera_name": "East Gate Checkpoint",
            "is_most_wanted": True,
            "matched_suspect_name": "Tariq Mansoor",
            "watchlist_category": "MOST_WANTED",
            "trajectory": [(100, 100), (102, 102), (105, 105)]
        }
        triggers = self.rule_engine.evaluate(track, zones=[], crossed_fences=[], day_night_context="DAY")
        self.assertGreaterEqual(len(triggers), 1)

        wanted_trigger = next((t for t in triggers if t["event_type"] == "MOST_WANTED_SIGHTING"), None)
        self.assertIsNotNone(wanted_trigger)
        self.assertEqual(wanted_trigger["severity"], "CRITICAL")
        self.assertGreaterEqual(wanted_trigger["risk_score"], 98)
        self.assertEqual(wanted_trigger["camera_id"], "CAM-03")
        # Ensure reasons explicitly contain camera ID and target name
        combined_reason = " ".join(wanted_trigger["reasons"])
        self.assertIn("CAM-03", combined_reason)
        self.assertIn("Tariq Mansoor", combined_reason)
        self.assertIn("HIGH ALERT", combined_reason)

    def test_rule_engine_lost_vehicle_intercept_alarm(self):
        """Verify RuleEngine triggers HOTLIST_VEHICLE_INTERCEPT with camera information."""
        track = {
            "track_id": 202,
            "object_type": "car",
            "camera_id": "CAM-01",
            "camera_name": "Perimeter Gate North",
            "is_lost_stolen_vehicle": True,
            "license_plate": "DL-01-AB-1234",
            "vehicle_category": "STOLEN_VEHICLE",
            "vehicle_make_model": "Black Mahindra Scorpio",
            "trajectory": [(200, 200), (205, 205), (210, 210)]
        }
        triggers = self.rule_engine.evaluate(track, zones=[], crossed_fences=[], day_night_context="DAY")
        self.assertGreaterEqual(len(triggers), 1)

        intercept_trigger = next((t for t in triggers if t["event_type"] == "HOTLIST_VEHICLE_INTERCEPT"), None)
        self.assertIsNotNone(intercept_trigger)
        self.assertEqual(intercept_trigger["severity"], "CRITICAL")
        self.assertGreaterEqual(intercept_trigger["risk_score"], 98)
        self.assertEqual(intercept_trigger["camera_id"], "CAM-01")
        # Ensure reasons explicitly contain camera ID, license plate, and high alert
        combined_reason = " ".join(intercept_trigger["reasons"])
        self.assertIn("CAM-01", combined_reason)
        self.assertIn("DL-01-AB-1234", combined_reason)
        self.assertIn("HIGH ALERT", combined_reason)

if __name__ == "__main__":
    unittest.main()
