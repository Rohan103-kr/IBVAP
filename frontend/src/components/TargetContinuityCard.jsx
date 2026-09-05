import React from 'react'

export default function TargetContinuityCard({ target, onFocusCamera }) {
  if (!target) return null

  const {
    target_id,
    camera_sequence = [],
    current_camera,
    current_sector,
    direction,
    speed_kmh,
    risk_score,
    predictive_alert,
    timeline = [],
    first_seen_time,
    last_seen_time
  } = target

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid var(--accent-bd)',
      borderRadius: 8,
      padding: '12px 14px',
      marginBottom: 12,
      fontFamily: 'var(--font-mono)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize: 18, color: 'var(--critical)' }}>crisis_alert</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', letterSpacing: '0.05em' }}>{target_id}</span>
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 700,
            background: 'rgba(239, 68, 68, 0.2)', color: 'var(--critical)', border: '1px solid rgba(239,68,68,0.4)'
          }}>
            MULTI-CAM CONTINUITY
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>First: {first_seen_time} · Last: {last_seen_time}</span>
          <span style={{
            fontSize: 11, fontWeight: 800, color: risk_score >= 85 ? 'var(--critical)' : 'var(--high)',
            background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4
          }}>
            RISK {risk_score}%
          </span>
        </div>
      </div>

      {/* Cross-Camera Sequence Path */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0',
        padding: '6px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 6, border: '1px solid var(--border-light)'
      }}>
        <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 700 }}>CAMERA PATH:</span>
        {camera_sequence.map((cam, idx) => (
          <React.Fragment key={cam}>
            <button
              onClick={() => onFocusCamera && onFocusCamera(cam)}
              style={{
                background: cam === current_camera ? 'rgba(14, 165, 233, 0.3)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${cam === current_camera ? 'var(--accent)' : 'var(--border)'}`,
                color: cam === current_camera ? 'var(--accent)' : 'var(--text-primary)',
                padding: '2px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontWeight: 700
              }}
              title={`Focus ${cam}`}
            >
              {cam}
            </button>
            {idx < camera_sequence.length - 1 && (
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>➔</span>
            )}
          </React.Fragment>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--teal)' }}>
          Speed: {speed_kmh} km/h · Heading: {direction}
        </span>
      </div>

      {/* ⚠️ Predictive Forward Trajectory Warning */}
      {predictive_alert && (
        <div style={{
          background: 'rgba(234, 179, 8, 0.08)',
          border: '1px solid rgba(234, 179, 8, 0.4)',
          borderRadius: 6,
          padding: '8px 10px',
          margin: '8px 0',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10
        }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--warning)', fontSize: 18, marginTop: 1 }}>radar</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--warning)' }}>
                PREDICTIVE TRAJECTORY WARNING (ETA ~{predictive_alert.estimated_arrival_sec}s)
              </span>
              <span style={{ fontSize: 9.5, color: 'var(--warning)', background: 'rgba(234,179,8,0.2)', padding: '1px 6px', borderRadius: 3 }}>
                FORWARD INTERCEPT
              </span>
            </div>
            <div style={{ fontSize: 10, color: '#f8fafc', marginTop: 3 }}>
              {predictive_alert.threat_forecast}
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--teal)', marginTop: 2 }}>
              👉 Recommended SOP: {predictive_alert.recommended_action}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
