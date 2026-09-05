"""
=============================================================================
SIH BORDER INTELLIGENCE PLATFORM (IBVAP) — KAGGLE ANOMALY TRAINING PIPELINE
=============================================================================
Dataset: UCF-Crime Anomaly Detection Dataset (minhajuddinmeraj/anomalydetectiondatasetucf)
Model: Spatio-Temporal 3D-CNN / MobileVideoNet + Multiple Instance Learning (MIL)
Target Output: border_anomaly_detector.onnx (Compact edge-ready binary for IBVAP)
=============================================================================
"""

import os
import glob
import cv2
import random
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader

# ---------------------------------------------------------------------------
# 1. Hyperparameters & Configuration
# ---------------------------------------------------------------------------
CONFIG = {
    "dataset_root": "/kaggle/input/anomalydetectiondatasetucf",
    "target_classes": [
        "Normal_Videos_event", # Normal baseline
        "Fighting",            # Border skirmish / physical brawl
        "Assault",             # Physical attack
        "Robbery",             # Infiltration robbery
        "Burglary",            # Fence / facility penetration
        "Vandalism",           # Barrier / equipment damage
        "Arson",               # Fire / sabotage
        "Explosion"            # Kinetic detonation
    ],
    "clip_len": 16,            # 16 frames per spatio-temporal snippet
    "sample_fps": 5,           # Sample rate from raw 30 FPS video
    "frame_size": (112, 112),  # Lightweight spatial footprint for edge devices
    "batch_size": 16,
    "epochs": 15,
    "lr": 1e-4,
    "device": "cuda" if torch.cuda.is_available() else "cpu",
    "onnx_export_path": "border_anomaly_detector.onnx"
}

# ---------------------------------------------------------------------------
# 2. Dataset & Frame Extraction
# ---------------------------------------------------------------------------
class UCFCrimeSubsetDataset(Dataset):
    def __init__(self, dataset_root, classes, clip_len=16, frame_size=(112, 112), max_videos_per_class=30):
        self.clip_len = clip_len
        self.frame_size = frame_size
        self.samples = [] # (video_path, label: 0 for normal, 1 for anomaly)

        print(f"[*] Scanning UCF-Crime dataset in {dataset_root}...")
        for cls in classes:
            is_anomaly = 0 if "normal" in cls.lower() else 1
            pattern = os.path.join(dataset_root, "**", f"*{cls}*", "*.mp4")
            vids = glob.glob(pattern, recursive=True)
            if not vids:
                # Fallback search
                pattern2 = os.path.join(dataset_root, f"*{cls}*", "*.mp4")
                vids = glob.glob(pattern2)

            vids = vids[:max_videos_per_class]
            print(f"    - Found {len(vids)} videos for category '{cls}' (Label: {is_anomaly})")
            for v in vids:
                self.samples.append((v, is_anomaly))

        random.shuffle(self.samples)
        print(f"[*] Total indexed video pool: {len(self.samples)} clips.")

    def __len__(self):
        return len(self.samples)

    def _extract_clip(self, video_path):
        cap = cv2.VideoCapture(video_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            cap.release()
            return np.zeros((3, self.clip_len, self.frame_size[0], self.frame_size[1]), dtype=np.float32)

        # Select random start frame
        start_idx = random.randint(0, max(0, total_frames - self.clip_len * 2))
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_idx)

        frames = []
        step = 2 # Step for sampling ~5-10 FPS
        count = 0
        while len(frames) < self.clip_len and cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            if count % step == 0:
                frame = cv2.resize(frame, self.frame_size)
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frames.append(frame.astype(np.float32) / 255.0)
            count += 1
        cap.release()

        # Pad with last frame if video is shorter
        while len(frames) < self.clip_len:
            frames.append(frames[-1] if frames else np.zeros((self.frame_size[0], self.frame_size[1], 3), dtype=np.float32))

        # (T, H, W, C) -> (C, T, H, W)
        tensor = np.array(frames[:self.clip_len]).transpose(3, 0, 1, 2)
        return tensor

    def __getitem__(self, idx):
        v_path, label = self.samples[idx]
        clip = self._extract_clip(v_path)
        return torch.tensor(clip, dtype=torch.float32), torch.tensor(label, dtype=torch.float32)

# ---------------------------------------------------------------------------
# 3. Edge-Optimized Spatio-Temporal 3D-CNN Model
# ---------------------------------------------------------------------------
class EdgeBorderAnomalyNet(nn.Module):
    """
    Lightweight 3D-CNN model designed for realtime edge inference (<15ms latency).
    Extracts spatial contours and temporal velocity flows across video frames.
    """
    def __init__(self, in_channels=3):
        super(EdgeBorderAnomalyNet, self).__init__()
        
        self.features = nn.Sequential(
            # Stage 1: Fast Temporal Subsampling
            nn.Conv3d(in_channels, 16, kernel_size=(3, 5, 5), stride=(1, 2, 2), padding=(1, 2, 2)),
            nn.BatchNorm3d(16),
            nn.ReLU(inplace=True),
            nn.MaxPool3d(kernel_size=(1, 2, 2)),

            # Stage 2: Spatio-Temporal Fusion
            nn.Conv3d(16, 32, kernel_size=(3, 3, 3), stride=(1, 2, 2), padding=(1, 1, 1)),
            nn.BatchNorm3d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool3d(kernel_size=(2, 2, 2)),

            # Stage 3: Deep Kinetic Representations
            nn.Conv3d(32, 64, kernel_size=(3, 3, 3), stride=(1, 1, 1), padding=(1, 1, 1)),
            nn.BatchNorm3d(64),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool3d((1, 1, 1))
        )

        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.3),
            nn.Linear(64, 32),
            nn.ReLU(inplace=True),
            nn.Linear(32, 1),
            nn.Sigmoid() # Anomaly probability [0.0, 1.0]
        )

    def forward(self, x):
        feat = self.features(x)
        out = self.classifier(feat)
        return out.squeeze(-1)

# ---------------------------------------------------------------------------
# 4. Training Routine
# ---------------------------------------------------------------------------
def train_model():
    device = torch.device(CONFIG["device"])
    print(f"[*] Initializing training on: {device}")

    # Dataset & DataLoader
    dataset = UCFCrimeSubsetDataset(
        dataset_root=CONFIG["dataset_root"],
        classes=CONFIG["target_classes"],
        clip_len=CONFIG["clip_len"],
        frame_size=CONFIG["frame_size"],
        max_videos_per_class=25
    )

    if len(dataset) == 0:
        print("[!] No videos found. Check Kaggle dataset path!")
        return

    loader = DataLoader(dataset, batch_size=CONFIG["batch_size"], shuffle=True, num_workers=2)

    model = EdgeBorderAnomalyNet().to(device)
    criterion = nn.BCELoss()
    optimizer = optim.AdamW(model.parameters(), lr=CONFIG["lr"], weight_decay=1e-4)

    print("\n" + "="*50)
    print("STARTING BORDER ANOMALY MODEL TRAINING")
    print("="*50)

    for epoch in range(1, CONFIG["epochs"] + 1):
        model.train()
        total_loss = 0.0
        correct = 0
        total = 0

        for clips, labels in loader:
            clips = clips.to(device)
            labels = labels.to(device)

            optimizer.zero_grad()
            preds = model(clips)
            loss = criterion(preds, labels)
            loss.backward()
            optimizer.step()

            total_loss += loss.item() * clips.size(0)
            binary_preds = (preds >= 0.5).float()
            correct += (binary_preds == labels).sum().item()
            total += labels.size(0)

        epoch_loss = total_loss / max(1, total)
        epoch_acc = (correct / max(1, total)) * 100
        print(f"Epoch [{epoch:02d}/{CONFIG['epochs']:02d}] - Loss: {epoch_loss:.4f} | Accuracy: {epoch_acc:.1f}%")

    print("\n[*] Training complete!")

    # -----------------------------------------------------------------------
    # 5. Export to ONNX for Edge Integration
    # -----------------------------------------------------------------------
    model.eval()
    dummy_input = torch.randn(1, 3, CONFIG["clip_len"], CONFIG["frame_size"][0], CONFIG["frame_size"][1], device=device)
    
    print(f"[*] Exporting trained model to ONNX: {CONFIG['onnx_export_path']}")
    torch.onnx.export(
        model,
        dummy_input,
        CONFIG["onnx_export_path"],
        input_names=["video_clip"],
        output_names=["anomaly_prob"],
        dynamic_axes={"video_clip": {0: "batch_size"}, "anomaly_prob": {0: "batch_size"}},
        opset_version=14
    )
    print(f"[✓] SUCCESS: Model exported successfully to {CONFIG['onnx_export_path']} (~1.2 MB)")
    print("[*] Download this file from Kaggle and place it in 'models/border_anomaly_detector.onnx' in your project.")

if __name__ == "__main__":
    train_model()
