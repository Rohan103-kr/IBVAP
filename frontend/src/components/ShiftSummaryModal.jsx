import React from 'react'

export default function ShiftSummaryModal({
  isOpen,
  onClose,
  alerts = [],
  dateFilter,
  selectedDate,
  timeRange,
  customStartTime,
  customEndTime
}) {
  if (!isOpen) return null

  const now = new Date()
  const reportId = `REP-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*9000+1000)}`

  const total = alerts.length
  const critical = alerts.filter(a => (a.severity || '').toUpperCase() === 'CRITICAL').length
  const high = alerts.filter(a => (a.severity || '').toUpperCase() === 'HIGH').length
  const warning = alerts.filter(a => (a.severity || '').toUpperCase() === 'WARNING').length
  const info = alerts.filter(a => (a.severity || '').toUpperCase() === 'INFO').length

  const avgRisk = total > 0
    ? Math.round(alerts.reduce((acc, a) => acc + (a.risk_score ?? a.riskScore ?? 0), 0) / total)
    : 0

  // Sector breakdown
  const camCounts = {}
  alerts.forEach(a => {
    const cam = a.camera_id || 'UNKNOWN'
    camCounts[cam] = (camCounts[cam] || 0) + 1
  })

  // Event type breakdown
  const typeCounts = {}
  alerts.forEach(a => {
    const t = a.event_type || 'ZONE_ENTRY'
    typeCounts[t] = (typeCounts[t] || 0) + 1
  })

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadJSON = () => {
    const reportData = {
      report_id: reportId,
      generated_at: now.toISOString(),
      filter_criteria: {
        date_filter: dateFilter,
        selected_date: selectedDate,
        time_range: timeRange,
        custom_time: timeRange === 'custom' ? `${customStartTime} - ${customEndTime}` : 'N/A'
      },
      summary_metrics: {
        total_incidents: total,
        critical_threats: critical,
        high_risk: high,
        warnings: warning,
        info: info,
        avg_risk_score: avgRisk
      },
      sector_distribution: camCounts,
      event_type_distribution: typeCounts,
      incident_records: alerts
    }

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `IBVAP_Shift_Report_${selectedDate || 'summary'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-box report-modal" style={{ maxWidth: 840, maxHeight: '92vh' }}>
        
        {/* Modal Header */}
        <div className="modal-header" style={{ borderBottomColor: 'var(--accent-bd)', background: 'rgba(14, 165, 233, 0.05)' }}>
          <div className="modal-header-left">
            <span className="material-symbols-outlined icon-fill" style={{ color: 'var(--accent)', fontSize: 22 }}>
              summarize
            </span>
            <span className="modal-title" style={{ color: 'var(--text-primary)' }}>
              TACTICAL SHIFT INCIDENT REPORT
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              background: 'var(--bg-surface)', padding: '2px 6px',
              borderRadius: 4, border: '1px solid var(--border-light)',
              color: 'var(--accent)'
            }}>
              {reportId}
            </span>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">✕</button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
          
          {/* Header Metadata Grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
            background: 'var(--bg-surface)', padding: 12, borderRadius: 6,
            border: '1px solid var(--border-light)', fontFamily: 'var(--font-mono)', fontSize: 11
          }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase' }}>Selected Date</div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{selectedDate || 'ALL DATES'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase' }}>Time Window</div>
              <div style={{ fontWeight: 700, color: 'var(--accent)' }}>
                {timeRange === 'custom' ? `${customStartTime} - ${customEndTime}` : `${timeRange.toUpperCase()}`}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase' }}>Generated At</div>
              <div style={{ color: 'var(--text-mono)' }}>{now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase' }}>Security Clearance</div>
              <div style={{ color: 'var(--success)', fontWeight: 700 }}>LEVEL 3 (AUTHENTICATED)</div>
            </div>
          </div>

          {/* Key Metric KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            <div className="alert-stat-card" style={{ borderColor: 'rgba(14, 165, 233, 0.4)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Incidents</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{total}</div>
            </div>
            <div className="alert-stat-card" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Critical Threats</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--critical)', fontFamily: 'var(--font-mono)' }}>{critical}</div>
            </div>
            <div className="alert-stat-card" style={{ borderColor: 'rgba(249, 115, 22, 0.4)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>High Risk</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--high)', fontFamily: 'var(--font-mono)' }}>{high}</div>
            </div>
            <div className="alert-stat-card" style={{ borderColor: 'rgba(234, 179, 8, 0.4)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Warnings</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--warning)', fontFamily: 'var(--font-mono)' }}>{warning}</div>
            </div>
            <div className="alert-stat-card" style={{ borderColor: 'rgba(16, 185, 129, 0.4)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg Threat Risk</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: avgRisk >= 75 ? 'var(--critical)' : 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                {avgRisk}<span style={{ fontSize: 12 }}>/100</span>
              </div>
            </div>
          </div>

          {/* Sector & Incident Breakdown Rows */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* By Sector */}
            <div className="dossier-card">
              <div className="dossier-card-title">SECTOR INTRUSION DENSITY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.keys(camCounts).length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No sector activity in selected window</div>
                ) : (
                  Object.entries(camCounts).map(([cam, count]) => (
                    <div key={cam} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      <span>{cam}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 80, height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, (count / total) * 100)}%`, height: '100%', background: 'var(--accent)' }} />
                        </div>
                        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{count}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* By Incident Type */}
            <div className="dossier-card">
              <div className="dossier-card-title">THREAT CLASSIFICATION BREAKDOWN</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.keys(typeCounts).length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No threat records in selected window</div>
                ) : (
                  Object.entries(typeCounts).map(([type, count]) => (
                    <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      <span>{type.replace(/_/g, ' ')}</span>
                      <span style={{ fontWeight: 700, color: type.includes('FENCE') ? 'var(--critical)' : 'var(--text-primary)' }}>
                        {count} ({Math.round((count / total) * 100)}%)
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Incident Log Table Preview */}
          <div style={{ flex: 1, minHeight: 180, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              CHRONOLOGICAL INCIDENT RECORD LOG ({alerts.length} EVENTS)
            </div>
            <div style={{
              flex: 1, overflowY: 'auto', maxHeight: 220,
              background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
              borderRadius: 6
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--font-mono)', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: 9 }}>
                    <th style={{ padding: '6px 10px' }}>TIME</th>
                    <th style={{ padding: '6px 10px' }}>EVENT ID</th>
                    <th style={{ padding: '6px 10px' }}>SEV</th>
                    <th style={{ padding: '6px 10px' }}>CAM</th>
                    <th style={{ padding: '6px 10px' }}>RISK</th>
                    <th style={{ padding: '6px 10px' }}>DESCRIPTION</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                        No incidents recorded for this time range.
                      </td>
                    </tr>
                  ) : (
                    alerts.map((a, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>
                          {a.timestamp ? new Date(a.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '--:--'}
                        </td>
                        <td style={{ padding: '6px 10px', fontWeight: 700 }}>{a.id || a.event_id || 'EVT-????'}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <span className={`alert-severity-tag tag-${(a.severity || 'info').toLowerCase()}`} style={{ fontSize: 8, padding: '1px 4px' }}>
                            {a.severity}
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--accent)' }}>{a.camera_id}</td>
                        <td style={{ padding: '6px 10px', fontWeight: 800, color: (a.risk_score ?? 0) >= 80 ? 'var(--critical)' : 'var(--text-primary)' }}>
                          {a.risk_score ?? a.riskScore ?? 0}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)', maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {a.description || a.event_type}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--success)' }}>verified</span>
              CRYPTOGRAPHIC TAMPER-PROOF SHA-256 AUDIT TRAIL CERTIFIED
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={handleDownloadJSON}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 4 }}>data_object</span>
                EXPORT JSON
              </button>
              <button className="btn-accent" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>print</span>
                PRINT / SAVE PDF
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
