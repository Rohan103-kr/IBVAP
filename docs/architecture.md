# IBVAP Technical Architecture & Day 1 System Design

## Overview
IBVAP (Intelligent Border Video Analytics Platform) is a modular decision-support system designed to convert continuous CCTV video feeds into prioritized, explainable security events for border surveillance operators.

## System Flow Architecture
```text
[ CCTV Cameras / RTSP / Local MP4 ]
              │
              ▼
    [ StreamManager ] (Frame extraction, FPS control, Health State logging)
              │
              ▼
    [ YOLODetector ] (Person & Vehicle bounding box detection)
              │
              ▼
    [ ByteTracker ] (Persistent Track ID assignment, Trajectories, Velocity)
              │
              ▼
     [ FastAPI Backend ] (REST APIs, Health Monitoring, Schema Contracts)
```

## Data Schema Contracts

### Detection Event
```json
{
  "camera_id": "CAM-01",
  "timestamp": "2026-08-29T19:07:00Z",
  "frame_id": 1042,
  "object_type": "person",
  "confidence": 0.92,
  "bbox": [120.0, 340.0, 210.0, 580.0]
}
```

### Tracked Object
```json
{
  "camera_id": "CAM-01",
  "track_id": 27,
  "object_type": "person",
  "confidence": 0.92,
  "bbox": [120.0, 340.0, 210.0, 580.0],
  "centroid": [165.0, 460.0],
  "trajectory": [[150.0, 450.0], [158.0, 455.0], [165.0, 460.0]],
  "velocity": [1.2, 0.8],
  "first_seen": "2026-08-29T19:06:45Z",
  "last_seen": "2026-08-29T19:07:00Z",
  "duration_sec": 15.0
}
```
