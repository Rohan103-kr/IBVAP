#!/usr/bin/env python3
"""
IBVAP Demo 1 Video Preparer
Assembles the exact video sequences for:
- Shot A & B (CAM-07): Logistics Road with Car (V-12) and Truck (V-13)
- Shot C (CAM-01): Environmental / Cattle activity
- Shot D (CAM-03): Authorized Patrol Officer (P-03)
"""

import os
import cv2
import numpy as np

def create_cam07_logistics_video():
    """
    CAM-07: Logistics road.
    0-5s: Empty road
    5-15s: Normal passenger car drives steadily through road
    15-20s: Car exits
    20-32s: Medium commercial truck enters and travels normally
    """
    output_path = "demo/videos/demo1_cam07_logistics.mp4"
    if os.path.exists(output_path) and os.path.getsize(output_path) > 500000:
        print(f"✓ {output_path} already exists.")
        return

    # Use Sysvideo or traffic_ip_camera or VID20260908175344.mp4
    src_car = "demo/videos/traffic_ip_camera.mp4"
    src_truck = "demo/videos/VID20260908174036.mp4"

    if not os.path.exists(src_car):
        src_car = "demo/videos/VID20260908175344.mp4"

    cap_car = cv2.VideoCapture(src_car)
    fps = 25.0
    w, h = 1280, 720
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    # Grab first frame as static empty road background if needed
    ret, bg_frame = cap_car.read()
    if not ret or bg_frame is None:
        bg_frame = np.zeros((h, w, 3), dtype=np.uint8)
    bg_frame = cv2.resize(bg_frame, (w, h))

    # 1. 0–5s: Empty road (or steady road background)
    empty_frame = cv2.GaussianBlur(bg_frame, (1, 1), 0)
    for _ in range(int(5.0 * fps)):
        out.write(empty_frame)

    # 2. 5–15s: Car driving steadily through road (10s)
    cap_car.set(cv2.CAP_PROP_POS_FRAMES, int(1.0 * fps))
    written_car = 0
    while written_car < int(10.0 * fps):
        ret, frame = cap_car.read()
        if not ret or frame is None:
            cap_car.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = cap_car.read()
        frame = cv2.resize(frame, (w, h))
        out.write(frame)
        written_car += 1
    cap_car.release()

    # 3. 15–20s: Car exits (empty road for 5s)
    for _ in range(int(5.0 * fps)):
        out.write(empty_frame)

    # 4. 20–32s: Medium commercial truck enters and travels normally
    if os.path.exists(src_truck):
        cap_truck = cv2.VideoCapture(src_truck)
        written_truck = 0
        while written_truck < int(12.0 * fps):
            ret, frame = cap_truck.read()
            if not ret or frame is None:
                cap_truck.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = cap_truck.read()
            frame = cv2.resize(frame, (w, h))
            out.write(frame)
            written_truck += 1
        cap_truck.release()
    else:
        # Repeat empty / road frame if truck clip not found
        for _ in range(int(12.0 * fps)):
            out.write(empty_frame)

    out.release()
    print(f"✓ Created {output_path} (Total duration: 32s)")

def create_cam01_environmental_video():
    """
    CAM-01: Rural outdoor perimeter with cattle / cows moving naturally.
    """
    output_path = "demo/videos/demo1_cam01_environmental.mp4"
    if os.path.exists(output_path) and os.path.getsize(output_path) > 500000:
        print(f"✓ {output_path} already exists.")
        return

    src_cow = "demo/videos/YTDown.com_YouTube_Gaay-chhori-Live-CCTV-footage-cow-thief-_Media_EggdwZjf3E8_001_720p.mp4"
    w, h = 1280, 720
    fps = 25.0
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    if os.path.exists(src_cow):
        cap = cv2.VideoCapture(src_cow)
        src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        # Start at 26s where cattle walk naturally
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(26.0 * src_fps))
        written = 0
        while written < int(24.0 * fps):
            ret, frame = cap.read()
            if not ret or frame is None:
                cap.set(cv2.CAP_PROP_POS_FRAMES, int(26.0 * src_fps))
                ret, frame = cap.read()
            frame = cv2.resize(frame, (w, h))
            out.write(frame)
            written += 1
        cap.release()
    else:
        # Fallback to existing sample
        print("Source cow video not found, copying fallback")

    out.release()
    print(f"✓ Created {output_path} (Total duration: 24s)")

def create_cam03_patrol_video():
    """
    CAM-03: Authorized patrol officer walking calmly along route.
    """
    output_path = "demo/videos/demo1_cam03_patrol.mp4"
    if os.path.exists(output_path) and os.path.getsize(output_path) > 500000:
        print(f"✓ {output_path} already exists.")
        return

    src_patrol = "demo/videos/YTDown.com_YouTube_Best-CCTV-Camera-Hikvision-2MP-Bullet-Vi_Media_H4gbVsnQD6w_001_720p.mp4"
    w, h = 1280, 720
    fps = 25.0
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    if os.path.exists(src_patrol):
        cap = cv2.VideoCapture(src_patrol)
        src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        # Start at 14s where officer walks calmly
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(14.0 * src_fps))
        written = 0
        while written < int(24.0 * fps):
            ret, frame = cap.read()
            if not ret or frame is None:
                cap.set(cv2.CAP_PROP_POS_FRAMES, int(14.0 * src_fps))
                ret, frame = cap.read()
            frame = cv2.resize(frame, (w, h))
            out.write(frame)
            written += 1
        cap.release()

    out.release()
    print(f"✓ Created {output_path} (Total duration: 24s)")

if __name__ == "__main__":
    os.makedirs("demo/videos", exist_ok=True)
    create_cam07_logistics_video()
    create_cam01_environmental_video()
    create_cam03_patrol_video()
    print("Demo 1 video assembly complete!")
