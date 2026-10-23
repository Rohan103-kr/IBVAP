import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import ZoneDrawerModal from './ZoneDrawerModal'
import SpeedometerGauge from './SpeedometerGauge'
import FolderVideoModal from './FolderVideoModal'
import GroundCalibrationModal from './GroundCalibrationModal'
import BEVRadarOverlay from './BEVRadarOverlay'
import Demo1SummaryModal from './Demo1SummaryModal'

const API_BASE = 'http://localhost:8000'

const CAMS = [
  {
    id: 'CAM-01', label: 'CAM-01', loc: 'North Gate · Buffer Zone Alpha',
    sensor: 'OPTICAL', fps: '15 FPS', status: 'LIVE',
    streamUrl: `${API_BASE}/api/v1/stream/CAM-01`,
    bboxes: [],
  },
  {
    id: 'CAM-02', label: 'CAM-02', loc: 'East Checkpoint · ANPR Gate',
    sensor: 'OPTICAL', fps: '15 FPS', status: 'LIVE',
    streamUrl: `${API_BASE}/api/v1/stream/CAM-02`,
    bboxes: [],
  },
  {
    id: 'CAM-03', label: 'CAM-03', loc: 'West Perimeter · Electric Tripwire',
    sensor: 'NIGHT IR', fps: '15 FPS', status: 'LIVE',
    streamUrl: `${API_BASE}/api/v1/stream/CAM-03`,
    bboxes: [],
  },
  {
    id: 'CAM-04', label: 'CAM-04', loc: 'South Perimeter · FLIR Thermal Post',
    sensor: 'FLIR THERMAL', fps: '15 FPS', status: 'LIVE',
    streamUrl: `${API_BASE}/api/v1/stream/CAM-04`,
    bboxes: [],
  },
  {
    id: 'CAM-05', label: 'CAM-05', loc: 'Forward Ridge · Sentry Watchtower',
    sensor: 'OPTICAL', fps: '15 FPS', status: 'LIVE',
    streamUrl: `${API_BASE}/api/v1/stream/CAM-05`,
    bboxes: [],
  },
  {
    id: 'CAM-06', label: 'CAM-06', loc: 'Riverine Border · Optical Radar Post',
    sensor: 'NIGHT IR', fps: '15 FPS', status: 'LIVE',
    streamUrl: `${API_BASE}/api/v1/stream/CAM-06`,
    bboxes: [],
  },
  {
    id: 'CAM-07', label: 'CAM-07', loc: 'Eastern Valley · High Altitude FLIR',
    sensor: 'FLIR THERMAL', fps: '15 FPS', status: 'LIVE',
    streamUrl: `${API_BASE}/api/v1/stream/CAM-07`,
    bboxes: [],
  },
  {
    id: 'CAM-08', label: 'CAM-08', loc: 'Command Outpost · Vehicle Inspection Sentry',
    sensor: 'OPTICAL', fps: '15 FPS', status: 'LIVE',
    streamUrl: `${API_BASE}/api/v1/stream/CAM-08`,
    bboxes: [],
  },
]

const SENSOR_FILTERS = ['ALL', 'OPTICAL', 'FLIR THERMAL', 'NIGHT IR', 'EDGE DETECT']
const GRID_MODES = [
  { id: '2x2', label: '2×2 Paginated', icon: 'grid_view' },
  { id: 'scroll', label: 'Scroll All (8 Cams)', icon: 'view_agenda' },
  { id: 'spotlight', label: 'Spotlight', icon: 'view_quilt' },
  { id: '1x1', label: 'Focus 1×1', icon: 'crop_square' },
]

const SENSOR_OVERLAY = {
  'OPTICAL':      'none',
  'FLIR THERMAL': 'invert(90%) sepia(100%) hue-rotate(-30deg) saturate(700%) brightness(0.85) contrast(1.4)',
  'NIGHT IR':     'grayscale(100%) brightness(0.6) contrast(2.2) sepia(100%) hue-rotate(90deg) saturate(300%)',
  'EDGE DETECT':  'contrast(2.5) brightness(0.7) invert(100%) grayscale(100%)',
}

function BBoxes({ bboxes = [] }) {
  if (!bboxes || bboxes.length === 0) return null
  return (
    <>
      {bboxes.map((b, i) => {
        const [x1, y1, x2, y2] = b.bbox || [0,0,0,0]
        const style = {
          left: `${(x1 / 12.8).toFixed(1)}%`,
          top: `${(y1 / 7.2).toFixed(1)}%`,
          width: `${((x2 - x1) / 12.8).toFixed(1)}%`,
          height: `${((y2 - y1) / 7.2).toFixed(1)}%`,
          position: 'absolute'
        }
        const isRed = b.label?.includes('CRITICAL') || b.label?.includes('PERSON') || b.label?.includes('DRONE') || b.label?.includes('BAG')
        return (
          <div key={i} className={`bbox-wrap ${isRed ? 'bbox-red' : 'bbox-amber'}`} style={style}>
            <span className={`bbox-label ${isRed ? 'red' : 'amber'}`}>
              <span className="material-symbols-outlined" style={{ fontSize: 10, marginRight: 3 }}>center_focus_strong</span>
              {b.label}
            </span>
          </div>
        )
      })}
    </>
  )
}

const CameraCell = React.memo(function CameraCell({
  cam,
  selected,
  onClick,
  sensorFilter,
  simBboxes,
  backendOnline,
  simRunning,
  onOpenZoneDrawer,
  onOpenRtspModal,
  onOpenFolderModal,
  isPlaying,
  onTogglePlay,
  streamVersion,
  isSingle = false,
  directFeedMode = true,
  directUrl = null,
  isThreatPromoted = false,
  isFirstSlot = false,
  threatSeverity = null,
  threatScore = 0,
  bevEnabled = false,
  onToggleBev = null,
  onOpenCalibration = null,
  showRadarOverlay = false,
  onToggleRadarOverlay = null,
}) {
  const [streamLoaded, setStreamLoaded] = useState(false)
  const [streamError, setStreamError] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [showPtz, setShowPtz] = useState(false)
  const [dehaze, setDehaze] = useState(false)
  const [nightBoost, setNightBoost] = useState(false)

  const handleToggleDehaze = async (e) => {
    e.stopPropagation()
    const next = !dehaze
    setDehaze(next)
    try {
      await fetch(`${API_BASE}/api/v1/camera/${cam.id}/filters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dehaze: next })
      })
    } catch {}
  }

  const handleToggleNightBoost = async (e) => {
    e.stopPropagation()
    const next = !nightBoost
    setNightBoost(next)
    try {
      await fetch(`${API_BASE}/api/v1/camera/${cam.id}/filters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ night_boost: next })
      })
    } catch {}
  }

  const activeFilter = sensorFilter !== 'ALL' ? sensorFilter : cam.sensor
  const cssFilter = SENSOR_OVERLAY[activeFilter] || 'none'
  const isAlert = simBboxes && simBboxes.some(b => b.label?.includes('CRITICAL') || b.label?.includes('INTRUSION') || b.label?.includes('DRONE') || b.label?.includes('BAG'))

  useEffect(() => {
    setStreamError(false)
    setStreamLoaded(false)
  }, [isPlaying, simRunning, backendOnline, streamVersion])

  const mediaStyle = {
    position: 'absolute', inset: 0,
    width: '100%', height: '100%',
    objectFit: isSingle ? 'contain' : 'cover',
    filter: cssFilter,
    transform: `translate(${panX}px, ${panY}px) scale(${zoomLevel})`,
    transformOrigin: 'center center',
    transition: 'filter 0.4s ease, transform 0.15s ease-out',
    background: '#04070e',
    imageRendering: 'auto',
    WebkitBackfaceVisibility: 'hidden',
  }

  const captureSnapshot = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1280; canvas.height = 720
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#04070e'; ctx.fillRect(0, 0, 1280, 720)
    ctx.fillStyle = '#0ea5e9'; ctx.font = 'bold 32px monospace'
    ctx.fillText(`IBVAP EVIDENCE SNAPSHOT — ${cam.id}`, 40, 60)
    ctx.font = '20px monospace'; ctx.fillStyle = '#94a3b8'
    ctx.fillText(`Location: ${cam.loc}`, 40, 100)
    ctx.fillText(`Timestamp: ${new Date().toISOString()}`, 40, 130)
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/jpeg')
    a.download = `IBVAP_SNAPSHOT_${cam.id}_${Date.now()}.jpg`
    a.click()
  }

  return (
    <div
      id={`camera-cell-${cam.id}`}
      className={`cam-cell${selected ? ' selected' : ''}${isAlert || isThreatPromoted ? ' cam-critical' : ''}${isFirstSlot ? ' cam-first-speaker' : ''}`}
      onClick={() => { onClick(cam.id) }}
      style={{
        border: isFirstSlot ? '2px solid var(--critical)' : (isThreatPromoted ? '2px solid var(--high)' : undefined),
        boxShadow: isFirstSlot ? '0 0 20px rgba(239, 68, 68, 0.45)' : (isThreatPromoted ? '0 0 14px rgba(249, 115, 22, 0.35)' : undefined),
      }}
    >
      {/* === Live AI MJPEG Stream from Backend vs Direct Browser Feed === */}
      {(() => {
        const isDirect = Boolean(
          directFeedMode &&
          directUrl &&
          (typeof directUrl === 'string') &&
          (directUrl.startsWith('http://') || directUrl.startsWith('https://'))
        );
        const streamSrc = isDirect ? directUrl : `${cam.streamUrl}?t=${streamVersion || 1}`;

        return isPlaying ? (
          <img
            src={streamSrc}
            onError={(e) => {
              setTimeout(() => {
                if (e.target) {
                  if (isDirect && e.target.src === directUrl) {
                    console.warn(`Direct feed failed for ${cam.id}, falling back to backend stream`);
                    e.target.src = `${cam.streamUrl}?t=${Date.now()}`;
                  } else {
                    e.target.src = `${cam.streamUrl}?t=${Date.now()}`;
                  }
                }
              }, 1500);
            }}
            style={{
              ...mediaStyle,
              display: 'block',
              objectFit: isSingle ? 'contain' : 'cover'
            }}
            alt={`${cam.label} live feed`}
          />
        ) : (
          <div
            className="cam-standby-overlay"
            onClick={(e) => {
              e.stopPropagation()
              onTogglePlay(cam.id)
            }}
            title="Click to Start Real-Time Live Stream & AI Detection"
          >
            <div className="cam-standby-inner">
              <div className="cam-play-btn" style={{ borderColor: 'var(--success)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, marginLeft: 2 }}>
                  play_arrow
                </span>
              </div>
              <span className="cam-standby-label" style={{ color: '#fff' }}>
                CLICK TO START LIVE MONITORING
              </span>
              <span className="cam-standby-hint">
                Live Stream Link · Real-Time Webcam · Edge AI Detection
              </span>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn-draw-zone"
                  style={{ background: 'rgba(16, 185, 129, 0.2)', borderColor: 'var(--success)', color: 'var(--success)', padding: '4px 8px', fontSize: 10 }}
                  onClick={() => onTogglePlay(cam.id)}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 11 }}>play_arrow</span>
                  Start Live
                </button>
                <button
                  className="btn-draw-zone"
                  style={{ background: 'rgba(14, 165, 233, 0.15)', borderColor: 'var(--accent)', color: 'var(--accent)', padding: '4px 8px', fontSize: 10 }}
                  onClick={() => onOpenRtspModal && onOpenRtspModal(cam.id)}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 11 }}>cell_tower</span>
                  Live Link / Webcam
                </button>
                <button
                  className="btn-draw-zone"
                  style={{ background: 'rgba(245, 158, 11, 0.2)', borderColor: '#f59e0b', color: '#f59e0b', padding: '4px 8px', fontSize: 10 }}
                  onClick={() => onOpenFolderModal && onOpenFolderModal(cam.id)}
                  title="Select video file present in folders"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 11 }}>folder</span>
                  Folder Video
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Top Header Badge */}
      <div className="cam-status-badge">
        <div
          className={`cam-status-dot ${isAlert || isThreatPromoted ? 'live' : (isPlaying ? 'live' : 'paused')}`}
          style={{ background: isFirstSlot ? 'var(--critical)' : undefined }}
        />
        <span style={{ color: isAlert || isThreatPromoted ? 'var(--critical)' : isPlaying ? 'var(--success)' : 'var(--text-muted)', letterSpacing: '0.07em', fontSize: 9, fontWeight: 700 }}>
          {isPlaying
            ? (directFeedMode && directUrl && (directUrl.startsWith('http://') || directUrl.startsWith('https://'))
                ? '⚡ DIRECT'
                : 'AI LIVE')
            : 'STANDBY'}
        </span>
        {isThreatPromoted && (
          <span style={{
            background: isFirstSlot ? 'var(--critical)' : 'var(--high)',
            color: '#fff',
            fontFamily: 'var(--font-mono)',
            fontSize: 8.5,
            fontWeight: 800,
            padding: '1px 6px',
            borderRadius: 3,
            letterSpacing: '0.05em',
            animation: isFirstSlot ? 'pulse-btn 1.4s infinite' : 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            marginLeft: 4
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 10 }}>emergency</span>
            {isFirstSlot ? '🚨 MAIN THREAT #1' : '⚠️ THREAT'}
          </span>
        )}
      </div>

      {/* Cam ID & Stream Actions */}
      <div className="cam-id-badge" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontWeight: 700, marginRight: 4, fontSize: 10, letterSpacing: '0.04em' }}>{cam.label}</span>

        {/* Play / Pause Toggle */}
        <button
          className={`btn-draw-zone${isPlaying ? ' active-warn' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePlay(cam.id)
          }}
          title={isPlaying ? "Pause Stream" : "Play Live Video"}
          style={{ padding: '3px 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            {isPlaying ? 'pause' : 'play_arrow'}
          </span>
        </button>

        {/* Zone Drawer */}
        <button
          className="btn-draw-zone"
          data-testid="btn-open-zone-drawer"
          onClick={(e) => {
            e.stopPropagation()
            onOpenZoneDrawer(cam)
          }}
          title="Draw Perimeter Buffer & Tripwire Zones"
          style={{ padding: '3px 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>draw</span>
        </button>

        {/* Live Stream / Webcam Connection */}
        <button
          className="btn-draw-zone"
          style={{ background: 'rgba(14, 165, 233, 0.25)', borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8', padding: '3px 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => {
            e.stopPropagation()
            onOpenRtspModal && onOpenRtspModal(cam.id)
          }}
          title="Connect Live Stream (RTSP/HTTP) or Webcam"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>cell_tower</span>
        </button>

        {/* Folder Video Source */}
        <button
          className="btn-draw-zone"
          style={{ background: 'rgba(245, 158, 11, 0.25)', borderColor: 'rgba(245, 158, 11, 0.4)', color: '#fbbf24', padding: '3px 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => {
            e.stopPropagation()
            onOpenFolderModal && onOpenFolderModal(cam.id)
          }}
          title="Analyze Video from Folders"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>folder</span>
        </button>


        {/* Tactical Interactive BEV Vector Radar Popout */}
        <button
          className={`btn-draw-zone${showRadarOverlay ? ' active-warn' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleRadarOverlay && onToggleRadarOverlay(cam.id)
          }}
          title="Toggle High-Precision Tactical Bird's-Eye-View Radar Vector HUD"
          style={{
            padding: '3px 6px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: showRadarOverlay ? 'rgba(16, 185, 129, 0.35)' : 'rgba(15, 23, 42, 0.6)',
            borderColor: showRadarOverlay ? '#10b981' : 'rgba(255, 255, 255, 0.15)',
            color: showRadarOverlay ? '#34d399' : '#94a3b8'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>explore</span>
        </button>

        {/* 4-Point Ground Perspective Calibration */}
        <button
          className="btn-draw-zone"
          data-testid="btn-calibrate-ground"
          onClick={(e) => {
            e.stopPropagation()
            onOpenCalibration && onOpenCalibration(cam.id)
          }}
          title="📐 CALIBRATE: 4-Point Ground Perspective & Homography (Metric Distance & Approach Speed)"
          style={{
            padding: '3px 6px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(99, 102, 241, 0.25)',
            borderColor: 'rgba(99, 102, 241, 0.4)',
            color: '#818cf8',
            cursor: 'pointer'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>square_foot</span>
        </button>

        {/* PTZ Joystick / Pan-Tilt-Zoom Controller Toggle */}
        <button
          className={`btn-draw-zone${showPtz ? ' active-warn' : ''}`}
          data-testid="btn-ptz-joystick"
          onClick={(e) => {
            e.stopPropagation()
            setShowPtz(prev => !prev)
          }}
          title="🕹️ PTZ JOYSTICK: Optical Pan-Tilt-Zoom Camera Control"
          style={{
            padding: '3px 6px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: showPtz ? 'rgba(234, 179, 8, 0.35)' : 'rgba(15, 23, 42, 0.6)',
            borderColor: showPtz ? '#eab308' : 'rgba(255, 255, 255, 0.15)',
            color: showPtz ? '#facc15' : '#94a3b8'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>videogame_asset</span>
        </button>

        {/* Snapshot */}
        <button
          className="btn-draw-zone"
          onClick={(e) => {
            e.stopPropagation()
            captureSnapshot()
          }}
          title="Capture Evidence Snapshot"
          style={{ padding: '3px 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>photo_camera</span>
        </button>
      </div>

      {/* PTZ Joystick Optical Overlay */}
      {showPtz && (
        <div className="ptz-overlay-box" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>videogame_asset</span>
              PTZ JOYSTICK
            </div>
            <button
              onClick={() => setShowPtz(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: 0 }}
              title="Close Joystick"
            >
              ✕
            </button>
          </div>
          <div className="ptz-pad">
            <button className="ptz-btn" title="Pan Up" onClick={() => setPanY(y => y - 30)}>▲</button>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="ptz-btn" title="Pan Left" onClick={() => setPanX(x => x - 30)}>◄</button>
              <button
                className="ptz-btn"
                title="Reset Center Position (0,0, 1x)"
                onClick={() => { setPanX(0); setPanY(0); setZoomLevel(1); }}
                style={{ color: '#38bdf8', fontWeight: 700 }}
              >
                ●
              </button>
              <button className="ptz-btn" title="Pan Right" onClick={() => setPanX(x => x + 30)}>►</button>
            </div>
            <button className="ptz-btn" title="Pan Down" onClick={() => setPanY(y => y + 30)}>▼</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>ZOOM:</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.25"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
              style={{ width: 60 }}
            />
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{zoomLevel}x</span>
          </div>
          {(panX !== 0 || panY !== 0) && (
            <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
              OFFSET: [{panX > 0 ? `+${panX}` : panX}, {panY > 0 ? `+${panY}` : panY}]px
            </div>
          )}
        </div>
      )}

      {/* Tactical Interactive BEV Vector Radar Popout */}
      {showRadarOverlay && (
        <BEVRadarOverlay
          cameraId={cam.id}
          onClose={() => onToggleRadarOverlay && onToggleRadarOverlay(cam.id)}
        />
      )}

      {/* HUD scanline & reticles */}
      <div className="scanline" />
      <div className="hud-corner top-left" />
      <div className="hud-corner top-right" />
      <div className="hud-corner bottom-left" />
      <div className="hud-corner bottom-right" />

      {/* Bounding box layer */}
      {isPlaying && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <BBoxes bboxes={simBboxes || cam.bboxes} />
        </div>
      )}

      {/* Bottom Bar */}
      <div className="cam-bottom-bar">
        <span className="cam-sensor-label">{cam.loc} · {activeFilter}</span>
        <span className="cam-fps-label">{isPlaying ? 'LIVE · AI ON' : 'STANDBY'}</span>
      </div>
    </div>
  )
})

function DwellTimer({ timestamp }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = timestamp ? new Date(timestamp).getTime() : Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(t)
  }, [timestamp])
  const m = Math.floor(elapsed / 60), s = elapsed % 60
  return <span>{m > 0 ? `${m}m ` : ''}{s}s</span>
}

const EVENT_ICONS = {
  FENCE_CROSSING:           'fence',
  ZONE_ENTRY:               'do_not_enter',
  RESTRICTED_PENETRATION:   'shield',
  ANPR_ALERT:               'directions_car',
  ANPR_WATCHLIST_MATCH:     'directions_car',
  FRS_SUSPECT_MATCH:        'face_retouching_natural',
  VIOLENT_SKIRMISH:         'sports_kabaddi',
  SUSPICIOUS_LOITERING:     'person_pin',
  LOITERING:                'person_pin',
  CROWD_SURGE:              'groups',
  FACE_MATCH:               'face',
  MULTI_CAMERA_CORRELATION: 'hub',
  NIGHT_INFILTRATION:       'nights_stay',
  BEHAVIORAL_ANOMALY:       'warning',
  COVERAGE_GAP_WARNING:     'videocam_off',
  EDGE_OFFLINE_SYNC:        'sync_problem',
  AUTHORIZED_PATROL:        'security',
}

const EVENT_TITLES = {
  FENCE_CROSSING:           'Perimeter Fence Incursion',
  RESTRICTED_PENETRATION:   'Restricted Buffer Penetration',
  ZONE_ENTRY:               'Zone Boundary Violation',
  ANPR_WATCHLIST_MATCH:     'ANPR Watchlist Vehicle Hit',
  ANPR_ALERT:               'Plate Recognition Capture',
  FRS_SUSPECT_MATCH:        'FRS Wanted Suspect Intercept',
  VIOLENT_SKIRMISH:         'Violent Skirmish / Armed Clash',
  LOITERING:                'Suspicious Perimeter Loitering',
  SUSPICIOUS_LOITERING:     'Perimeter Recon Loitering',
  CROWD_SURGE:              'Mass Crowd Border Surge',
  MULTI_CAMERA_CORRELATION: 'Cross-Camera Incursion Chain',
  NIGHT_INFILTRATION:       'Night Stealth Infiltration',
  BEHAVIORAL_ANOMALY:       'Tactical Behavioral Anomaly',
  AUTHORIZED_PATROL:        'Authorized Friendly Patrol',
}

function AlertSidebar({ alerts = [], onInvestigate, onOpenDispatch, onAcknowledge, onClearAll, playingState = {} }) {
  const [filterMode, setFilterMode] = useState('ALL') // 'ALL', 'ACTIVE', 'CRITICAL', 'HIGH'
  const [localAcked, setLocalAcked] = useState(new Set())

  // Single-pass O(N) incident clustering using Hash Map data structure
  const { clusters, counts } = useMemo(() => {
    const clusterMap = new Map()
    const now = Date.now()
    const counts = { ALL: 0, ACTIVE: 0, CRITICAL: 0, HIGH: 0, WARN: 0 }

    for (let i = 0; i < alerts.length; i++) {
      const a = alerts[i]
      if (!a) continue
      // Only monitor cameras that are currently streaming
      if (!playingState[a.camera_id]) continue

      const aid = a.id || a.event_id
      if (aid && localAcked.has(aid)) continue

      const risk = a.risk_score ?? a.riskScore ?? 0
      // Suppress sub-threshold noise
      if (risk < 40 && a.severity === 'INFO') continue

      // Incident-Level Clustering (Operator Command View):
      // Group by Camera + Event Type (or Vehicle Plate for ANPR) so the operator sees exactly ONE active
      // incident card per security event on each camera, with all involved tracks fused together.
      const isVehiclePlate = a.license_plate && a.event_type?.includes('ANPR')
      const clusterKey = isVehiclePlate
        ? `${a.camera_id}::PLATE_${a.license_plate}`
        : `${a.camera_id}::${a.event_type || 'INCIDENT'}`

      const aTs = a.timestamp ? new Date(a.timestamp).getTime() : now
      const isLiveActive = (now - aTs) < 60000 // Seen in last 60 seconds

      if (!clusterMap.has(clusterKey)) {
        clusterMap.set(clusterKey, {
          clusterKey,
          primaryId: aid || clusterKey,
          allIds: new Set([aid].filter(Boolean)),
          camera_id: a.camera_id,
          track_id: a.track_id,
          allTracks: new Set(a.track_id ? [a.track_id] : []),
          object_type: a.object_type || (a.event_type?.includes('ANPR') ? 'vehicle' : 'person'),
          event_type: a.event_type || 'SECURITY_BREACH',
          severity: (a.severity || 'WARNING').toUpperCase(),
          risk_score: risk,
          description: a.description || a.reasons?.[0] || 'Perimeter intrusion activity registered',
          reasons: Array.isArray(a.reasons) ? a.reasons : [],
          license_plate: a.license_plate || null,
          snapshot: a.snapshot || null,
          firstSeen: aTs,
          lastSeen: aTs,
          count: 1,
          isActive: isLiveActive,
        })
      } else {
        const c = clusterMap.get(clusterKey)
        c.count++
        if (aid) c.allIds.add(aid)
        if (a.track_id) {
          if (!c.allTracks) c.allTracks = new Set(c.track_id ? [c.track_id] : [])
          c.allTracks.add(a.track_id)
        }
        if (aTs > c.lastSeen) c.lastSeen = aTs
        if (aTs < c.firstSeen) c.firstSeen = aTs
        if (isLiveActive) c.isActive = true

        // Escalate cluster attributes if newer event has higher risk/severity
        if (risk > c.risk_score) {
          c.risk_score = risk
          c.severity = (a.severity || c.severity).toUpperCase()
          c.event_type = a.event_type || c.event_type
          if (a.description) c.description = a.description
          if (a.track_id) c.track_id = a.track_id
        }
        if (Array.isArray(a.reasons) && a.reasons.length > 0) {
          c.reasons = Array.from(new Set([...c.reasons, ...a.reasons]))
        }
        if (a.license_plate && !c.license_plate) c.license_plate = a.license_plate
        if (a.snapshot && !c.snapshot) c.snapshot = a.snapshot
      }
    }

    // Sort clusters: Active now first, then Severity Rank, then Risk Score descending
    const SEV_RANKS = { CRITICAL: 4, HIGH: 3, WARNING: 2, INFO: 1 }
    const sorted = Array.from(clusterMap.values()).sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      const rankA = SEV_RANKS[a.severity] || 0
      const rankB = SEV_RANKS[b.severity] || 0
      if (rankA !== rankB) return rankB - rankA
      return b.risk_score - a.risk_score
    })

    // Compute filter counts in single pass
    counts.ALL = sorted.length
    for (let i = 0; i < sorted.length; i++) {
      const c = sorted[i]
      if (c.isActive) counts.ACTIVE++
      if (c.severity === 'CRITICAL') counts.CRITICAL++
      else if (c.severity === 'HIGH') counts.HIGH++
      else counts.WARN++
    }

    return { clusters: sorted, counts }
  }, [alerts, playingState, localAcked])

  // Filter clusters based on active tab
  const filteredClusters = useMemo(() => {
    if (filterMode === 'ACTIVE') return clusters.filter(c => c.isActive)
    if (filterMode === 'CRITICAL') return clusters.filter(c => c.severity === 'CRITICAL')
    if (filterMode === 'HIGH') return clusters.filter(c => c.severity === 'HIGH')
    if (filterMode === 'WARN') return clusters.filter(c => c.severity === 'WARNING' || c.severity === 'INFO')
    return clusters
  }, [clusters, filterMode])

  // Operator Action: Acknowledge single incident cluster
  const handleAcknowledgeCluster = (e, cluster) => {
    e.stopPropagation()
    // Add all underlying event IDs to acknowledged set
    const idsToAck = Array.from(cluster.allIds)
    setLocalAcked(prev => {
      const next = new Set(prev)
      idsToAck.forEach(id => next.add(id))
      return next
    })
    if (onAcknowledge) {
      onAcknowledge({
        ...cluster,
        id: cluster.primaryId,
        event_id: cluster.primaryId,
        all_ids: idsToAck,
      })
    }
  }

  // Operator Action: Bulk acknowledge all visible clusters
  const handleAcknowledgeAll = (e) => {
    e.stopPropagation()
    const allIds = []
    clusters.forEach(c => {
      c.allIds.forEach(id => allIds.push(id))
    })
    setLocalAcked(prev => new Set([...prev, ...allIds]))
    if (onClearAll) {
      onClearAll()
    } else if (onAcknowledge && clusters.length > 0) {
      clusters.forEach(c => onAcknowledge(c))
    }
  }

  const formatRelativeTime = (ts) => {
    if (!ts) return ''
    const diffSec = Math.max(1, Math.floor((Date.now() - ts) / 1000))
    if (diffSec < 10) return 'Just now'
    if (diffSec < 60) return `${diffSec}s ago`
    const mins = Math.floor(diffSec / 60)
    return `${mins}m ago`
  }

  return (
    <div className="live-alert-sidebar">
      {/* ── Top Header & Sentry Summary ── */}
      <div className="sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize: 18, color: 'var(--critical)' }}>
              crisis_alert
            </span>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--text-primary)' }}>
              LIVE THREAT FEED
            </span>
            {counts.ALL > 0 && (
              <span style={{
                background: counts.CRITICAL > 0 ? 'var(--critical)' : 'var(--high)',
                color: '#fff', fontSize: 10, fontWeight: 900,
                padding: '2px 7px', borderRadius: 12,
                boxShadow: counts.CRITICAL > 0 ? '0 0 10px rgba(244, 63, 94, 0.6)' : 'none'
              }}>
                {counts.ALL}
              </span>
            )}
          </div>

          {counts.ALL > 0 && (
            <button
              className="tactical-ack-all-btn"
              onClick={handleAcknowledgeAll}
              title="Acknowledge all incidents and mark resolved [SPACE]"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>done_all</span>
              ACK ALL
            </button>
          )}
        </div>

        {/* ── Multi-Tier Tactical Filter Chips ── */}
        <div className="sidebar-filters" style={{ marginTop: 10 }}>
          {[
            { id: 'ALL', label: 'ALL', count: counts.ALL },
            { id: 'ACTIVE', label: 'ACTIVE NOW', count: counts.ACTIVE, isLive: true },
            { id: 'CRITICAL', label: 'CRITICAL', count: counts.CRITICAL, isCrit: true },
            { id: 'HIGH', label: 'HIGH', count: counts.HIGH },
          ].map(f => (
            <button
              key={f.id}
              className={`filter-chip${filterMode === f.id ? ' active' : ''}`}
              onClick={() => setFilterMode(f.id)}
              style={
                f.isCrit && f.count > 0 && filterMode !== 'CRITICAL'
                  ? { borderColor: 'rgba(244, 63, 94, 0.6)', color: 'var(--critical)' }
                  : f.isLive && f.count > 0 && filterMode !== 'ACTIVE'
                  ? { borderColor: 'rgba(16, 185, 129, 0.6)', color: 'var(--success)' }
                  : {}
              }
            >
              {f.isLive && f.count > 0 && <span className="filter-live-dot" />}
              {f.label}
              <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.85, fontWeight: 800 }}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Incident Feed Body ── */}
      <div className="sidebar-alert-list">
        {filteredClusters.length === 0 ? (
          /* High-Tech Tactical Perimeter Radar Clean State */
          <div className="perimeter-secure-hud">
            <div className="radar-sweep-ring">
              <div className="radar-sweep-line" />
              <span className="material-symbols-outlined radar-center-shield">security</span>
            </div>
            <div className="secure-title">SECTOR SECURE</div>
            <div className="secure-subtitle">0 Active Incursions · Perimeter Nominal</div>
            <div className="secure-meta">AI Sentry Guard Active on All Feeds</div>
          </div>
        ) : (
          filteredClusters.map((cluster) => {
            const isCrit = cluster.severity === 'CRITICAL'
            const isHigh = cluster.severity === 'HIGH'
            const sevColor = isCrit ? 'var(--critical)' : isHigh ? 'var(--high)' : 'var(--warning)'
            const icon = EVENT_ICONS[cluster.event_type] || 'warning'
            const title = EVENT_TITLES[cluster.event_type] || cluster.event_type.replace(/_/g, ' ')
            const isVehicle = cluster.object_type === 'vehicle' || cluster.event_type.includes('ANPR')
            const cleanDesc = cluster.description.replace(/^BIIE SYNTHESIS:\s*/i, '').replace(/\s*\(\+\d+\)/g, '')

            return (
              <div
                key={cluster.clusterKey}
                className={`tactical-incident-card ${isCrit ? 'tic-critical' : isHigh ? 'tic-high' : ''}`}
                style={{ borderLeftColor: sevColor }}
                onClick={() => onInvestigate && onInvestigate(cluster)}
              >
                {/* Active Threat Pulsing Ring */}
                {cluster.isActive && (
                  <div className="tic-live-beacon">
                    <span className="tic-beacon-dot" />
                    <span className="tic-beacon-text">ACTIVE NOW</span>
                  </div>
                )}

                {/* Header: Severity Pill + Title + Risk Pill */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span
                      className="tic-sev-badge"
                      style={{
                        background: isCrit ? 'rgba(244, 63, 94, 0.15)' : 'rgba(251, 146, 60, 0.15)',
                        color: sevColor,
                        borderColor: isCrit ? 'rgba(244, 63, 94, 0.45)' : 'rgba(251, 146, 60, 0.45)'
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>{icon}</span>
                      {cluster.severity}
                    </span>
                    <span className="tic-incident-title">{title}</span>
                  </div>

                  <span className="tic-risk-pill" style={{ color: sevColor, borderColor: `${sevColor}44` }}>
                    {cluster.risk_score}%
                  </span>
                </div>

                {/* Target Intelligence Metadata Chips */}
                <div className="tic-chips-row">
                  {/* Sector Badge */}
                  <span className="tic-chip sector-chip">
                    <span className="material-symbols-outlined" style={{ fontSize: 10 }}>videocam</span>
                    {cluster.camera_id}
                  </span>

                  {/* Target Details Badge */}
                  <span className="tic-chip target-chip">
                    <span className="material-symbols-outlined" style={{ fontSize: 10 }}>
                      {isVehicle ? 'directions_car' : 'person'}
                    </span>
                    {cluster.license_plate ? (
                      <span style={{ fontWeight: 800, color: 'var(--high)' }}>{cluster.license_plate}</span>
                    ) : (cluster.allTracks && cluster.allTracks.size > 1) ? (
                      `Tracks #${Array.from(cluster.allTracks).slice(0, 3).join(', #')} (${cluster.allTracks.size} targets)`
                    ) : cluster.track_id ? (
                      `Track #${cluster.track_id}`
                    ) : (
                      cluster.object_type.toUpperCase()
                    )}
                  </span>

                  {/* Recency Time */}
                  <span className="tic-chip time-chip">
                    <span className="material-symbols-outlined" style={{ fontSize: 10 }}>schedule</span>
                    {formatRelativeTime(cluster.lastSeen)}
                  </span>

                  {/* Bundled Multiplier */}
                  {cluster.count > 1 && (
                    <span className="tic-chip count-chip" title={`${cluster.count} concurrent frames/detections fused`}>
                      ×{cluster.count} Events Fused
                    </span>
                  )}
                </div>

                {/* Plain-English Explanation Reason */}
                <div className="tic-reason-text">
                  {cleanDesc}
                </div>

                {/* Tactical Sentry Action Bar */}
                <div className="tic-action-bar">
                  <button
                    className="tic-btn tic-dossier-btn"
                    onClick={(e) => { e.stopPropagation(); onInvestigate && onInvestigate(cluster) }}
                    title="Open Forensic Dossier & Snapshot Evidence"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 11 }}>assignment</span>
                    DOSSIER
                  </button>

                  {(isCrit || cluster.risk_score >= 80) && (
                    <button
                      className="tic-btn tic-dispatch-btn"
                      onClick={(e) => { e.stopPropagation(); onOpenDispatch && onOpenDispatch(cluster) }}
                      title="Dispatch Quick Reaction Force [D]"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>e911_emergency</span>
                      QRF DISPATCH
                    </button>
                  )}

                  <button
                    className="tic-btn tic-ack-btn"
                    onClick={(e) => handleAcknowledgeCluster(e, cluster)}
                    title="Acknowledge and mark resolved [SPACE]"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 11 }}>check</span>
                    ACK
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}





function RtspConfigModal({ camId, currentUrl, onClose, onSave }) {
  const [url, setUrl] = useState(currentUrl || `0`)
  const [camName, setCamName] = useState(`Live Stream ${camId}`)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await fetch('http://localhost:8000/api/v1/cameras/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream_url: url })
      })
      const data = await r.json()
      setTestResult(data)
    } catch (err) {
      setTestResult({ status: 'FAILED', message: 'Failed to connect to backend test server.' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    try {
      await fetch('http://localhost:8000/api/v1/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camera_id: camId, name: camName, stream_url: url })
      })
    } catch {}
    onSave(camId, url)
    onClose()
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-box" style={{ maxWidth: 480, padding: 20, background: '#0f172a', border: '1px solid var(--accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined">cell_tower</span>
            CONNECT LIVE STREAM / WEBCAM — {camId}
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.4 }}>
          Stream real-time video from a hardware webcam (device 0, 1), mobile phone (IP Webcam / RTSP app), or network IP camera.
        </p>

        <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#cbd5e1', display: 'block', marginBottom: 4 }}>
              CAMERA NAME &amp; ROLE:
            </label>
            <input
              type="text"
              value={camName}
              onChange={e => setCamName(e.target.value)}
              style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#fff', padding: '6px 10px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#cbd5e1', display: 'block', marginBottom: 4 }}>
              RTSP / HTTP STREAM URL OR WEBCAM DEVICE INDEX:
            </label>
            <input
              type="text"
              value={url}
              onChange={e => {
                let clean = e.target.value
                if (clean.includes('://')) {
                  clean = clean.replace(/^(https?|rtsp)[:\s/]+/i, '$1://')
                }
                setUrl(clean)
              }}
              placeholder="0 (local webcam), rtsp://..., or http://192.168.1.100:8080/video"
              style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#fff', padding: '6px 10px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}
            />
            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ color: '#94a3b8' }}>Tap preset to auto-fill:</span>
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: '4px 8px', fontSize: 9, textAlign: 'left', background: 'rgba(34,197,94,0.1)', borderColor: '#22c55e', color: '#4ade80' }}
                onClick={() => setUrl('0')}
              >
                💻 <b>Local USB / Integrated Webcam:</b> 0
              </button>
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: '4px 8px', fontSize: 9, textAlign: 'left', background: 'rgba(14,165,233,0.1)', borderColor: 'var(--accent)', color: '#38bdf8' }}
                onClick={() => setUrl('http://192.0.0.4:8080/video')}
              >
                📱 <b>IP Webcam (Active):</b> http://192.0.0.4:8080/video
              </button>
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: '4px 8px', fontSize: 9, textAlign: 'left', color: '#94a3b8' }}
                onClick={() => setUrl('http://10.194.120.173:4747/video')}
              >
                ⚡ <b>DroidCam:</b> http://10.194.120.173:4747/video
              </button>
            </div>
          </div>
        </div>

        {testResult && (
          <div style={{ padding: '8px 10px', borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-mono)', marginBottom: 12, background: testResult.status === 'SUCCESS' ? 'rgba(20,184,166,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${testResult.status === 'SUCCESS' ? '#14b8a6' : '#ef4444'}`, color: testResult.status === 'SUCCESS' ? '#14b8a6' : '#fca5a5' }}>
            {testResult.status === 'SUCCESS' ? '🟢 ' : '🔴 '}
            {testResult.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-ghost"
            style={{ flex: 1, padding: '8px', fontSize: 11 }}
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? 'Testing Connection...' : 'TEST CONNECTION'}
          </button>
          <button
            className="btn-accent"
            style={{ flex: 1, padding: '8px', fontSize: 11 }}
            onClick={handleSave}
          >
            SAVE &amp; CONNECT
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LiveFeedsView({ alerts = [], simBboxes = {}, onInvestigate, backendOnline, onOpenDispatch, playingState = {}, onTogglePlay, onSetPlay, onAcknowledge, onClearAll, onClearCameraAlerts }) {
  const [selectedCam, setSelectedCam] = useState('CAM-01')
  const [sensorFilter, setSensorFilter] = useState('ALL')
  const [gridMode, setGridMode] = useState('2x2')
  const [activeZoneModalCam, setActiveZoneModalCam] = useState(null)
  const [rtspModalCam, setRtspModalCam] = useState(null)
  const [folderModalCam, setFolderModalCam] = useState(null)
  const [rtspStreams, setRtspStreams] = useState({})
  const [streamVersions, setStreamVersions] = useState({})
  const [directFeedMode, setDirectFeedMode] = useState(false)
  const [calibratingCam, setCalibratingCam] = useState(null)
  const [bevEnabledMap, setBevEnabledMap] = useState({})
  const [activeRadarOverlayCam, setActiveRadarOverlayCam] = useState(null)

  // DEMO 1: Normal Traffic -> Suppression State
  const [demo1Active, setDemo1Active] = useState(false)
  const [demo1Status, setDemo1Status] = useState(null)
  const [isDemo1SummaryOpen, setIsDemo1SummaryOpen] = useState(false)

  const handleToggleDemo1 = useCallback(async () => {
    if (demo1Active) {
      try {
        await fetch(`${API_BASE}/api/v1/simulation/demo-1/stop`, { method: 'POST' })
        setDemo1Active(false)
        const now = Date.now()
        setStreamVersions(prev => ({
          ...prev,
          'CAM-07': now,
          'CAM-01': now,
          'CAM-03': now
        }))
      } catch (err) {
        console.error('Stop Demo 1 error:', err)
      }
    } else {
      try {
        const res = await fetch(`${API_BASE}/api/v1/simulation/demo-1/start`, { method: 'POST' })
        const data = await res.json()
        setDemo1Active(true)
        setDemo1Status(data.demo_1)
        if (onClearAll) onClearAll()
        const now = Date.now()
        setStreamVersions(prev => ({
          ...prev,
          'CAM-07': now,
          'CAM-01': now,
          'CAM-03': now
        }))
        // Ensure Demo 1 cameras are active
        if (onSetPlay) {
          onSetPlay('CAM-07', true)
          onSetPlay('CAM-01', true)
          onSetPlay('CAM-03', true)
        } else {
          if (!playingState['CAM-07']) onTogglePlay('CAM-07')
          if (!playingState['CAM-01']) onTogglePlay('CAM-01')
          if (!playingState['CAM-03']) onTogglePlay('CAM-03')
        }
        setSelectedCam('CAM-07')
      } catch (err) {
        console.error('Start Demo 1 error:', err)
      }
    }
  }, [demo1Active, playingState, onTogglePlay, onSetPlay, onClearAll])

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/simulation/demo-1/status`)
      .then(res => res.json())
      .then(d => {
        if (d && d.is_active) {
          setDemo1Active(true)
          setDemo1Status(d)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!demo1Active) return
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/simulation/demo-1/status`)
        const data = await res.json()
        if (data && data.is_active) {
          setDemo1Status(data)
        } else {
          setDemo1Active(false)
          const now = Date.now()
          setStreamVersions(prev => ({
            ...prev,
            'CAM-07': now,
            'CAM-01': now,
            'CAM-03': now
          }))
        }
      } catch (e) {}
    }, 2000)
    return () => clearInterval(timer)
  }, [demo1Active])

  const handleToggleBev = useCallback(async (camId) => {
    const nextVal = !bevEnabledMap[camId]
    setBevEnabledMap(prev => ({ ...prev, [camId]: nextVal }))
    try {
      await fetch(`${API_BASE}/api/v1/camera/${camId}/toggle_bev?enabled=${nextVal}`, { method: 'POST' })
      setStreamVersions(prev => ({ ...prev, [camId]: Date.now() }))
    } catch (err) {
      console.error('Failed to toggle BEV:', err)
    }
  }, [bevEnabledMap])

  // Meeting Active-Speaker Auto-Promote & Pagination States
  const [autoPromoteThreats, setAutoPromoteThreats] = useState(true)
  const [pageIndex, setPageIndexState] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('page')
      if (p) return Math.max(0, parseInt(p, 10) - 1)
    } catch {}
    return 0
  })

  const setPageIndex = useCallback((val) => {
    setPageIndexState(prev => {
      const next = typeof val === 'function' ? val(prev) : val
      try {
        const url = new URL(window.location.href)
        url.searchParams.set('page', String(next + 1))
        window.history.replaceState(null, '', url.toString())
      } catch {}
      return next
    })
  }, [])
  const pageSize = 4

  useEffect(() => {
    fetch('http://localhost:8000/api/v1/cameras')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const map = {}
          data.forEach(c => {
            if (c.stream_url) {
              map[c.camera_id] = c.stream_url
            }
          })
          setRtspStreams(prev => ({ ...map, ...prev }))
        }
      })
      .catch(() => {})
  }, [])

  // 1. Dynamic Abnormal Threat Score Calculation for each camera
  const cameraThreatMap = useMemo(() => {
    const map = {}
    CAMS.forEach(c => {
      map[c.id] = { score: 0, latestAlertTime: 0, activeCount: 0, alertSeverity: null }
    })

    alerts.forEach(a => {
      const cid = a.camera_id || a.cam
      if (cid && map[cid]) {
        if (!a.acknowledged) {
          map[cid].activeCount++
          const sev = (a.severity || '').toUpperCase()
          const risk = Number(a.risk_score || a.riskScore || 50)
          let weight = 100
          if (sev === 'CRITICAL') weight = 1000
          else if (sev === 'HIGH') weight = 500
          else if (sev === 'WARNING') weight = 250
          
          map[cid].score += weight + risk
          if (!map[cid].alertSeverity || sev === 'CRITICAL') {
            map[cid].alertSeverity = sev
          }
          const t = a.timestamp ? new Date(a.timestamp).getTime() : 0
          if (t > map[cid].latestAlertTime) {
            map[cid].latestAlertTime = t
          }
        }
      }
    })

    // Bounding boxes check (person, drone, bag, intrusion)
    Object.entries(simBboxes).forEach(([cid, bboxes]) => {
      if (map[cid] && Array.isArray(bboxes) && bboxes.length > 0) {
        const hasCritical = bboxes.some(b => b.label?.includes('CRITICAL') || b.label?.includes('INTRUSION') || b.label?.includes('DRONE') || b.label?.includes('BAG') || b.label?.includes('PERSON'))
        if (hasCritical) {
          map[cid].score += 800
          if (!map[cid].alertSeverity) map[cid].alertSeverity = 'CRITICAL'
        } else {
          map[cid].score += 200
        }
      }
    })

    return map
  }, [alerts, simBboxes])

  // 2. Ordered Cameras: When Auto-Promote is ON, abnormal cameras jump to position #1
  const orderedCams = useMemo(() => {
    if (!autoPromoteThreats) {
      return CAMS
    }
    return [...CAMS].sort((a, b) => {
      const threatA = cameraThreatMap[a.id]?.score || 0
      const threatB = cameraThreatMap[b.id]?.score || 0
      if (threatA !== threatB) {
        return threatB - threatA // Highest threat comes first
      }
      const timeA = cameraThreatMap[a.id]?.latestAlertTime || 0
      const timeB = cameraThreatMap[b.id]?.latestAlertTime || 0
      if (timeA !== timeB) {
        return timeB - timeA // More recent alert comes first
      }
      return a.id.localeCompare(b.id)
    })
  }, [autoPromoteThreats, cameraThreatMap])

  // 3. Active-Speaker Meeting Auto-Switch to Main Screen
  const prevTopThreatRef = useRef(null)
  useEffect(() => {
    if (!autoPromoteThreats) return
    const topThreatCam = orderedCams.find(c => (cameraThreatMap[c.id]?.score || 0) > 0)
    if (topThreatCam && topThreatCam.id !== prevTopThreatRef.current) {
      prevTopThreatRef.current = topThreatCam.id
      setSelectedCam(topThreatCam.id)
      setPageIndex(0) // Ensure viewing the primary page where the threat is stationed
    }
  }, [autoPromoteThreats, orderedCams, cameraThreatMap])

  const selectedCamObj = orderedCams.find(c => c.id === selectedCam) || orderedCams[0]
  const totalPages = Math.ceil(orderedCams.length / pageSize)

  // 4. Arrow navigation handlers (< and >)
  const handlePrev = useCallback(() => {
    if (gridMode === '1x1' || gridMode === 'spotlight') {
      const idx = orderedCams.findIndex(c => c.id === selectedCam)
      const nextIdx = (idx - 1 + orderedCams.length) % orderedCams.length
      setSelectedCam(orderedCams[nextIdx].id)
    } else {
      setPageIndex(p => (p > 0 ? p - 1 : totalPages - 1))
    }
  }, [gridMode, orderedCams, selectedCam, totalPages])

  const handleNext = useCallback(() => {
    if (gridMode === '1x1' || gridMode === 'spotlight') {
      const idx = orderedCams.findIndex(c => c.id === selectedCam)
      const nextIdx = (idx + 1) % orderedCams.length
      setSelectedCam(orderedCams[nextIdx].id)
    } else {
      setPageIndex(p => (p < totalPages - 1 ? p + 1 : 0))
    }
  }, [gridMode, orderedCams, selectedCam, totalPages])

  // Keyboard navigation for arrow buttons: Left / Right arrows & < / >
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return
      if (e.key === 'ArrowLeft' || e.key === '<' || e.key === ',') {
        e.preventDefault()
        handlePrev()
      } else if (e.key === 'ArrowRight' || e.key === '>' || e.key === '.') {
        e.preventDefault()
        handleNext()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlePrev, handleNext])

  // Cameras displayed in active page
  const displayedCams = useMemo(() => {
    if (gridMode === '2x2') {
      return orderedCams.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
    }
    return orderedCams
  }, [gridMode, orderedCams, pageIndex, pageSize])

  const handleGridWheel = useCallback((e) => {
    if (gridMode === '2x2') {
      if (e.deltaY > 35 && pageIndex === 0) {
        setPageIndex(1)
      } else if (e.deltaY < -35 && pageIndex === 1) {
        setPageIndex(0)
      }
    }
  }, [gridMode, pageIndex, setPageIndex])

  const handleSaveRtsp = useCallback((camId, streamUrl) => {
    setRtspStreams(prev => ({ ...prev, [camId]: streamUrl }))
    setStreamVersions(prev => ({ ...prev, [camId]: Date.now() }))
    if (!playingState[camId]) {
      onTogglePlay(camId)
    }
  }, [playingState, onTogglePlay])

  const handleClearAlerts = useCallback(async () => {
    try {
      await fetch('http://localhost:8000/api/v1/events/clear', { method: 'POST' })
      await fetch('http://localhost:8000/api/v1/incidents/clear', { method: 'POST' })
    } catch (err) {
      console.error('Clear alerts error:', err)
    }
    if (onClearAll) onClearAll()
  }, [onClearAll])

  const renderCell = (cam, isSelected, isSingle = false, isFirstSlot = false) => {
    const threatInfo = cameraThreatMap[cam.id]
    const hasThreat = threatInfo && threatInfo.score > 0
    return (
      <CameraCell
        key={cam.id}
        cam={cam}
        selected={isSelected}
        isSingle={isSingle}
        onClick={setSelectedCam}
        sensorFilter={sensorFilter}
        simBboxes={simBboxes[cam.id]}
        backendOnline={backendOnline}
        onOpenZoneDrawer={setActiveZoneModalCam}
        onOpenRtspModal={(cid) => setRtspModalCam(cid)}
        onOpenFolderModal={(cid) => setFolderModalCam(cid)}
        isPlaying={playingState[cam.id]}
        onTogglePlay={onTogglePlay}
        streamVersion={streamVersions[cam.id] || 1}
        directFeedMode={directFeedMode}
        directUrl={rtspStreams[cam.id]}
        isThreatPromoted={hasThreat}
        isFirstSlot={isFirstSlot && hasThreat}
        threatScore={threatInfo?.score || 0}
        threatSeverity={threatInfo?.alertSeverity || 'HIGH'}
        bevEnabled={bevEnabledMap[cam.id] ?? false}
        onToggleBev={handleToggleBev}
        onOpenCalibration={(cid) => setCalibratingCam(cid)}
        showRadarOverlay={activeRadarOverlayCam === cam.id}
        onToggleRadarOverlay={(cid) => setActiveRadarOverlayCam(prev => prev === cid ? null : cid)}
      />
    )
  }

  return (
    <div className="view">
      {/* Top Toolbar */}
      <div className="view-toolbar" style={{ flexWrap: 'nowrap', overflowX: 'auto', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span className="toolbar-title" style={{ whiteSpace: 'nowrap', marginRight: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--accent)' }}>videocam</span>
            SURVEILLANCE FEEDS
          </span>
          <button
            className="toolbar-btn"
            style={{
              background: !directFeedMode ? 'var(--accent-bg)' : 'var(--bg-surface)',
              border: !directFeedMode ? '1px solid var(--accent-bd)' : '1px solid var(--border)',
              color: !directFeedMode ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              whiteSpace: 'nowrap'
            }}
            onClick={() => setDirectFeedMode(prev => !prev)}
            title="Toggle between Edge AI Sentry Analysis and Direct Raw Stream"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {!directFeedMode ? 'security' : 'bolt'}
            </span>
            {!directFeedMode ? 'AI SENTRY' : 'RAW FEED'}
          </button>
          <button
            className="toolbar-btn"
            style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', color: 'var(--warning)', whiteSpace: 'nowrap' }}
            onClick={() => setFolderModalCam('CAM-01')}
            title="Select and run detection on recorded video file from folder"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>folder_open</span>
            FOLDER
          </button>
          <button
            className="toolbar-btn"
            style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-bd)', color: 'var(--accent)', whiteSpace: 'nowrap' }}
            onClick={() => setRtspModalCam('CAM-01')}
            title="Connect RTSP / HTTP Network stream or Webcam"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>cell_tower</span>
            CONNECT
          </button>
          <button
            className="toolbar-btn"
            style={{ background: 'var(--critical-bg)', border: '1px solid var(--critical-bd)', color: 'var(--critical)', whiteSpace: 'nowrap' }}
            onClick={async () => {
              try {
                await fetch('http://localhost:8000/api/v1/cameras/reset-defaults', { method: 'POST' });
                setRtspStreams({});
                const now = Date.now();
                const newVersions = {};
                CAMS.forEach(c => {
                  newVersions[c.id] = now;
                  if (!playingState[c.id]) onTogglePlay(c.id);
                });
                setStreamVersions(newVersions);
              } catch (err) {
                console.error('Reset defaults error:', err);
              }
            }}
            title="Reset all cameras to Standby mode"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>restart_alt</span>
            STANDBY
          </button>
          <button
            className="toolbar-btn"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
            onClick={handleClearAlerts}
            title="Clear all active alarms and incident logs"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>cleaning_services</span>
            CLEAR
          </button>

          {/* HD Real-Time Stream Status Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 9px',
              borderRadius: '4px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: '#34d399',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              whiteSpace: 'nowrap'
            }}
            title="High-Definition Real-Time Optical Surveillance · Clean 2D Perimeter Active"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#34d399' }}>videocam</span>
            <span>HD STREAM · 2D SENTRY</span>
          </div>
        </div>

        {/* Right Section: Auto-Promote + <> Arrow Pager Controls + Grid Mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 'auto' }}>
          {/* Meeting Active-Speaker Auto-Promote Toggle */}
          <button
            id="btn-toggle-auto-promote"
            className={`toolbar-btn${autoPromoteThreats ? ' active' : ''}`}
            onClick={() => setAutoPromoteThreats(p => !p)}
            title="Meeting Active-Speaker Auto-Promote: When something abnormal or high risk happens on a camera, it automatically moves to the 1st / Main screen position"
            style={{
              background: autoPromoteThreats ? 'rgba(239, 68, 68, 0.14)' : 'var(--bg-surface)',
              borderColor: autoPromoteThreats ? 'var(--critical)' : 'var(--border)',
              color: autoPromoteThreats ? 'var(--critical)' : 'var(--text-muted)',
              fontWeight: 800,
              fontSize: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              whiteSpace: 'nowrap'
            }}
          >
            <span className="material-symbols-outlined icon-fill" style={{ fontSize: 14, color: autoPromoteThreats ? 'var(--critical)' : 'inherit' }}>
              {autoPromoteThreats ? 'emergency_home' : 'meeting_room'}
            </span>
            {autoPromoteThreats ? '⚡ THREAT TO MAIN #1' : 'AUTO-PROMOTE OFF'}
          </button>

          {/* Camera Pagination Controls (< and > arrow buttons) */}
          <div className="toolbar-group" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '2px 4px' }}>
            <button
              id="btn-prev-cams"
              className="toolbar-btn"
              onClick={handlePrev}
              title="Previous Cameras [Left Arrow / '<']"
              style={{ padding: '2px 5px' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
            </button>

            <span id="cam-pager-label" style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 800,
              padding: '0 5px',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              userSelect: 'none'
            }}>
              {gridMode === '2x2'
                ? `CAMS ${pageIndex * pageSize + 1}–${Math.min((pageIndex + 1) * pageSize, orderedCams.length)} / ${orderedCams.length}`
                : `${selectedCamObj.id} (${orderedCams.findIndex(c => c.id === selectedCamObj.id) + 1}/${orderedCams.length})`
              }
            </span>

            <button
              id="btn-next-cams"
              className="toolbar-btn"
              onClick={handleNext}
              title="Next Cameras [Right Arrow / '>']"
              style={{ padding: '2px 5px' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
            </button>
          </div>

          {/* Grid Selector */}
          <div className="toolbar-group">
            {GRID_MODES.map(gm => (
              <button
                key={gm.id}
                className={`toolbar-btn${gridMode === gm.id ? ' active' : ''}`}
                onClick={() => setGridMode(gm.id)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{gm.icon}</span>
                {gm.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* DEMO 1 Live Controller HUD Bar */}
      {demo1Active && (
        <div
          id="demo1-hud-bar"
          style={{
            background: 'linear-gradient(90deg, rgba(15, 23, 42, 0.95), rgba(30, 58, 138, 0.4), rgba(15, 23, 42, 0.95))',
            border: '1px solid rgba(59, 130, 246, 0.5)',
            borderRadius: 8,
            margin: '6px 12px 10px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 15px rgba(59, 130, 246, 0.2)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', letterSpacing: '0.04em' }}>
                DEMO 1 · NORMAL TRAFFIC ➔ SUPPRESSION
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>
                {demo1Status?.current_shot || 'Shot A — CAM-07: Normal Car'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              <span style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '3px 8px', borderRadius: 4, color: '#38bdf8' }}>
                Detections: <strong>{demo1Status?.total_detections ?? 4}</strong>
              </span>
              <span style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '3px 8px', borderRadius: 4, color: '#34d399' }}>
                Security Incidents: <strong>0</strong>
              </span>
              <span style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '3px 8px', borderRadius: 4, color: '#34d399' }}>
                Critical Alerts: <strong>0</strong>
              </span>
              <span style={{ background: 'rgba(148, 163, 184, 0.15)', border: '1px solid rgba(148, 163, 184, 0.3)', padding: '3px 8px', borderRadius: 4, color: '#cbd5e1' }}>
                Suppressed: <strong>{demo1Status?.suppressed_routine ?? 4}</strong>
              </span>
              <span style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '3px 8px', borderRadius: 4, color: '#fbbf24' }}>
                Workload: <strong>LOW</strong>
              </span>
            </div>

            <div style={{ display: 'flex', gap: 4, borderLeft: '1px solid var(--border)', paddingLeft: 8 }}>
              <button
                className="btn-draw-zone"
                style={{
                  padding: '4px 8px',
                  fontSize: 10,
                  fontWeight: 700,
                  background: selectedCam === 'CAM-07' ? '#2563eb' : 'var(--bg-surface)',
                  color: selectedCam === 'CAM-07' ? '#fff' : 'var(--text-muted)'
                }}
                onClick={() => {
                  setSelectedCam('CAM-07')
                  setPageIndex(1)
                  if (!playingState['CAM-07']) onTogglePlay('CAM-07')
                }}
                title="View CAM-07: Shot A Car / Shot B Truck"
              >
                CAM-07 (Shots A/B)
              </button>
              <button
                className="btn-draw-zone"
                style={{
                  padding: '4px 8px',
                  fontSize: 10,
                  fontWeight: 700,
                  background: selectedCam === 'CAM-01' ? '#2563eb' : 'var(--bg-surface)',
                  color: selectedCam === 'CAM-01' ? '#fff' : 'var(--text-muted)'
                }}
                onClick={() => {
                  setSelectedCam('CAM-01')
                  setPageIndex(0)
                  if (!playingState['CAM-01']) onTogglePlay('CAM-01')
                }}
                title="View CAM-01: Shot C Cattle"
              >
                CAM-01 (Shot C)
              </button>
              <button
                className="btn-draw-zone"
                style={{
                  padding: '4px 8px',
                  fontSize: 10,
                  fontWeight: 700,
                  background: selectedCam === 'CAM-03' ? '#2563eb' : 'var(--bg-surface)',
                  color: selectedCam === 'CAM-03' ? '#fff' : 'var(--text-muted)'
                }}
                onClick={() => {
                  setSelectedCam('CAM-03')
                  setPageIndex(0)
                  if (!playingState['CAM-03']) onTogglePlay('CAM-03')
                }}
                title="View CAM-03: Shot D Patrol"
              >
                CAM-03 (Shot D)
              </button>
            </div>

            <button
              className="btn-draw-zone"
              style={{
                padding: '5px 12px',
                fontSize: 11,
                fontWeight: 700,
                background: 'rgba(59, 130, 246, 0.2)',
                borderColor: '#3b82f6',
                color: '#93c5fd',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
              onClick={() => setIsDemo1SummaryOpen(true)}
              title="Open Routine Activity Summary Report"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>summarize</span>
              Routine Summary
            </button>

            <button
              className="icon-btn"
              style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)' }}
              onClick={handleToggleDemo1}
              title="Stop Demo 1"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Grid + Sidebar */}
      <div className="live-feeds-layout">
        <div className={`cam-grid mode-${gridMode}`} onWheel={handleGridWheel}>
          {gridMode === '1x1' ? (
            renderCell(selectedCamObj, true, true, autoPromoteThreats && (cameraThreatMap[selectedCamObj.id]?.score || 0) > 0)
          ) : gridMode === 'spotlight' ? (
            <div className="spotlight-wrap">
              <div className="spotlight-main">
                {renderCell(selectedCamObj, true, true, autoPromoteThreats && (cameraThreatMap[selectedCamObj.id]?.score || 0) > 0)}
              </div>
              <div className="spotlight-thumbs">
                {orderedCams.filter(c => c.id !== selectedCamObj.id).map(cam => renderCell(cam, false, false, false))}
              </div>
            </div>
          ) : (
            displayedCams.map((cam, idx) => renderCell(cam, selectedCam === cam.id, false, idx === 0))
          )}
        </div>

        {/* Sidebar Alerts */}
        <AlertSidebar
          alerts={alerts}
          onInvestigate={onInvestigate}
          onOpenDispatch={onOpenDispatch}
          onAcknowledge={onAcknowledge}
          onClearAll={handleClearAlerts}
          playingState={playingState}
        />
      </div>

      {/* Zone Drawer Modal */}
      {activeZoneModalCam && (
        <ZoneDrawerModal
          cam={activeZoneModalCam}
          onClose={() => setActiveZoneModalCam(null)}
        />
      )}

      {/* RTSP Stream Config Modal */}
      {rtspModalCam && (
        <RtspConfigModal
          camId={rtspModalCam}
          currentUrl={rtspStreams[rtspModalCam]}
          onClose={() => setRtspModalCam(null)}
          onSave={handleSaveRtsp}
        />
      )}

      {/* Folder Video Detection Hub Modal */}
      {folderModalCam && (
        <FolderVideoModal
          isOpen={!!folderModalCam}
          onClose={() => setFolderModalCam(null)}
          initialCameraId={folderModalCam}
          onVideoAssigned={(camId, video) => {
            const now = Date.now()
            setStreamVersions(prev => ({ ...prev, [camId]: now }))
            if (onClearCameraAlerts) {
              onClearCameraAlerts(camId)
            }
            if (onSetPlay) {
              onSetPlay(camId, true)
            } else if (!playingState[camId]) {
              onTogglePlay(camId)
            }
          }}
        />
      )}

      {/* Ground Perspective Calibration Modal (Homography 2.5D) */}
      {calibratingCam && (
        <GroundCalibrationModal
          cam={CAMS.find(c => c.id === calibratingCam) || { id: calibratingCam, label: `Camera ${calibratingCam}` }}
          cameraId={typeof calibratingCam === 'string' ? calibratingCam : calibratingCam?.id}
          isOpen={!!calibratingCam}
          onClose={() => setCalibratingCam(null)}
          onSaveSuccess={() => {
            setStreamVersions(prev => ({ ...prev, [calibratingCam]: Date.now() }))
            setBevEnabledMap(prev => ({ ...prev, [calibratingCam]: true }))
          }}
        />
      )}

      {/* Demo 1 Routine Activity Summary Modal */}
      <Demo1SummaryModal
        isOpen={isDemo1SummaryOpen}
        onClose={() => setIsDemo1SummaryOpen(false)}
        data={demo1Status}
        onRestart={handleToggleDemo1}
      />
    </div>
  )
}
