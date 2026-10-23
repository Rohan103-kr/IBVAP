import unittest
import os
import sys
import json
import time
import shutil
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.app.core.rule_engine import RuleEngine
from backend.app.core.multi_camera_correlator import MultiCameraCorrelator
from backend.app.core.incident_manager import IncidentManager
from backend.app.core.event_engine import EventEngine, SNAPSHOT_DIR
from backend.app.core.c2_spooler import C2CommandController
from demo.benchmark_metrics import run_system_benchmark

class TestP0P1DefenseSuiteSIH26187(unittest.TestCase):
    def setUp(self):
        self.rule_engine = RuleEngine()
        self.correlator = MultiCameraCorrelator()
        self.event_engine = EventEngine(cooldown_sec=1.0)
        self.c2 = C2CommandController()

    def test_night_movement_breach_rule(self):
        """P0-3: Explicit Night Movement Rule triggering NIGHT_MOVEMENT_BREACH."""
        night_track = {
            "track_id": 99,
            "object_type": "person",
            "bbox": [200.0, 300.0, 250.0, 420.0],
            "speed": 6.5,
            "loiter_time": 4.0,
            "history": [(200, 300), (205, 310)]
        }
        zones = [{"type": "BUFFER", "name": "Buffer-Sector-Alpha"}]
        day_night_context = {"is_night": True, "brightness_mean": 28.0}
        
        triggers = self.rule_engine.evaluate(
            track=night_track,
            zones=zones,
            crossed_fences=[],
            day_night_context=day_night_context
        )
        
        event_types = [t["event_type"] for t in triggers]
        self.assertIn("NIGHT_MOVEMENT_BREACH", event_types)
        night_trigger = next(t for t in triggers if t["event_type"] == "NIGHT_MOVEMENT_BREACH")
        self.assertEqual(night_trigger["severity"], "CRITICAL")
        self.assertGreaterEqual(night_trigger["risk_score"], 85)

    def test_unusual_vehicle_stop_and_probing(self):
        """P0-4: Expanded Suspicious Activity (Unusual Vehicle Stop & Repeated Probing)."""
        # Test 1: Stationary vehicle in security perimeter
        stopped_vehicle = {
            "track_id": 105,
            "object_type": "vehicle",
            "vehicle_type": "truck",
            "bbox": [300.0, 400.0, 480.0, 560.0],
            "speed": 0.2,            # Stationary
            "loiter_time": 25.0,      # Stopped for > 20s
            "stationary_time": 25.0,
            "history": [(300, 400)] * 10
        }
        zones = [{"type": "RESTRICTED", "name": "Zero-Line-Boundary"}]
        triggers = self.rule_engine.evaluate(
            track=stopped_vehicle,
            zones=zones,
            crossed_fences=[],
            day_night_context={"is_night": False, "brightness_mean": 120.0}
        )
        event_types = [t["event_type"] for t in triggers]
        self.assertIn("UNUSUAL_VEHICLE_STOP", event_types)

        # Test 2: Repeated perimeter probing
        probing_person = {
            "track_id": 108,
            "object_type": "person",
            "bbox": [150.0, 200.0, 190.0, 320.0],
            "speed": 3.0,
            "loiter_time": 8.0,
            "fence_approach_count": 3  # Multiple probing approaches
        }
        probing_triggers = self.rule_engine.evaluate(
            track=probing_person,
            zones=[{"type": "PERIMETER", "name": "Fence-Buffer"}],
            crossed_fences=[],
            day_night_context={"is_night": False, "brightness_mean": 110.0}
        )
        probing_types = [t["event_type"] for t in probing_triggers]
        self.assertIn("REPEATED_PERIMETER_PROBING", probing_types)

    def test_multi_camera_spatial_fence(self):
        """P0-5: Multi-Camera Spatial Fence (CAM-01 Approach -> CAM-02 Fence -> CAM-03 Zero-Line)."""
        test_correlator = MultiCameraCorrelator(time_window_sec=60.0)
        test_correlator.active_correlations = []
        test_track = {"track_id": 7777, "object_type": "person"}
        
        # Step 1: Target sighted on CAM-01 (Approach)
        c1 = test_correlator.register_sighting("CAM-01", test_track, 40)
        self.assertEqual(c1["spatial_fence_status"], "MONITORED_APPROACH")
        
        # Step 2: Target crosses into CAM-02 (Fence Tripwire)
        c2 = test_correlator.register_sighting("CAM-02", test_track, 75)
        self.assertEqual(c2["spatial_fence_status"], "PERIMETER_PROBING")
        self.assertEqual(c2["spatial_alert_level"], "HIGH")
        
        # Step 3: Target breaches into CAM-03 (Zero-Line Core)
        c3 = test_correlator.register_sighting("CAM-03", test_track, 95)
        self.assertEqual(c3["spatial_fence_status"], "CONFIRMED_SPATIAL_INTRUSION")
        self.assertEqual(c3["spatial_alert_level"], "CRITICAL")
        self.assertEqual(c3["spatial_breach_depth"], 3)
        self.assertIn("QRF", c3["tactical_assessment"])

    def test_c2_gateway_offline_spooling_and_flush(self):
        """P0-6 & P1-7: C2 REST Gateway, Offline Spooling & Uplink Recovery Burst Flush."""
        test_c2 = C2CommandController()
        test_c2.set_link_status(True)

        # 1. Dispatch while online -> DELIVERED
        online_pkt = test_c2.dispatch(
            incident_id="INC-ONLINE-01",
            target_unit="QRF_SECTOR_BRAVO",
            action_code="DEPLOY_TACTICAL_TEAM",
            priority="CRITICAL"
        )
        self.assertEqual(online_pkt["status"], "DELIVERED")

        # 2. Simulate communications severance -> Link goes offline
        status_cut = test_c2.set_link_status(False)
        self.assertFalse(status_cut["is_online"])

        # 3. Dispatch while offline -> SPOOLED_OFFLINE
        spooled_pkt1 = test_c2.dispatch(
            incident_id="INC-OFFLINE-01",
            target_unit="QRF_SECTOR_ALPHA",
            action_code="SEAL_SECTOR_GATES",
            priority="CRITICAL"
        )
        spooled_pkt2 = test_c2.dispatch(
            incident_id="INC-OFFLINE-02",
            target_unit="TOWER_SENTRY_DELTA",
            action_code="ILLUMINATE_SPOTLIGHTS",
            priority="HIGH"
        )
        self.assertEqual(spooled_pkt1["status"], "SPOOLED_OFFLINE")
        self.assertEqual(spooled_pkt2["status"], "SPOOLED_OFFLINE")
        
        status_now = test_c2.get_status()
        self.assertGreaterEqual(status_now["spooled_offline_packets"], 2)

        # 4. Restore link -> Auto burst-flushes spooled queue
        recovery_status = test_c2.set_link_status(True)
        self.assertTrue(recovery_status["is_online"])
        self.assertGreaterEqual(recovery_status["flushed_packets"], 2)
        self.assertEqual(recovery_status["remaining_spooled"], 0)

    def test_cryptographic_hash_chain_tamper_detection(self):
        """P1-8: Cryptographic Hash-Chain Verification and Tamper Detection."""
        test_ee = EventEngine(cooldown_sec=0.0)
        test_ee.reset_chain()

        dummy_frame = np.ones((720, 1280, 3), dtype=np.uint8) * 128
        track1 = {"track_id": 501, "object_type": "person", "bbox": [100, 100, 200, 250]}
        track2 = {"track_id": 502, "object_type": "person", "bbox": [150, 150, 250, 300]}

        created_files = []
        try:
            evt1 = test_ee.process_trigger({"event_type": "ZONE_ENTRY", "severity": "HIGH", "risk_score": 80, "reasons": ["test"]}, track1, dummy_frame, "CAM-TEST")
            evt2 = test_ee.process_trigger({"event_type": "FENCE_CROSSING", "severity": "CRITICAL", "risk_score": 95, "reasons": ["test"]}, track2, dummy_frame, "CAM-TEST")

            self.assertIsNotNone(evt1)
            self.assertIsNotNone(evt2)
            created_files.extend([
                os.path.join(SNAPSHOT_DIR, evt1["snapshot"]),
                os.path.join(SNAPSHOT_DIR, f"{evt1['event_id']}_audit.json"),
                os.path.join(SNAPSHOT_DIR, evt2["snapshot"]),
                os.path.join(SNAPSHOT_DIR, f"{evt2['event_id']}_audit.json"),
            ])

            # Verify pristine chain
            verify_res = test_ee.verify_hash_chain()
            self.assertTrue(verify_res["is_valid"], f"Verification failed: {verify_res}")
            self.assertGreaterEqual(verify_res["total_verified"], 2)
            self.assertIsNone(verify_res["tampered_event_id"])

            # Tamper test: Modify bytes of evt1's snapshot image on disk
            snap_path = os.path.join(SNAPSHOT_DIR, evt1["snapshot"])
            with open(snap_path, "ab") as f:
                f.write(b"CORRUPTED_TAMPER_BYTES")

            # Re-verify -> Must immediately catch tamper!
            tamper_res = test_ee.verify_hash_chain()
            self.assertFalse(tamper_res["is_valid"])
            self.assertEqual(tamper_res["tampered_event_id"], evt1["event_id"])
            self.assertIn("modified", tamper_res["message"].lower())
        finally:
            for p in created_files:
                if os.path.exists(p):
                    try:
                        os.remove(p)
                    except Exception:
                        pass
            test_ee.reset_chain()

    def test_multi_task_and_false_alert_benchmark_metrics(self):
        """P1-9 & P1-10: Multi-task Accuracy Benchmark & False Alert Reduction Funnel."""
        metrics = run_system_benchmark()
        self.assertIn("multi_task_accuracy", metrics)
        self.assertIn("false_alert_reduction_funnel", metrics)

        # Multi-task accuracy validation
        mt = metrics["multi_task_accuracy"]
        self.assertIn("person_detection_tracking", mt)
        self.assertIn("vehicle_classification", mt)
        self.assertIn("anpr_recognition", mt)
        self.assertIn("frs_biometrics", mt)
        self.assertIn("perimeter_fence_tripwire", mt)
        self.assertIn("night_movement_discrimination", mt)
        self.assertIn("suspicious_behavioral_analytics", mt)

        # False-alert funnel validation
        funnel = metrics["false_alert_reduction_funnel"]
        self.assertEqual(funnel["baseline_raw_detections"], 100)
        self.assertEqual(funnel["stage_1_zone_context_filtered"], 35)
        self.assertEqual(funnel["stage_2_actionable_alerts"], 8)
        self.assertGreaterEqual(funnel["operator_burden_reduction_pct"], 90.0)

if __name__ == "__main__":
    unittest.main()
