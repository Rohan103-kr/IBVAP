# IBVAP — System Run & Quick Start Guide

> **IBVAP (Intelligent Border Video Analytics Platform)** converts continuous CCTV video feeds into prioritized, explainable security events for border surveillance operators.

---

## 📋 Prerequisites

Before launching the system, ensure you have the following installed on your machine:
* **Python 3.10+** (with `pip`)
* **Node.js 18+** & **npm**

---

## 🚀 1. One-Command Quick Launch (Recommended)

Run the automated start script from the project root directory:

```bash
chmod +x start.sh
./start.sh
```

This single command will:
1. Initialize the **FastAPI REST & MJPEG Video Streaming Backend** on `http://localhost:8000`.
2. Install frontend node modules (if needed) and launch the **React Tactical Command Center UI** on `http://localhost:3000`.

---

## 🛠️ 2. Manual Step-by-Step Launch

If you prefer launching the backend and frontend separately:

### Step 2.1: Launch Python Backend Service
Open Terminal #1:
```bash
# Install Python dependencies
pip install fastapi uvicorn ultralytics opencv-python pillow numpy torch torchvision reportlab markdown

# Start FastAPI server
python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Step 2.2: Launch React Command Center Frontend
Open Terminal #2:
```bash
# Navigate to frontend directory
cd frontend

# Install Node dependencies
npm install

# Start Vite dev server
npm run dev
```

---

## 🌐 Access Points & Links

| Application / Service | URL | Description |
| :--- | :--- | :--- |
| **Tactical Command Center UI** | [http://localhost:3000](http://localhost:3000) | Live video feeds, Tactical Geo-Map, Forensic Dossier & Alerts |
| **FastAPI Backend Server** | [http://localhost:8000](http://localhost:8000) | REST APIs, health checks, camera streamers |
| **Interactive API Docs (Swagger)** | [http://localhost:8000/docs](http://localhost:8000/docs) | Complete Swagger UI for backend API testing |

---

## 🧪 3. Running Automated Test Suite

To run all 21 unit tests covering detection, tracking, zone PIP math, explainable risk engine, deduplication, and cross-camera correlation:

```bash
python3 -m unittest discover -s tests -p "test_*.py"
```

*Expected output: All 21 tests pass cleanly (100% success).*

---

## 📂 System Project Structure

- `ai/`: Object detection (YOLOv8), tracking (ByteTrack), polygon zones, context, FRS, ANPR & health monitoring.
- `backend/`: FastAPI REST controllers, MJPEG streaming engine, feature extractor, weighted risk engine, and incident manager.
- `frontend/`: React + Vite dark-mode Command Center dashboard UI.
- `configs/`: JSON configuration files for cameras, zones, schemas, and face databases.
- `demo/`: Demonstration videos, snapshots, and event records.
- `docs/`: Architecture diagrams and presentation pitch scripts.
- `tests/`: 21 automated unit tests.
