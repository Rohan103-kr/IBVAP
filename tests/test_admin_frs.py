import unittest
from fastapi.testclient import TestClient
from backend.app.main import app

class TestAdminFRS(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_admin_login_success(self):
        resp = self.client.post("/api/v1/admin/login", json={"username": "root", "password": "1234"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "SUCCESS")
        self.assertEqual(data["user"]["id"], "root")
        self.assertTrue("token" in data)

    def test_admin_login_invalid(self):
        resp = self.client.post("/api/v1/admin/login", json={"username": "root", "password": "wrongpassword"})
        self.assertEqual(resp.status_code, 401)

    def test_get_frs_identities_structure(self):
        resp = self.client.get("/api/v1/frs/identities")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue("identities" in data)
        self.assertTrue(len(data["identities"]) >= 1)
        first = data["identities"][0]
        self.assertTrue("person_id" in first)
        self.assertTrue("name" in first)
        self.assertTrue("status" in first)
        self.assertTrue("photos" in first)

    def test_photo_serving(self):
        resp = self.client.get("/api/v1/frs/photo/01_Rohan_Kumar_Vaishya/upload_000_1788523468.jpeg")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.headers["content-type"], "image/jpeg")

    def test_photo_path_traversal_blocked(self):
        resp = self.client.get("/api/v1/frs/photo/../hack/file.jpg")
        self.assertIn(resp.status_code, [400, 404])

if __name__ == "__main__":
    unittest.main()
