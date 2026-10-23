import cv2
import time
import json
import logging
from typing import Dict, Any, Optional
from ai.stream_manager import StreamManager
from ai.detector import YOLODetector
from ai.tracker import ByteTracker
from ai.zones import ZoneEngine
from ai.context import ContextEngine
from backend.app.core.feature_extractor import FeatureExtractor
from backend.app.core.risk_engine import RiskEngine
from backend.app.core.event_engine import EventEngine
from backend.app.core.incident_manager import IncidentManager
from backend.app.core.multi_camera_correlator import MultiCameraCorrelator
from ai.anpr import ANPREngine
from ai.camera_health import CameraHealthMonitor
from ai.face_detector import FaceDetector
from ai.face_recognition_system import FaceRecognitionSystem
from ai.utils import draw_annotations

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FinalPipeline")

class FinalPipeline:
    """
    Final IBVAP Pipeline:
    Stream Ingestion -> Health Monitoring -> YOLO -> ByteTrack -> Face Detection -> FRS ->
    ANPR -> Zone -> Context -> Risk -> Event Engine -> Multi-Camera Correlator -> Annotations
    """
    def __init__(self, camera_id: str = "CAM-01", stream_url: str = "demo/videos/sample1.mp4", target_fps: int = 15):
        self.camera_id = camera_id
        self.stream_manager = StreamManager(camera_id, stream_url, target_fps)
        self.health_monitor = CameraHealthMonitor(camera_id)
        self.detector = YOLODetector(model_name="yolov8n.pt", conf_thresh=0.35)
        self.tracker = ByteTracker(max_disappeared=30, iou_threshold=0.3)
        self.zone_engine = ZoneEngine(config_path="configs/zones.json")
        self.context_engine = ContextEngine()
        self.feature_extractor = FeatureExtractor()
        self.risk_engine = RiskEngine()
        self.event_engine = EventEngine(cooldown_sec=20.0)
        self.incident_manager = IncidentManager()
        self.multi_cam_correlator = MultiCameraCorrelator()
        self.anpr_engine = ANPREngine()
        # Phase 3 additions: Face Detection & FRS
        self.face_detector = FaceDetector(scale_factor=1.1, min_neighbors=4, min_face_size=20)
        self.frs = FaceRecognitionSystem()
        # Seed demo identities so FRS is non-empty on first run
        if not self.frs.is_trained:
            logger.info("No FRS model found — seeding demo identities...")
            self.frs.seed_demo_identities()
        self.is_running = False

    def run(self, max_frames: Optional[int] = None, display: bool = False, output_video: Optional[str] = None):
        logger.info(f"Starting Day 5 Differentiation & Hardened Pipeline for camera {self.camera_id}...")
        self.is_running = True

        writer = None
        frame_idx = 0
        start_time = time.time()

        for frame, frame_id, status in self.stream_manager.read_frames(loop=True):
            if not self.is_running:
                break

            frame_idx += 1

            # 1. Camera Health & Anomaly Check
            health_report = self.health_monitor.inspect_frame(frame)

            # 2. Context Engine
            day_night = self.context_engine.get_day_night_context(frame)

            # 3. Detection & Tracking
            detections = self.detector.detect(frame, camera_id=self.camera_id, frame_id=frame_id)
            tracked_objects = self.tracker.update(detections, camera_id=self.camera_id)

            # 3b. Face Detection & FRS on person bounding boxes
            person_bboxes = [t["bbox"] for t in tracked_objects if t.get("object_type") == "person"]
            face_detections = self.face_detector.detect_faces_in_frame(frame, person_bboxes)
            frs_results = []
            if face_detections:
                chips = [self.face_detector.extract_face_chip(frame, fd["bbox"]) for fd in face_detections]
                bboxes = [fd["bbox"] for fd in face_detections]
                frs_results = self.frs.recognize_batch(chips, bboxes)
                person_tracks = [t for t in tracked_objects if t.get("object_type") == "person"]
                for p_track in person_tracks:
                    px1, py1, px2, py2 = p_track.get("bbox", [0, 0, 0, 0])
                    matched_res = None
                    matched_fd = None
                    for fd, frs_res in zip(face_detections, frs_results):
                        fx1, fy1, fx2, fy2 = fd["bbox"]
                        fcx, fcy = (fx1 + fx2) / 2.0, (fy1 + fy2) / 2.0
                        if (px1 - 15) <= fcx <= (px2 + 15) and (py1 - 15) <= fcy <= (py2 + 15):
                            matched_fd = fd
                            matched_res = frs_res
                            break

                    if matched_fd and matched_res and matched_fd.get("quality_passed", False) and matched_res.get("is_known", False):
                        p_track["face_bbox"] = matched_fd["bbox"]
                        name = matched_res.get("identity", "OFFICER")
                        is_friendly = ("OFFICER" in name.upper() or "CAPTAIN" in name.upper() or "PATROL" in name.upper() or "AUTHORIZED" in name.upper() or "SUSPECT" not in name.upper())
                        p_track["identity_status"] = "AUTHORIZED" if is_friendly else "UNAUTHORIZED"
                        p_track["identity_name"] = name
                    else:
                        p_track["identity_status"] = "UNRECOGNIZED"
                        p_track["identity_name"] = None
                        if matched_fd:
                            p_track["face_bbox"] = matched_fd["bbox"]

            # 4. Process Tracked Objects
            for track in tracked_objects:
                trajectory = track["trajectory"]
                curr_centroid = track["centroid"]

                # ANPR OCR for Vehicle detections
                if track["object_type"] in ["vehicle", "car", "truck", "bus"]:
                    anpr_rec = self.anpr_engine.process_vehicle(
                        frame, track["bbox"], self.camera_id, track["track_id"], vehicle_type=track["object_type"]
                    )
                    if anpr_rec:
                        track["license_plate"] = anpr_rec["plate_number"]
                        track["is_watchlist_vehicle"] = anpr_rec.get("is_watchlist", False)
                        track["watchlist_reason"] = anpr_rec.get("watchlist_reason")
                        track["plate_confidence"] = anpr_rec.get("confidence", 0.9)
                        track["consensus_ratio"] = anpr_rec.get("consensus_ratio", "1/1")

                # Spatial Zone Containment & Fence Crossing
                matched_zones = self.zone_engine.check_point_in_zones(curr_centroid, self.camera_id)
                track["current_zones"] = [z["name"] for z in matched_zones]

                crossed_fences = []
                if len(trajectory) >= 2:
                    p_prev = (trajectory[-2][0], trajectory[-2][1])
                    p_curr = (curr_centroid[0], curr_centroid[1])
                    crossed_fences = self.zone_engine.check_fence_crossing(p_prev, p_curr, self.camera_id)

                track["heading_deg"] = self.context_engine.calculate_heading(trajectory)

                # Feature Extraction & Risk Scoring
                features = self.feature_extractor.extract_features(track, matched_zones, crossed_fences, day_night)
                risk_res = self.risk_engine.compute_risk(features, object_type=track["object_type"])
                track["risk_score"] = risk_res["score"]
                track["severity"] = risk_res["severity"]

                # Cross-Camera Movement Correlation & Security Event Generation
                if risk_res["severity"] in ["HIGH", "CRITICAL"] or features["fence_crossed"]:
                    trigger = {
                        "event_type": "FENCE_CROSSING" if features["fence_crossed"] else "ZONE_ENTRY",
                        "severity": risk_res["severity"],
                        "risk_score": risk_res["score"],
                        "reasons": risk_res["reasons"],
                        "zone_id": matched_zones[0]["zone_id"] if matched_zones else None,
                        "fence_id": crossed_fences[0]["fence_id"] if crossed_fences else None
                    }

                    sec_evt = self.event_engine.process_trigger(trigger, track, frame, self.camera_id)
                    snapshot_file = sec_evt["snapshot"] if sec_evt else None

                    self.incident_manager.update_incident(
                        camera_id=self.camera_id,
                        track=track,
                        risk_result=risk_res,
                        event_type=trigger["event_type"],
                        snapshot_filename=snapshot_file
                    )

                    # Register Cross-Camera Correlation Sighting
                    self.multi_cam_correlator.register_sighting(self.camera_id, track, risk_res["score"])

            # 5. Render Visual HUD Annotations
            annotated = self.zone_engine.render_zones(frame, self.camera_id)  # frame already has face boxes
            fps = self.stream_manager.actual_fps if self.stream_manager.actual_fps > 0 else 15.0
            annotated = draw_annotations(annotated, tracked_objects, fps, self.camera_id, status)

            if output_video:
                if writer is None:
                    h, w, _ = annotated.shape
                    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                    writer = cv2.VideoWriter(output_video, fourcc, int(fps), (w, h))
                writer.write(annotated)

            if display:
                cv2.imshow(f"IBVAP Final - {self.camera_id}", annotated)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break

            if max_frames and frame_idx >= max_frames:
                logger.info(f"Reached max frame limit ({max_frames}). Stopping pipeline.")
                break

        self.stream_manager.release()
        if writer:
            writer.release()
        if display:
            cv2.destroyAllWindows()

        elapsed = time.time() - start_time
        logger.info(f"Final Pipeline completed. Processed {frame_idx} frames in {elapsed:.2f}s ({frame_idx / max(elapsed, 0.001):.1f} FPS).")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="IBVAP Final Pipeline Runner")
    parser.add_argument("--camera", type=str, default="CAM-01", help="Camera ID")
    parser.add_argument("--source", type=str, default="demo/videos/sample1.mp4", help="Video source")
    parser.add_argument("--frames", type=int, default=100, help="Maximum frames")
    parser.add_argument("--output", type=str, default="demo/output_final.mp4", help="Output video path")
    args = parser.parse_args()

    pipeline = FinalPipeline(camera_id=args.camera, stream_url=args.source)
    pipeline.run(max_frames=args.frames, output_video=args.output)
