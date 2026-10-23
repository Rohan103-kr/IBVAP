import React, { useState, useEffect } from 'react'
import { API_BASE } from '../config'

export default function BEVRadarOverlay({ cameraId = 'CAM-01', onClose }) {
  const [telemetry, setTelemetry] = useState(null)
  const [calibration, setCalibration] = useState(null)

  useEffect(() => {
    let mounted = true

    // Fetch calibration metadata
    fetch(`${API_BASE}/api/v1/calibration/${cameraId}`)
      .then(res => res.json())
      .then(data => {
        if (mounted && data.calibration) {
          setCalibration(data.calibration)
        }
      })
      .catch(() => {})

    // Poll live telemetry every 200ms for smooth 5Hz radar sweep
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/telemetry/${cameraId}`)
        const data = await res.json()
        if (mounted && data.telemetry) {
          setTelemetry(data.telemetry)
        }
      } catch (err) {
        // Silently skip
      }
    }, 200)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [cameraId])

  const targets = telemetry?.targets || []
  const metricWidth = calibration?.metric_width_m || 8.5
  const metricLength = calibration?.metric_length_m || 35.0
  const barrierY = calibration?.barrier_y_m || 12.0

  return (
    <div style={{
      position: 'absolute', bottom: '12px', right: '12px', zIndex: 30,
      width: '230px', background: 'rgba(10, 15, 26, 0.90)', backdropFilter: 'blur(8px)',
      border: '1px solid #1e293b', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', color: '#f8fafc',
      fontFamily: 'Inter, monospace'
    }}>
      {/* Radar Header */}
      <div style={{
        padding: '8px 12px', background: 'rgba(15, 23, 42, 0.8)',
        borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
          <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.04em', color: '#38bdf8' }}>
            BEV TACTICAL RADAR
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Radar Viewport (Top-Down SVG) */}
      <div style={{ position: 'relative', width: '100%', height: '180px', padding: '10px 14px' }}>
        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          {/* Background Grid Lines */}
          <line x1="10%" y1="0" x2="10%" y2="100%" stroke="rgba(56,189,248,0.15)" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(56,189,248,0.25)" strokeWidth="1" />
          <line x1="90%" y1="0" x2="90%" y2="100%" stroke="rgba(56,189,248,0.15)" strokeWidth="3 3" />

          {/* Distance Range Lines (10m, 20m, 30m) */}
          {[10, 20, 30].map(dist => {
            const yPct = (1.0 - (dist / metricLength)) * 100
            if (yPct < 0 || yPct > 100) return null
            return (
              <g key={dist}>
                <line x1="0" y1={`${yPct}%`} x2="100%" y2={`${yPct}%`} stroke="rgba(148,163,184,0.2)" strokeWidth="1" />
                <text x="4" y={`${yPct - 2}%`} fill="#64748b" fontSize="8" fontFamily="monospace">
                  {dist}m
                </text>
              </g>
            )
          })}

          {/* Barrier / Chokepoint Line */}
          {(() => {
            const bY = (1.0 - (barrierY / metricLength)) * 100
            return (
              <g>
                <line x1="0" y1={`${bY}%`} x2="100%" y2={`${bY}%`} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 2" />
                <text x="65%" y={`${bY - 3}%`} fill="#f87171" fontSize="8" fontWeight="bold">
                  BARRIER
                </text>
              </g>
            )
          })()}

          {/* Render Active Targets */}
          {targets.map((t, idx) => {
            const [nx, ny] = t.bev_normalized || [0.5, 0.5]
            const cx = `${Math.max(5, Math.min(95, nx * 100))}%`
            const cy = `${Math.max(5, Math.min(95, (1.0 - ny) * 100))}%`
            const isSuspect = t.identity_status === 'UNAUTHORIZED' || t.is_watchlist_vehicle === true
            const color = isSuspect ? '#ef4444' : (t.object_type === 'person' ? '#34d399' : '#38bdf8')

            return (
              <g key={t.track_id || idx}>
                {/* Ping Pulse Animation */}
                <circle cx={cx} cy={cy} r="10" fill={color} opacity="0.25" />
                {/* Target Blip */}
                <circle cx={cx} cy={cy} r="4.5" fill={color} stroke="#0f172a" strokeWidth="1.5" />
                {/* Label */}
                <text
                  x={cx}
                  y={cy}
                  dx="8"
                  dy="3"
                  fill="#ffffff"
                  fontSize="9"
                  fontWeight="600"
                  fontFamily="Inter, sans-serif"
                >
                  {t.license_plate || `#${t.track_id}`}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Telemetry Footer */}
      <div style={{
        padding: '6px 12px', background: 'rgba(15, 23, 42, 0.95)',
        borderTop: '1px solid #1e293b', fontSize: '10px', color: '#94a3b8',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        {targets.length > 0 ? (
          <>
            <span style={{ color: '#38bdf8', fontWeight: '600' }}>
              🎯 {targets[0].license_plate || `Target #${targets[0].track_id}`}
            </span>
            <span style={{ color: '#fbbf24', fontWeight: '500' }}>
              {targets[0].distance_to_barrier_m ? `${targets[0].distance_to_barrier_m}m to barrier` : 'In Sector'}
            </span>
            <span style={{ color: '#34d399', fontFamily: 'monospace' }}>
              {targets[0].ground_speed_kmh ? `${targets[0].ground_speed_kmh} km/h` : '35 km/h'}
            </span>
          </>
        ) : (
          <span style={{ color: '#64748b' }}>Awaiting target track...</span>
        )}
      </div>
    </div>
  )
}
