import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import ZoneDrawerModal from './ZoneDrawerModal'
import SpeedometerGauge from './SpeedometerGauge'

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
]

const SENSOR_FILTERS = ['ALL', 'OPTICAL', 'FLIR THERMAL', 'NIGHT IR', 'EDGE DETECT']
const GRID_MODES = [
  { id: '2x2', label: '2×2 Grid', icon: 'grid_view' },
  { id: 'spotlight', label: 'Spotlight', icon: 'view_quilt' },
  { id: '1x1', label: 'Focus 1×1', icon: 'crop_single' },
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

// Per-camera state is managed in the parent (uploadedVideos map)
function CameraCell({
  cam,
  selected,
  onClick,
  sensorFilter,
  simBboxes,
  backendOnline,
  simRunning,
  onOpenZoneDrawer,
  onOpenRtspModal,
  isPlaying,
  onTogglePlay,
  streamVersion,
  uploadedVideoUrl,
  onUploadVideo,
  onDeleteVideo,
  hasUploadedVideo,
}) {
  const [streamLoaded, setStreamLoaded] = useState(false)
  const [streamError, setStreamError] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [showPtz, setShowPtz] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dehaze, setDehaze] = useState(false)
  const [nightBoost, setNightBoost] = useState(false)
  const fileInputRef = useRef(null)

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

  // Stream only after: video uploaded & play button hit
  const useStream = hasUploadedVideo && isPlaying && !streamError

  useEffect(() => {
    setStreamError(false)
    setStreamLoaded(false)
  }, [isPlaying, simRunning, backendOnline, streamVersion, hasUploadedVideo])

  const mediaStyle = {
    position: 'absolute', inset: 0,
    width: '100%', height: '100%',
    objectFit: 'cover',
    filter: cssFilter,
    transform: `scale(${zoomLevel})`,
    transformOrigin: 'center center',
    transition: 'filter 0.4s ease, transform 0.2s ease',
    background: '#04070e',
  }

  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API_BASE}/api/v1/upload-video/${cam.id}`, {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        const localUrl = URL.createObjectURL(file)
        onUploadVideo(cam.id, localUrl)
      }
    } catch {
      // fallback: still show preview locally even if backend upload fails
      const localUrl = URL.createObjectURL(file)
      onUploadVideo(cam.id, localUrl)
    }
    setUploading(false)
  }, [cam.id, onUploadVideo])

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
      className={`cam-cell${selected ? ' selected' : ''}${isAlert ? ' cam-critical' : ''}`}
      onClick={() => { onClick(cam.id) }}
    >
      {/* === Live AI MJPEG Stream from Backend === */}
      {isPlaying ? (
        <img
          src={`${cam.streamUrl}?t=${streamVersion || 1}`}
          style={{
            ...mediaStyle,
            display: 'block',
            objectFit: 'cover'
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
          title="Click to Start AI Live Video Stream & Detection"
        >
          <div className="cam-standby-inner">
            <div className="cam-play-btn" style={{ borderColor: 'var(--success)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, marginLeft: 2 }}>
                play_arrow
              </span>
            </div>
            <span className="cam-standby-label" style={{ color: '#fff' }}>
              CLICK TO PLAY LIVE VIDEO
            </span>
            <span className="cam-standby-hint">
              YOLOv8 Detection · ByteTrack Vector Math · Live Stream
            </span>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
              <button
                className="btn-draw-zone"
                style={{ background: 'rgba(16, 185, 129, 0.2)', borderColor: 'var(--success)', color: 'var(--success)', padding: '4px 8px', fontSize: 10 }}
                onClick={() => onTogglePlay(cam.id)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>play_arrow</span>
                Play Live
              </button>
              <button
                className="btn-draw-zone"
                style={{ padding: '4px 8px', fontSize: 10 }}
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>upload_file</span>
                Upload MP4
              </button>
              <button
                className="btn-draw-zone"
                style={{ background: 'rgba(14, 165, 233, 0.15)', borderColor: 'var(--accent)', color: 'var(--accent)', padding: '4px 8px', fontSize: 10 }}
                onClick={() => onOpenRtspModal && onOpenRtspModal(cam.id)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>cell_tower</span>
                RTSP Live
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header Badge */}
      <div className="cam-status-badge">
        <div className={`cam-status-dot ${isAlert ? 'live' : (isPlaying ? 'live' : 'paused')}`} />
        <span style={{ color: isAlert ? 'var(--critical)' : isPlaying ? 'var(--success)' : hasUploadedVideo ? 'var(--warning)' : 'var(--text-muted)', letterSpacing: '0.07em', fontSize: 9, fontWeight: 700 }}>
          {isPlaying ? 'AI DETECT LIVE' : hasUploadedVideo ? 'VIDEO READY · DRAW ZONES' : 'STANDBY · READY TO PLAY'}
        </span>
        {isPlaying && (
          <button
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: 4, display: 'flex', alignItems: 'center' }}
            onClick={(e) => {
              e.stopPropagation()
              onTogglePlay(cam.id)
            }}
            title="Pause camera stream"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>pause</span>
          </button>
        )}
      </div>

      {/* Cam ID & Stream Actions */}
      <div className="cam-id-badge" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontWeight: 700, marginRight: 2 }}>{cam.label}</span>

        {/* Play / Pause Toggle */}
        <button
          className={`btn-draw-zone${isPlaying ? ' active-warn' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePlay(cam.id)
          }}
          title={isPlaying ? "Pause stream" : "Play live video"}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
            {isPlaying ? 'pause' : 'play_arrow'}
          </span>
          {isPlaying ? 'Pause' : 'Play'}
        </button>

        {/* Zone Drawer */}
        <button
          className="btn-draw-zone"
          onClick={(e) => {
            e.stopPropagation()
            onOpenZoneDrawer({ ...cam, uploadedVideoUrl })
          }}
          title="Draw Custom Polygon Buffer & Tripwire Zones"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>draw</span>
          Zones
        </button>

        {/* File Upload Button */}
        <button
          className="btn-draw-zone"
          onClick={(e) => {
            e.stopPropagation()
            fileInputRef.current?.click()
          }}
          title="Upload Video File"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>upload_file</span>
          Upload
        </button>

        {/* RTSP Connection */}
        <button
          className="btn-draw-zone"
          style={{ background: 'rgba(14, 165, 233, 0.15)', borderColor: 'var(--accent)', color: 'var(--accent)' }}
          onClick={(e) => {
            e.stopPropagation()
            onOpenRtspModal && onOpenRtspModal(cam.id)
          }}
          title="Connect RTSP Stream"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>cell_tower</span>
          RTSP
        </button>

        <button
          className="btn-draw-zone"
          onClick={(e) => {
            e.stopPropagation()
            captureSnapshot()
          }}
          title="Capture Snapshot"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>photo_camera</span>
        </button>
      </div>

      {/* Hidden file input for video uploads (always rendered) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* PTZ Overlay */}
      {showPtz && (
        <div className="ptz-overlay-box" onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent)', marginBottom: 4, fontWeight: 700 }}>
            PTZ OPTICAL PAN-ZOOM
          </div>
          <div className="ptz-pad">
            <button className="ptz-btn" title="Pan Up">▲</button>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="ptz-btn" title="Pan Left">◄</button>
              <button className="ptz-btn" title="Reset Center">●</button>
              <button className="ptz-btn" title="Pan Right">►</button>
            </div>
            <button className="ptz-btn" title="Pan Down">▼</button>
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
        </div>
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
        <span className="cam-fps-label">{isPlaying ? '15.0 FPS · AI ON' : hasUploadedVideo ? 'READY' : 'NO VIDEO'}</span>
      </div>
    </div>
  )
}

function AlertSidebar({ alerts, onInvestigate, onOpenDispatch, onAcknowledge, playingState = {} }) {
  const [sevFilter, setSevFilter] = useState('ALL')
  const [ackedSet, setAckedSet] = useState(new Set())

  // Deduplicate active alerts by camera_id + track_id (show max 1 card per active intruder)
  const dedupedAlerts = useMemo(() => {
    const seen = new Set()
    const result = []
    for (const a of alerts) {
      if (!playingState[a.camera_id]) continue
      const risk = a.risk_score ?? a.riskScore ?? 0
      if (risk <= 50) continue
      const key = `${a.camera_id}_${a.track_id || '0'}`
      const id = a.id || a.event_id || key
      if (ackedSet.has(id)) continue
      if (!seen.has(key)) {
        seen.add(key)
        result.push(a)
      }
    }
    return result
  }, [alerts, playingState, ackedSet])

  const filtered = sevFilter === 'ALL'
    ? dedupedAlerts
    : dedupedAlerts.filter(a => (a.severity || '').toUpperCase() === sevFilter)

  const critCount = dedupedAlerts.filter(a => (a.severity || '').toUpperCase() === 'CRITICAL').length

  const handleAck = (e, a) => {
    e.stopPropagation()
    const id = a.id || a.event_id || `${a.camera_id}_${a.track_id}`
    setAckedSet(prev => new Set([...prev, id]))
    if (onAcknowledge) onAcknowledge(a)
  }

  const handleAckAll = () => {
    const ids = dedupedAlerts.map(a => a.id || a.event_id || `${a.camera_id}_${a.track_id}`)
    setAckedSet(prev => new Set([...prev, ...ids]))
  }

  return (
    <div className="live-alert-sidebar">
      <div className="sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="sidebar-title">
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--critical)' }}>warning</span>
            LIVE THREAT FEED
          </span>
          {dedupedAlerts.length > 0 && (
            <button
              className="toolbar-btn"
              onClick={handleAckAll}
              style={{ fontSize: 9, borderColor: 'var(--success-bd)', color: 'var(--success)', padding: '2px 6px' }}
              title="Acknowledge all live threats"
            >
              ✓ ACK ALL ({dedupedAlerts.length})
            </button>
          )}
        </div>
        <div className="sidebar-filters" style={{ marginTop: 8 }}>
          {['ALL', 'CRITICAL', 'HIGH', 'WARNING'].map(f => (
            <button
              key={f}
              className={`filter-chip${sevFilter === f ? ' active' : ''}`}
              onClick={() => setSevFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-alert-list">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--success)' }}>verified_user</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No active unhandled threats</span>
          </div>
        ) : (
          filtered.map((a, idx) => {
            const sev = (a.severity || 'INFO').toUpperCase()
            const color = sev === 'CRITICAL' ? 'var(--critical)' : sev === 'HIGH' ? 'var(--high)' : 'var(--warning)'
            const rank = a.priority_rank || (idx + 1)
            const isTop = rank === 1 || a.is_top_priority
            const risk = a.risk_score ?? a.riskScore ?? 85
            return (
              <div
                key={a.id || a.event_id || idx}
                className={`sidebar-alert-card ${sev === 'CRITICAL' ? 'crit' : ''}`}
                style={{ borderLeft: isTop ? '3px solid #eab308' : undefined, display: 'flex', gap: 10, alignItems: 'center' }}
                onClick={() => onInvestigate(a)}
              >
                {/* Speedometer Gauge Dial Meter */}
                <div style={{ flexShrink: 0 }}>
                  <SpeedometerGauge value={risk} size={65} showLabel={false} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sac-header">
                    <span className={`alert-severity-tag tag-${sev.toLowerCase()}`}>{sev}</span>
                    <span className="sac-cam">{a.camera_id}</span>
                    <span className="sac-risk" style={{ color, fontWeight: 900 }}>{risk}/100</span>
                  </div>
                  <div className="sac-desc" style={{ marginTop: 2 }}>
                    {(() => {
                      let desc = a.description || 'Intrusion activity recorded'
                      desc = desc.replace(/^BIIE SYNTHESIS:\s*/i, '').replace(/\s*\(\+\d+\)/g, '')
                      const parts = desc.split(/\s*·\s*/)
                      return parts.slice(0, 2).join(' · ')
                    })()}
                  </div>
                  <div className="sac-footer" style={{ marginTop: 4 }}>
                    <span>TRK: <strong>{a.track_id || '8821'}</strong></span>
                    <button
                      className="btn-draw-zone"
                      onClick={(e) => handleAck(e, a)}
                      style={{ background: 'rgba(16, 185, 129, 0.2)', borderColor: 'var(--success)', color: 'var(--success)', padding: '2px 6px', fontSize: 9, fontWeight: 700 }}
                      title="Acknowledge Threat"
                    >
                      ✓ ACK
                    </button>
                  </div>
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
  const [url, setUrl] = useState(currentUrl || `rtsp://192.168.1.105:8554/live`)
  const [camName, setCamName] = useState(`Mobile Watchtower ${camId}`)
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
      <div className="modal-box" style={{ maxWidth: 460, padding: 20, background: '#0f172a', border: '1px solid var(--accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined">cell_tower</span>
            CONNECT RTSP / MOBILE CAMERA — {camId}
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.4 }}>
          Stream live video from a mobile phone (e.g., RTSP Camera / IP Webcam App) or IP CCTV camera on the local network.
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
              RTSP / HTTP STREAM URL:
            </label>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="rtsp://192.168.1.105:8554/live or http://192.168.1.105:8080/video"
              style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#fff', padding: '6px 10px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}
            />
            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
              IPv4: <code>http://192.168.1.105:8080/video</code><br />
              IPv6: <code>http://[2401:4900:1c8a:...]:8080/video</code> (auto-bracketed)
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

export default function LiveFeedsView({ alerts = [], simBboxes = {}, onInvestigate, backendOnline, onOpenDispatch, playingState = {}, onTogglePlay }) {
  const [selectedCam, setSelectedCam] = useState('CAM-01')
  const [sensorFilter, setSensorFilter] = useState('ALL')
  const [gridMode, setGridMode] = useState('2x2')
  const [activeZoneModalCam, setActiveZoneModalCam] = useState(null)
  const [rtspModalCam, setRtspModalCam] = useState(null)
  const [uploadedVideos, setUploadedVideos] = useState({})
  const [rtspStreams, setRtspStreams] = useState({})
  const [streamVersions, setStreamVersions] = useState({})

  const selectedCamObj = CAMS.find(c => c.id === selectedCam) || CAMS[0]

  const handleUploadVideo = useCallback((camId, localUrl) => {
    setUploadedVideos(prev => ({ ...prev, [camId]: { url: localUrl } }))
    setStreamVersions(prev => ({ ...prev, [camId]: Date.now() }))
    if (!playingState[camId]) {
      onTogglePlay(camId)
    }
  }, [playingState, onTogglePlay])

  const handleSaveRtsp = useCallback((camId, streamUrl) => {
    setRtspStreams(prev => ({ ...prev, [camId]: streamUrl }))
    setUploadedVideos(prev => ({ ...prev, [camId]: { url: `${API_BASE}/api/v1/stream/${camId}` } }))
    setStreamVersions(prev => ({ ...prev, [camId]: Date.now() }))
    if (!playingState[camId]) {
      onTogglePlay(camId)
    }
  }, [playingState, onTogglePlay])

  const handleDeleteVideo = useCallback((camId) => {
    setUploadedVideos(prev => {
      const copy = { ...prev }
      delete copy[camId]
      return copy
    })
    setRtspStreams(prev => {
      const copy = { ...prev }
      delete copy[camId]
      return copy
    })
    setStreamVersions(prev => ({ ...prev, [camId]: Date.now() }))
    if (playingState[camId]) {
      onTogglePlay(camId)
    }
  }, [playingState, onTogglePlay])

  // Real active critical alert for BIIE Hero Banner (only for currently playing streams)
  const activeCamAlerts = alerts.filter(a => playingState[a.camera_id] && (a.risk_score ?? a.riskScore ?? 0) > 50)
  const topCriticalAlert = activeCamAlerts.find(a => (a.severity || '').toUpperCase() === 'CRITICAL' || (a.risk_score ?? a.riskScore ?? 0) >= 80)

  const renderCell = (cam, isSelected) => (
    <CameraCell
      key={cam.id}
      cam={cam}
      selected={isSelected}
      onClick={setSelectedCam}
      sensorFilter={sensorFilter}
      simBboxes={simBboxes[cam.id]}
      backendOnline={backendOnline}
      onOpenZoneDrawer={setActiveZoneModalCam}
      onOpenRtspModal={(cid) => setRtspModalCam(cid)}
      isPlaying={playingState[cam.id]}
      onTogglePlay={onTogglePlay}
      streamVersion={streamVersions[cam.id] || 1}
      uploadedVideoUrl={uploadedVideos[cam.id]?.url}
      onUploadVideo={handleUploadVideo}
      onDeleteVideo={handleDeleteVideo}
      hasUploadedVideo={!!uploadedVideos[cam.id]}
    />
  )

  return (
    <div className="view">
      {/* Top Toolbar */}
      <div className="view-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="toolbar-title">
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>videocam</span>
            Live Command Feeds
          </span>
          <button
            className="toolbar-btn"
            style={{ background: 'rgba(16, 185, 129, 0.2)', borderColor: 'var(--success)', color: 'var(--success)', marginLeft: 8 }}
            onClick={() => {
              CAMS.forEach(c => {
                if (!playingState[c.id]) {
                  onTogglePlay(c.id)
                }
              })
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>play_circle</span>
            START ALL STREAMS
          </button>
          <button
            className="toolbar-btn"
            style={{ background: 'rgba(14, 165, 233, 0.15)', borderColor: 'var(--accent)', color: 'var(--accent)', marginLeft: 4 }}
            onClick={() => setRtspModalCam('CAM-01')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>cell_tower</span>
            CONNECT RTSP
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



      {/* Main Grid + Sidebar */}
      <div className="live-feeds-layout">
        <div className={`cam-grid mode-${gridMode}`}>
          {gridMode === '1x1' ? (
            renderCell(selectedCamObj, true)
          ) : gridMode === 'spotlight' ? (
            <div className="spotlight-wrap">
              <div className="spotlight-main">
                {renderCell(selectedCamObj, true)}
              </div>
              <div className="spotlight-thumbs">
                {CAMS.filter(c => c.id !== selectedCamObj.id).map(cam => renderCell(cam, false))}
              </div>
            </div>
          ) : (
            CAMS.map(cam => renderCell(cam, selectedCam === cam.id))
          )}
        </div>

        {/* Sidebar Alerts */}
        <AlertSidebar
          alerts={alerts}
          onInvestigate={onInvestigate}
          onOpenDispatch={onOpenDispatch}
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
    </div>
  )
}
