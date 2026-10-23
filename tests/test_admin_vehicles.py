import unittest
import os
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.rule_engine import RuleEngine

class TestAdminVehicles(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.test_plate = "TEST-99-ZZ-0001"

    def tearDown(self):
        # Cleanup test vehicle if left behind
        try:
            self.client.delete(f"/api/v1/vehicles/enrolled/{self.test_plate}")
        except Exception:
            pass

    def test_get_vehicles_enrolled_structure(self):
        resp = self.client.get("/api/v1/vehicles/enrolled")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue("vehicles" in data)
        self.assertTrue("count" in data)
        self.assertGreaterEqual(len(data["vehicles"]), 1)
        
        # Verify required schema fields
        sample = data["vehicles"][0]
        self.assertIn("plate_number", sample)
        self.assertIn("vehicle_type", sample)
        self.assertIn("owner_name", sample)
        self.assertIn("department", sample)
        self.assertIn("status", sample)
        self.assertIn("photos", sample)

    def test_enroll_and_delete_vehicle(self):
        # 1. Enroll test vehicle
        enroll_data = {
            "plate_number": self.test_plate,
            "vehicle_type": "TRUCK",
            "owner_name": "Test Convoy Driver",
            "department": "Sector 9 Test Logistics",
            "status": "AUTHORIZED",
            "notes": "Automated test vehicle for zone alert suppression"
        }
        resp = self.client.post("/api/v1/vehicles/enrolled", data=enroll_data)
        self.assertEqual(resp.status_code, 200)
        res_data = resp.json()
        self.assertEqual(res_data["status"], "SUCCESS")
        self.assertEqual(res_data["vehicle"]["plate_number"], self.test_plate)

        # 2. Verify it is returned in GET
        get_resp = self.client.get("/api/v1/vehicles/enrolled")
        plates = [v["plate_number"] for v in get_resp.json()["vehicles"]]
        self.assertIn(self.test_plate, plates)

        # 3. Delete test vehicle
        del_resp = self.client.delete(f"/api/v1/vehicles/enrolled/{self.test_plate}")
        self.assertEqual(del_resp.status_code, 200)

        # 4. Verify removal
        get_resp2 = self.client.get("/api/v1/vehicles/enrolled")
        plates2 = [v["plate_number"] for v in get_resp2.json()["vehicles"]]
        self.assertNotIn(self.test_plate, plates2)

    def test_vehicle_photo_path_traversal_blocked(self):
        resp = self.client.get("/api/v1/vehicles/enrolled/photo/..%2Fhack/file.jpg")
        self.assertIn(resp.status_code, [400, 404])

    def test_authorized_vehicle_suppresses_zone_alerts(self):
        rule_engine = RuleEngine()
        zones = [{"zone_id": "R1", "name": "Buffer Zone", "type": "RESTRICTED"}]
        fences = [{"fence_id": "F1", "name": "Primary Fence"}]
        
        # Track marked as AUTHORIZED (authorized convoy)
        track_auth = {
            "track_id": 999,
            "camera_id": "CAM-01",
            "object_type": "truck",
            "identity_status": "AUTHORIZED",
            "vehicle_clearance": "AUTHORIZED_CONVOY",
            "plate_number": "UK-07-TA-5521",
            "duration_sec": 45.0
        }
        alarms_auth = rule_engine.evaluate(track_auth, zones, fences, "DAY")
        # All alarms should be suppressed for authorized convoy
        self.assertEqual(len(alarms_auth), 0, "Authorized convoy must suppress zone intrusion alarms")

        # Track marked as UNAUTHORIZED / SUSPECT (watchlist match)
        track_unauth = {
            "track_id": 998,
            "camera_id": "CAM-01",
            "object_type": "truck",
            "identity_status": "UNAUTHORIZED",
            "is_watchlist_vehicle": True,
            "plate_number": "DL-01-AB-1234",
            "duration_sec": 45.0
        }
        alarms_unauth = rule_engine.evaluate(track_unauth, zones, fences, "DAY")
        # Watchlist match must trigger priority alarms
        self.assertGreater(len(alarms_unauth), 0, "Watchlist vehicle must trigger critical alarms")
        event_types = [a["event_type"] for a in alarms_unauth]
        self.assertIn("ANPR_WATCHLIST_MATCH", event_types)

if __name__ == "__main__":
    unittest.main()
