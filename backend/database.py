import sqlite3
import os
import json
import csv
import io
import threading
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "surveillance.db")
DB_LOCK = threading.Lock()


def get_db_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with DB_LOCK:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Enable WAL mode for high concurrency
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")

        # Persons table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS persons (
            person_id TEXT PRIMARY KEY,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            current_camera_id TEXT,
            current_camera_name TEXT,
            status TEXT NOT NULL DEFAULT 'UNDER_CCTV',
            face_snapshot TEXT,
            body_snapshot TEXT,
            total_dwell_seconds REAL DEFAULT 0,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """)

        # Camera Sightings (Intervals: "this time to this time from this camera to this camera")
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS camera_sightings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id TEXT NOT NULL,
            camera_id TEXT NOT NULL,
            camera_name TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            duration_seconds REAL DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            snapshot_path TEXT,
            face_snapshot_path TEXT,
            confidence REAL DEFAULT 1.0,
            FOREIGN KEY (person_id) REFERENCES persons(person_id)
        )
        """)

        # Detailed Movement Audit Log
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS movement_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id TEXT NOT NULL,
            camera_id TEXT NOT NULL,
            camera_name TEXT NOT NULL,
            event_type TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            details TEXT
        )
        """)

        # Indices for performance
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sightings_person ON camera_sightings (person_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sightings_active ON camera_sightings (is_active)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_persons_status ON persons (status)")

        conn.commit()
        conn.close()


def update_person_presence(
    person_id: str,
    camera_id: str,
    camera_name: str,
    face_snapshot: Optional[str] = None,
    body_snapshot: Optional[str] = None,
    confidence: float = 0.90,
    timestamp: Optional[datetime] = None
) -> Dict[str, Any]:
    """
    Called when a person is detected in a specific camera.
    Maintains active interval:
    - If already active in this camera, updates end_time and duration.
    - If was in another camera or inactive, closes any previous open sighting and opens a new interval.
    """
    if timestamp is None:
        timestamp = datetime.now()
    ts_iso = timestamp.strftime("%Y-%m-%d %H:%M:%S")

    with DB_LOCK:
        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. Upsert person (atomically handles concurrent detections across threads)
        cursor.execute("""
            INSERT INTO persons (
                person_id, first_seen, last_seen, current_camera_id, current_camera_name,
                status, face_snapshot, body_snapshot, total_dwell_seconds, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'UNDER_CCTV', ?, ?, 0.0, ?, ?)
            ON CONFLICT(person_id) DO UPDATE SET
                last_seen = excluded.last_seen,
                current_camera_id = excluded.current_camera_id,
                current_camera_name = excluded.current_camera_name,
                status = 'UNDER_CCTV',
                face_snapshot = COALESCE(excluded.face_snapshot, persons.face_snapshot),
                body_snapshot = COALESCE(excluded.body_snapshot, persons.body_snapshot),
                updated_at = excluded.updated_at
        """, (person_id, ts_iso, ts_iso, camera_id, camera_name, face_snapshot, body_snapshot, ts_iso, ts_iso))

        # 2. Check for active sighting for this person in this camera
        cursor.execute("""
            SELECT * FROM camera_sightings 
            WHERE person_id = ? AND camera_id = ? AND is_active = 1
            ORDER BY id DESC LIMIT 1
        """, (person_id, camera_id))
        active_sighting = cursor.fetchone()

        # 3. Check if there are active sightings in OTHER cameras for this person (Camera Transition / Handoff)
        cursor.execute("""
            SELECT * FROM camera_sightings 
            WHERE person_id = ? AND camera_id != ? AND is_active = 1
        """, (person_id, camera_id))
        other_active = cursor.fetchall()
        for other in other_active:
            # Close other camera sighting
            try:
                start_dt = datetime.strptime(other["start_time"], "%Y-%m-%d %H:%M:%S")
                duration = max(1.0, (timestamp - start_dt).total_seconds())
            except Exception:
                duration = 1.0
            
            cursor.execute("""
                UPDATE camera_sightings 
                SET end_time = ?, duration_seconds = ?, is_active = 0
                WHERE id = ?
            """, (ts_iso, duration, other["id"]))

            # Log handoff
            cursor.execute("""
                INSERT INTO movement_logs (person_id, camera_id, camera_name, event_type, timestamp, details)
                VALUES (?, ?, ?, 'TRANSFERRED', ?, ?)
            """, (person_id, camera_id, camera_name, ts_iso, f"Transferred from {other['camera_name']} to {camera_name}"))

        if active_sighting:
            # Update existing interval
            try:
                start_dt = datetime.strptime(active_sighting["start_time"], "%Y-%m-%d %H:%M:%S")
                duration = max(1.0, (timestamp - start_dt).total_seconds())
            except Exception:
                duration = 1.0

            cursor.execute("""
                UPDATE camera_sightings SET
                    end_time = ?,
                    duration_seconds = ?,
                    face_snapshot_path = COALESCE(?, face_snapshot_path),
                    snapshot_path = COALESCE(?, snapshot_path),
                    confidence = MAX(confidence, ?)
                WHERE id = ?
            """, (ts_iso, duration, face_snapshot, body_snapshot, confidence, active_sighting["id"]))
            sighting_id = active_sighting["id"]
        else:
            # Start a brand new sighting interval for this camera
            cursor.execute("""
                INSERT INTO camera_sightings (
                    person_id, camera_id, camera_name, start_time, end_time,
                    duration_seconds, is_active, snapshot_path, face_snapshot_path, confidence
                ) VALUES (?, ?, ?, ?, ?, 1.0, 1, ?, ?, ?)
            """, (person_id, camera_id, camera_name, ts_iso, ts_iso, body_snapshot, face_snapshot, confidence))
            sighting_id = cursor.lastrowid

            cursor.execute("""
                INSERT INTO movement_logs (person_id, camera_id, camera_name, event_type, timestamp, details)
                VALUES (?, ?, ?, 'ENTERED_CAMERA', ?, ?)
            """, (person_id, camera_id, camera_name, ts_iso, f"Appeared in {camera_name}"))

        conn.commit()
        conn.close()

    return {
        "person_id": person_id,
        "camera_id": camera_id,
        "camera_name": camera_name,
        "sighting_id": sighting_id,
        "timestamp": ts_iso,
        "status": "UNDER_CCTV"
    }


def close_inactive_sightings(timeout_seconds: float = 3.5):
    """
    Closes sightings for people who haven't been detected in the camera for > timeout_seconds.
    Marks them as EXITED (Departed from CCTV coverage).
    """
    with DB_LOCK:
        conn = get_db_connection()
        cursor = conn.cursor()
        now = datetime.now()

        cursor.execute("""
            SELECT s.*, p.last_seen 
            FROM camera_sightings s
            JOIN persons p ON s.person_id = p.person_id
            WHERE s.is_active = 1
        """)
        active_rows = cursor.fetchall()

        for row in active_rows:
            try:
                last_seen_dt = datetime.strptime(row["end_time"], "%Y-%m-%d %H:%M:%S")
                diff = (now - last_seen_dt).total_seconds()
                if diff > timeout_seconds:
                    # Close sighting
                    cursor.execute("""
                        UPDATE camera_sightings 
                        SET is_active = 0 
                        WHERE id = ?
                    """, (row["id"],))

                    # Check if person has any other active sightings
                    cursor.execute("""
                        SELECT COUNT(*) as count FROM camera_sightings 
                        WHERE person_id = ? AND is_active = 1
                    """, (row["person_id"],))
                    res = cursor.fetchone()
                    
                    if res and res["count"] == 0:
                        cursor.execute("""
                            UPDATE persons SET 
                                status = 'EXITED',
                                current_camera_id = NULL,
                                current_camera_name = NULL,
                                updated_at = ?
                            WHERE person_id = ?
                        """, (row["end_time"], row["person_id"]))

                        cursor.execute("""
                            INSERT INTO movement_logs (person_id, camera_id, camera_name, event_type, timestamp, details)
                            VALUES (?, ?, ?, 'EXITED_CAMERA', ?, 'Left CCTV coverage')
                        """, (row["person_id"], row["camera_id"], row["camera_name"], row["end_time"]))
            except Exception:
                continue

        conn.commit()
        conn.close()


def get_active_under_cctv() -> List[Dict[str, Any]]:
    """
    Returns list of persons currently visible under any CCTV camera.
    """
    with DB_LOCK:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT 
                p.person_id,
                p.first_seen,
                p.last_seen,
                p.current_camera_id,
                p.current_camera_name,
                p.status,
                p.face_snapshot,
                p.body_snapshot,
                s.start_time as camera_start_time,
                s.end_time as camera_last_time,
                s.duration_seconds as camera_duration_seconds
            FROM persons p
            LEFT JOIN camera_sightings s ON (p.person_id = s.person_id AND s.is_active = 1)
            WHERE p.status = 'UNDER_CCTV'
            ORDER BY s.start_time DESC
        """)
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]


def get_all_persons(limit: int = 100) -> List[Dict[str, Any]]:
    """
    Returns all registered persons with summary statistics.
    """
    with DB_LOCK:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT 
                p.*,
                (SELECT COUNT(DISTINCT camera_id) FROM camera_sightings WHERE person_id = p.person_id) as cameras_count,
                (SELECT COUNT(*) FROM camera_sightings WHERE person_id = p.person_id) as total_sightings_count,
                (SELECT SUM(duration_seconds) FROM camera_sightings WHERE person_id = p.person_id) as total_duration_seconds
            FROM persons p
            ORDER BY p.last_seen DESC
            LIMIT ?
        """, (limit,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]


def get_person_journey(person_id: str) -> Dict[str, Any]:
    """
    Retrieves the complete spatio-temporal trajectory of a person:
    "that person 1 this time to this time from this camera to this camera till under the cctvs"
    """
    with DB_LOCK:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM persons WHERE person_id = ?", (person_id,))
        person = cursor.fetchone()
        if not person:
            conn.close()
            return {}

        cursor.execute("""
            SELECT * FROM camera_sightings 
            WHERE person_id = ?
            ORDER BY start_time ASC, id ASC
        """, (person_id,))
        sightings = [dict(r) for r in cursor.fetchall()]

        cursor.execute("""
            SELECT * FROM movement_logs
            WHERE person_id = ?
            ORDER BY timestamp ASC, id ASC
        """, (person_id,))
        logs = [dict(r) for r in cursor.fetchall()]

        conn.close()

    return {
        "person": dict(person),
        "sightings": sightings,
        "movement_logs": logs,
        "is_currently_under_cctv": (person["status"] == "UNDER_CCTV"),
        "total_sightings": len(sightings)
    }


def export_journey_csv() -> str:
    """
    Generates a full CSV export of all cross-camera intervals.
    """
    with DB_LOCK:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT 
                s.person_id,
                p.status as current_status,
                s.camera_id,
                s.camera_name,
                s.start_time,
                s.end_time,
                ROUND(s.duration_seconds, 1) as duration_sec,
                CASE WHEN s.is_active = 1 THEN 'UNDER_CCTV' ELSE 'COMPLETED' END as interval_status,
                s.snapshot_path,
                s.face_snapshot_path
            FROM camera_sightings s
            JOIN persons p ON s.person_id = p.person_id
            ORDER BY s.person_id ASC, s.start_time ASC
        """)
        rows = cursor.fetchall()
        conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Person ID", "Current Overall Status", "Camera ID", "Camera Name",
        "Start Time (From)", "End Time (To)", "Duration (Seconds)",
        "Interval Status", "Body Snapshot", "Face Snapshot"
    ])

    for row in rows:
        writer.writerow(list(row))

    return output.getvalue()
