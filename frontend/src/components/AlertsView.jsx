import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import ShiftSummaryModal from './ShiftSummaryModal'
import TargetContinuityCard from './TargetContinuityCard'
import SpeedometerGauge from './SpeedometerGauge'

const API_BASE = 'http://localhost:8000'

const SEV_ORDER = { CRITICAL: 0, HIGH: 1, WARNING: 2, INFO: 3 }

function fmtTs(ts) {
  if (!ts) return '--:--:--'
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  } catch { return ts }
}

function fmtRelative(ts) {
  if (!ts) return ''
  try {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
    if (diff < 5) return 'just now'
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  } catch { return '' }
}

function RiskGauge({ value = 0, color }) {
  const r = 14
  const circ = 2 * Math.PI * r
  const dash = (value / 100) * circ
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" style={{ flexShrink: 0 }}>
      <circle cx="19" cy="19" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
      <circle
        cx="19" cy="19" r={r} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 19 19)"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x="19" y="23" textAnchor="middle" fill={color} fontSize="9" fontFamily="'JetBrains Mono', monospace" fontWeight="800">
        {value}
      </text>
    </svg>
  )
}

function PulsingDot({ color }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 10, height: 10 }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: color, opacity: 0.4,
        animation: 'alert-pulse 1.5s ease-out infinite'
      }} />
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
    </span>
  )
}

function formatCleanDesc(raw) {
  if (!raw) return 'Perimeter intrusion activity recorded'
  let clean = raw.replace(/^BIIE SYNTHESIS:\s*/i, '').replace(/\s*\(\+\d+\)/g, '')
  const parts = clean.split(/\s*·\s*/)
  return parts.slice(0, 2).join(' · ')
}

function StatCard({ label, value, color, icon, sublabel }) {
  return (
    <div className="alert-stat-card" style={{ borderColor: color + '44' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="material-symbols-outlined icon-fill" style={{ fontSize: 16, color }}>{icon}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 800, color }}>{value}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      {sublabel && <div style={{ fontSize: 9, color, marginTop: 2, opacity: 0.8 }}>{sublabel}</div>}
    </div>
  )
}

function AlertCard({ alert, onInvestigate, onOpenDispatch, onAcknowledge, acknowledged }) {
  const sev = (alert.severity || 'INFO').toUpperCase()
  const risk = alert.risk_score ?? alert.riskScore ?? 0
  const [relative, setRelative] = useState(fmtRelative(alert.timestamp))
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setRelative(fmtRelative(alert.timestamp)), 5000)
    return () => clearInterval(t)
  }, [alert.timestamp])

  const COLOR = { CRITICAL: '#ef4444', HIGH: '#f97316', WARNING: '#eab308', INFO: '#0ea5e9' }
  const color = COLOR[sev] || '#0ea5e9'

  const BG = {
    CRITICAL: 'rgba(239,68,68,0.07)',
    HIGH: 'rgba(249,115,22,0.07)',
    WARNING: 'rgba(234,179,8,0.07)',
    INFO: 'rgba(14,165,233,0.07)'
  }

  const eventTypeIcon = {
    FENCE_CROSSING: 'fence',
    ZONE_ENTRY: 'workspaces',
    ANPR_ALERT: 'directions_car',
    LOITERING: 'person_pin',
    CROWD_SURGE: 'groups',
    FACE_MATCH: 'face',
    MULTI_CAMERA_CORRELATION: 'hub',
  }
  const icon = eventTypeIcon[alert.event_type] || 'warning'

  return (
    <div
      className="alert-card-v2"
      style={{
        background: acknowledged ? 'rgba(18,27,43,0.5)' : BG[sev],
        borderColor: acknowledged ? 'var(--border-light)' : color + '55',
        opacity: acknowledged ? 0.55 : 1,
      }}
    >
      {/* Left accent bar */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: acknowledged ? 'var(--border-light)' : color,
        borderRadius: '6px 0 0 6px'
      }} />

      {/* Critical pulse dot */}
      {!acknowledged && sev === 'CRITICAL' && (
        <div style={{ position: 'absolute', top: 12, left: 9 }}>
          <PulsingDot color={color} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: (sev === 'CRITICAL' && !acknowledged) ? 14 : 8 }}>
        {/* Speedometer Gauge Dial Meter */}
        <SpeedometerGauge value={risk} size={80} showLabel={false} />

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize: 13, color: acknowledged ? 'var(--text-muted)' : color }}>{icon}</span>
            <span className={`alert-severity-tag tag-${sev.toLowerCase()}`} style={acknowledged ? { opacity: 0.4 } : {}}>
              {sev}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: acknowledged ? 'var(--text-muted)' : 'var(--text-primary)' }}>
              {alert.id || alert.event_id || 'EVT-????'}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)',
              background: 'var(--accent-bg)', padding: '1px 6px', borderRadius: 3,
              border: '1px solid var(--accent-bd)'
            }}>
              {alert.camera_id || 'CAM-??'}
            </span>
            {alert.track_id && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
                background: 'var(--bg-surface)', padding: '1px 6px', borderRadius: 3,
                border: '1px solid var(--border)'
              }}>
                TRK-{alert.track_id}
              </span>
            )}
            {acknowledged && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--success)',
                background: 'rgba(16,185,129,0.1)', padding: '1px 6px', borderRadius: 3,
                border: '1px solid rgba(16,185,129,0.3)'
              }}>
                ✓ ACK
              </span>
            )}
          </div>

          {/* Description */}
          <div style={{ fontSize: 12, color: acknowledged ? 'var(--text-muted)' : 'var(--text-primary)', lineHeight: 1.4, marginBottom: 4 }}>
            {formatCleanDesc(alert.description || alert.event_type)}
          </div>

          {/* 2-Second Explainable XAI Checkmarks */}
          {alert.reasons && alert.reasons.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0 6px' }}>
              {alert.reasons.slice(0, expanded ? undefined : 3).map((r, i) => (
                <span key={i} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9.5,
                  color: sev === 'CRITICAL' ? '#fca5a5' : 'var(--text-mono)',
                  background: sev === 'CRITICAL' ? 'rgba(239,68,68,0.12)' : 'var(--bg-surface)',
                  padding: '2px 7px', borderRadius: 4,
                  border: `1px solid ${sev === 'CRITICAL' ? 'rgba(239,68,68,0.3)' : 'var(--border-light)'}`,
                  display: 'inline-flex', alignItems: 'center', gap: 4
                }}>
                  <span style={{ color: sev === 'CRITICAL' ? '#ef4444' : 'var(--success)', fontWeight: 800 }}>✓</span>
                  {r}
                </span>
              ))}
              {alert.reasons.length > 3 && (
                <button
                  onClick={() => setExpanded(e => !e)}
                  style={{
                    background: 'none', border: 'none', color: 'var(--accent)',
                    fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer',
                    padding: '0 4px', display: 'inline-flex', alignItems: 'center'
                  }}
                >
                  {expanded ? 'Hide extra' : `+${alert.reasons.length - 3} more`}
                </button>
              )}
            </div>
          )}

          {/* Footer meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 10 }}>schedule</span>
              {fmtTs(alert.timestamp)}
            </span>
            <span style={{ color: 'var(--border-light)' }}>•</span>
            <span>{relative}</span>
            {alert.event_type && (
              <>
                <span style={{ color: 'var(--border-light)' }}>•</span>
                <span style={{ color: 'var(--text-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {alert.event_type.replace(/_/g, ' ')}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
          <button
            className="alert-action-btn"
            onClick={e => { e.stopPropagation(); onInvestigate && onInvestigate(alert) }}
            title="Open Forensic Dossier"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>open_in_new</span>
            Dossier
          </button>

          {sev === 'CRITICAL' && (
            <button
              className="alert-action-btn alert-action-btn--dispatch"
              onClick={e => { e.stopPropagation(); onOpenDispatch && onOpenDispatch(alert) }}
              title="Dispatch Quick Reaction Force"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>e911_emergency</span>
              Dispatch QRF
            </button>
          )}

          {!acknowledged && (
            <button
              className="alert-action-btn alert-action-btn--ack"
              onClick={e => { e.stopPropagation(); onAcknowledge && onAcknowledge(alert.id || alert.event_id) }}
              title="Acknowledge this alert"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check</span>
              Acknowledge
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AlertsView({ alerts = [], onInvestigate, onOpenDispatch, onClearAll }) {
  const [filter, setFilter]           = useState('ALL')
  const [search, setSearch]           = useState('')
  const [sortBy, setSortBy]           = useState('severity')
  const [acknowledged, setAcknowledged] = useState(new Set())
  const [showAcked, setShowAcked]     = useState(false)
  const tickerRef = useRef(null)

  // ── Clock & Date / Time Filters ──
  const [timeRange, setTimeRange]     = useState('ALL') // 'ALL', '15m', '1h', '6h', '24h', 'custom'
  const [customStartTime, setCustomStartTime] = useState('00:00')
  const [customEndTime, setCustomEndTime]     = useState('23:59')
  const [datePreset, setDatePreset]   = useState('ALL') // 'ALL', 'TODAY', 'YESTERDAY', '7DAYS', 'CUSTOM'
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [activeTargets, setActiveTargets] = useState([])

  // Live ticking clock & targets poll
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000)
    const fetchTargets = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/targets/active`)
        const data = await res.json()
        setActiveTargets(data.targets || [])
      } catch {}
    }
    fetchTargets()
    const tTargets = setInterval(fetchTargets, 4000)
    return () => {
      clearInterval(t)
      clearInterval(tTargets)
    }
  }, [])

  /* ── Ticker animation ── */
  useEffect(() => {
    const el = tickerRef.current
    if (!el) return
    let frame, pos = 0
    const step = () => {
      pos -= 0.4
      if (pos < -(el.scrollWidth / 2)) pos = 0
      el.style.transform = `translateX(${pos}px)`
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [alerts])

  const handleAcknowledge = useCallback((id) => {
    if (!id) return
    setAcknowledged(prev => new Set([...prev, id]))
  }, [])

  const handleAcknowledgeAll = () => {
    const ids = alerts.map(a => a.id || a.event_id).filter(Boolean)
    setAcknowledged(prev => new Set([...prev, ...ids]))
  }

  const handleExportCSV = () => {
    const rows = [
      ['ID', 'Severity', 'Camera', 'Track', 'Risk', 'EventType', 'Description', 'Timestamp'],
      ...filtered.map(a => [
        a.id || a.event_id || '',
        a.severity || '',
        a.camera_id || '',
        a.track_id || '',
        a.risk_score ?? '',
        a.event_type || '',
        (a.description || '').replace(/,/g, ';'),
        a.timestamp || ''
      ])
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ibvap_alerts_${selectedDate || 'shift'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ── Filtered list by Date, Time, Severity, Search ── */
  const filtered = useMemo(() => {
    let list = [...alerts]
    const now = Date.now()

    // 1. Filter by Date
    if (datePreset === 'TODAY') {
      const todayStr = new Date().toISOString().slice(0, 10)
      list = list.filter(a => (a.timestamp || '').startsWith(todayStr))
    } else if (datePreset === 'YESTERDAY') {
      const yest = new Date(now - 86400000).toISOString().slice(0, 10)
      list = list.filter(a => (a.timestamp || '').startsWith(yest))
    } else if (datePreset === '7DAYS') {
      const past7 = now - 7 * 86400000
      list = list.filter(a => new Date(a.timestamp || 0).getTime() >= past7)
    } else if (datePreset === 'CUSTOM' && selectedDate) {
      list = list.filter(a => (a.timestamp || '').startsWith(selectedDate))
    }

    // 2. Filter by Time Window / Clock Range
    if (timeRange === '15m') {
      list = list.filter(a => new Date(a.timestamp || 0).getTime() >= now - 15 * 60 * 1000)
    } else if (timeRange === '1h') {
      list = list.filter(a => new Date(a.timestamp || 0).getTime() >= now - 60 * 60 * 1000)
    } else if (timeRange === '6h') {
      list = list.filter(a => new Date(a.timestamp || 0).getTime() >= now - 6 * 3600 * 1000)
    } else if (timeRange === '24h') {
      list = list.filter(a => new Date(a.timestamp || 0).getTime() >= now - 24 * 3600 * 1000)
    } else if (timeRange === 'custom') {
      list = list.filter(a => {
        if (!a.timestamp) return true
        try {
          const d = new Date(a.timestamp)
          const hhmm = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
          return hhmm >= customStartTime && hhmm <= customEndTime
        } catch { return true }
      })
    }

    // 3. Filter Acknowledged
    if (!showAcked) list = list.filter(a => { const id = a.id || a.event_id; return !id || !acknowledged.has(id) })

    // 4. Filter by Severity
    if (filter !== 'ALL') list = list.filter(a => (a.severity || '').toUpperCase() === filter)

    // 5. Text Search
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        (a.description || '').toLowerCase().includes(q) ||
        (a.camera_id || '').toLowerCase().includes(q) ||
        (a.track_id || '').toLowerCase().includes(q) ||
        (a.id || '').toLowerCase().includes(q) ||
        (a.event_type || '').toLowerCase().includes(q)
      )
    }

    // 6. Sort
    list.sort((a, b) => {
      if (sortBy === 'severity') {
        const sa = SEV_ORDER[(a.severity || '').toUpperCase()] ?? 4
        const sb = SEV_ORDER[(b.severity || '').toUpperCase()] ?? 4
        return sa !== sb ? sa - sb : (b.risk_score ?? 0) - (a.risk_score ?? 0)
      }
      if (sortBy === 'risk') return (b.risk_score ?? 0) - (a.risk_score ?? 0)
      if (sortBy === 'time') return new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
      return 0
    })
    return list
  }, [alerts, datePreset, selectedDate, timeRange, customStartTime, customEndTime, filter, search, sortBy, showAcked, acknowledged])

  /* ── Derived counts from filtered window ── */
  const counts = useMemo(() => ({
    CRITICAL: filtered.filter(a => (a.severity || '').toUpperCase() === 'CRITICAL').length,
    HIGH:     filtered.filter(a => (a.severity || '').toUpperCase() === 'HIGH').length,
    WARNING:  filtered.filter(a => (a.severity || '').toUpperCase() === 'WARNING').length,
    INFO:     filtered.filter(a => (a.severity || '').toUpperCase() === 'INFO').length,
    TOTAL:    filtered.length,
    UNACKED:  filtered.filter(a => { const id = a.id || a.event_id; return id && !acknowledged.has(id) }).length,
  }), [filtered, acknowledged])

  const criticals = filtered.filter(a => (a.severity || '').toUpperCase() === 'CRITICAL').slice(0, 8)

  return (
    <div className="view alerts-view-v2" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ═══ Clean Top Summary Bar ═══ */}
      <div className="alert-stats-bar" style={{ padding: '8px 16px', gap: 12 }}>
        <StatCard label="Critical Threats"  value={counts.CRITICAL} color="#ef4444" icon="crisis_alert"   sublabel={counts.CRITICAL > 0 ? '🔴 Immediate Action Required' : 'All clear'} />
        <StatCard label="High Risk"         value={counts.HIGH}     color="#f97316" icon="priority_high"  sublabel="Require sentry monitoring" />
        <StatCard label="Total Active"      value={counts.TOTAL}    color="var(--accent)" icon="event_list" sublabel={`${counts.UNACKED} unacknowledged`} />
      </div>

      {/* ═══ Unified Single Toolbar ═══ */}
      <div className="view-toolbar" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '6px 16px', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="toolbar-title" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize: 16, color: 'var(--critical)' }}>notifications_active</span>
            Security Incidents Feed
          </span>
        </div>

        {/* Severity Filter Chips */}
        <div className="toolbar-group">
          {['ALL', 'CRITICAL', 'HIGH', 'WARNING'].map(f => (
            <button
              key={f}
              className={`toolbar-btn${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
              style={f === 'CRITICAL' && counts.CRITICAL > 0 && filter !== 'CRITICAL' ? { color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)' } : {}}
            >
              {f === 'ALL' ? `ALL (${counts.TOTAL})` : `${f} (${counts[f] || 0})`}
            </button>
          ))}
        </div>

        {/* Search & Actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-muted)', pointerEvents: 'none' }}>search</span>
            <input
              type="text"
              placeholder="Search camera, track, event..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                color: 'var(--text-primary)', padding: '4px 10px 4px 27px',
                borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11, width: 220, outline: 'none',
              }}
            />
          </div>

          {counts.UNACKED > 0 && (
            <button className="toolbar-btn" onClick={handleAcknowledgeAll} style={{ fontSize: 10, borderColor: 'var(--success-bd)', color: 'var(--success)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2 }}>done_all</span>
              Ack All ({counts.UNACKED})
            </button>
          )}

          <button className="toolbar-btn" onClick={() => setIsReportModalOpen(true)} style={{ fontSize: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2 }}>summarize</span>
            Report
          </button>

          <button className="toolbar-btn" onClick={handleExportCSV} style={{ fontSize: 10 }} title="Export filtered alerts as CSV">
            <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2 }}>download</span>
            CSV
          </button>
        </div>
      </div>

      {/* ═══ Spacious Alert Cards List ═══ */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: 60 }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize: 48, color: 'var(--success)', marginBottom: 12, display: 'block' }}>verified_user</span>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', marginBottom: 6 }}>
              ALL CLEAR — NO ACTIVE THREATS
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Monitoring boundary zones and tripwire sensors in real-time.
            </div>
          </div>
        ) : (
          filtered.map(a => (
            <AlertCard
              key={a.id || a.event_id}
              alert={a}
              onInvestigate={onInvestigate}
              onOpenDispatch={onOpenDispatch}
              onAcknowledge={handleAcknowledge}
              acknowledged={acknowledged.has(a.id || a.event_id)}
            />
          ))
        )}
      </div>

      {/* ═══ Shift Summary Report Modal ═══ */}
      <ShiftSummaryModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        alerts={filtered}
        dateFilter={datePreset}
        selectedDate={datePreset === 'CUSTOM' ? selectedDate : datePreset}
        timeRange={timeRange}
        customStartTime={customStartTime}
        customEndTime={customEndTime}
      />
    </div>
  )
}

