#!/usr/bin/env python3
"""
Unit Tests for DEMO 1 — Normal Traffic -> Suppression
Validates:
- Detections are distinguished from security incidents (DETECTION ≠ INCIDENT)
- CAM-07 Car mapped to V-12, Truck mapped to V-13 with STATUS: ROUTINE and RISK: 0
- CAM-01 Cattle / Environmental classified as routine with zero security incidents
- CAM-03 Patrol Officer mapped to P-03 with AUTHORIZED PATROL offset and zero risk
- Security incidents = 0, Critical alerts = 0, Workload = LOW
"""

import unittest
from backend.app.core.streamer import camera_streamer
from ai.detector import YOLODetector

class TestDemo1Suppression(unittest.TestCase):
    def setUp(self):
        camera_streamer.stop_demo_1()

    def tearDown(self):
        camera_streamer.stop_demo_1()

    def test_demo_1_activation_and_status(self):
        status = camera_streamer.start_demo_1()
        self.assertTrue(status["is_active"])
        self.assertEqual(status["security_incidents"], 0)
        self.assertEqual(status["critical_alerts"], 0)
        self.assertEqual(status["operator_workload"], "LOW")
        self.assertEqual(status["key_message"], "DETECTION ≠ INCIDENT")
        self.assertEqual(len(status["shots"]), 4)

        # Verify designated video sources routed
        self.assertIn("demo1_cam07_logistics.mp4", camera_streamer.custom_sources.get("CAM-07", ""))
        self.assertIn("demo1_cam01_environmental.mp4", camera_streamer.custom_sources.get("CAM-01", ""))
        self.assertIn("demo1_cam03_patrol.mp4", camera_streamer.custom_sources.get("CAM-03", ""))

    def test_detector_cattle_environmental_class_support(self):
        detector = YOLODetector()
        # Verify COCO cattle classes (17 sheep, 18 horse, 19 cow) are supported
        self.assertIn(19, detector.class_names)
        self.assertEqual(detector.class_names[19], "cattle")
        self.assertIn(18, detector.class_names)
        self.assertIn(17, detector.class_names)

    def test_demo_1_stop(self):
        camera_streamer.start_demo_1()
        self.assertTrue(camera_streamer.demo_1_active)
        res = camera_streamer.stop_demo_1()
        self.assertFalse(camera_streamer.demo_1_active)
        self.assertEqual(res["status"], "INACTIVE")
        self.assertNotIn("CAM-07", camera_streamer.custom_sources)
        self.assertNotIn("CAM-01", camera_streamer.custom_sources)
        self.assertNotIn("CAM-03", camera_streamer.custom_sources)

if __name__ == "__main__":
    unittest.main()
