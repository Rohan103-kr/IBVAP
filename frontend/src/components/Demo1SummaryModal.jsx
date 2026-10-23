import React from 'react'

export default function Demo1SummaryModal({ isOpen, onClose, data, onRestart }) {
  if (!isOpen || !data) return null

  const {
    cam07_vehicles = 2,
    cam01_environmental = 1,
    cam03_patrol = 1,
    total_detections = 4,
    security_incidents = 0,
    critical_alerts = 0,
    suppressed_routine = 4,
    operator_workload = 'LOW',
    key_message = 'DETECTION ≠ INCIDENT',
    elapsed_sec = 32.0,
    shots = []
  } = data

  const copyToClipboard = () => {
    const reportText = `
==================================================
             ROUTINE ACTIVITY SUMMARY
==================================================
CAM-07  Vehicles detected:    ${cam07_vehicles} (V-12 Car, V-13 Truck)
CAM-01  Environmental events: ${cam01_environmental} (Cattle / Animal activity)
CAM-03  Authorized patrol:    ${cam03_patrol} (P-03 Friendly Officer)
--------------------------------------------------
Total detections:             ${total_detections}
Security incidents:           ${security_incidents}
Critical alerts:              ${critical_alerts}
Suppressed/routine:           ${suppressed_routine}
Operator workload:            ${operator_workload}
--------------------------------------------------
KEY MESSAGE: ${key_message}
==================================================
    `.trim()
    navigator.clipboard.writeText(reportText)
    alert('Routine Activity Summary copied to clipboard!')
  }

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 640,
          width: '92%',
          background: 'var(--bg-panel)',
          border: '1px solid rgba(59, 130, 246, 0.4)',
          borderRadius: 12,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(59, 130, 246, 0.2)',
          padding: 24,
          color: 'var(--text-primary)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid #3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>shield_with_heart</span>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
                DEMO 1 — NORMAL TRAFFIC → SUPPRESSION
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Verification that IBVAP distinguishes routine activity from true security violations
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="icon-btn"
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>

        {/* Key Message Tactical Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(16, 185, 129, 0.12))',
            border: '1px solid rgba(59, 130, 246, 0.35)',
            borderRadius: 8,
            padding: '10px 16px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#38bdf8' }}>info</span>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>
                Operational Paradigm
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#38bdf8', letterSpacing: '0.03em' }}>
                KEY MESSAGE: {key_message}
              </div>
            </div>
          </div>
          <div
            style={{
              padding: '4px 10px',
              borderRadius: 20,
              background: 'rgba(16, 185, 129, 0.2)',
              border: '1px solid #10b981',
              color: '#34d399',
              fontSize: 11,
              fontWeight: 700
            }}
          >
            ✓ 100% SUPPRESSED
          </div>
        </div>

        {/* Executive Summary Grid Table */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 20,
            fontFamily: 'var(--font-mono)',
            fontSize: 12
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.1em',
              color: '#94a3b8',
              marginBottom: 12,
              borderBottom: '1px solid var(--border)',
              paddingBottom: 6
            }}
          >
            ROUTINE ACTIVITY SUMMARY
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ color: 'var(--text-secondary)' }}>CAM-07 &nbsp;Vehicles detected:</span>
            <span style={{ fontWeight: 700, color: '#38bdf8' }}>{cam07_vehicles} (V-12 Car, V-13 Truck)</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ color: 'var(--text-secondary)' }}>CAM-01 &nbsp;Environmental events:</span>
            <span style={{ fontWeight: 700, color: '#94a3b8' }}>{cam01_environmental} (Cattle / Routine Wildlife)</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ color: 'var(--text-secondary)' }}>CAM-03 &nbsp;Authorized patrol:</span>
            <span style={{ fontWeight: 700, color: '#34d399' }}>{cam03_patrol} (P-03 Friendly Officer)</span>
          </div>

          <div style={{ borderTop: '1px dashed var(--border)', margin: '8px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Total detections:</span>
            <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{total_detections}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Security incidents:</span>
            <span style={{ fontWeight: 800, color: '#34d399' }}>{security_incidents} (Zero False Alarms)</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Critical alerts:</span>
            <span style={{ fontWeight: 800, color: '#34d399' }}>{critical_alerts} (Zero Alarms)</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Suppressed / routine:</span>
            <span style={{ fontWeight: 800, color: '#38bdf8' }}>{suppressed_routine}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Operator workload:</span>
            <span style={{ fontWeight: 800, color: '#34d399' }}>{operator_workload}</span>
          </div>
        </div>

        {/* Shot Progression Breakdown Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          <div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 6, border: '1px solid var(--border)', fontSize: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: '#38bdf8' }}>Shot A · CAM-07 Car</span>
              <span style={{ fontSize: 9, color: 'var(--success)' }}>✓ ROUTINE</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#94a3b8' }}>
              V-12 CAR 96% | RISK: 0
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 6, border: '1px solid var(--border)', fontSize: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: '#38bdf8' }}>Shot B · CAM-07 Truck</span>
              <span style={{ fontSize: 9, color: 'var(--success)' }}>✓ ROUTINE</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#94a3b8' }}>
              V-13 TRUCK 94% | RISK: 0
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 6, border: '1px solid var(--border)', fontSize: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: '#94a3b8' }}>Shot C · CAM-01 Cattle</span>
              <span style={{ fontSize: 9, color: 'var(--success)' }}>✓ SUPPRESSED</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#94a3b8' }}>
              CATTLE / ENV | RISK: 0
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 6, border: '1px solid var(--border)', fontSize: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: '#34d399' }}>Shot D · CAM-03 Patrol</span>
              <span style={{ fontSize: 9, color: 'var(--success)' }}>✓ OFFSET -20</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#94a3b8' }}>
              P-03 AUTHORIZED | FINAL: 0
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <button
            onClick={copyToClipboard}
            className="btn-draw-zone"
            style={{ padding: '8px 14px', fontSize: 11, background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_copy</span>
            Copy Text Summary
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {onRestart && (
              <button
                onClick={onRestart}
                className="btn-draw-zone"
                style={{ padding: '8px 14px', fontSize: 11, background: 'rgba(59, 130, 246, 0.15)', borderColor: '#3b82f6', color: '#60a5fa' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>replay</span>
                Replay Demo 1
              </button>
            )}
            <button
              onClick={onClose}
              className="btn-accent"
              style={{ padding: '8px 18px', fontSize: 11 }}
            >
              Close & Monitor Feeds
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
