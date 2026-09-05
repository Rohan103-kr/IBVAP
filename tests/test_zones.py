import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ai.zones import ZoneEngine, line_intersects

class TestZones(unittest.TestCase):
    def setUp(self):
        self.ze = ZoneEngine(config_path="configs/zones.json")

    def test_line_intersects(self):
        # Intersecting lines
        p1, p2 = (0.0, 5.0), (10.0, 5.0)
        p3, p4 = (5.0, 0.0), (5.0, 10.0)
        self.assertTrue(line_intersects(p1, p2, p3, p4))

        # Non-intersecting parallel lines
        p5, p6 = (0.0, 2.0), (10.0, 2.0)
        self.assertFalse(line_intersects(p1, p2, p5, p6))

    def test_point_in_polygon_containment(self):
        # Test centroid inside zone polygon defined in configs/zones.json
        inside_point = (200.0, 400.0)
        matched = self.ze.check_point_in_zones(inside_point, "CAM-01")
        self.assertGreater(len(matched), 0)
        self.assertTrue(len(matched) > 0)

        outside_point = (10.0, 10.0)
        matched_out = self.ze.check_point_in_zones(outside_point, "CAM-01")
        self.assertEqual(len(matched_out), 0)

if __name__ == "__main__":
    unittest.main()
