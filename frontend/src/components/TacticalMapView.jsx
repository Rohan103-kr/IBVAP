import React, { useState, useEffect } from 'react'

const W = 900
const H = 600

const CAMERA_POSITIONS = [
  { id: 'CAM-01', label: 'CAM-01', cx: 220, cy: 140, angle: 135, spread: 55, loc: 'North Gate' },
  { id: 'CAM-02', label: 'CAM-02', cx: 680, cy: 180, angle: 200, spread: 60, loc: 'East Checkpoint' },
  { id: 'CAM-03', label: 'CAM-03', cx: 180, cy: 440, angle: 45,  spread: 55, loc: 'West Corridor' },
  { id: 'CAM-04', label: 'CAM-04', cx: 650, cy: 480, angle: 315, spread: 60, loc: 'South Perimeter' },
]

const RESTRICTED_ZONE = [
  [280, 100], [580, 100], [610, 260], [540, 320], [330, 310], [250, 250]
].map(([x, y]) => `${x},${y}`).join(' ')

const BUFFER_ZONE = [
  [200, 70], [640, 70], [670, 340], [590, 390], [270, 380], [180, 310]
].map(([x, y]) => `${x},${y}`).join(' ')

const FENCE_LINE = [[120, 380], [740, 380]]

function fovCone(cx, cy, angle, spread, length = 140) {
  const toRad = d => (d * Math.PI) / 180
  const a1 = toRad(angle - spread / 2)
  const a2 = toRad(angle + spread / 2)
  const x1 = cx + Math.cos(a1) * length
  const y1 = cy + Math.sin(a1) * length
  const x2 = cx + Math.cos(a2) * length
  const y2 = cy + Math.sin(a2) * length
  return `M ${cx} ${cy} L ${x1} ${y1} A ${length} ${length} 0 0 1 ${x2} ${y2} Z`
}

const RADAR_CX = W / 2
const RADAR_CY = H / 2

const STATIC_TARGETS = [
  {
    id: 'TRK-8821', x: 330, y: 220, type: 'PERSON', speed: '3.2 m/s', heading: '45° NE', risk: 96, cam: 'CAM-01', status: 'CRITICAL',
    path: [[220, 140], [260, 170], [300, 200], [330, 220]]
  },
  {
    id: 'TRK-4092', x: 620, y: 210, type: 'VEHICLE (DL-01-AB-1234)', speed: '12.4 m/s', heading: '180° S', risk: 78, cam: 'CAM-02', status: 'HIGH',
    path: [[680, 180], [650, 195], [620, 210]]
  },
  {
    id: 'TRK-1104', x: 230, y: 385, type: 'PERSON', speed: '1.8 m/s', heading: '90° E', risk: 94, cam: 'CAM-03', status: 'CRITICAL',
    path: [[180, 440], [200, 410], [230, 385]]
  },
  {
    id: 'TRK-9012', x: 450, y: 480, type: 'DRONE (UNMANNED)', speed: '18.0 m/s', heading: '315° NW', risk: 88, cam: 'CAM-04', status: 'HIGH',
    path: [[550, 520], [500, 500], [450, 480]]
  }
]

function TargetMarker({ t, selected, onClick }) {
  const color = t.status === 'CRITICAL' ? '#ef4444' : t.status === 'HIGH' ? '#f97316' : '#eab308'

  return (
    <g cursor="pointer" onClick={() => onClick(t)}>
      {/* Path history polyline */}
      {t.path && t.path.length > 1 && (
        <polyline
          points={t.path.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="3 3"
          opacity="0.6"
        />
      )}

      {/* Pulsing Lock Ring */}
      {selected && (
        <circle cx={t.x} cy={t.y} r={24} fill="none" stroke={color} strokeWidth="1.2" strokeDasharray="4 3" opacity="0.8">
          <animateTransform attributeName="transform" type="rotate" from={`0 ${t.x} ${t.y}`} to={`360 ${t.x} ${t.y}`} dur="6s" repeatCount="indefinite" />
        </circle>
      )}

      <circle cx={t.x} cy={t.y} r={14} fill="none" stroke={color} strokeWidth="0.8" opacity="0.4" />
      <polygon
        points={`${t.x},${t.y - 9} ${t.x + 8},${t.y + 6} ${t.x - 8},${t.y + 6}`}
        fill={color}
        opacity={selected ? 1 : 0.85}
        stroke="#000"
        strokeWidth="0.6"
      />
      <text x={t.x} y={t.y - 14} textAnchor="middle" fill={color} fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="700">
        {t.id}
      </text>
    </g>
  )
}

function TargetDrawer({ target, targets, onSelect, onInvestigate, onOpenDispatch }) {
  if (!target) {
    return (
      <div className="map-drawer">
        <div className="drawer-header">
          <span className="drawer-title">
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>radar</span>
            Target Intel Radar
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
            {targets.length} TRACKED
          </span>
        </div>
        <div className="drawer-body">
          <div style={{ marginBottom: 10, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Active Perimeter Tracks
          </div>
          <div className="target-list">
            {targets.map(t => {
              const color = t.status === 'CRITICAL' ? 'var(--critical)' : t.status === 'HIGH' ? 'var(--high)' : 'var(--warning)'
              return (
                <div key={t.id} className="target-list-item" onClick={() => onSelect(t)}>
                  <div>
                    <div className="tl-id">{t.id}</div>
                    <div className="tl-speed" style={{ fontSize: 9, marginTop: 2 }}>{t.type} · {t.cam}</div>
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                    color, background: `${color}18`, border: `1px solid ${color}55`,
                    borderRadius: 4, padding: '2px 7px'
                  }}>
                    {t.risk}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="empty-state" style={{ marginTop: 30, gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--text-dim)' }}>touch_app</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Select target node on radar canvas</span>
          </div>
        </div>
      </div>
    )
  }

  const color = target.status === 'CRITICAL' ? 'var(--critical)' : target.status === 'HIGH' ? 'var(--high)' : 'var(--warning)'

  return (
    <div className="map-drawer">
      <div className="drawer-header">
        <span className="drawer-title" style={{ color }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>track_changes</span>
          {target.id} DOSSIER
        </span>
        <button
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}
          onClick={() => onSelect(null)}
        >✕</button>
      </div>
      <div className="drawer-body">
        <div className="target-dossier">
          <div className="target-header">
            <div>
              <div className="target-id">{target.id}</div>
              <div className="target-type">{target.type} · {target.cam}</div>
            </div>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 800,
              color, background: `${color}18`, border: `1px solid ${color}55`,
              borderRadius: 5, padding: '3px 10px'
            }}>
              {target.status}
            </span>
          </div>

          {[
            ['Speed Math',    target.speed,   'cyan'],
            ['Heading Vector',target.heading, 'cyan'],
            ['Calculated Risk',`${target.risk}/100`, 'crit'],
            ['Nearest Camera',target.cam,     ''],
            ['GIS Location',  `(${target.x}, ${target.y})`, ''],
          ].map(([label, value, cls]) => (
            <div key={label} className="target-row">
              <span className="label">{label}</span>
              <span className={`value ${cls}`}>{value}</span>
            </div>
          ))}

          {/* Risk bar */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>
              THREAD SEVERITY — {target.risk}/100
            </div>
            <div className="risk-bar-wrap">
              <div className="risk-bar-fill" style={{ width: `${target.risk}%`, background: color }} />
            </div>
          </div>

          <div className="target-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 14 }}>
            <button className="target-action-btn blue">Lock Reticle</button>
            <button className="target-action-btn blue">Track Polyline</button>
          </div>

          {target.status === 'CRITICAL' && (
            <button className="open-dossier-btn" style={{ background: 'var(--critical)', color: '#fff', marginTop: 10 }} onClick={() => onOpenDispatch(target)}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 5 }}>e911_emergency</span>
              SOP Emergency Dispatch
            </button>
          )}

          <button className="open-dossier-btn" onClick={() => onInvestigate && onInvestigate(target)}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 5 }}>folder_open</span>
            Open 5-Sec Forensic Dossier
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TacticalMapView({ simTargets = [], onInvestigate, onOpenDispatch }) {
  const [selectedTarget, setSelectedTarget] = useState(null)
  const [showGrid, setShowGrid] = useState(true)
  const [showZones, setShowZones] = useState(true)
  const [showFOV, setShowFOV] = useState(true)
  const [showHeatmap, setShowHeatmap] = useState(false)

  const allTargets = simTargets.length > 0 ? simTargets : STATIC_TARGETS

  return (
    <div className="view">
      {/* Toolbar */}
      <div className="view-toolbar">
        <span className="toolbar-title">
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>map</span>
          Tactical GIS Radar Theater
        </span>
        <div className="toolbar-sep" />
        <div className="toolbar-group">
          <button className={`toolbar-btn${showGrid ? ' active' : ''}`} onClick={() => setShowGrid(v => !v)}>Grid</button>
          <button className={`toolbar-btn${showZones ? ' active-warn' : ''}`} onClick={() => setShowZones(v => !v)}>Zones</button>
          <button className={`toolbar-btn${showFOV ? ' active' : ''}`} onClick={() => setShowFOV(v => !v)}>FOV Cones</button>
          <button className={`toolbar-btn${showHeatmap ? ' active' : ''}`} onClick={() => setShowHeatmap(v => !v)}>Heatmap</button>
        </div>
        <div className="ml-auto" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
            RADAR SWEEP 360° · {allTargets.length} ACTIVE TRACKS
          </span>
        </div>
      </div>

      {/* Map Layout */}
      {/* Border Digital Twin Sector Intelligence Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '12px 16px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', fontWeight: 600, letterSpacing: '0.03em' }}>SECTOR A (NORTH BORDER)</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>98.0% COVERAGE</span>
            <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.15)', color: 'var(--success)', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>OPTIMAL</span>
          </div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--critical-bd)', borderRadius: 10, padding: '8px 12px' }}>
          <div style={{ fontSize: 10, color: '#fca5a5', fontFamily: 'var(--font-sans)', fontWeight: 600, letterSpacing: '0.03em' }}>SECTOR B (FENCE LINE)</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--critical)' }}>50.0% COVERAGE</span>
            <span style={{ fontSize: 10, background: 'rgba(244,63,94,0.15)', color: 'var(--critical)', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>GAP DEGRADED</span>
          </div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', fontWeight: 600, letterSpacing: '0.03em' }}>SECTOR C (CHECKPOST)</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>100% COVERAGE</span>
            <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.15)', color: 'var(--success)', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>OPTIMAL</span>
          </div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--accent-bd)', borderRadius: 10, padding: '8px 12px' }}>
          <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-sans)', fontWeight: 600, letterSpacing: '0.03em' }}>BORDER INTEL STATUS</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>EDGE NODE ONLINE</span>
            <span style={{ fontSize: 10, background: 'rgba(56,189,248,0.15)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>3 TRACKS</span>
          </div>
        </div>
      </div>

      <div className="map-layout">
        <div className="map-canvas-wrap">
          <svg className="map-svg" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg">
            <rect width={W} height={H} fill="#04070e" />

            {/* Concentric Radar Rings */}
            <circle cx={RADAR_CX} cy={RADAR_CY} r={100} fill="none" stroke="#0ea5e9" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.25" />
            <circle cx={RADAR_CX} cy={RADAR_CY} r={200} fill="none" stroke="#0ea5e9" strokeWidth="0.5" opacity="0.2" />
            <circle cx={RADAR_CX} cy={RADAR_CY} r={300} fill="none" stroke="#0ea5e9" strokeWidth="0.5" strokeDasharray="5 5" opacity="0.15" />
            <text x={RADAR_CX + 105} y={RADAR_CY} fill="#0ea5e9" fontSize="8" fontFamily="JetBrains Mono" opacity="0.4">100m</text>
            <text x={RADAR_CX + 205} y={RADAR_CY} fill="#0ea5e9" fontSize="8" fontFamily="JetBrains Mono" opacity="0.4">250m</text>
            <text x={RADAR_CX + 305} y={RADAR_CY} fill="#0ea5e9" fontSize="8" fontFamily="JetBrains Mono" opacity="0.4">500m</text>

            {/* Rotating Radar Sweep Beam */}
            <g>
              <line x1={RADAR_CX} y1={RADAR_CY} x2={RADAR_CX + 320} y2={RADAR_CY} stroke="#0ea5e9" strokeWidth="1.5" opacity="0.7">
                <animateTransform attributeName="transform" type="rotate" from={`0 ${RADAR_CX} ${RADAR_CY}`} to={`360 ${RADAR_CX} ${RADAR_CY}`} dur="5s" repeatCount="indefinite" />
              </line>
            </g>

            {/* Grid Lines */}
            {showGrid && (
              <g opacity="0.06" stroke="#0ea5e9" strokeWidth="0.5">
                {Array.from({ length: 19 }, (_, i) => (
                  <line key={`gv${i}`} x1={i * 50} y1={0} x2={i * 50} y2={H} />
                ))}
                {Array.from({ length: 13 }, (_, i) => (
                  <line key={`gh${i}`} x1={0} y1={i * 50} x2={W} y2={i * 50} />
                ))}
              </g>
            )}

            {/* Polygon Zones */}
            {showZones && (
              <>
                <polygon points={BUFFER_ZONE} fill="rgba(234,179,8,0.06)" stroke="#eab308" strokeWidth="1" strokeDasharray="6 3" />
                <polygon points={RESTRICTED_ZONE} fill="rgba(239,68,68,0.12)" stroke="#ef4444" strokeWidth="1.5" />
                <line x1={FENCE_LINE[0][0]} y1={FENCE_LINE[0][1]} x2={FENCE_LINE[1][0]} y2={FENCE_LINE[1][1]} stroke="#ef4444" strokeWidth="2.5" strokeDasharray="8 4" />
              </>
            )}

            {/* Heatmap Layer */}
            {showHeatmap && (
              <g opacity="0.3">
                <circle cx="330" cy="220" r="50" fill="url(#heat-grad)" />
                <circle cx="230" cy="385" r="60" fill="url(#heat-grad)" />
                <defs>
                  <radialGradient id="heat-grad">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                  </radialGradient>
                </defs>
              </g>
            )}

            {/* Camera FOV Cones */}
            {showFOV && CAMERA_POSITIONS.map(cam => (
              <g key={cam.id}>
                <path d={fovCone(cam.cx, cam.cy, cam.angle, cam.spread)} fill="rgba(14,165,233,0.08)" stroke="#0ea5e9" strokeWidth="0.8" strokeDasharray="3 2" />
                <circle cx={cam.cx} cy={cam.cy} r="4" fill="#0ea5e9" />
                <text x={cam.cx + 8} y={cam.cy + 3} fill="#0ea5e9" fontSize="8" fontFamily="JetBrains Mono" fontWeight="700">
                  {cam.id}
                </text>
              </g>
            ))}

            {/* Target Markers */}
            {allTargets.map(t => (
              <TargetMarker
                key={t.id}
                t={t}
                selected={selectedTarget?.id === t.id}
                onClick={setSelectedTarget}
              />
            ))}
          </svg>
        </div>

        {/* Target Intel Drawer */}
        <TargetDrawer
          target={selectedTarget}
          targets={allTargets}
          onSelect={setSelectedTarget}
          onInvestigate={onInvestigate}
          onOpenDispatch={onOpenDispatch}
        />
      </div>
    </div>
  )
}
