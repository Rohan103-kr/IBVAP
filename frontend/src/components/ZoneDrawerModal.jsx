import React, { useState, useRef, useEffect, useCallback } from 'react'
import { API_BASE } from '../config'

// ── Homography Projective Geometry Helper ───────────────────────────────────
function project2DToMetric(u, v, H) {
  if (!H || H.length !== 3) return [u, v]
  const denom = H[2][0] * u + H[2][1] * v + H[2][2]
  if (Math.abs(denom) < 1e-6) return [0, 0]
  const xm = (H[0][0] * u + H[0][1] * v + H[0][2]) / denom
  const ym = (H[1][0] * u + H[1][1] * v + H[1][2]) / denom
  return [Number(xm.toFixed(2)), Number(ym.toFixed(2))]
}

export default function ZoneDrawerModal({ cam, onClose }) {
  const [calibration, setCalibration] = useState(null)

  // Preset Zone Category Choice: 'WATCH_ZONE' | 'RESTRICTED_ZONE' | 'FENCE_LINE'
  const [zoneCategory, setZoneCategory] = useState('RESTRICTED_ZONE')
  // Drawing Tool: 'PENCIL' | 'POLYGON' | 'ERASER'
  const [drawTool, setDrawTool] = useState('PENCIL')
  const [zoneName, setZoneName] = useState('Restricted-Alpha')
  const [saved, setSaved] = useState(false)
  const [bgVersion, setBgVersion] = useState(Date.now())

  // Loaded from backend for this camera
  const [savedZones, setSavedZones] = useState([])
  const [savedFences, setSavedFences] = useState([])

  // Points for active Polygon/Line mode: array of [x, y] in canvas coordinates (520x280)
  const [points, setPoints] = useState([])
  // Strokes for active Pencil mode: array of strokes; each stroke is array of [x, y]
  const [strokes, setStrokes] = useState([])

  // Eraser hover position
  const [eraserPos, setEraserPos] = useState(null)

  const canvasRef = useRef(null)
  const isPainting = useRef(false)
  const currentStroke = useRef([])

  // Load existing saved zones & calibration from backend when modal opens
  useEffect(() => {
    let isMounted = true

    fetch(`${API_BASE}/api/v1/zones?camera_id=${cam.id}`)
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return
        if (data && typeof data === 'object') {
          setSavedZones(data.zones || [])
          setSavedFences(data.fences || [])
        }
      })
      .catch(err => console.error('Failed to load existing zones:', err))

    fetch(`${API_BASE}/api/v1/calibration/${cam.id}`)
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return
        if (data && data.status === 'SUCCESS' && data.calibration) {
          setCalibration(data.calibration)
        }
      })
      .catch(err => console.error('Failed to load homography calibration:', err))

    return () => { isMounted = false }
  }, [cam.id])

  // Calibration dimensions
  const mw = calibration?.metric_width_m || 12.0
  const ml = calibration?.metric_length_m || 60.0
  const barrierY = calibration?.barrier_y_m || 2.0

  // Auto-set default zone name on category change
  const handleSelectCategory = (category) => {
    setZoneCategory(category)
    if (category === 'WATCH_ZONE') {
      setZoneName(`Watch-Zone-${cam?.id || '01'}`)
    } else if (category === 'RESTRICTED_ZONE') {
      setZoneName(`Restricted-Zone-${cam?.id || '01'}`)
    } else if (category === 'FENCE_LINE') {
      setZoneName(`Fence-Line-${cam?.id || '01'}`)
    }
  }

  // Active styles based on zoneCategory
  const getCategoryStyles = useCallback(() => {
    if (zoneCategory === 'WATCH_ZONE') {
      return {
        color: '#eab308',
        fill: 'rgba(234, 179, 8, 0.22)',
        label: 'WATCH ZONE',
        severity: 'MEDIUM',
        backendType: 'WATCH'
      }
    }
    if (zoneCategory === 'RESTRICTED_ZONE') {
      return {
        color: '#ef4444',
        fill: 'rgba(239, 68, 68, 0.22)',
        label: 'RESTRICTED ZONE',
        severity: 'CRITICAL',
        backendType: 'RESTRICTED'
      }
    }
    // FENCE_LINE
    return {
      color: '#06b6d4',
      fill: 'rgba(6, 182, 212, 0.15)',
      label: 'VIRTUAL TRIPWIRE / FENCE',
      severity: 'HIGH',
      backendType: 'LINE'
    }
  }, [zoneCategory])

  // Get canvas coordinates from event
  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return [
      Math.round(clientX - rect.left),
      Math.round(clientY - rect.top)
    ]
  }

  // ── Eraser Logic ─────────────────────────────────────────────────────────
  const eraseAtPos = (x, y) => {
    const radius = 24

    setPoints(prev => prev.filter(([px, py]) => Math.hypot(px - x, py - y) > radius))
    setStrokes(prev => prev.filter(stroke => {
      return !stroke.some(([sx, sy]) => Math.hypot(sx - x, sy - y) <= radius)
    }))

    setSavedZones(prev => prev.filter(zone => {
      const rawPts = zone.polygon || []
      const pts = rawPts.map(([px, py]) => [
        (px / 1280.0) * 520.0,
        (py / 720.0) * 280.0
      ])
      return !pts.some(([cx, cy]) => Math.hypot(cx - x, cy - y) <= radius)
    }))

    setSavedFences(prev => prev.filter(fence => {
      const line = fence.line || [[0, 0], [0, 0]]
      const p1 = [(line[0][0] / 1280.0) * 520.0, (line[0][1] / 720.0) * 280.0]
      const p2 = [(line[1][0] / 1280.0) * 520.0, (line[1][1] / 720.0) * 280.0]
      return Math.hypot(p1[0] - x, p1[1] - y) > radius && Math.hypot(p2[0] - x, p2[1] - y) > radius
    }))
  }

  const handleDeleteSavedZone = (zoneId) => {
    setSavedZones(prev => prev.filter(z => (z.zone_id || z.name) !== zoneId))
  }

  const handleDeleteSavedFence = (fenceId) => {
    setSavedFences(prev => prev.filter(f => (f.fence_id || f.name) !== fenceId))
  }

  // ── Mouse / Touch Handlers ───────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const pos = getPos(e, canvas)

    if (drawTool === 'ERASER') {
      isPainting.current = true
      eraseAtPos(pos[0], pos[1])
      return
    }

    if (drawTool === 'PENCIL') {
      e.preventDefault()
      isPainting.current = true
      currentStroke.current = [pos]
    }
  }, [drawTool])

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const pos = getPos(e, canvas)

    if (drawTool === 'ERASER') {
      setEraserPos(pos)
      if (isPainting.current) {
        eraseAtPos(pos[0], pos[1])
      }
      return
    }

    if (drawTool === 'PENCIL' && isPainting.current) {
      e.preventDefault()
      currentStroke.current.push(pos)

      const ctx = canvas.getContext('2d')
      const { color } = getCategoryStyles()
      const prev = currentStroke.current[currentStroke.current.length - 2]
      if (prev) {
        ctx.strokeStyle = color
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(prev[0], prev[1])
        ctx.lineTo(pos[0], pos[1])
        ctx.stroke()
      }
    }
  }, [drawTool, getCategoryStyles])

  const handleMouseUp = useCallback(() => {
    if (!isPainting.current) return
    isPainting.current = false
    if (drawTool === 'PENCIL') {
      if (currentStroke.current.length >= 1) {
        setStrokes(prev => [...prev, [...currentStroke.current]])
      }
      currentStroke.current = []
    }
  }, [drawTool])

  const handleCanvasClick = (e) => {
    if (drawTool === 'ERASER' || drawTool === 'PENCIL') return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.round(e.clientX - rect.left)
    const y = Math.round(e.clientY - rect.top)
    if (drawTool === 'POLYGON') {
      setPoints(prev => [...prev, [x, y]])
    }
  }

  const handleSwitchTool = (newTool) => {
    if (newTool === 'POLYGON' && strokes.length > 0 && points.length === 0) {
      const sampled = strokes.flatMap(s => s.filter((_, i) => i % 3 === 0))
      if (sampled.length >= 3) setPoints(sampled)
    } else if (newTool === 'PENCIL' && points.length > 0 && strokes.length === 0) {
      setStrokes([[...points, points[0]]])
    }
    setDrawTool(newTool)
  }

  const handleClearAll = () => {
    setPoints([])
    setStrokes([])
    setSavedZones([])
    setSavedFences([])
    currentStroke.current = []
    isPainting.current = false
  }

  // ── Render Canvas in 2D ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const { color: activeColor, fill: activeFill, label } = getCategoryStyles()

    // ── 0. 2D TACTICAL GRID OVERLAY ─────────────────────────────────────────
    ctx.strokeStyle = 'rgba(14,165,233,0.08)'
    ctx.lineWidth = 1
    for (let i = 0; i < canvas.width; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke()
    }
    for (let j = 0; j < canvas.height; j += 40) {
      ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(canvas.width, j); ctx.stroke()
    }

    // === 1. DRAW PREVIOUSLY SAVED ZONES ===
    savedZones.forEach((zone, i) => {
      const rawPts = zone.polygon || []
      if (rawPts.length < 3) return

      const pts = rawPts.map(([px, py]) => [
        (px / 1280.0) * 520.0,
        (py / 720.0) * 280.0
      ])

      const isWatch = zone.type === 'WATCH'
      const zColor = isWatch ? '#eab308' : '#ef4444'
      const zFill  = isWatch ? 'rgba(234,179,8,0.22)' : 'rgba(239,68,68,0.22)'

      ctx.strokeStyle = zColor
      ctx.fillStyle = zFill
      ctx.lineWidth = 2

      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      pts.forEach(([x, y]) => ctx.lineTo(x, y))
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Zone Label
      ctx.fillStyle = zColor
      ctx.font = 'bold 9px JetBrains Mono'
      ctx.fillText(`[${isWatch ? 'WATCH' : 'RESTRICTED'}] ${zone.name || `Zone-${i+1}`}`, pts[0][0] + 4, pts[0][1] - 4)
    })

    // === 2. DRAW PREVIOUSLY SAVED FENCES ===
    savedFences.forEach((fence, i) => {
      const line = fence.line || [[0, 0], [0, 0]]
      const p1 = [(line[0][0] / 1280.0) * 520.0, (line[0][1] / 720.0) * 280.0]
      const p2 = [(line[1][0] / 1280.0) * 520.0, (line[1][1] / 720.0) * 280.0]

      ctx.strokeStyle = '#06b6d4'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(p1[0], p1[1])
      ctx.lineTo(p2[0], p2[1])
      ctx.stroke()

      ctx.fillStyle = '#06b6d4'
      ctx.font = 'bold 9px JetBrains Mono'
      ctx.fillText(`[TRIPWIRE] ${fence.name || `Fence-${i+1}`}`, p1[0] + 4, p1[1] - 4)
    })

    // === 3. DRAW ACTIVE PENCIL STROKES ===
    if (strokes.length > 0) {
      strokes.forEach(stroke => {
        if (!stroke || stroke.length === 0) return
        if (stroke.length === 1) {
          ctx.fillStyle = activeColor
          ctx.beginPath()
          ctx.arc(stroke[0][0], stroke[0][1], zoneCategory === 'FENCE_LINE' ? 3.5 : 2.5, 0, Math.PI * 2)
          ctx.fill()
          return
        }
        ctx.strokeStyle = activeColor
        ctx.lineWidth = zoneCategory === 'FENCE_LINE' ? 4 : 3
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(stroke[0][0], stroke[0][1])
        stroke.forEach(([x, y]) => ctx.lineTo(x, y))
        ctx.stroke()
      })
    }

    // === 4. DRAW ACTIVE POLYGON / LINE POINTS ===
    if (points.length > 0) {
      ctx.strokeStyle = activeColor
      ctx.fillStyle = activeFill
      ctx.lineWidth = zoneCategory === 'FENCE_LINE' ? 3.5 : 2.5

      ctx.beginPath()
      ctx.moveTo(points[0][0], points[0][1])
      points.forEach(([x, y]) => ctx.lineTo(x, y))

      if (zoneCategory !== 'FENCE_LINE' && points.length > 2) {
        ctx.closePath()
        ctx.fill()
      }
      ctx.stroke()

      // Vertex dots
      points.forEach(([x, y], idx) => {
        ctx.fillStyle = activeColor
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 10px JetBrains Mono'
        ctx.fillText(`P${idx + 1}`, x + 8, y - 5)
      })
    }

    // === 5. DRAW ERASER BRUSH CURSOR ===
    if (drawTool === 'ERASER' && eraserPos) {
      ctx.strokeStyle = '#ef4444'
      ctx.fillStyle = 'rgba(239, 68, 68, 0.25)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(eraserPos[0], eraserPos[1], 24, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }

    // Mode Banner in Top Left
    ctx.fillStyle = drawTool === 'ERASER' ? '#ef4444' : activeColor
    ctx.font = 'bold 11px JetBrains Mono'
    ctx.fillText(`📹 2D CAMERA PERSPECTIVE · ${drawTool === 'ERASER' ? '🧹 ERASER TOOL' : label}`, 12, 22)
  }, [points, strokes, savedZones, savedFences, zoneCategory, drawTool, eraserPos, getCategoryStyles])

  // ── Save & Sync to Backend ───────────────────────────────────────────────
  const handleSaveZone = async () => {
    const { severity, backendType } = getCategoryStyles()
    let updatedZones = [...savedZones]
    let updatedFences = [...savedFences]

    if (drawTool !== 'ERASER') {
      let backendPoints = points
      if (drawTool === 'PENCIL' && strokes.length > 0) {
        backendPoints = strokes.flatMap(s => s.filter((_, i) => i % 3 === 0))
      }

      if (backendPoints.length > 0) {
        const scaled2DPts = backendPoints.map(([x, y]) => [
          Math.round((x / 520.0) * 1280.0),
          Math.round((y / 280.0) * 720.0)
        ])
        const metricPts = scaled2DPts.map(([px, py]) => project2DToMetric(px, py, calibration?.matrix_h))

        if (backendType === 'LINE' && scaled2DPts.length >= 2) {
          updatedFences.push({
            fence_id: `fence-${Date.now()}`,
            name: zoneName,
            severity,
            line: [scaled2DPts[0], scaled2DPts[scaled2DPts.length - 1]],
            metric_line: [metricPts[0], metricPts[metricPts.length - 1]]
          })
        } else if (scaled2DPts.length >= 3) {
          updatedZones.push({
            zone_id: `zone-${Date.now()}`,
            name: zoneName,
            type: backendType,
            severity,
            polygon: scaled2DPts,
            metric_polygon: metricPts
          })
        }
      }
    }

    try {
      await fetch(`${API_BASE}/api/v1/zones/${cam.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zones: updatedZones,
          fences: updatedFences
        })
      })
    } catch (err) {
      console.error('Error saving zone config:', err)
    }

    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 1000)
  }

  const cursorStyle = drawTool === 'ERASER'
    ? 'crosshair'
    : drawTool === 'PENCIL'
      ? 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="%230ea5e9" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg>\') 0 24, crosshair'
      : 'crosshair'

  return (
    <div className="modal-backdrop">
      <div className="modal-box" style={{ maxWidth: 880 }}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="material-symbols-outlined icon-fill" style={{ color: 'var(--accent)', fontSize: 20 }}>draw</span>
            <span className="modal-title">2D TACTICAL ZONE DRAWER — {cam?.label || 'CAM-01'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              {savedZones.length + savedFences.length} saved item(s) · 2D Camera View
            </span>
            <button className="modal-close-btn" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, padding: 16 }}>
          {/* Main Drawing Canvas Area */}
          <div>
            {/* STEP 1: Select Zone Category */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 700 }}>
                1. CHOOSE ZONE TYPE TO DRAW:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                <button
                  className={`toolbar-btn${zoneCategory === 'WATCH_ZONE' && drawTool !== 'ERASER' ? ' active-warn' : ''}`}
                  style={{ padding: '8px 6px', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  onClick={() => { handleSelectCategory('WATCH_ZONE'); if (drawTool === 'ERASER') setDrawTool('PENCIL') }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#eab308' }}>visibility</span>
                  Watch Zone
                </button>

                <button
                  className={`toolbar-btn${zoneCategory === 'RESTRICTED_ZONE' && drawTool !== 'ERASER' ? ' active-danger' : ''}`}
                  style={{ padding: '8px 6px', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  onClick={() => { handleSelectCategory('RESTRICTED_ZONE'); if (drawTool === 'ERASER') setDrawTool('PENCIL') }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ef4444' }}>block</span>
                  Restricted Zone
                </button>

                <button
                  className={`toolbar-btn${zoneCategory === 'FENCE_LINE' && drawTool !== 'ERASER' ? ' active' : ''}`}
                  style={{ padding: '8px 6px', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  onClick={() => { handleSelectCategory('FENCE_LINE'); if (drawTool === 'ERASER') setDrawTool('PENCIL') }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#06b6d4' }}>show_chart</span>
                  Fence Line
                </button>
              </div>
            </div>

            {/* STEP 2: Choose Drawing Tool (Pencil vs Handles vs Eraser) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 700 }}>
                2. DRAWING &amp; EDITING TOOL:
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className="toolbar-btn"
                  style={{ fontSize: 10, padding: '4px 8px', background: 'rgba(14, 165, 233, 0.15)', borderColor: 'var(--accent)', color: 'var(--accent)' }}
                  onClick={() => setBgVersion(Date.now())}
                  title="Capture current camera frame as canvas backdrop"
                >
                  📸 Snap Frame
                </button>
                <button
                  className={`toolbar-btn${drawTool === 'PENCIL' ? ' active' : ''}`}
                  style={{ fontSize: 10, padding: '4px 8px' }}
                  onClick={() => handleSwitchTool('PENCIL')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 12, marginRight: 2 }}>draw</span>
                  ✏️ Pencil
                </button>
                <button
                  className={`toolbar-btn${drawTool === 'POLYGON' ? ' active' : ''}`}
                  style={{ fontSize: 10, padding: '4px 8px' }}
                  onClick={() => handleSwitchTool('POLYGON')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 12, marginRight: 2 }}>polyline</span>
                  ⬡ Vertices
                </button>
                <button
                  className={`toolbar-btn${drawTool === 'ERASER' ? ' active-danger' : ''}`}
                  style={{ fontSize: 10, padding: '4px 8px' }}
                  onClick={() => handleSwitchTool('ERASER')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 12, marginRight: 2 }}>ink_eraser</span>
                  🧹 Eraser
                </button>
              </div>
            </div>

            {/* Canvas Box with 2D Camera Feed Backdrop */}
            <div style={{ position: 'relative', width: '100%', height: 280, background: '#04070e', border: '1px solid var(--border-light)', borderRadius: 6, overflow: 'hidden' }}>
              <img
                key={`2D-${bgVersion}`}
                src={`${API_BASE}/api/v1/camera/${cam.id}/frame?t=${bgVersion}`}
                alt={`${cam.label} feed background`}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="520" height="280" viewBox="0 0 520 280"><rect width="100%" height="100%" fill="%2304070e"/><path d="M0 0 L520 280 M520 0 L0 280" stroke="%231e293b" stroke-width="1"/><circle cx="260" cy="140" r="60" stroke="%230ea5e9" stroke-width="1" fill="none" stroke-dasharray="4 4"/><text x="50%" y="48%" fill="%2338bdf8" font-family="monospace" font-size="12" text-anchor="middle">TACTICAL CAMERA FEED</text><text x="50%" y="58%" fill="%2364748b" font-family="monospace" font-size="10" text-anchor="middle">LIVE 2D VIEW</text></svg>`;
                }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: 0.88,
                  filter: 'brightness(1.05) contrast(1.05)',
                }}
              />

              {/* Interactive Canvas */}
              <canvas
                ref={canvasRef}
                width={520}
                height={280}
                onClick={handleCanvasClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleMouseDown}
                onTouchMove={handleMouseMove}
                onTouchEnd={handleMouseUp}
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  cursor: cursorStyle,
                  touchAction: 'none',
                }}
              />

              {/* Mode hint overlay */}
              <div style={{
                position: 'absolute', bottom: 6, left: 8,
                fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.7)',
                pointerEvents: 'none', background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: 3
              }}>
                {drawTool === 'ERASER'
                  ? '🧹 ERASER MODE — Click or drag over any zone/line to erase it'
                  : drawTool === 'PENCIL'
                    ? '✏️ PENCIL MODE — Click & drag to draw custom freehand contours'
                    : '⬡ VERTICES MODE — Click on frame to place corner points'}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              <span>
                {drawTool === 'ERASER'
                  ? '🧹 Eraser active · Click items to delete'
                  : drawTool === 'PENCIL'
                    ? `✏️ Freehand mode · ${strokes.length} stroke(s)`
                    : `⬡ Handle mode · ${points.length} vertex point(s)`}
              </span>
              <span style={{ color: getCategoryStyles().color, fontWeight: 700 }}>
                {savedZones.length + savedFences.length} SAVED ITEM(S)
              </span>
            </div>
          </div>

          {/* Right Control Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 400, overflowY: 'auto' }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 4 }}>NEW ZONE / FENCE NAME</label>
              <input
                type="text"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}
              />
            </div>

            {/* Metric Dimensions Panel */}
            <div style={{ background: 'var(--bg-surface)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>straighten</span>
                GROUND TELEMETRY SPECS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                <div>Width: <span style={{ color: 'var(--text-bright)' }}>{mw}m</span></div>
                <div>Depth: <span style={{ color: 'var(--text-bright)' }}>{ml}m</span></div>
                <div>Barrier: <span style={{ color: '#ef4444' }}>{barrierY}m</span></div>
                <div>Math: <span style={{ color: '#38bdf8' }}>H(3x3)</span></div>
              </div>
            </div>

            {/* List of Existing Saved Zones & Fences */}
            <div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                <span>SAVED ZONES &amp; TRIPWIRES</span>
                <span style={{ color: 'var(--accent)' }}>{savedZones.length + savedFences.length} Total</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
                {savedZones.length === 0 && savedFences.length === 0 ? (
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic' }}>No saved zones yet. Draw and save below.</span>
                ) : (
                  <>
                    {savedZones.map((z, idx) => {
                      const isWatch = z.type === 'WATCH'
                      const tagColor = isWatch ? '#eab308' : '#ef4444'
                      const idKey = z.zone_id || z.name || `z-${idx}`
                      return (
                        <div key={idKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', background: 'var(--bg-card)', borderRadius: 4, fontSize: 9, fontFamily: 'var(--font-mono)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: tagColor, display: 'inline-block' }} />
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{z.name || `Zone-${idx+1}`}</span>
                          </div>
                          <button
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11 }}
                            onClick={() => handleDeleteSavedZone(idKey)}
                            title="Erase / Delete Zone"
                          >
                            🗑️
                          </button>
                        </div>
                      )
                    })}

                    {savedFences.map((f, idx) => {
                      const idKey = f.fence_id || f.name || `f-${idx}`
                      return (
                        <div key={idKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', background: 'var(--bg-card)', borderRadius: 4, fontSize: 9, fontFamily: 'var(--font-mono)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4', display: 'inline-block' }} />
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{f.name || `Fence-${idx+1}`}</span>
                          </div>
                          <button
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11 }}
                            onClick={() => handleDeleteSavedFence(idKey)}
                            title="Erase / Delete Fence"
                          >
                            🗑️
                          </button>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn-ghost" style={{ flex: 1, fontSize: 10 }} onClick={handleClearAll}>Clear All</button>
              <button
                className="btn-accent"
                style={{ flex: 1, fontSize: 10 }}
                onClick={handleSaveZone}
              >
                {saved ? 'Saved ✓' : 'Save & Sync'}
              </button>
            </div>

            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', lineHeight: 1.4, padding: '8px', background: 'var(--bg-surface)', borderRadius: 4, border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>2D CAMERA ZONE DRAWING</div>
              <div>• Draw directly on the live 2D CCTV camera feed</div>
              <div>• Use ✏️ Pencil for freehand contours or ⬡ Vertices for polygon corners</div>
              <div>• Zones are projected to physical ground coordinates via Homography H(3x3)</div>
              <div>• Evaluates ground footpoint contact for zero false alarms</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
