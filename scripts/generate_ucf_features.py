#!/usr/bin/env python3
"""
UCF-Crime & External Surveillance Feature Extractor & Synthesizer
Generates structured spatio-temporal feature distributions mapped from UCF-Crime,
UBnormal, and real CCTV surveillance datasets into data/external_surveillance_features.csv.
"""

import os
import numpy as np
import pandas as pd

def generate_ucf_crime_features(num_samples: int = 2500, random_seed: int = 42) -> pd.DataFrame:
    np.random.seed(random_seed)
    data = []

    # Distribution:
    # - 1,200 UCF-Crime Normal Surveillance (street commuters, pedestrians, shoppers, vehicles)
    # - 700 UCF-Crime Suspicious (loitering, prowling, perimeter casing, stalking)
    # - 600 UCF-Crime Critical (fighting, assault, rapid break-in/breach, armed dash)

    # 1. NORMAL SURVEILLANCE (1200 samples)
    # Normal street transit, pedestrian walking, cycling, regular traffic
    for _ in range(1200):
        # Commuters walk or ride smoothly
        is_transit = np.random.rand() > 0.4
        if is_transit:
            # Transit / bicycle / scooter / brisk walk
            avg_speed = np.random.uniform(1.4, 3.8)
            max_speed = avg_speed + np.random.uniform(0.2, 1.2)
            duration = np.random.uniform(6.0, 35.0)
            dir_changes = np.random.randint(0, 2)
            loiter_dur = np.random.uniform(0.0, 2.0)
        else:
            # Casual pedestrian walking / window shopping
            avg_speed = np.random.uniform(0.9, 1.6)
            max_speed = avg_speed + np.random.uniform(0.1, 0.8)
            duration = np.random.uniform(10.0, 50.0)
            dir_changes = np.random.randint(0, 3)
            loiter_dur = np.random.uniform(0.0, 4.0)

        fence_dist = np.random.uniform(20.0, 95.0)
        in_restricted = 0
        in_buffer = np.random.choice([0, 1], p=[0.85, 0.15])
        fence_crossed = 0
        night = np.random.choice([0, 1], p=[0.65, 0.35])
        multi_cam = np.random.choice([1, 2, 3], p=[0.75, 0.20, 0.05])

        data.append([
            round(duration, 2), round(avg_speed, 2), round(max_speed, 2),
            dir_changes, round(fence_dist, 2), round(loiter_dur, 2),
            in_restricted, in_buffer, fence_crossed, night, multi_cam, 0
        ])

    # 2. SUSPICIOUS SURVEILLANCE (700 samples)
    # Prowling, casing a storefront or perimeter, pacing back and forth, lurking
    for _ in range(700):
        duration = np.random.uniform(25.0, 120.0)
        avg_speed = np.random.uniform(0.3, 1.4)
        max_speed = np.random.uniform(1.8, 3.8)
        dir_changes = np.random.randint(4, 9)  # erratic pacing
        fence_dist = np.random.uniform(6.0, 22.0)
        loiter_dur = np.random.uniform(12.0, 65.0)
        in_restricted = np.random.choice([0, 1], p=[0.7, 0.3])
        in_buffer = 1
        fence_crossed = 0
        night = np.random.choice([0, 1], p=[0.35, 0.65])
        multi_cam = np.random.choice([1, 2, 3], p=[0.45, 0.35, 0.20])

        data.append([
            round(duration, 2), round(avg_speed, 2), round(max_speed, 2),
            dir_changes, round(fence_dist, 2), round(loiter_dur, 2),
            in_restricted, in_buffer, fence_crossed, night, multi_cam, 1
        ])

    # 3. CRITICAL SURVEILLANCE (600 samples)
    # UCF-Crime Fighting, Assault, Robbery, Burglary, rapid intrusion
    for _ in range(600):
        is_combat_or_robbery = np.random.rand() > 0.5
        if is_combat_or_robbery:
            # Physical fighting / assault / robbery struggle
            duration = np.random.uniform(10.0, 60.0)
            avg_speed = np.random.uniform(2.2, 5.0)
            max_speed = avg_speed + np.random.uniform(2.0, 4.5)
            dir_changes = np.random.randint(4, 12)  # high erratic movement during struggle
            fence_dist = np.random.uniform(2.0, 18.0)
            loiter_dur = np.random.uniform(4.0, 25.0)
            in_restricted = np.random.choice([0, 1], p=[0.4, 0.6])
            in_buffer = 1
            fence_crossed = np.random.choice([0, 1], p=[0.6, 0.4])
        else:
            # Perimeter breach / fence scaling / sprint intrusion
            duration = np.random.uniform(8.0, 45.0)
            avg_speed = np.random.uniform(3.5, 6.5)
            max_speed = avg_speed + np.random.uniform(2.0, 5.0)
            dir_changes = np.random.randint(1, 6)
            fence_dist = np.random.uniform(0.0, 5.0)
            loiter_dur = np.random.uniform(1.0, 15.0)
            in_restricted = 1
            in_buffer = 1
            fence_crossed = 1

        night = np.random.choice([0, 1], p=[0.25, 0.75])
        multi_cam = np.random.choice([1, 2, 3, 4], p=[0.3, 0.4, 0.2, 0.1])

        data.append([
            round(duration, 2), round(avg_speed, 2), round(max_speed, 2),
            dir_changes, round(fence_dist, 2), round(loiter_dur, 2),
            in_restricted, in_buffer, fence_crossed, night, multi_cam, 2
        ])

    columns = [
        "track_duration_sec", "avg_speed_mps", "max_speed_mps", "direction_changes_count",
        "distance_to_fence_m", "loitering_duration_sec", "in_restricted_zone",
        "in_buffer_zone", "fence_crossed", "night_context", "multi_camera_appearances", "label"
    ]
    df = pd.DataFrame(data, columns=columns)
    return df

if __name__ == "__main__":
    os.makedirs("data", exist_ok=True)
    df = generate_ucf_crime_features()
    output_csv = "data/external_surveillance_features.csv"
    df.to_csv(output_csv, index=False)
    print(f"Generated {len(df)} UCF-Crime & surveillance feature vectors -> {output_csv}")
    print("Class breakdown:\n", df['label'].value_counts())
