import os
import io
from datetime import datetime
from fastapi import FastAPI, Response, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse, FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from backend.config import BASE_DIR, DATA_DIR, SNAPSHOT_DIR
from backend.database import (
    init_db,
    get_active_under_cctv,
    get_all_persons,
    get_person_journey,
    export_journey_csv
)
from backend.camera_streamer import MultiCameraManager

app = FastAPI(
    title="Multi-Camera Human & Face Surveillance System",
    description="Cross-Camera Re-Identification, Multi-Object Tracking & Spatio-Temporal Journey Logging",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Database
init_db()

# Mount Static and Data Directories
os.makedirs(SNAPSHOT_DIR, exist_ok=True)
static_dir = os.path.join(BASE_DIR, "static")
os.makedirs(static_dir, exist_ok=True)

app.mount("/static", StaticFiles(directory=static_dir), name="static")
app.mount("/data/snapshots", StaticFiles(directory=SNAPSHOT_DIR), name="snapshots")

# Initialize Multi-Camera Manager
camera_manager = MultiCameraManager()


class CameraAddRequest(BaseModel):
    id: str
    name: str
    source: str
    location: Optional[str] = "Surveillance Zone"


@app.get("/")
def serve_index():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return PlainTextResponse("CCTV ReID Command Center starting up...")


@app.get("/video_feed/{camera_id}")
def video_feed(camera_id: str):
    """
    Live MJPEG stream for a specific camera with real-time AI bounding box overlays.
    """
    if camera_id not in camera_manager.workers:
        raise HTTPException(status_code=404, detail=f"Camera '{camera_id}' not found")

    return StreamingResponse(
        camera_manager.stream_mjpeg(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.get("/api/cameras")
def get_cameras():
    """
    Get all active cameras and their current operational status.
    """
    return {
        "cameras": camera_manager.get_cameras_info()
    }


@app.post("/api/cameras")
def add_camera(req: CameraAddRequest):
    """
    Add or update a camera feed (RTSP URL, webcam index, or video file).
    """
    camera_manager.add_camera(
        camera_id=req.id,
        camera_name=req.name,
        source=req.source,
        location=req.location or "Surveillance Zone"
    )
    return {"status": "success", "message": f"Camera {req.name} added successfully"}


@app.post("/api/cameras/upload")
async def upload_camera_video(
    file: UploadFile = File(...),
    camera_id: Optional[str] = Form(None),
    camera_name: Optional[str] = Form(None),
    location: Optional[str] = Form(None)
):
    """
    Upload a video file (.mp4, .avi, .mov, etc.) to set as a camera feed.
    If camera_id matches an existing camera, replaces that feed with the uploaded video.
    Otherwise, creates a new camera feed with the uploaded video.
    """
    uploads_dir = os.path.join(DATA_DIR, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)

    # Sanitize filename
    safe_name = "".join(c for c in file.filename if c.isalnum() or c in "._-")
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    save_filename = f"upload_{timestamp_str}_{safe_name}"
    save_path = os.path.join(uploads_dir, save_filename)

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    if camera_id and camera_id in camera_manager.workers:
        # Replace existing camera feed
        worker = camera_manager.workers[camera_id]
        cname = camera_name or worker.camera_name
        cloc = location or worker.location
        camera_manager.add_camera(camera_id, cname, save_path, cloc)
        return {
            "status": "success",
            "message": f"Feed updated for {cname} with uploaded video {safe_name}",
            "camera_id": camera_id,
            "source": save_path
        }
    else:
        # Create a new camera feed
        cid = camera_id or f"cam_{len(camera_manager.workers) + 1}"
        cname = camera_name or f"Feed ({safe_name})"
        cloc = location or "Uploaded Video Feed"
        camera_manager.add_camera(cid, cname, save_path, cloc)
        return {
            "status": "success",
            "message": f"Created new camera feed {cname} with uploaded video",
            "camera_id": cid,
            "source": save_path
        }


@app.delete("/api/cameras/{camera_id}")
def delete_camera(camera_id: str):
    """
    Remove a camera feed.
    """
    camera_manager.remove_camera(camera_id)
    return {"status": "success", "message": f"Camera {camera_id} removed"}


@app.get("/api/active-cctv")
def get_active_persons():
    """
    Returns all persons currently under CCTV coverage right now.
    """
    active = get_active_under_cctv()
    return {
        "count": len(active),
        "persons": active
    }


@app.get("/api/persons")
def list_persons(limit: int = Query(default=100, ge=1, le=500)):
    """
    Returns list of all persons recorded in the database.
    """
    persons = get_all_persons(limit=limit)
    return {
        "count": len(persons),
        "persons": persons
    }


@app.get("/api/persons/{person_id}/journey")
def get_journey(person_id: str):
    """
    Returns the complete chronological cross-camera journey of a person:
    "that person 1 this time to this time from this camera to this camera till under the cctvs"
    """
    journey = get_person_journey(person_id)
    if not journey:
        raise HTTPException(status_code=404, detail=f"Person '{person_id}' not found")
    return journey


@app.get("/api/status")
def system_status():
    """
    Overall system statistics.
    """
    cameras = camera_manager.get_cameras_info()
    active_under_cctv = get_active_under_cctv()
    all_persons = get_all_persons(limit=1000)

    return {
        "system": "Multi-Camera Cross-ReID Surveillance",
        "status": "ONLINE",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_cameras": len(cameras),
        "online_cameras": sum(1 for c in cameras if c["is_connected"]),
        "currently_under_cctv_count": len(active_under_cctv),
        "total_unique_persons_tracked": len(all_persons)
    }


@app.get("/api/export/csv")
def export_csv():
    """
    Export all movement intervals and camera transitions as a CSV file.
    """
    csv_data = export_journey_csv()
    filename = f"cctv_movement_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.on_event("shutdown")
def shutdown_event():
    camera_manager.shutdown()
