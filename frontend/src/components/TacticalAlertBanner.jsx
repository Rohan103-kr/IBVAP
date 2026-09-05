import React, { useState, useEffect } from 'react'
import SpeedometerGauge from './SpeedometerGauge'

export default function TacticalAlertBanner({ alert, onInvestigate, onOpenDispatch, onSnooze, onDismiss, onAcknowledge }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (alert) {
      setVisible(true)
    } else {
      setVisible(false)
    }
  }, [alert])

  if (!alert || !visible) return null

  const sev = (alert.severity || 'CRITICAL').toUpperCase()
  const risk = alert.risk_score ?? alert.riskScore ?? 85
  const camId = alert.camera_id || 'CAM-01'
  const trackId = alert.track_id ? `TRK-${alert.track_id}` : null
  const isCritical = sev === 'CRITICAL'
  const barColor = isCritical ? 'var(--critical)' : 'var(--high)'
  const tagClass = isCritical ? 'tag-critical' : 'tag-high'

  const formatDesc = (raw) => {
    if (!raw) return 'Perimeter intrusion detected'
    let clean = raw.replace(/^BIIE SYNTHESIS:\s*/i, '').replace(/\s*\(\+\d+\)/g, '')
    const parts = clean.split(/\s*·\s*/)
    if (parts.length > 2) {
      clean = parts.slice(0, 2).join(' · ')
    }
    return clean
  }

  const handleAck = () => {
    if (onAcknowledge) onAcknowledge(alert)
    if (onDismiss) onDismiss(alert)
    setVisible(false)
  }

  return (
    <div className="tactical-alert-banner">
      {/* Radar Ping Glow */}
      <div className="tab-pulse-ring" style={{ borderColor: barColor }} />

      {/* Main Content Area */}
      <div className="tab-body" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Speedometer Gauge Dial Threat Meter */}
        <div style={{ flexShrink: 0, paddingRight: 4 }}>
          <SpeedometerGauge value={risk} size={100} showLabel={true} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tab-header">
            <div className="tab-meta">
              <span className={`alert-severity-tag ${tagClass}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 12, marginRight: 2 }}>warning</span>
                {sev} BREACH
              </span>
              <span className="tab-cam-badge">{camId}</span>
              {trackId && <span className="tab-trk-badge">{trackId}</span>}
            </div>
          </div>

          <div className="tab-desc" style={{ marginTop: 4 }}>
            {formatDesc(alert.description || alert.event_type)}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="tab-actions" style={{ flexShrink: 0, gap: 8 }}>
          {/* Prominent 1-Click / Spacebar Acknowledge Button */}
          <button
            className="tab-btn"
            onClick={handleAck}
            style={{
              background: 'rgba(16, 185, 129, 0.25)',
              borderColor: 'var(--success)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 11,
              padding: '8px 16px',
              borderRadius: 6,
              boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)',
              cursor: 'pointer'
            }}
            title="Silence Siren & Acknowledge Threat (Keyboard shortcut: Spacebar)"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, marginRight: 4, color: 'var(--success)' }}>check_circle</span>
            ✓ ACKNOWLEDGE (Space)
          </button>

          <button
            className="tab-btn tab-btn-dossier"
            onClick={() => onInvestigate && onInvestigate(alert)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>badge</span>
            DOSSIER
          </button>

          {isCritical && (
            <button
              className="tab-btn tab-btn-dispatch"
              onClick={() => onOpenDispatch && onOpenDispatch(alert)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>e911_emergency</span>
              DISPATCH QRF
            </button>
          )}

          <button
            className="tab-btn-close"
            onClick={() => onDismiss && onDismiss(alert)}
            title="Dismiss Alert Banner"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
