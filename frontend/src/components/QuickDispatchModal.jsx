import React, { useState, useEffect } from 'react'

const QRF_UNITS = [
  { id: 'ALPHA-1', name: 'ALPHA-1 · Northern Ridge Interceptors', eta: '1.5 min', status: 'READY', type: 'All-Terrain Patrol' },
  { id: 'BRAVO-2', name: 'BRAVO-2 · Rapid Tactical Strike Force', eta: '3.0 min', status: 'STANDBY', type: 'Armored Response' },
  { id: 'CHARLIE-3', name: 'CHARLIE-3 · Drone Recon & Searchlight Squad', eta: '45 sec', status: 'AIRBORNE', type: 'Autonomous UAV' },
  { id: 'DELTA-4', name: 'DELTA-4 · Central Outpost K9 Unit', eta: '2.5 min', status: 'READY', type: 'Canine Tracking' },
]

export default function QuickDispatchModal({ alert, onClose }) {
  const [selectedUnit, setSelectedUnit] = useState('ALPHA-1')
  const [radioChannel, setRadioChannel] = useState('CH-1 (Tactical North)')
  const [sirenActive, setSirenActive] = useState(true)
  const [gateLock, setGateLock] = useState(true)
  const [droneSupport, setDroneSupport] = useState(true)
  const [spotlightTrack, setSpotlightTrack] = useState(true)
  const [dispatched, setDispatched] = useState(false)
  const [dispatchTime, setDispatchTime] = useState(null)
  const [countdown, setCountdown] = useState(90)

  useEffect(() => {
    let timer = null
    if (dispatched && countdown > 0) {
      timer = setInterval(() => setCountdown(c => (c > 0 ? c - 1 : 0)), 1000)
    }
    return () => clearInterval(timer)
  }, [dispatched, countdown])

  const handleDispatch = () => {
    setDispatchTime(new Date().toLocaleTimeString('en-IN'))
    setDispatched(true)

    // Audio chime
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(520, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3)
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(); osc.stop(ctx.currentTime + 0.5)
    } catch {}
  }

  const camId = alert?.camera_id || alert?.cam || 'CAM-01'
  const trackId = alert?.track_id || alert?.id || 'TRK-8821'
  const risk = alert?.risk_score ?? alert?.risk ?? 96
  const unit = QRF_UNITS.find(u => u.id === selectedUnit) || QRF_UNITS[0]

  return (
    <div className="modal-backdrop">
      <div className="modal-box dispatch-modal" style={{ maxWidth: 640 }}>
        {/* Header */}
        <div className="modal-header" style={{ borderBottomColor: 'rgba(239, 68, 68, 0.4)' }}>
          <div className="modal-header-left">
            <span className="material-symbols-outlined icon-fill" style={{ color: 'var(--critical)', fontSize: 22 }}>
              e911_emergency
            </span>
            <span className="modal-title" style={{ color: 'var(--critical)' }}>TACTICAL EMERGENCY DISPATCH (QRF)</span>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">✕</button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: 'block', padding: 20 }}>
          {dispatched ? (
            <div className="dispatch-success-state" style={{ textAlign: 'center', padding: '24px 12px' }}>
              <div className="pulse-circle-wrap" style={{ margin: '0 auto 14px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 52, color: 'var(--success)' }}>verified</span>
              </div>
              <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--success)', letterSpacing: '0.05em', marginBottom: 6 }}>
                TACTICAL UNIT MOBILIZED
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                Unit <strong>{unit.name}</strong> dispatched on <strong>{radioChannel}</strong> at <strong>{dispatchTime}</strong>.
              </p>

              {/* Countdown timer */}
              <div style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 8, padding: '16px', marginBottom: 16,
                display: 'flex', justifyContent: 'space-around', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 800, color: 'var(--success)' }}>
                    00:{countdown < 10 ? `0${countdown}` : countdown}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ESTIMATED TIME TO TARGET</div>
                </div>
                <div style={{ height: 40, width: 1, background: 'var(--border-light)' }} />
                <div style={{ textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  <div>TARGET: <strong style={{ color: 'var(--critical)' }}>{camId} ({trackId})</strong></div>
                  <div>SECTOR INTERLOCK: <strong style={{ color: gateLock ? 'var(--warning)' : 'var(--text-muted)' }}>{gateLock ? 'SEALED' : 'OPEN'}</strong></div>
                  <div>PERIMETER SIREN: <strong style={{ color: sirenActive ? 'var(--critical)' : 'var(--text-muted)' }}>{sirenActive ? 'BLARING' : 'SILENT'}</strong></div>
                </div>
              </div>

              <button className="btn-accent" onClick={onClose} style={{ width: '100%', padding: '10px' }}>
                RETURN TO COMMAND CENTER
              </button>
            </div>
          ) : (
            <>
              {/* Alert Summary Box */}
              <div className="dispatch-summary-box" style={{ background: 'var(--critical-bg)', border: '1px solid var(--critical-bd)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span className="alert-severity-tag tag-critical">
                    <span className="material-symbols-outlined" style={{ fontSize: 12, marginRight: 2 }}>warning</span>
                    CRITICAL THREAT BREACH
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--critical)', fontWeight: 800 }}>
                    RISK SCORE: {risk}/100
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                  {alert?.description || 'Perimeter Fence Breach & Restricted Buffer Zone Infiltration'}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  <span>SECTOR: <strong style={{ color: 'var(--accent)' }}>{camId}</strong></span>
                  <span>TARGET: <strong style={{ color: 'var(--text-primary)' }}>{trackId}</strong></span>
                  <span>LATENCY: <strong style={{ color: 'var(--success)' }}>14ms (EDGE AI)</strong></span>
                </div>
              </div>

              {/* SOP Action Checklist */}
              <div className="sop-section" style={{ marginBottom: 16 }}>
                <div className="sop-section-title" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  Standard Operating Procedure (SOP) Action Checklist
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginBottom: 4 }}>
                      1. ASSIGN QRF PATROL UNIT:
                    </label>
                    <select
                      value={selectedUnit}
                      onChange={(e) => setSelectedUnit(e.target.value)}
                      style={{
                        width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                        color: 'var(--text-primary)', padding: '8px 10px', borderRadius: 6,
                        fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none'
                      }}
                    >
                      {QRF_UNITS.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} (ETA: {u.eta})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginBottom: 4 }}>
                      2. COMMS FREQUENCY:
                    </label>
                    <select
                      value={radioChannel}
                      onChange={(e) => setRadioChannel(e.target.value)}
                      style={{
                        width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                        color: 'var(--text-primary)', padding: '8px 10px', borderRadius: 6,
                        fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none'
                      }}
                    >
                      <option value="CH-1 (Tactical North)">CH-1 (Tactical North)</option>
                      <option value="CH-2 (Drone Command)">CH-2 (Drone Airborne)</option>
                      <option value="CH-3 (High Alert HQ)">CH-3 (HQ Secure Relay)</option>
                    </select>
                  </div>
                </div>

                {/* 4 Interactive Action Toggles */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label className="sop-checkbox-card" style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: sirenActive ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-surface)',
                    border: `1px solid ${sirenActive ? 'var(--critical-bd)' : 'var(--border-light)'}`,
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer'
                  }}>
                    <input type="checkbox" checked={sirenActive} onChange={e => setSirenActive(e.target.checked)} />
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: sirenActive ? 'var(--critical)' : 'var(--text-primary)' }}>
                        SOUND SECTOR SIREN
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Audio deterrent beacon</div>
                    </div>
                  </label>

                  <label className="sop-checkbox-card" style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: gateLock ? 'rgba(234, 179, 8, 0.1)' : 'var(--bg-surface)',
                    border: `1px solid ${gateLock ? 'var(--warning-bd)' : 'var(--border-light)'}`,
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer'
                  }}>
                    <input type="checkbox" checked={gateLock} onChange={e => setGateLock(e.target.checked)} />
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: gateLock ? 'var(--warning)' : 'var(--text-primary)' }}>
                        AUTO-LOCK PERIMETER
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Seal automated gates</div>
                    </div>
                  </label>

                  <label className="sop-checkbox-card" style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: droneSupport ? 'rgba(14, 165, 233, 0.1)' : 'var(--bg-surface)',
                    border: `1px solid ${droneSupport ? 'var(--accent-bd)' : 'var(--border-light)'}`,
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer'
                  }}>
                    <input type="checkbox" checked={droneSupport} onChange={e => setDroneSupport(e.target.checked)} />
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: droneSupport ? 'var(--accent)' : 'var(--text-primary)' }}>
                        LAUNCH DRONE SWARM
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Airborne thermal tracking</div>
                    </div>
                  </label>

                  <label className="sop-checkbox-card" style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: spotlightTrack ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-surface)',
                    border: `1px solid ${spotlightTrack ? 'var(--success-bd)' : 'var(--border-light)'}`,
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer'
                  }}>
                    <input type="checkbox" checked={spotlightTrack} onChange={e => setSpotlightTrack(e.target.checked)} />
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: spotlightTrack ? 'var(--success)' : 'var(--text-primary)' }}>
                        PTZ SPOTLIGHT LOCK
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Track target with 10k lumen beam</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button className="btn-ghost" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="btn-critical"
                  onClick={handleDispatch}
                  style={{
                    background: 'var(--critical)',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: 6,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>send</span>
                  CONFIRM & DISPATCH {unit.id}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
