from pydantic import BaseModel, Field
from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime

class Resolution(BaseModel):
    width: int = 1280
    height: int = 720

class CameraMetadata(BaseModel):
    camera_id: str
    name: str
    location: str
    stream_url: str
    status: str = "ONLINE"  # ONLINE, DEGRADED, OFFLINE
    fps: float = 0.0
    resolution: Resolution = Resolution()

class ZoneConfig(BaseModel):
    zone_id: str
    name: str
    type: str  # SAFE, RESTRICTED, BORDER_FENCE, WATCH
    polygon: List[List[int]]
    color: Optional[List[int]] = [0, 0, 255]

class VirtualFenceConfig(BaseModel):
    fence_id: str
    name: str
    line: List[List[int]]
    color: Optional[List[int]] = [0, 140, 255]

class DetectionEvent(BaseModel):
    camera_id: str
    timestamp: str
    frame_id: int
    object_type: str
    confidence: float
    bbox: List[float]

class TrackedObject(BaseModel):
    camera_id: str
    track_id: int
    object_type: str
    confidence: float
    bbox: List[float]
    centroid: List[float]
    trajectory: List[List[float]] = []
    velocity: List[float] = [0.0, 0.0]
    heading_deg: Optional[float] = 0.0
    first_seen: str
    last_seen: str
    duration_sec: float = 0.0
    current_zones: List[str] = []

class SecurityEvent(BaseModel):
    event_id: str
    event_type: str
    severity: str    # INFO, WARNING, HIGH, CRITICAL
    risk_score: int  # 0 to 100
    camera_id: str
    track_id: int
    object_type: str
    timestamp: str
    reasons: List[str]
    zone_id: Optional[str] = None
    fence_id: Optional[str] = None
    snapshot: Optional[str] = None
    acknowledged: bool = False

class RiskBreakdown(BaseModel):
    score: int
    severity: str
    reasons: List[str]
    weights_applied: Dict[str, int]
    point_breakdown: Dict[str, int] = {}
    explanation: str

class IncidentTimelineEvent(BaseModel):
    timestamp: str
    event_type: str
    description: str
    camera_id: Optional[str] = None
    risk_score: Optional[int] = 0

class Incident(BaseModel):
    incident_id: str
    camera_id: str
    track_id: int
    object_type: str
    primary_event_type: str
    highest_severity: str
    max_risk_score: int
    explanation: str
    ai_summary: Optional[str] = ""
    reasons: List[str] = []
    point_breakdown: Dict[str, int] = {}
    identity_status: Optional[str] = "UNRECOGNIZED" # AUTHORIZED, UNAUTHORIZED, UNRECOGNIZED
    snapshots: List[str] = []
    timeline: List[IncidentTimelineEvent] = []
    first_seen: str
    last_seen: str
    status: str = "ACTIVE"  # ACTIVE, ACKNOWLEDGED, RESOLVED
    operator_notes: Optional[str] = ""

