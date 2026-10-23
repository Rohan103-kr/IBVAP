import React, { useState, useRef, useEffect, useCallback } from 'react'
import { API_BASE } from '../config'

// ── Mathematical Homography Solvers (8x8 Linear System via Gaussian Elimination) ──
function solve8x8(A, B) {
  const n = 8
  const M = A.map((row, i) => [...row, B[i]])

  for (let i = 0; i < n; i++) {
    let maxRow = i
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k
      }
    }
    if (Math.abs(M[maxRow][i]) < 1e-12) return null
    if (maxRow !== i) {
      const temp = M[i]
      M[i] = M[maxRow]
      M[maxRow] = temp
    }

    const pivot = M[i][i]
    for (let j = i; j <= n; j++) {
      M[i][j] /= pivot
    }

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = M[k][i]
        for (let j = i; j <= n; j++) {
          M[k][j] -= factor * M[i][j]
        }
      }
    }
  }
  return M.map(row => row[n])
}

function computeHomography(srcPts, dstPts) {
  if (!srcPts || !dstPts || srcPts.length !== 4 || dstPts.length !== 4) return null
  const A = []
  const B = []

  for (let i = 0; i < 4; i++) {
    const [x, y] = srcPts[i]
    const [u, v] = dstPts[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    B.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    B.push(v)
  }

  const h = solve8x8(A, B)
  if (!h) return null
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1.0]
  ]
}

function projectPoint(H, x, y) {
  if (!H) return null
  const w = H[2][0] * x + H[2][1] * y + H[2][2]
  if (Math.abs(w) < 1e-9) return null
  const u = (H[0][0] * x + H[0][1] * y + H[0][2]) / w
  const v = (H[1][0] * x + H[1][1] * y + H[1][2]) / w
  return [u, v]
}

// ── Standard Calibration Presets ──
const PRESETS = [
  {
    id: 'toll_gate',
    name: 'Toll Gate Approach',
    icon: 'toll',
    points: [[320, 240], [960, 240], [1180, 710], [100, 710]],
    width: 8.5,
    length: 35.0,
    barrier: 12.0
  },
  {
    id: 'perimeter_fence',
    name: 'Perimeter Fence Trench',
    icon: 'security',
    points: [[380, 180], [900, 180], [1220, 710], [60, 710]],
    width: 15.0,
    length: 50.0,
    barrier: 25.0
  },
  {
    id: 'highway_corridor',
    name: 'Highway Approach (Long Range)',
    icon: 'speed',
    points: [[440, 200], [840, 200], [1150, 715], [130, 715]],
    width: 12.0,
    length: 60.0,
    barrier: 30.0
  },
  {
    id: 'inspection_chokepoint',
    name: 'Security Checkpoint',
    icon: 'verified_user',
    points: [[340, 280], [940, 280], [1100, 700], [180, 700]],
    width: 6.0,
    length: 22.0,
    barrier: 8.0
  }
]

export default function GroundCalibrationModal({
  cam,
  cameraId,
  isOpen = true,
  onClose,
  onSaveSuccess
}) {
  // Resolve Camera ID & Label safely from both prop conventions
  const camId = (typeof cam === 'object' ? cam?.id : cam) || cameraId || 'CAM-01'
  const camLabel = (typeof cam === 'object' ? (cam?.label || cam?.name) : null) || `Tactical Camera ${camId}`

  // 4 perspective ground corners [Far-Left, Far-Right, Near-Right, Near-Left]
  const [points, setPoints] = useState([
    [320, 240],   // 0. Far Left
    [960, 240],   // 1. Far Right
    [1180, 710],  // 2. Near Right
    [100, 710]    // 3. Near Left
  ])

  // Metric dimensions
  const [metricWidth, setMetricWidth] = useState(8.5)
  const [metricLength, setMetricLength] = useState(35.0)
  const [barrierDist, setBarrierDist] = useState(12.0)

  // Interaction states
  const [activePointIdx, setActivePointIdx] = useState(0)
  const [hoveredPointIdx, setHoveredPointIdx] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showLoupe, setShowLoupe] = useState(true)
  const [showGuidelines, setShowGuidelines] = useState(true)
  const [activePreset, setActivePreset] = useState('toll_gate')

  // Status & Telemetry
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // { type: 'success'|'error', text: '' }
  const [snapshotTimestamp, setSnapshotTimestamp] = useState(Date.now())
  const [imgError, setImgError] = useState(false)

  // Simulation state for top-down radar preview
  const [simVehiclePos, setSimVehiclePos] = useState({ y: 32.0, speedKmh: 42 })

  // DOM Refs
  const canvasRef = useRef(null)
  const radarCanvasRef = useRef(null)
  const containerRef = useRef(null)
  const animFrameRef = useRef(null)
  const dragStartRef = useRef({ activeIdx: null, startX: 0, startY: 0, origPoints: null })

  // Fetch current camera calibration from backend on mount
  useEffect(() => {
    let isMounted = true
    fetch(`${API_BASE}/api/v1/calibration/${camId}`)
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return
        if (data && data.status === 'SUCCESS' && data.calibration) {
          const c = data.calibration
          if (Array.isArray(c.src_points) && c.src_points.length === 4) {
            setPoints(c.src_points)
          }
          if (c.metric_width_m) setMetricWidth(Number(c.metric_width_m))
          if (c.metric_length_m) setMetricLength(Number(c.metric_length_m))
          if (c.barrier_y_m) setBarrierDist(Number(c.barrier_y_m))
        }
      })
      .catch(err => {
        console.warn(`Could not load existing calibration for ${camId}, using defaults:`, err)
      })

    return () => { isMounted = false }
  }, [camId])

  // Vehicle simulation loop in top-down BEV preview
  useEffect(() => {
    let lastTime = performance.now()
    const updateSim = (time) => {
      const dt = Math.min(0.1, (time - lastTime) / 1000)
      lastTime = time

      setSimVehiclePos(prev => {
        const speedMps = (prev.speedKmh * 1000) / 3600
        let newY = prev.y - speedMps * dt
        // Reset when passing barrier or near bottom
        if (newY < 0.5) {
          newY = metricLength
        }
        return { ...prev, y: newY }
      })

      animFrameRef.current = requestAnimationFrame(updateSim)
    }

    animFrameRef.current = requestAnimationFrame(updateSim)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [metricLength])

  // ── Keyboard nudge control for active point ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (activePointIdx === null || activePointIdx === undefined) return
      // Ignore if user is typing in an input
      if (e.target.tagName === 'INPUT') return

      const step = e.shiftKey ? 10 : 1
      let dx = 0
      let dy = 0

      if (e.key === 'ArrowLeft') dx = -step
      else if (e.key === 'ArrowRight') dx = step
      else if (e.key === 'ArrowUp') dy = -step
      else if (e.key === 'ArrowDown') dy = step
      else if (e.key === 'Tab') {
        e.preventDefault()
        setActivePointIdx((prev) => ((prev ?? 0) + (e.shiftKey ? 3 : 1)) % 4)
        return
      } else {
        return
      }

      e.preventDefault()
      setPoints(prev => {
        const next = [...prev]
        const [curX, curY] = next[activePointIdx]
        next[activePointIdx] = [
          Math.max(0, Math.min(1280, curX + dx)),
          Math.max(0, Math.min(720, curY + dy))
        ]
        return next
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activePointIdx])

  // ── Draw Main Camera Perspective Overlay ──
  const drawPerspectiveOverlay = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    if (!points || points.length < 4) return

    const [p0, p1, p2, p3] = points

    // 1. Shaded Ground Quadrilateral
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(p0[0], p0[1])
    ctx.lineTo(p1[0], p1[1])
    ctx.lineTo(p2[0], p2[1])
    ctx.lineTo(p3[0], p3[1])
    ctx.closePath()

    // Semi-transparent gradient cyan/emerald ground mesh
    const grad = ctx.createLinearGradient(0, p0[1], 0, p3[1])
    grad.addColorStop(0, 'rgba(14, 165, 233, 0.10)')
    grad.addColorStop(1, 'rgba(16, 185, 129, 0.16)')
    ctx.fillStyle = grad
    ctx.fill()

    // Glowing border outline
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#38bdf8'
    ctx.shadowColor = '#0284c7'
    ctx.shadowBlur = 10
    ctx.stroke()
    ctx.restore()

    // 2. Perspective Guidelines (Lateral lane subdivisions and longitudinal range steps)
    if (showGuidelines) {
      ctx.save()
      // Longitudinal perspective lane dividers (3 lines -> 4 lanes)
      for (let i = 1; i <= 3; i++) {
        const t = i / 4.0
        const fx = p0[0] + (p1[0] - p0[0]) * t
        const fy = p0[1] + (p1[1] - p0[1]) * t
        const nx = p3[0] + (p2[0] - p3[0]) * t
        const ny = p3[1] + (p2[1] - p3[1]) * t

        ctx.beginPath()
        ctx.setLineDash([4, 4])
        ctx.moveTo(fx, fy)
        ctx.lineTo(nx, ny)
        ctx.lineWidth = 1.2
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)'
        ctx.stroke()
      }

      // Transverse perspective distance rings (at 25%, 50%, 75% depth)
      const depthTicks = [0.25, 0.5, 0.75]
      depthTicks.forEach((ratio) => {
        // Perspective interpolation: near is p3-p2 (ratio 0), far is p0-p1 (ratio 1)
        const lx = p3[0] + (p0[0] - p3[0]) * ratio
        const ly = p3[1] + (p0[1] - p3[1]) * ratio
        const rx = p2[0] + (p1[0] - p2[0]) * ratio
        const ry = p2[1] + (p1[1] - p2[1]) * ratio

        ctx.beginPath()
        ctx.setLineDash([2, 4])
        ctx.moveTo(lx, ly)
        ctx.lineTo(rx, ry)
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)'
        ctx.stroke()

        const distM = (metricLength * ratio).toFixed(1)
        ctx.font = '9px JetBrains Mono, monospace'
        ctx.fillStyle = 'rgba(148, 163, 184, 0.7)'
        ctx.fillText(`${distM}m`, lx + 6, ly - 3)
      })
      ctx.restore()
    }

    // 3. Barrier / Chokepoint Transverse Line (Red Hazard Striping)
    const bRatio = Math.max(0, Math.min(1, barrierDist / (metricLength || 35.0)))
    const bx1 = p3[0] + (p0[0] - p3[0]) * bRatio
    const by1 = p3[1] + (p0[1] - p3[1]) * bRatio
    const bx2 = p2[0] + (p1[0] - p2[0]) * bRatio
    const by2 = p2[1] + (p1[1] - p2[1]) * bRatio

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(bx1, by1)
    ctx.lineTo(bx2, by2)
    ctx.lineWidth = 3
    ctx.strokeStyle = '#ef4444'
    ctx.shadowColor = '#dc2626'
    ctx.shadowBlur = 12
    ctx.stroke()

    // Barrier Banner HUD
    const labelX = (bx1 + bx2) / 2
    const labelY = (by1 + by2) / 2
    ctx.font = 'bold 11px Inter, sans-serif'
    ctx.textAlign = 'center'
    const bText = `🛑 CHOKEPOINT / BARRIER: ${barrierDist}m`
    const bTextW = ctx.measureText(bText).width

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
    ctx.fillRect(labelX - bTextW / 2 - 8, labelY - 18, bTextW + 16, 20)
    ctx.lineWidth = 1
    ctx.strokeStyle = '#ef4444'
    ctx.strokeRect(labelX - bTextW / 2 - 8, labelY - 18, bTextW + 16, 20)

    ctx.fillStyle = '#f87171'
    ctx.fillText(bText, labelX, labelY - 4)
    ctx.restore()

    // 4. Interactive Corner Handles
    const handleLabels = [
      'P1: Far Left (Top-L)',
      'P2: Far Right (Top-R)',
      'P3: Near Right (Btm-R)',
      'P4: Near Left (Btm-L)'
    ]

    points.forEach(([px, py], idx) => {
      const isActive = activePointIdx === idx
      const isHovered = hoveredPointIdx === idx

      ctx.save()

      // Target ring aura
      if (isActive || isHovered) {
        ctx.beginPath()
        ctx.arc(px, py, isActive ? 18 : 14, 0, Math.PI * 2)
        ctx.fillStyle = isActive ? 'rgba(251, 191, 36, 0.25)' : 'rgba(56, 189, 248, 0.25)'
        ctx.fill()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = isActive ? '#fbbf24' : '#38bdf8'
        ctx.stroke()
      }

      // Crosshair Reticle on Active
      if (isActive) {
        ctx.beginPath()
        ctx.moveTo(px - 22, py)
        ctx.lineTo(px + 22, py)
        ctx.moveTo(px, py - 22)
        ctx.lineTo(px, py + 22)
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)'
        ctx.stroke()
      }

      // Main handle center dot
      ctx.beginPath()
      ctx.arc(px, py, isActive ? 9 : 7, 0, Math.PI * 2)
      ctx.fillStyle = isActive ? '#fbbf24' : '#38bdf8'
      ctx.fill()
      ctx.lineWidth = 2.5
      ctx.strokeStyle = '#0f172a'
      ctx.stroke()

      // Label Tag Box
      const tagText = handleLabels[idx]
      ctx.font = 'bold 10px JetBrains Mono, monospace'
      ctx.textAlign = 'left'
      const tagW = ctx.measureText(tagText).width
      const tagX = idx % 2 === 0 ? px - tagW - 14 : px + 14
      const tagY = idx < 2 ? py - 8 : py + 16

      ctx.fillStyle = isActive ? 'rgba(245, 158, 11, 0.92)' : 'rgba(15, 23, 42, 0.88)'
      ctx.fillRect(tagX - 4, tagY - 11, tagW + 8, 16)
      ctx.lineWidth = 1
      ctx.strokeStyle = isActive ? '#fbbf24' : '#38bdf8'
      ctx.strokeRect(tagX - 4, tagY - 11, tagW + 8, 16)

      ctx.fillStyle = isActive ? '#0f172a' : '#f8fafc'
      ctx.fillText(tagText, tagX, tagY + 1)

      ctx.restore()
    })
  }, [points, activePointIdx, hoveredPointIdx, showGuidelines, barrierDist, metricLength])

  // ── Draw Top-Down BEV Metric Radar Canvas ──
  const drawBevRadarPreview = useCallback(() => {
    const canvas = radarCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height

    ctx.clearRect(0, 0, w, h)

    // Dark military radar background with subtle circular grid
    ctx.fillStyle = '#060a12'
    ctx.fillRect(0, 0, w, h)

    // Radar coordinate parameters
    const padX = 28
    const padY = 24
    const drawW = w - padX * 2
    const drawH = h - padY * 2

    const maxLen = metricLength > 0 ? metricLength : 35.0
    const maxWid = metricWidth > 0 ? metricWidth : 8.5

    // Helper: Ground Metric (X: -maxWid/2 .. +maxWid/2, Y: 0 .. maxLen) to Radar Canvas (x, y)
    // In our coordinate system: Y=0 is near (bottom), Y=maxLen is far (top)
    const groundToRadar = (mx, my) => {
      const normX = (mx + maxWid / 2) / maxWid
      const normY = (my) / maxLen
      const rx = padX + normX * drawW
      const ry = padY + (1 - normY) * drawH
      return [rx, ry]
    }

    // 1. Grid lines (Distance range rings in meters)
    ctx.save()
    const stepM = maxLen > 40 ? 10 : 5
    for (let m = 0; m <= maxLen; m += stepM) {
      const [, ry] = groundToRadar(0, m)
      ctx.beginPath()
      ctx.moveTo(padX, ry)
      ctx.lineTo(padX + drawW, ry)
      ctx.lineWidth = 1
      ctx.strokeStyle = m === 0 ? 'rgba(56, 189, 248, 0.4)' : 'rgba(30, 45, 65, 0.7)'
      ctx.stroke()

      ctx.font = '9px JetBrains Mono, monospace'
      ctx.fillStyle = '#64748b'
      ctx.textAlign = 'right'
      ctx.fillText(`${m}m`, padX - 4, ry + 3)
    }

    // Lane border lines
    const [leftX] = groundToRadar(-maxWid / 2, 0)
    const [rightX] = groundToRadar(maxWid / 2, 0)
    const [centerX] = groundToRadar(0, 0)

    // Left & Right curbs
    ctx.lineWidth = 2
    ctx.strokeStyle = '#38bdf8'
    ctx.strokeRect(leftX, padY, rightX - leftX, drawH)

    // Center divider
    ctx.beginPath()
    ctx.setLineDash([4, 4])
    ctx.moveTo(centerX, padY)
    ctx.lineTo(centerX, padY + drawH)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'
    ctx.stroke()
    ctx.restore()

    // 2. Barrier Line in Radar (Red Bar)
    const [, barrierRy] = groundToRadar(0, barrierDist)
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(leftX, barrierRy)
    ctx.lineTo(rightX, barrierRy)
    ctx.lineWidth = 3.5
    ctx.strokeStyle = '#ef4444'
    ctx.shadowColor = '#dc2626'
    ctx.shadowBlur = 8
    ctx.stroke()

    ctx.font = 'bold 9px Inter, sans-serif'
    ctx.fillStyle = '#f87171'
    ctx.textAlign = 'left'
    ctx.fillText(`🛑 BARRIER ${barrierDist}m`, rightX + 6, barrierRy + 3)
    ctx.restore()

    // 3. Simulated Moving Target (Demonstrating Ground Velocity & Footpoint Anchoring)
    const simY = simVehiclePos.y
    const [vehRx, vehRy] = groundToRadar(0, simY)
    const distToBarrier = simY - barrierDist

    ctx.save()
    // Target pulse halo
    ctx.beginPath()
    ctx.arc(vehRx, vehRy, 10, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)'
    ctx.fill()

    // Target blip
    ctx.beginPath()
    ctx.arc(vehRx, vehRy, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#38bdf8'
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()

    // Velocity vector line forward
    ctx.beginPath()
    ctx.moveTo(vehRx, vehRy)
    ctx.lineTo(vehRx, vehRy + 14)
    ctx.lineWidth = 2
    ctx.strokeStyle = '#38bdf8'
    ctx.stroke()

    // Telemetry badge
    const badgeText = `${simVehiclePos.speedKmh} km/h | ${distToBarrier > 0 ? `${distToBarrier.toFixed(1)}m to Gate` : 'PASSED'}`
    ctx.font = 'bold 9px JetBrains Mono, monospace'
    ctx.fillStyle = '#38bdf8'
    ctx.textAlign = 'center'
    ctx.fillText(badgeText, vehRx, vehRy - 12)
    ctx.restore()

    // 4. Radar HUD Header / Title
    ctx.font = '9px JetBrains Mono, monospace'
    ctx.fillStyle = '#94a3b8'
    ctx.textAlign = 'left'
    ctx.fillText('TOP-DOWN EUCLIDEAN GROUND RADAR (1:1 METRIC)', 8, 14)
  }, [metricLength, metricWidth, barrierDist, simVehiclePos])

  // Trigger canvas renders
  useEffect(() => {
    drawPerspectiveOverlay()
  }, [drawPerspectiveOverlay])

  useEffect(() => {
    drawBevRadarPreview()
  }, [drawBevRadarPreview])

  // ── Mouse & Touch Drag-and-Drop Handlers ──
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: Math.round((clientX - rect.left) * scaleX),
      y: Math.round((clientY - rect.top) * scaleY),
      cssDist: (px, py) => {
        const screenPx = rect.left + (px / canvas.width) * rect.width
        const screenPy = rect.top + (py / canvas.height) * rect.height
        return Math.hypot(clientX - screenPx, clientY - screenPy)
      }
    }
  }

  const handlePointerDown = (e) => {
    e.preventDefault()
    const { x, y, cssDist } = getCanvasCoords(e)

    // Check hit within 28 CSS screen pixels
    let bestIdx = null
    let minScreenDist = 28
    for (let i = 0; i < points.length; i++) {
      const [px, py] = points[i]
      const dist = cssDist(px, py)
      if (dist < minScreenDist) {
        minScreenDist = dist
        bestIdx = i
      }
    }

    if (bestIdx !== null) {
      setActivePointIdx(bestIdx)
      setIsDragging(true)
      dragStartRef.current = {
        activeIdx: bestIdx,
        startX: x,
        startY: y,
        origPoints: [...points]
      }
    } else {
      // Find closest point and jump to click location
      let closestIdx = 0
      let minDist = 999999
      points.forEach(([px, py], i) => {
        const d = Math.hypot(x - px, y - py)
        if (d < minDist) {
          minDist = d
          closestIdx = i
        }
      })
      setActivePointIdx(closestIdx)
      setIsDragging(true)
      setPoints(prev => {
        const next = [...prev]
        next[closestIdx] = [Math.max(0, Math.min(1280, x)), Math.max(0, Math.min(720, y))]
        return next
      })
    }
  }

  const handlePointerMove = (e) => {
    const { x, y, cssDist } = getCanvasCoords(e)

    if (!isDragging) {
      // Check hover
      let foundHover = null
      for (let i = 0; i < points.length; i++) {
        const [px, py] = points[i]
        if (cssDist(px, py) < 28) {
          foundHover = i
          break
        }
      }
      setHoveredPointIdx(foundHover)
      return
    }

    if (activePointIdx === null || activePointIdx === undefined) return

    setPoints(prev => {
      const next = [...prev]
      next[activePointIdx] = [
        Math.max(0, Math.min(1280, x)),
        Math.max(0, Math.min(720, y))
      ]
      return next
    })
  }

  const handlePointerUp = () => {
    setIsDragging(false)
  }

  // Global window pointer listeners for smooth dragging outside canvas
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e) => handlePointerMove(e)
    const onUp = () => handlePointerUp()

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [isDragging, activePointIdx])

  // ── Apply Preset ──
  const applyPreset = (presetId) => {
    const p = PRESETS.find(item => item.id === presetId)
    if (!p) return
    setActivePreset(presetId)
    setPoints(p.points.map(pt => [...pt]))
    setMetricWidth(p.width)
    setMetricLength(p.length)
    setBarrierDist(p.barrier)
  }

  // ── Reset to Defaults ──
  const handleResetDefaults = () => {
    applyPreset('toll_gate')
  }

  // ── Save Calibration to Backend API ──
  const handleSave = async () => {
    setSaving(true)
    setSaveStatus(null)
    try {
      const payload = {
        src_points: points,
        metric_width_m: parseFloat(metricWidth) || 8.5,
        metric_length_m: parseFloat(metricLength) || 35.0,
        barrier_y_m: parseFloat(barrierDist) || 12.0
      }

      const res = await fetch(`${API_BASE}/api/v1/calibration/${camId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (data && data.status === 'SUCCESS') {
        setSaveStatus({ type: 'success', text: `✓ Homography calibration saved for ${camId}!` })
        if (onSaveSuccess) onSaveSuccess()
        setTimeout(() => setSaveStatus(null), 3500)
      } else {
        setSaveStatus({ type: 'error', text: `Failed to save calibration: ${data?.message || 'Unknown error'}` })
      }
    } catch (err) {
      console.error('Error saving calibration:', err)
      setSaveStatus({ type: 'error', text: `Network error: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  // Active point coordinates
  const activePt = activePointIdx !== null && points[activePointIdx] ? points[activePointIdx] : [0, 0]

  if (!isOpen) return null

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 10, 20, 0.82)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal-box"
        style={{
          background: 'var(--bg-panel, #0f172a)',
          border: '1px solid var(--border, rgba(255,255,255,0.14))',
          borderRadius: '14px',
          width: '96vw',
          maxWidth: '1240px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
          overflow: 'hidden',
          color: 'var(--text-primary, #f8fafc)'
        }}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            height: '56px',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface, #1e293b)',
            borderBottom: '1px solid var(--border, rgba(255,255,255,0.1))',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.2)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>square_foot</span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', letterSpacing: '0.02em', color: 'var(--text-primary, #f8fafc)' }}>
                  4-Point Ground Perspective & Homography Calibration
                </h3>
                <span style={{
                  background: 'rgba(14, 165, 233, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  fontSize: '11px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: '600',
                  padding: '1px 8px',
                  borderRadius: '4px'
                }}>
                  {camId}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)' }}>
                  — {camLabel}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setSnapshotTimestamp(Date.now())}
              className="btn"
              title="Refresh Camera Frame Snapshot"
              style={{
                background: 'var(--bg-card, #1e293b)',
                border: '1px solid var(--border, rgba(255,255,255,0.12))',
                color: 'var(--text-secondary, #94a3b8)',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>sync</span>
              Refresh Frame
            </button>
            <button
              onClick={onClose}
              className="modal-close-btn"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted, #94a3b8)',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Main Content (2-Column Grid) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(360px, 1fr)',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden'
        }}>
          {/* Left Column: Interactive Perspective Canvas */}
          <div style={{
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            borderRight: '1px solid var(--border, rgba(255,255,255,0.1))',
            background: '#04070e',
            overflowY: 'auto'
          }}>
            {/* Camera Viewport Canvas Container */}
            <div
              ref={containerRef}
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16 / 9',
                background: '#080d1a',
                borderRadius: '10px',
                overflow: 'hidden',
                boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
                userSelect: 'none'
              }}
            >
              {/* Live stream / snapshot backdrop */}
              <img
                key={snapshotTimestamp}
                src={`${API_BASE}/api/v1/camera/${camId}/frame?t=${snapshotTimestamp}`}
                alt={`${camId} Frame Backdrop`}
                onError={() => setImgError(true)}
                onLoad={() => setImgError(false)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  opacity: imgError ? 0.2 : 0.9,
                  filter: 'contrast(1.05) brightness(1.02)'
                }}
              />

              {/* Fallback Tactical Grid if image stream is connecting or unavailable */}
              {imgError && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                  fontSize: '12px',
                  background: 'repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(56,189,248,0.05) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(56,189,248,0.05) 40px)'
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '32px', marginBottom: '6px', color: '#0284c7' }}>videocam</span>
                  <span>Synthetic Calibration Plane ({camId})</span>
                  <span style={{ fontSize: '10px', color: '#475569' }}>Live RTSP Stream Offline — Standalone Metric Mode Active</span>
                </div>
              )}

              {/* Interactive Vector Overlay Canvas */}
              <canvas
                ref={canvasRef}
                width={1280}
                height={720}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  cursor: isDragging ? 'grabbing' : (hoveredPointIdx !== null ? 'grab' : 'crosshair'),
                  touchAction: 'none'
                }}
              />

              {/* HUD Status Bar in Camera Frame */}
              <div style={{
                position: 'absolute',
                top: '10px',
                left: '12px',
                background: 'rgba(15, 23, 42, 0.78)',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontFamily: 'JetBrains Mono, monospace',
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                <span>PLANE H(3x3): READY</span>
                <span style={{ color: '#64748b' }}>|</span>
                <span style={{ color: '#f8fafc' }}>
                  ACTIVE: P{activePointIdx + 1} [{activePt[0]}, {activePt[1]}]
                </span>
              </div>
            </div>

            {/* Instruction / Fine-Tune Nudge Controls Under Canvas */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'var(--bg-surface, #1e293b)',
              border: '1px solid var(--border, rgba(255,255,255,0.08))',
              borderRadius: '8px',
              fontSize: '11px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary, #94a3b8)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#38bdf8' }}>touch_app</span>
                <span>Click & drag handles 1–4 to align with road edges. Use Arrow Keys for 1px pixel-perfect nudge.</span>
              </div>

              {/* Point selector tabs */}
              <div style={{ display: 'flex', gap: '4px' }}>
                {[0, 1, 2, 3].map(idx => (
                  <button
                    key={idx}
                    onClick={() => setActivePointIdx(idx)}
                    style={{
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontFamily: 'JetBrains Mono, monospace',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      border: activePointIdx === idx ? '1px solid #fbbf24' : '1px solid var(--border, rgba(255,255,255,0.1))',
                      background: activePointIdx === idx ? '#fbbf24' : 'rgba(255,255,255,0.04)',
                      color: activePointIdx === idx ? '#0f172a' : 'var(--text-primary, #f8fafc)',
                      fontWeight: '700'
                    }}
                  >
                    P{idx + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: BEV Radar Preview & Metric Telemetry Settings */}
          <div style={{
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            overflowY: 'auto',
            background: 'var(--bg-panel, #0f172a)'
          }}>
            {/* Top-Down BEV Radar Simulation Canvas */}
            <div style={{
              background: '#060a12',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '8px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{
                padding: '6px 12px',
                background: 'rgba(15, 23, 42, 0.9)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px'
              }}>
                <span style={{ fontWeight: '700', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>radar</span>
                  REAL-TIME TOP-DOWN BEV RADAR
                </span>
                <span style={{ fontSize: '10px', color: '#10b981', fontFamily: 'JetBrains Mono, monospace' }}>
                  FOOTPOINT ANCHORED
                </span>
              </div>

              <div style={{ width: '100%', height: '175px', position: 'relative' }}>
                <canvas
                  ref={radarCanvasRef}
                  width={420}
                  height={175}
                  style={{ width: '100%', height: '100%', display: 'block' }}
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div style={{
              background: 'var(--bg-surface, #1e293b)',
              border: '1px solid var(--border, rgba(255,255,255,0.08))',
              borderRadius: '8px',
              padding: '10px 12px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary, #94a3b8)', marginBottom: '8px', letterSpacing: '0.04em' }}>
                CALIBRATION PRESETS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id)}
                    style={{
                      padding: '6px 8px',
                      fontSize: '11px',
                      textAlign: 'left',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      border: activePreset === p.id ? '1px solid #38bdf8' : '1px solid var(--border, rgba(255,255,255,0.1))',
                      background: activePreset === p.id ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255,255,255,0.03)',
                      color: activePreset === p.id ? '#38bdf8' : 'var(--text-primary, #f8fafc)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{p.icon}</span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Metric Dimensions Configuration */}
            <div style={{
              background: 'var(--bg-surface, #1e293b)',
              border: '1px solid var(--border, rgba(255,255,255,0.08))',
              borderRadius: '8px',
              padding: '12px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary, #94a3b8)', marginBottom: '10px', letterSpacing: '0.04em' }}>
                METRIC GROUND TELEMETRY PARAMETERS
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Lane Width */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                    <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Physical Road Width:</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#38bdf8', fontWeight: '600' }}>{metricWidth} m</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="range"
                      min="3.0"
                      max="30.0"
                      step="0.5"
                      value={metricWidth}
                      onChange={(e) => setMetricWidth(parseFloat(e.target.value))}
                      style={{ flex: 1, accentColor: '#38bdf8' }}
                    />
                    <input
                      type="number"
                      step="0.5"
                      value={metricWidth}
                      onChange={(e) => setMetricWidth(parseFloat(e.target.value) || 0)}
                      style={{
                        width: '65px',
                        padding: '3px 6px',
                        fontSize: '11px',
                        fontFamily: 'JetBrains Mono, monospace',
                        background: 'var(--bg-card, #0f172a)',
                        border: '1px solid var(--border, rgba(255,255,255,0.15))',
                        color: 'var(--text-primary, #f8fafc)',
                        borderRadius: '4px'
                      }}
                    />
                  </div>
                </div>

                {/* Perspective Depth */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                    <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Road Perspective Depth:</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#38bdf8', fontWeight: '600' }}>{metricLength} m</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="range"
                      min="10.0"
                      max="100.0"
                      step="1.0"
                      value={metricLength}
                      onChange={(e) => setMetricLength(parseFloat(e.target.value))}
                      style={{ flex: 1, accentColor: '#38bdf8' }}
                    />
                    <input
                      type="number"
                      step="1.0"
                      value={metricLength}
                      onChange={(e) => setMetricLength(parseFloat(e.target.value) || 0)}
                      style={{
                        width: '65px',
                        padding: '3px 6px',
                        fontSize: '11px',
                        fontFamily: 'JetBrains Mono, monospace',
                        background: 'var(--bg-card, #0f172a)',
                        border: '1px solid var(--border, rgba(255,255,255,0.15))',
                        color: 'var(--text-primary, #f8fafc)',
                        borderRadius: '4px'
                      }}
                    />
                  </div>
                </div>

                {/* Barrier / Chokepoint */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                    <span style={{ color: '#f87171', fontWeight: '600' }}>Barrier / Chokepoint Distance:</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#f87171', fontWeight: '700' }}>{barrierDist} m</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="range"
                      min="2.0"
                      max={metricLength}
                      step="0.5"
                      value={barrierDist}
                      onChange={(e) => setBarrierDist(parseFloat(e.target.value))}
                      style={{ flex: 1, accentColor: '#ef4444' }}
                    />
                    <input
                      type="number"
                      step="0.5"
                      value={barrierDist}
                      onChange={(e) => setBarrierDist(parseFloat(e.target.value) || 0)}
                      style={{
                        width: '65px',
                        padding: '3px 6px',
                        fontSize: '11px',
                        fontFamily: 'JetBrains Mono, monospace',
                        background: 'var(--bg-card, #0f172a)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#f87171',
                        borderRadius: '4px'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Coordinates Fine-Tuning Pad */}
            <div style={{
              background: 'var(--bg-surface, #1e293b)',
              border: '1px solid var(--border, rgba(255,255,255,0.08))',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '11px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: '700', color: 'var(--text-secondary, #94a3b8)', letterSpacing: '0.04em' }}>
                  ACTIVE POINT P{activePointIdx + 1} NUDGE
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#fbbf24', fontWeight: '700' }}>
                  [{activePt[0]}px, {activePt[1]}px]
                </span>
              </div>

              {/* Nudge D-Pad */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <button
                  onClick={() => setPoints(prev => {
                    const next = [...prev]
                    next[activePointIdx] = [next[activePointIdx][0] - 1, next[activePointIdx][1]]
                    return next
                  })}
                  className="btn"
                  title="Nudge Left 1px"
                  style={{ padding: '4px 10px', fontSize: '11px', background: 'var(--bg-card, #0f172a)', border: '1px solid var(--border, rgba(255,255,255,0.12))', borderRadius: '4px', cursor: 'pointer' }}
                >
                  ◄ X-
                </button>
                <button
                  onClick={() => setPoints(prev => {
                    const next = [...prev]
                    next[activePointIdx] = [next[activePointIdx][0] + 1, next[activePointIdx][1]]
                    return next
                  })}
                  className="btn"
                  title="Nudge Right 1px"
                  style={{ padding: '4px 10px', fontSize: '11px', background: 'var(--bg-card, #0f172a)', border: '1px solid var(--border, rgba(255,255,255,0.12))', borderRadius: '4px', cursor: 'pointer' }}
                >
                  X+ ►
                </button>
                <button
                  onClick={() => setPoints(prev => {
                    const next = [...prev]
                    next[activePointIdx] = [next[activePointIdx][0], next[activePointIdx][1] - 1]
                    return next
                  })}
                  className="btn"
                  title="Nudge Up 1px"
                  style={{ padding: '4px 10px', fontSize: '11px', background: 'var(--bg-card, #0f172a)', border: '1px solid var(--border, rgba(255,255,255,0.12))', borderRadius: '4px', cursor: 'pointer' }}
                >
                  ▲ Y-
                </button>
                <button
                  onClick={() => setPoints(prev => {
                    const next = [...prev]
                    next[activePointIdx] = [next[activePointIdx][0], next[activePointIdx][1] + 1]
                    return next
                  })}
                  className="btn"
                  title="Nudge Down 1px"
                  style={{ padding: '4px 10px', fontSize: '11px', background: 'var(--bg-card, #0f172a)', border: '1px solid var(--border, rgba(255,255,255,0.12))', borderRadius: '4px', cursor: 'pointer' }}
                >
                  ▼ Y+
                </button>
              </div>
            </div>

            {/* Status Feedback Banner */}
            {saveStatus && (
              <div style={{
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: saveStatus.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${saveStatus.type === 'success' ? '#10b981' : '#ef4444'}`,
                color: saveStatus.type === 'success' ? '#34d399' : '#f87171'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                  {saveStatus.type === 'success' ? 'check_circle' : 'error'}
                </span>
                <span>{saveStatus.text}</span>
              </div>
            )}

            {/* Actions: Save & Reset */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  border: '1px solid #3b82f6',
                  padding: '11px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '700',
                  letterSpacing: '0.02em',
                  cursor: saving ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
                  transition: 'transform 0.1s, filter 0.15s'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                  {saving ? 'sync' : 'save'}
                </span>
                {saving ? 'Transmitting Homography Calibration...' : '💾 Save & Activate BEV Calibration'}
              </button>

              <button
                onClick={handleResetDefaults}
                style={{
                  background: 'var(--bg-card, #1e293b)',
                  color: 'var(--text-secondary, #94a3b8)',
                  border: '1px solid var(--border, rgba(255,255,255,0.12))',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>restart_alt</span>
                Reset to Factory Defaults
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
