#!/usr/bin/env python3
"""
IBVAP Behavioral Anomaly ML Model Trainer
Trains a lightweight Random Forest Classifier on 11-dimensional spatio-temporal track feature vectors.
Saves model weights to `models/border_behavior_classifier.pkl` & `models/border_behavior_classifier.json`.
"""

import os
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix

def generate_ibvap_dataset(num_samples: int = 1500, random_seed: int = 42) -> pd.DataFrame:
    """
    Generates structured track feature dataset representing border surveillance scenarios:
    - NORMAL (0): Regular walking, vehicle passing, border patrol.
    - SUSPICIOUS (1): Loitering, frequent direction changes, night boundary approach.
    - CRITICAL (2): Restricted zone breach, fence crossing, rapid perimeter intrusion.
    """
    np.random.seed(random_seed)
    data = []

    # 1. NORMAL SCENARIOS (600 samples)
    for _ in range(600):
        duration = np.random.uniform(5.0, 40.0)
        avg_speed = np.random.uniform(1.0, 3.5)
        max_speed = avg_speed + np.random.uniform(0.2, 1.5)
        direction_changes = np.random.randint(0, 3)
        fence_dist = np.random.uniform(25.0, 100.0)
        loiter_dur = np.random.uniform(0.0, 3.0)
        in_restricted = 0
        in_buffer = np.random.choice([0, 1], p=[0.7, 0.3])
        fence_crossed = 0
        night = np.random.choice([0, 1], p=[0.6, 0.4])
        multi_cam = np.random.choice([1, 2], p=[0.8, 0.2])

        data.append([
            duration, avg_speed, max_speed, direction_changes, fence_dist,
            loiter_dur, in_restricted, in_buffer, fence_crossed, night, multi_cam, 0
        ])

    # 2. SUSPICIOUS SCENARIOS (500 samples)
    for _ in range(500):
        duration = np.random.uniform(20.0, 90.0)
        avg_speed = np.random.uniform(0.3, 1.8)
        max_speed = np.random.uniform(1.8, 4.5)
        direction_changes = np.random.randint(3, 8)
        fence_dist = np.random.uniform(5.0, 25.0)
        loiter_dur = np.random.uniform(6.0, 45.0)
        in_restricted = np.random.choice([0, 1], p=[0.6, 0.4])
        in_buffer = 1
        fence_crossed = 0
        night = np.random.choice([0, 1], p=[0.3, 0.7])
        multi_cam = np.random.choice([1, 2, 3], p=[0.5, 0.35, 0.15])

        data.append([
            duration, avg_speed, max_speed, direction_changes, fence_dist,
            loiter_dur, in_restricted, in_buffer, fence_crossed, night, multi_cam, 1
        ])

    # 3. CRITICAL SCENARIOS (400 samples)
    for _ in range(400):
        duration = np.random.uniform(15.0, 120.0)
        avg_speed = np.random.uniform(2.5, 6.0)
        max_speed = avg_speed + np.random.uniform(1.5, 4.0)
        direction_changes = np.random.randint(2, 10)
        fence_dist = np.random.uniform(0.0, 8.0)
        loiter_dur = np.random.uniform(5.0, 60.0)
        in_restricted = 1
        in_buffer = 1
        fence_crossed = np.random.choice([0, 1], p=[0.3, 0.7])
        night = np.random.choice([0, 1], p=[0.2, 0.8])
        multi_cam = np.random.choice([1, 2, 3, 4], p=[0.3, 0.4, 0.2, 0.1])

        data.append([
            duration, avg_speed, max_speed, direction_changes, fence_dist,
            loiter_dur, in_restricted, in_buffer, fence_crossed, night, multi_cam, 2
        ])

    columns = [
        "track_duration_sec", "avg_speed_mps", "max_speed_mps", "direction_changes_count",
        "distance_to_fence_m", "loitering_duration_sec", "in_restricted_zone",
        "in_buffer_zone", "fence_crossed", "night_context", "multi_camera_appearances", "label"
    ]

    return pd.DataFrame(data, columns=columns)

def train_and_export_model():
    print("==========================================================")
    print("🚀 IBVAP STEP 1: Behavioral Anomaly Model Training")
    print("==========================================================")

    os.makedirs("data", exist_ok=True)
    os.makedirs("models", exist_ok=True)

    df = generate_ibvap_dataset()
    csv_path = "data/behavior_dataset.csv"
    df.to_csv(csv_path, index=False)
    print(f"✅ Generated dataset saved to: {csv_path} ({len(df)} records)")

    X = df.drop(columns=["label"])
    y = df["label"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=12,
        random_state=42,
        class_weight="balanced"
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\n📊 Model Accuracy: {acc * 100:.2f}%")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=["NORMAL", "SUSPICIOUS", "CRITICAL"]))

    # Save Pickle Model
    pkl_path = "models/border_behavior_classifier.pkl"
    joblib.dump(clf, pkl_path)
    print(f"💾 Trained model saved to: {pkl_path}")

    # Export Feature Importance Metadata
    importances = dict(zip(X.columns, [round(float(v), 4) for v in clf.feature_importances_]))
    meta = {
        "model_type": "RandomForestClassifier",
        "accuracy": round(float(acc), 4),
        "num_samples": len(df),
        "feature_names": list(X.columns),
        "feature_importances": importances,
        "classes": ["NORMAL", "SUSPICIOUS", "CRITICAL"]
    }
    json_path = "models/border_behavior_classifier_metadata.json"
    with open(json_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"📝 Model metadata saved to: {json_path}")

    # Try exporting ONNX model if skl2onnx is available
    try:
        from skl2onnx import convert_sklearn
        from skl2onnx.common.data_types import FloatTensorType

        initial_type = [('float_input', FloatTensorType([None, X.shape[1]]))]
        onnx_model = convert_sklearn(clf, initial_types=initial_type)
        onnx_path = "models/border_behavior_classifier.onnx"
        with open(onnx_path, "wb") as f:
            f.write(onnx_model.SerializeToString())
        print(f"📦 ONNX model exported to: {onnx_path}")
    except Exception as e:
        print(f"ℹ️  ONNX export note: {e} (Using PKL model file directly)")

    print("\n==========================================================")
    print("✅ STEP 1 COMPLETE: Behavioral Anomaly Model Ready!")
    print("==========================================================")

if __name__ == "__main__":
    train_and_export_model()
