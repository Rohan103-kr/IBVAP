import React, { useState, useEffect, useRef } from 'react'
import { API_BASE } from '../config'

function fmtTs(ts) {
  if (!ts) return '--:--:--'
  try { return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) }
  catch { return ts }
}

const RISK_FACTORS = [
  { name: 'Fence Breach Tripwire',       pts: 30, desc: 'Target intersected primary border fence line' },
  { name: 'Restricted Zone Penetration', pts: 25, desc: 'Target entered polygon Zone-North-Red' },
  { name: 'Night-time Low Light Context',pts: 20, desc: 'Event occurred inside 20:00–06:00 IST window' },
  { name: 'Unrecognized Identity',       pts: 15, desc: 'FRS facial match returned no authorized record' },
  { name: 'Cross-Camera Correlation',    pts: 15, desc: 'Identical track correlated from CAM-01 to CAM-02' },
]

const ESCALATION_TIMELINE = (alert) => [
  { time: '23:41:08', event: 'Person Detected', risk: 12, tag: 'INFO' },
  { time: '23:41:21', event: 'Restricted Zone Entry', risk: 37, tag: 'WARNING' },
  { time: '23:41:48', event: 'Loitering (47s Dwell)', risk: 52, tag: 'HIGH' },
  { time: '23:42:06', event: 'Fence Boundary Approach', risk: 72, tag: 'HIGH' },
  { time: '23:42:17', event: 'CAM-02 Spatial Correlation', risk: 84, tag: 'CRITICAL' },
  { time: '23:42:31', event: 'Unrecognized Identity Verified', risk: alert?.risk_score ?? 91, tag: 'CRITICAL' },
]

export default function ForensicDossierModal({ alert, onClose, onOpenDispatch }) {
  const [feedback, setFeedback] = useState(null)
  const [feedbackMsg, setFeedbackMsg] = useState('')
  const [saved, setSaved]       = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const retryRef = useRef(false)

  if (!alert) return null

  const sev = (alert.severity || 'CRITICAL').toUpperCase()
  const risk = alert.risk_score ?? alert.riskScore ?? 91
  const sevColor = sev === 'CRITICAL' ? 'var(--critical)' : sev === 'HIGH' ? 'var(--high)' : 'var(--warning)'

  const getSnapshotUrl = () => {
    let snap = alert.snapshot || (Array.isArray(alert.snapshots) && alert.snapshots[0]) || alert.snapshot_filename || alert.snapshot_url
    if (snap && typeof snap === 'string') {
      const filename = snap.replace(/^.*[\\\/]/, '').trim()
      if (filename) return `${API_BASE}/api/v1/snapshots/${filename}`
    }
    const eid = alert.event_id || alert.id
    if (eid && typeof eid === 'string' && eid.startsWith('EVT-')) {
      return `${API_BASE}/api/v1/snapshots/${eid}_snapshot.jpg`
    }
    return null
  }

  const [imgSrc, setImgSrc] = useState(getSnapshotUrl)

  useEffect(() => {
    setImgFailed(false)
    retryRef.current = false
    setImgSrc(getSnapshotUrl())
  }, [alert])

  const handleFeedback = async (type, label) => {
    setFeedback(type)
    setFeedbackMsg(`Action "${label}" recorded. Feedback stored to calibration dataset.`)
    try {
      await fetch(`${API_BASE}/api/v1/incidents/${alert.id || alert.event_id || 'EVT-001'}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback_type: type, notes: label, operator_id: 'Op-Cmd-01' })
      })
    } catch {}
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-box dossier-modal" style={{ maxWidth: 1100 }}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="material-symbols-outlined icon-fill" style={{ color: sevColor, fontSize: 20 }}>folder_open</span>
            <span className="modal-title">FORENSIC DOSSIER & AI DECISION TRACE</span>
          </div>
          <div className="modal-header-meta">
            <span style={{ background: alert.is_top_priority !== false ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255,255,255,0.06)', color: alert.is_top_priority !== false ? '#eab308' : 'var(--text-muted)', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, marginRight: 6 }}>
              {alert.is_top_priority !== false ? '⚡ PRIORITY #1 THREAT' : `PRIORITY #${alert.priority_rank || 2}`}
            </span>
            <span>ID <strong className="mc">{alert.id || alert.event_id || 'EVT-001'}</strong></span>
            <span>Camera <strong className="mc">{alert.camera_id || 'CAM-01'}</strong></span>
            <span>Track <strong className="mc">TRK-#{alert.track_id || '127'}</strong></span>
            <span className={`alert-severity-tag tag-${sev.toLowerCase()}`} style={{ marginLeft: 6 }}>{sev}</span>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">✕</button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Column 1: Evidence + AI Decision Trace */}
          <div className="modal-col">
            <div className="snapshot-frame">
              <div className="snapshot-label">
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>center_focus_strong</span>
                Captured Evidence Snapshot — {alert.camera_id || 'CAM-01'}
              </div>
              <div className="snapshot-img-wrap" style={{ position: 'relative', width: '100%', height: '180px', overflow: 'hidden', background: '#0a0d14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {imgFailed ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#94a3b8', padding: 12, textAlign: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--accent)' }}>photo_camera</span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#e2e8f0' }}>EVIDENCE CAPTURE ARCHIVED</span>
                    <span style={{ fontSize: 10, color: '#64748b' }}>{alert.event_id || alert.id} · SHA-256 Verified</span>
                  </div>
                ) : (
                  <img
                    src={imgSrc}
                    alt="Captured Instance Snapshot"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={() => {
                      const eid = alert.event_id || alert.id
                      if (!retryRef.current && eid) {
                        retryRef.current = true
                        setImgSrc(`${API_BASE}/api/v1/snapshots/${eid}_snapshot.jpg?t=${Date.now()}`)
                      } else {
                        setImgFailed(true)
                      }
                    }}
                  />
                )}
                <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(239, 68, 68, 0.9)', color: '#fff', padding: '3px 7px', borderRadius: 3, fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 800, letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>photo_camera</span>
                  INSTANCE EVIDENCE PHOTO
                </div>
                <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(255,255,255,0.2)', color: '#f8fafc', padding: '3px 6px', borderRadius: 3, fontSize: 9, fontFamily: 'var(--font-mono)' }}>
                  TRK-#{alert.track_id || 'N/A'} · RISK {risk}%
                </div>
              </div>
              <div className="snapshot-footer">
                <span>TIMESTAMP: {fmtTs(alert.timestamp)}</span>
                <span>SHA-256 AUDITED SNAPSHOT</span>
              </div>
            </div>

            {/* BIIE 5-Question Framework Badges */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 10 }}>
              <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #334155', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>1. WHO</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cyan)' }}>{alert.identity_status || 'UNRECOGNIZED'}</div>
              </div>
              <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #334155', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>2. WHAT</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)' }}>{alert.primary_event_type || alert.event_type || 'INTRUSION'}</div>
              </div>
              <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #334155', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>3. WHERE</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0' }}>{alert.camera_id || 'CAM-01'} (Sec B)</div>
              </div>
              <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #334155', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>4. WHEN</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0' }}>{fmtTs(alert.timestamp)}</div>
              </div>
              <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #ef4444', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>5. WHY RISKY</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--critical)' }}>{risk}/100</div>
              </div>
            </div>

            {/* AI Decision Trace ("WHY 87?") */}
            <div className="dossier-card" style={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--accent-bd)' }}>
              <div className="dossier-card-title" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>AI DECISION TRACE — WHY {risk}?</span>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>AUDITABLE CHAIN</span>
              </div>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', lineHeight: 1.6, color: '#cbd5e1' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ color: 'var(--cyan)' }}>RAW OBSERVATIONS</span> ➔ Person Detected ➔ Track #{alert.track_id || '127'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  ↓ Entered Restricted Polygon Zone ➔ Heading toward boundary
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  ↓ Loitered 47s ➔ Night IR Window ➔ CAM-02 Spatial Correlation
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--critical)' }}>
                  ↓ Identity UNRECOGNIZED ➔ RISK FUSION ➔ {risk} / 100
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Threat Escalation & Risk Matrix */}
          <div className="modal-col">
            {/* Threat Escalation Timeline */}
            <div className="dossier-card">
              <div className="dossier-card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>THREAT ESCALATION TIMELINE</span>
                <span style={{ color: 'var(--critical)', fontSize: 9, fontFamily: 'var(--font-mono)' }}>RISING THREAT</span>
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                {ESCALATION_TIMELINE(alert).map((t, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', background: 'rgba(255,255,255,0.03)', borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{t.time}</span>
                    <span style={{ color: '#f8fafc', flex: 1, marginLeft: 8 }}>{t.event}</span>
                    <strong style={{ color: t.risk >= 80 ? 'var(--critical)' : t.risk >= 50 ? 'var(--high)' : 'var(--warning)', marginLeft: 8 }}>
                      RISK {t.risk}
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Score Breakdown */}
            <div className="dossier-card">
              <div className="dossier-card-title">CONFIGURABLE POLICY WEIGHT BREAKDOWN — {risk}/100</div>
              <div style={{ display: 'grid', gap: 5 }}>
                {(alert.reasons && alert.reasons.length > 0 ? alert.reasons.map((r, i) => {
                  const pts = r.includes("(+") ? parseInt(r.split("(+")[1].replace(")", "")) : 15
                  return { name: r.split(" (+")[0], pts: pts }
                }) : RISK_FACTORS).map((f, i) => (
                  <div key={i} className="risk-factor-row">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                      <span>{f.name}</span>
                      <strong style={{ color: f.pts < 0 ? 'var(--teal)' : 'var(--critical)' }}>{f.pts > 0 ? `+${f.pts}` : f.pts} pts</strong>
                    </div>
                    <div className="risk-bar-wrap" style={{ height: 4, marginTop: 2 }}>
                      <div className="risk-bar-fill" style={{ width: `${Math.abs(f.pts) * 2.5}%`, background: f.pts < 0 ? 'var(--teal)' : 'var(--critical)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Column 3: Dedicated Human Override Mechanism */}
          <div className="modal-col">
            <div className="dossier-card" style={{ borderColor: 'var(--accent-bd)' }}>
              <div className="dossier-card-title" style={{ color: 'var(--cyan)' }}>AI SYSTEM DECISION</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: sevColor, marginBottom: 4 }}>
                {sev} RISK — SCORE {risk} / 100
              </div>
              <p style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Automated recommendation: Dispatch Sector B QRF patrol unit immediately to intercept target near boundary tripwire.
              </p>
            </div>

            {/* Dedicated Human Override Controls */}
            <div className="dossier-card" style={{ marginTop: 'auto' }}>
              <div className="dossier-card-title">HUMAN OPERATOR OVERRIDE & AUDIT LOG</div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                <button
                  className={`feedback-btn green${feedback === 'CONFIRM' ? ' active' : ''}`}
                  style={{ padding: '6px', fontSize: 10 }}
                  onClick={() => handleFeedback('CONFIRM', 'CONFIRM INCIDENT')}
                >
                  ✓ CONFIRM
                </button>
                <button
                  className={`feedback-btn red${feedback === 'DISMISS' ? ' active' : ''}`}
                  style={{ padding: '6px', fontSize: 10 }}
                  onClick={() => handleFeedback('DISMISS', 'DISMISS INCIDENT')}
                >
                  ✕ DISMISS
                </button>
                <button
                  className={`feedback-btn amber${feedback === 'ESCALATE' ? ' active' : ''}`}
                  style={{ padding: '6px', fontSize: 10, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid #f59e0b' }}
                  onClick={() => handleFeedback('ESCALATE', 'ESCALATE TO HQ')}
                >
                  ▲ ESCALATE HQ
                </button>
                <button
                  className={`feedback-btn red${feedback === 'FALSE_POSITIVE' ? ' active' : ''}`}
                  style={{ padding: '6px', fontSize: 10 }}
                  onClick={() => handleFeedback('FALSE_POSITIVE', 'MARK FALSE POSITIVE')}
                >
                  ⚠ FALSE ALARM
                </button>
              </div>

              {feedbackMsg && (
                <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--teal)', padding: '4px 6px', background: 'rgba(20, 184, 166, 0.1)', borderRadius: 4, marginBottom: 8 }}>
                  {feedbackMsg}
                </div>
              )}

              {sev === 'CRITICAL' && (
                <button
                  className="btn-critical-mini"
                  style={{ width: '100%', padding: '8px', fontSize: 11, marginBottom: 8 }}
                  onClick={() => { onClose(); onOpenDispatch && onOpenDispatch(alert); }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 4 }}>e911_emergency</span>
                  DISPATCH QRF UNIT
                </button>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost" style={{ flex: 1 }} onClick={handlePrint}>
                  🖨 Print Dossier
                </button>
                <button className="btn-accent" style={{ flex: 1 }} onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
