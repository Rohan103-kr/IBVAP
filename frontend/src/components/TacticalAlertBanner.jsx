import React, { useState, useEffect, useRef } from 'react'
import SpeedometerGauge from './SpeedometerGauge'

const EVENT_LABELS = {
  FENCE_CROSSING:           { icon: 'fence',          label: 'FENCE BREACH',       color: '#f43f5e' },
  ZONE_ENTRY:               { icon: 'do_not_enter',   label: 'ZONE VIOLATION',      color: '#f43f5e' },
  ANPR_ALERT:               { icon: 'directions_car', label: 'ANPR HIT',            color: '#fb923c' },
  ANPR_WATCHLIST_MATCH:     { icon: 'directions_car', label: 'WATCHLIST VEHICLE',   color: '#f43f5e' },
  SUSPICIOUS_LOITERING:     { icon: 'person_pin',     label: 'LOITERING DETECTED',  color: '#facc15' },
  LOITERING:                { icon: 'person_pin',     label: 'LOITERING DETECTED',  color: '#facc15' },
  CROWD_SURGE:              { icon: 'groups',         label: 'CROWD SURGE',         color: '#fb923c' },
  FACE_MATCH:               { icon: 'face',           label: 'FACE MATCH',          color: '#fb923c' },
  MULTI_CAMERA_CORRELATION: { icon: 'hub',            label: 'CROSS-CAM CHAIN',     color: '#f43f5e' },
  NIGHT_INFILTRATION:       { icon: 'nights_stay',    label: 'NIGHT INFILTRATION',  color: '#f43f5e' },
  COVERAGE_GAP_WARNING:     { icon: 'videocam_off',   label: 'BLIND ZONE ALERT',    color: '#facc15' },
  EDGE_OFFLINE_SYNC:        { icon: 'sync_problem',   label: 'EDGE OFFLINE',        color: '#facc15' },
  AUTHORIZED_PATROL:        { icon: 'security',       label: 'FRIENDLY PATROL',     color: '#10b981' },
}

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

export default function TacticalAlertBanner({ alert, onInvestigate, onOpenDispatch, onSnooze, onDismiss, onAcknowledge, onHoverChange }) {
  const [visible, setVisible] = useState(false)
  const [snoozed, setSnoozed] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [timeLeft, setTimeLeft] = useState(10)
  const bannerRef = useRef(null)

  useEffect(() => {
    if (alert) {
      setVisible(true)
      setSnoozed(false)
      setTimeLeft(10)
    } else {
      setVisible(false)
    }
  }, [alert])

  // Non-intrusive auto-dismiss after 10s if not hovered by operator
  useEffect(() => {
    if (!visible || isHovered || !alert) return
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          if (onDismiss) onDismiss(alert)
          setVisible(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [visible, isHovered, alert, onDismiss])

  const handleMouseEnter = () => {
    setIsHovered(true)
    if (onHoverChange) onHoverChange(true)
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    if (onHoverChange) onHoverChange(false)
  }

  if (!alert || !visible || snoozed) return null

  const sev = (alert.severity || 'CRITICAL').toUpperCase()
  const risk = alert.risk_score ?? alert.riskScore ?? 85
  const camId = alert.camera_id || 'CAM-01'
  const trackId = alert.track_id ? `TRK-${alert.track_id}` : null
  const isCritical = sev === 'CRITICAL'
  const isHigh = sev === 'HIGH'
  const eventMeta = EVENT_LABELS[alert.event_type] || { icon: 'warning', label: sev + ' BREACH', color: '#f43f5e' }
  const barColor = eventMeta.color
  const isLoitering = alert.event_type === 'LOITERING' || alert.event_type === 'SUSPICIOUS_LOITERING'
  const isAnpr = alert.event_type === 'ANPR_ALERT' || alert.event_type === 'ANPR_WATCHLIST_MATCH'
  const isMultiCam = alert.event_type === 'MULTI_CAMERA_CORRELATION'
  const needsDispatch = isCritical || (risk >= 80 && isAnpr) || isMultiCam

  const formatDesc = (raw) => {
    if (!raw) return 'Perimeter intrusion detected'
    let clean = raw.replace(/^BIIE SYNTHESIS:\s*/i, '').replace(/\s*\(\+\d+\)/g, '')
    const parts = clean.split(/\s*·\s*/)
    return parts[0]
  }

  const handleAck = () => {
    if (onAcknowledge) onAcknowledge(alert)
    if (onDismiss) onDismiss(alert)
    setVisible(false)
  }

  const handleSnooze = () => {
    setSnoozed(true)
    if (onSnooze) onSnooze(alert)
  }

  return (
    <div
      ref={bannerRef}
      className="tactical-alert-banner"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        borderColor: `${barColor}88`,
        boxShadow: `0 12px 40px rgba(0,0,0,0.75), 0 0 24px ${barColor}33`,
      }}
    >
      {/* Animated radar ping ring */}
      <div className="tab-pulse-ring" style={{ borderColor: barColor }} />
      <div className="tab-pulse-ring tab-pulse-ring--delay" style={{ borderColor: barColor }} />

      {/* Top strip: Event Type label */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        paddingBottom: 8, borderBottom: `1px solid ${barColor}33`
      }}>
        <span className="material-symbols-outlined icon-fill" style={{ fontSize: 18, color: barColor }}>{eventMeta.icon}</span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 900,
          color: barColor, letterSpacing: '0.08em', textTransform: 'uppercase'
        }}>{eventMeta.label}</span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)',
          background: 'var(--accent-bg)', border: '1px solid var(--accent-bd)',
          padding: '1px 7px', borderRadius: 4, fontWeight: 700
        }}>{camId}</span>
        {trackId && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            padding: '1px 6px', borderRadius: 4
          }}>{trackId}</span>
        )}
        {/* Severity tag */}
        <span className={`alert-severity-tag tag-${sev.toLowerCase()}`} style={{ marginLeft: 'auto' }}>
          {sev}
        </span>
        {/* Close */}
        <button className="tab-banner-btn-close" onClick={() => onDismiss && onDismiss(alert)} title="Dismiss & Silence [ESC]">✕</button>
      </div>

      {/* Main body: Gauge + Snapshot + Content */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Speedometer Gauge & Evidence Thumbnail */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <SpeedometerGauge value={risk} size={82} showLabel={true} />
          {(alert.snapshot || alert.snapshot_filename) && (
            <div
              style={{
                width: 78,
                height: 50,
                borderRadius: 4,
                overflow: 'hidden',
                border: `1px solid ${barColor}66`,
                background: '#090d16',
                cursor: 'pointer',
                position: 'relative',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
              }}
              onClick={() => onInvestigate && onInvestigate(alert)}
              title="Click to inspect evidence snapshot in Forensic Dossier"
            >
              <img
                src={`http://localhost:8000/api/v1/snapshots/${(alert.snapshot || alert.snapshot_filename).replace(/^.*[\\\/]/, '')}`}
                alt="Evidence snapshot"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { e.target.parentElement.style.display = 'none' }}
              />
              <span style={{
                position: 'absolute', bottom: 1, right: 2,
                fontSize: 7.5, fontFamily: 'var(--font-mono)',
                background: 'rgba(0,0,0,0.8)', padding: '0 3px', borderRadius: 2,
                color: '#38bdf8', fontWeight: 700
              }}>EVIDENCE</span>
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Description */}
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
            lineHeight: 1.4, marginBottom: 8
          }}>
            {formatDesc(alert.description || alert.event_type)}
          </div>

          {/* Special context badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
            {/* ANPR Plate */}
            {isAnpr && alert.license_plate && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
                background: 'rgba(251,146,60,0.2)', color: '#fb923c',
                border: '1px solid rgba(251,146,60,0.5)', padding: '2px 8px', borderRadius: 4,
                display: 'inline-flex', alignItems: 'center', gap: 4
              }}>
                <span className="material-symbols-outlined icon-fill" style={{ fontSize: 11 }}>directions_car</span>
                PLATE: {alert.license_plate}
              </span>
            )}

            {/* Loitering dwell timer */}
            {isLoitering && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                background: 'rgba(234,179,8,0.18)', color: '#facc15',
                border: '1px solid rgba(234,179,8,0.5)', padding: '2px 8px', borderRadius: 4,
                display: 'inline-flex', alignItems: 'center', gap: 4
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>timer</span>
                DWELL: <DwellTimer timestamp={alert.timestamp} />
              </span>
            )}

            {/* Predictive ETA */}
            {alert.eta_seconds && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
                background: 'rgba(244,63,94,0.18)', color: '#f43f5e',
                border: '1px solid rgba(244,63,94,0.5)', padding: '2px 8px', borderRadius: 4,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                animation: 'pulse-btn 1.2s infinite'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>navigation</span>
                ⚠ ETA ~{alert.eta_seconds}s TO BREACH
              </span>
            )}

            {/* Cross-cam chain */}
            {isMultiCam && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                background: 'rgba(56,189,248,0.15)', color: 'var(--accent)',
                border: '1px solid rgba(56,189,248,0.4)', padding: '2px 8px', borderRadius: 4,
                display: 'inline-flex', alignItems: 'center', gap: 4
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>hub</span>
                MULTI-CAMERA CHAIN CONFIRMED
              </span>
            )}
          </div>

          {/* XAI Reasons — 2-second explainability */}
          {alert.reasons && alert.reasons.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {alert.reasons.slice(0, 4).map((r, i) => {
                // Clean reason text
                const clean = r.replace(/\s*\(\+\d+\)/g, '').replace(/\s*\(-\d+\)/g, '')
                const points = r.match(/\(([+-]\d+)\)/)
                return (
                  <span key={i} style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9,
                    color: isCritical ? 'var(--critical)' : 'var(--text-mono)',
                    background: isCritical ? 'rgba(244,63,94,0.1)' : 'var(--bg-surface)',
                    border: `1px solid ${isCritical ? 'rgba(244,63,94,0.25)' : 'var(--border-light)'}`,
                    padding: '2px 7px', borderRadius: 4,
                    display: 'inline-flex', alignItems: 'center', gap: 4
                  }}>
                    <span style={{ color: isCritical ? 'var(--critical)' : 'var(--success)', fontWeight: 900 }}>✓</span>
                    {clean}
                    {points && (
                      <span style={{ color: barColor, fontWeight: 800 }}>{points[0]}</span>
                    )}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginTop: 10,
        paddingTop: 8, borderTop: `1px solid ${barColor}22`
      }}>
        {/* Primary: ACKNOWLEDGE */}
        <button
          className="tab-banner-btn"
          onClick={handleAck}
          style={{
            background: 'rgba(16,185,129,0.2)',
            borderColor: 'var(--success)',
            color: 'var(--text-primary)',
            fontWeight: 900,
            fontSize: 11,
            padding: '7px 16px',
            borderRadius: 6,
            boxShadow: '0 0 14px rgba(16,185,129,0.35)',
            cursor: 'pointer',
            letterSpacing: '0.04em'
          }}
          title="Acknowledge & silence [SPACE]"
        >
          <span className="material-symbols-outlined icon-fill" style={{ fontSize: 14, color: 'var(--success)', marginRight: 4 }}>check_circle</span>
          ACKNOWLEDGE
          <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 4 }}>[SPACE]</span>
        </button>

        {/* Dossier */}
        <button
          className="tab-banner-btn tab-banner-btn-dossier"
          onClick={() => onInvestigate && onInvestigate(alert)}
          title="Open Forensic Dossier"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>badge</span>
          DOSSIER
        </button>

        {/* Dispatch QRF — for CRITICAL or high-risk ANPR */}
        {needsDispatch && (
          <button
            className="tab-banner-btn tab-banner-btn-dispatch"
            onClick={() => onOpenDispatch && onOpenDispatch(alert)}
            title="Dispatch Quick Reaction Force [D]"
            style={{ animation: isCritical ? 'pulse-btn 1.5s infinite' : 'none' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>e911_emergency</span>
            DISPATCH QRF
            <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 3 }}>[D]</span>
          </button>
        )}

        {/* Snooze */}
        <button
          className="tab-banner-btn tab-banner-btn-snooze"
          onClick={handleSnooze}
          title="Snooze this camera for 90 seconds"
          style={{ marginLeft: 'auto', fontSize: 10 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>snooze</span>
          SNOOZE 90s
        </button>
      </div>

      {/* Non-intrusive auto-dismiss progress countdown */}
      <div style={{ marginTop: 8 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 4
        }}>
          <span style={{ color: isHovered ? '#38bdf8' : 'var(--text-muted)', fontWeight: isHovered ? 700 : 500 }}>
            {isHovered ? '⏸ COUNTDOWN PAUSED (INSPECTING)' : `AUTO-DISMISS IN ${timeLeft}s`}
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 8.5 }}>
            [SPACE] ACK · [ESC] SILENCE
          </span>
        </div>
        <div style={{ height: 3, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              background: isHovered ? '#38bdf8' : barColor,
              width: `${(timeLeft / 10) * 100}%`,
              transition: isHovered ? 'none' : 'width 1s linear',
              opacity: 0.85
            }}
          />
        </div>
      </div>
    </div>
  )
}
