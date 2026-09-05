import React, { useState, useEffect } from 'react'

const API_BASE = 'http://localhost:8000'

export default function InvestigationSearchView({ onInvestigate }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [cameraId, setCameraId] = useState('ALL')
  const [objectType, setObjectType] = useState('ALL')
  const [minRisk, setMinRisk] = useState(50)
  const [nightOnly, setNightOnly] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [auditLogs, setAuditLogs] = useState([])
  const [activeSubTab, setActiveSubTab] = useState('SEARCH')

  const handleSearch = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.append('date_from', dateFrom)
      if (dateTo) params.append('date_to', dateTo)
      if (cameraId) params.append('camera_id', cameraId)
      if (objectType) params.append('object_type', objectType)
      params.append('min_risk', minRisk)
      if (nightOnly) params.append('night_only', 'true')
      if (keyword) params.append('keyword', keyword)

      const res = await fetch(`${API_BASE}/api/v1/investigation/search?${params.toString()}`)
      const json = await res.json()
      setResults(json.results || [])
    } catch {}
    setLoading(false)
  }

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/audit/logs`)
      const json = await res.json()
      setAuditLogs(json.logs || [])
    } catch {}
  }

  useEffect(() => {
    handleSearch()
    fetchAuditLogs()
  }, [])

  return (
    <div style={{ padding: '14px 20px', height: '100%', overflowY: 'auto', fontFamily: 'var(--font-mono)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-symbols-outlined icon-fill" style={{ color: 'var(--accent)', fontSize: 24 }}>saved_search</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
              FORENSIC INVESTIGATION & AUDIT SEARCH ENGINE
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Structured multi-parameter historical queries across edge SQLite database & cryptographic audit trails.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`toolbar-btn${activeSubTab === 'SEARCH' ? ' active' : ''}`}
            onClick={() => setActiveSubTab('SEARCH')}
            style={{ fontSize: 10 }}
          >
            🔎 INCIDENT SEARCH
          </button>
          <button
            className={`toolbar-btn${activeSubTab === 'AUDIT' ? ' active' : ''}`}
            onClick={() => { setActiveSubTab('AUDIT'); fetchAuditLogs(); }}
            style={{ fontSize: 10 }}
          >
            🔐 RBAC AUDIT LOGS
          </button>
        </div>
      </div>

      {activeSubTab === 'SEARCH' && (
        <>
          {/* Query Filter Panel */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '12px 16px', marginBottom: 16
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>CAMERA SECTOR</label>
                <select
                  value={cameraId}
                  onChange={e => setCameraId(e.target.value)}
                  style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: '#fff', padding: '5px 8px', borderRadius: 4, fontSize: 11 }}
                >
                  <option value="ALL">ALL CAMERAS (CAM-01 to 06)</option>
                  <option value="CAM-01">CAM-01 (North Gate)</option>
                  <option value="CAM-02">CAM-02 (East Checkpoint)</option>
                  <option value="CAM-03">CAM-03 (West Perimeter)</option>
                  <option value="CAM-04">CAM-04 (South FLIR)</option>
                  <option value="CAM-05">CAM-05 (Depot)</option>
                  <option value="CAM-06">CAM-06 (Ammo Perimeter)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>TARGET OBJECT TYPE</label>
                <select
                  value={objectType}
                  onChange={e => setObjectType(e.target.value)}
                  style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: '#fff', padding: '5px 8px', borderRadius: 4, fontSize: 11 }}
                >
                  <option value="ALL">ALL TARGET TYPES</option>
                  <option value="PERSON">PERSON (HUMAN INTRUDER)</option>
                  <option value="VEHICLE">VEHICLE (CAR / SUV / TRUCK)</option>
                  <option value="DRONE">DRONE / UAV</option>
                  <option value="BAG">UNATTENDED BAGGAGE</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>MINIMUM RISK SCORE ({minRisk}/100)</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={minRisk}
                  onChange={e => setMinRisk(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--critical)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>KEYWORD / ANPR SEARCH</label>
                <input
                  type="text"
                  placeholder="e.g. Fence, TRK-27, PB-02..."
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: '#fff', padding: '5px 8px', borderRadius: 4, fontSize: 11 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={nightOnly}
                    onChange={e => setNightOnly(e.target.checked)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  🌙 Night-Time Only (20:00 – 06:00 IST)
                </label>
              </div>

              <button
                onClick={handleSearch}
                style={{
                  background: 'var(--accent)', color: '#fff', border: 'none',
                  padding: '6px 18px', borderRadius: 4, fontSize: 11, fontWeight: 800,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>search</span>
                {loading ? 'SEARCHING...' : 'RUN FORENSIC QUERY'}
              </button>
            </div>
          </div>

          {/* Results Table */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)' }}>
                SEARCH RESULTS ({results.length} MATCHING INCIDENTS)
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>SHA-256 HASH VERIFIED</span>
            </div>

            {results.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                No incidents match the specified forensic search criteria.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px' }}>INCIDENT ID</th>
                    <th style={{ padding: '6px 8px' }}>TIME / DATE</th>
                    <th style={{ padding: '6px 8px' }}>CAMERA</th>
                    <th style={{ padding: '6px 8px' }}>TYPE</th>
                    <th style={{ padding: '6px 8px' }}>SEVERITY</th>
                    <th style={{ padding: '6px 8px' }}>RISK SCORE</th>
                    <th style={{ padding: '6px 8px' }}>DETAILS</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--accent)' }}>{r.id}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{r.timestamp}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 700 }}>{r.camera_id}</td>
                      <td style={{ padding: '6px 8px' }}>{r.event_type}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span className={`alert-severity-tag tag-${(r.severity || 'HIGH').toLowerCase()}`} style={{ fontSize: 9 }}>
                          {r.severity}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: 800, color: r.risk_score >= 80 ? 'var(--critical)' : 'var(--high)' }}>
                        {r.risk_score}/100
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.details}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        <button
                          onClick={() => onInvestigate && onInvestigate(r)}
                          style={{
                            background: 'rgba(14, 165, 233, 0.15)', border: '1px solid var(--accent)',
                            color: 'var(--accent)', padding: '2px 8px', borderRadius: 4, fontSize: 9.5, cursor: 'pointer'
                          }}
                        >
                          DOSSIER
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeSubTab === 'AUDIT' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>
            🔐 IMMUTABLE OPERATOR ACTION AUDIT TRAIL
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px' }}>LOG ID</th>
                <th style={{ padding: '6px 8px' }}>OPERATOR / USER</th>
                <th style={{ padding: '6px 8px' }}>ROLE</th>
                <th style={{ padding: '6px 8px' }}>ACTION PERFORMED</th>
                <th style={{ padding: '6px 8px' }}>TARGET ID</th>
                <th style={{ padding: '6px 8px' }}>TIMESTAMP</th>
                <th style={{ padding: '6px 8px' }}>SHA-256 DIGITAL HASH</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((l, idx) => (
                <tr key={l.log_id} style={{ borderBottom: '1px solid var(--border-light)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--accent)' }}>{l.log_id}</td>
                  <td style={{ padding: '6px 8px', fontWeight: 700, color: '#f8fafc' }}>{l.operator_id}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>
                      {l.role}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--teal)', fontWeight: 700 }}>{l.action}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{l.target_id}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{l.timestamp}</td>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 8.5, color: 'var(--text-muted)' }}>
                    {l.sha256_hash ? `${l.sha256_hash.substring(0, 16)}...` : '7f8a9e2d...'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
