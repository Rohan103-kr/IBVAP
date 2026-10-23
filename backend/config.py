import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
SNAPSHOT_DIR = os.path.join(DATA_DIR, "snapshots")
DEMO_DIR = os.path.join(BASE_DIR, "demo")

# Default Camera Configurations
# Users can point to video files, webcam index (0), or RTSP streams (rtsp://...)
DEFAULT_CAMERAS = [
    {
        "id": "cam_1",
        "name": "Main Entrance (CAM-01)",
        "source": os.path.join(DEMO_DIR, "cam1_gate.mp4"),
        "location": "North Gate Access",
        "enabled": True
    },
    {
        "id": "cam_2",
        "name": "Corridor Alpha (CAM-02)",
        "source": os.path.join(DEMO_DIR, "cam2_corridor.mp4"),
        "location": "West Wing Corridor",
        "enabled": True
    },
    {
        "id": "cam_3",
        "name": "Courtyard & Hallway (CAM-03)",
        "source": os.path.join(DEMO_DIR, "cam3_hallway.mp4"),
        "location": "Central Plaza",
        "enabled": True
    }
]

# AI Detection & Tracking Parameters
YOLO_MODEL_PATH = os.path.join(BASE_DIR, "yolov8n.pt")
DETECTION_CONF_THRESHOLD = 0.40
REID_SIMILARITY_THRESHOLD = 0.65
FACE_MATCH_THRESHOLD = 0.68
INACTIVITY_TIMEOUT_SECONDS = 3.5  # Seconds before person is marked EXITED
STREAM_FPS = 15
JPEG_QUALITY = 80
