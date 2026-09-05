#!/usr/bin/env python3
"""
IBVAP Multi-Dataset Retrainer & Behavioral Model Compiler
Merges controlled border scenarios + external surveillance datasets (UCF-Crime, UBnormal, ShanghaiTech, custom CCTV)
and trains the final 11-dimensional Random Forest classifier `models/border_behavior_classifier.pkl`.
"""

import os
import sys
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from scripts.train_behavior_model import generate_ibvap_dataset

def train_multi_dataset_classifier():
    print("==========================================================")
    print("🚀 IBVAP MULTI-DATASET BEHAVIORAL MODEL RETRAINER")
    print("==========================================================")

    os.makedirs("data", exist_ok=True)
    os.makedirs("models", exist_ok=True)

    # 1. Load Controlled Border Scenarios
    df_border = generate_ibvap_dataset(num_samples=1500)
    print(f"✓ Loaded {len(df_border)} controlled border scenario feature vectors.")

    # 2. Load External Surveillance Datasets (UCF-Crime / UBnormal / ShanghaiTech / CCTV)
    ext_csv = "data/external_surveillance_features.csv"
    if os.path.exists(ext_csv):
        df_ext = pd.read_csv(ext_csv)
        print(f"✓ Loaded {len(df_ext)} external dataset feature vectors from {ext_csv}.")
        df_full = pd.concat([df_border, df_ext], ignore_index=True)
    else:
        print(f"ℹ️ External dataset file '{ext_csv}' not found. Retraining on 1,500 controlled border vectors.")
        df_full = df_border

    # Normalize feature column names
    target_cols = [
        "track_duration_sec", "avg_speed_mps", "max_speed_mps", "direction_changes_count",
        "distance_to_fence_m", "loitering_duration_sec", "in_restricted_zone",
        "in_buffer_zone", "fence_crossed", "night_context", "multi_camera_appearances", "label"
    ]
    df_full.columns = target_cols

    X = df_full.drop(columns=["label"])
    y = df_full["label"].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    clf = RandomForestClassifier(
        n_estimators=120,
        max_depth=14,
        random_state=42,
        class_weight="balanced"
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\n📊 Multi-Dataset Random Forest Model Accuracy: {acc * 100:.2f}%")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=["NORMAL", "SUSPICIOUS", "CRITICAL"]))

    # Export PKL Model
    pkl_path = "models/border_behavior_classifier.pkl"
    joblib.dump(clf, pkl_path)
    print(f"💾 Exported model to: {pkl_path}")

    # Export Feature Importance Metadata
    importances = dict(zip(X.columns, [round(float(v), 4) for v in clf.feature_importances_]))
    meta = {
        "model_type": "RandomForestClassifier",
        "accuracy": round(float(acc), 4),
        "num_samples": len(df_full),
        "feature_names": list(X.columns),
        "feature_importances": importances,
        "classes": ["NORMAL", "SUSPICIOUS", "CRITICAL"]
    }
    json_path = "models/border_behavior_classifier_metadata.json"
    with open(json_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"📝 Exported model metadata to: {json_path}")
    print("\n==========================================================")
    print("✅ RETRAINING COMPLETE: border_behavior_classifier.pkl READY!")
    print("==========================================================")

if __name__ == "__main__":
    train_multi_dataset_classifier()
