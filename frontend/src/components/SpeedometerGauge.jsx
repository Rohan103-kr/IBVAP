import React from 'react'

export default function SpeedometerGauge({ value = 0, size = 110, showLabel = true }) {
  const score = Math.max(0, Math.min(100, Number(value) || 0))

  // Determine threat severity color
  let color = '#10b981' // Green (Safe/Info)
  let statusText = 'SAFE'
  if (score >= 81) {
    color = '#f43f5e' // Red (Critical)
    statusText = 'CRITICAL'
  } else if (score >= 61) {
    color = '#fb923c' // Orange (High)
    statusText = 'HIGH'
  } else if (score > 30) {
    color = '#facc15' // Yellow (Warning)
    statusText = 'WARNING'
  }

  // Needle angle calculation (-90 deg to +90 deg)
  const angle = -90 + (score / 100) * 180

  const cx = 60
  const cy = 55

  return (
    <div className="speedometer-container" style={{ width: size, textAlign: 'center', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size * 0.65} viewBox="0 0 120 75" style={{ overflow: 'visible' }}>
        <defs>
          <filter id="gauge-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Background Arc */}
        <path
          d="M 18 55 A 42 42 0 0 1 102 55"
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth="10"
          strokeLinecap="round"
        />

        {/* 4 Colored Threat Zones */}
        {/* Zone 1: Green (0 - 30) */}
        <path
          d="M 18 55 A 42 42 0 0 1 34.7 22.3"
          fill="none"
          stroke="#10b981"
          strokeWidth="8"
          opacity="0.85"
        />
        {/* Zone 2: Yellow (31 - 60) */}
        <path
          d="M 34.7 22.3 A 42 42 0 0 1 73.1 18.2"
          fill="none"
          stroke="#facc15"
          strokeWidth="8"
          opacity="0.85"
        />
        {/* Zone 3: Orange (61 - 80) */}
        <path
          d="M 73.1 18.2 A 42 42 0 0 1 95.7 34.8"
          fill="none"
          stroke="#fb923c"
          strokeWidth="8"
          opacity="0.85"
        />
        {/* Zone 4: Red (81 - 100) */}
        <path
          d="M 95.7 34.8 A 42 42 0 0 1 102 55"
          fill="none"
          stroke="#f43f5e"
          strokeWidth="8"
          opacity="0.85"
        />

        {/* Active Arc Highlight */}
        <path
          d="M 18 55 A 42 42 0 0 1 102 55"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${(score / 100) * 132} 132`}
          strokeLinecap="round"
          filter="url(#gauge-glow)"
          style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.5s ease' }}
        />

        {/* Needle Pointer */}
        <g transform={`rotate(${angle} ${cx} ${cy})`} style={{ transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          <line x1={cx} y1={cy} x2={cx} y2="18" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
          <line x1={cx} y1={cy} x2={cx} y2="18" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <polygon points={`${cx - 3},${cy} ${cx + 3},${cy} ${cx},14`} fill={color} />
        </g>

        {/* Pivot Point */}
        <circle cx={cx} cy={cy} r="6" fill="#0f172a" stroke={color} strokeWidth="2.5" />
        <circle cx={cx} cy={cy} r="2" fill="#fff" />
      </svg>

      {/* Score Text Badge */}
      {showLabel && (
        <div style={{ marginTop: -8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 900, color: color, letterSpacing: '0.04em' }}>
            {score}
          </span>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginLeft: 2 }}>/100</span>
          <div style={{ fontSize: 9, fontWeight: 800, color: color, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: -1 }}>
            {statusText}
          </div>
        </div>
      )}
    </div>
  )
}
