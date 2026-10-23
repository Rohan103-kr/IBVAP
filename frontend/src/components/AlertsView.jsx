import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import ShiftSummaryModal from './ShiftSummaryModal'
import TargetContinuityCard from './TargetContinuityCard'
import SpeedometerGauge from './SpeedometerGauge'

const API_BASE = 'http://localhost:8000'

const SEV_ORDER = { CRITICAL: 0, HIGH: 1, WARNING: 2, INFO: 3 }

const EVENT_META = {
  FENCE_CROSSING:           { icon: 'fence',          label: 'Fence Breach',       color: '#f43f5e' },
  ZONE_ENTRY:               { icon: 'do_not_enter',   label: 'Zone Violation',      color: '#f43f5e' },
  ANPR_ALERT:               { icon: 'directions_car', label: 'ANPR Hit',            color: '#fb923c' },
  ANPR_WATCHLIST_MATCH:     { icon: 'directions_car', label: 'Watchlist Vehicle',   color: '#f43f5e' },
  SUSPICIOUS_LOITERING:     { icon: 'person_pin',     label: 'Loitering',           color: '#facc15' },
  LOITERING:                { icon: 'person_pin',     label: 'Loitering',           color: '#facc15' },
  CROWD_SURGE:              { icon: 'groups',         label: 'Crowd Surge',         color: '#fb923c' },
  FACE_MATCH:               { icon: 'face',           label: 'Face Match',          color: '#fb923c' },
  MULTI_CAMERA_CORRELATION: { icon: 'hub',            label: 'Cross-Cam Chain',     color: '#f43f5e' },
  NIGHT_INFILTRATION:       { icon: 'nights_stay',    label: 'Night Infiltration',  color: '#f43f5e' },
  COVERAGE_GAP_WARNING:     { icon: 'videocam_off',   label: 'Blind Zone',          color: '#facc15' },
  EDGE_OFFLINE_SYNC:        { icon: 'sync_problem',   label: 'Edge Offline',        color: '#facc15' },
  AUTHORIZED_PATROL:        { icon: 'security',       label: 'Friendly Patrol',     color: '#10b981' },
}

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

function StatCard({ label, value, color, icon, sublabel, pulsing }) {
  return (
    <div className="alert-stat-card" style={{ borderColor: color + '44' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="material-symbols-outlined icon-fill" style={{ fontSize: 16, color }}>{icon}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 800, color }}>
          {value}
          {pulsing && value > 0 && <span style={{
            display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
            background: color, marginLeft: 5, verticalAlign: 'middle',
            animation: 'alert-pulse 1.5s ease-out infinite'
          }} />}
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      {sublabel && <div style={{ fontSize: 9, color, marginTop: 2, opacity: 0.8 }}>{sublabel}</div>}
    </div>
  )
}

function IncidentClusterCard({ cluster, onInvestigate, onOpenDispatch, onAcknowledgeCluster }) {
  const sev = cluster.maxSeverity || 'INFO'
  const risk = cluster.maxRisk || 0
  const [expanded, setExpanded] = useState(false)
  const [showSubEvents, setShowSubEvents] = useState(false)
  const alert = cluster.primaryEvent || cluster.events[0]
  const acknowledged = cluster.allAcknowledged

  const COLOR = { CRITICAL: '#ef4444', HIGH: '#f97316', WARNING: '#eab308', INFO: '#0ea5e9' }
  const color = COLOR[sev] || '#0ea5e9'

  const BG = {
    CRITICAL: 'rgba(239,68,68,0.07)',
    HIGH: 'rgba(249,115,22,0.07)',
    WARNING: 'rgba(234,179,8,0.07)',
    INFO: 'rgba(14,165,233,0.07)'
  }

  const meta = EVENT_META[alert.event_type] || { icon: 'warning', label: (alert.event_type || 'ALERT').replace(/_/g, ' '), color }
  const isAnpr = cluster.eventTypes.some(t => t === 'ANPR_ALERT' || t === 'ANPR_WATCHLIST_MATCH')
  const isMultiCam = cluster.eventTypes.includes('MULTI_CAMERA_CORRELATION')
  const isCritical = sev === 'CRITICAL'
  const needsDispatch = isCritical || (risk >= 80 && isAnpr) || isMultiCam
  const numEvents = cluster.events.length

  return (
    <div
      className="alert-card-v2"
      style={{
        background: acknowledged ? 'var(--bg-surface)' : BG[sev],
        borderColor: acknowledged ? 'var(--border-light)' : color + '55',
        opacity: acknowledged ? 0.6 : 1,
      }}
    >
      {/* Left accent bar */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
        background: acknowledged ? 'var(--border-light)' : color,
        borderRadius: '6px 0 0 6px'
      }} />

      {/* Critical pulse dot */}
      {!acknowledged && isCritical && (
        <div style={{ position: 'absolute', top: 12, left: 9 }}>
          <PulsingDot color={color} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, paddingLeft: (isCritical && !acknowledged) ? 14 : 8 }}>
        {/* Speedometer Gauge & Snapshot Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <SpeedometerGauge value={risk} size={80} showLabel={false} />
          {cluster.snapshot && (
            <div
              style={{
                width: 72,
                height: 46,
                borderRadius: 4,
                overflow: 'hidden',
                border: `1px solid ${color}55`,
                background: '#090d16',
                cursor: 'pointer',
                position: 'relative'
              }}
              onClick={() => onInvestigate && onInvestigate(alert)}
              title="Inspect evidence snapshot in Forensic Dossier"
            >
              <img
                src={`http://localhost:8000/api/v1/snapshots/${cluster.snapshot.replace(/^.*[\\\/]/, '')}`}
                alt="Evidence"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { e.target.parentElement.style.display = 'none' }}
              />
              <span style={{
                position: 'absolute', bottom: 1, right: 2,
                fontSize: 7.5, fontFamily: 'var(--font-mono)',
                background: 'rgba(0,0,0,0.8)', padding: '0 3px', borderRadius: 2,
                color: '#38bdf8', fontWeight: 700
              }}>SNAP</span>
            </div>
          )}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize: 16, color: acknowledged ? 'var(--text-muted)' : meta.color }}>{meta.icon}</span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 900,
              color: meta.color, background: `${meta.color}18`,
              border: `1px solid ${meta.color}40`, padding: '2px 7px', borderRadius: 3,
              textTransform: 'uppercase'
            }}>{meta.label}</span>
            <span className={`alert-severity-tag tag-${sev.toLowerCase()}`} style={acknowledged ? { opacity: 0.4 } : {}}>
              {sev}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)',
              background: 'var(--accent-bg)', padding: '1px 6px', borderRadius: 3,
              border: '1px solid var(--accent-bd)', fontWeight: 700
            }}>
              {cluster.camera_id}
            </span>
            {cluster.track_id && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5, color: '#38bdf8',
                background: 'rgba(56,189,248,0.12)', padding: '1px 6px', borderRadius: 3,
                border: '1px solid rgba(56,189,248,0.35)', fontWeight: 800
              }}>
                TARGET #TRK-{cluster.track_id}
              </span>
            )}

            {/* Fusion Badge */}
            {numEvents > 1 && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
                color: '#f59e0b', background: 'rgba(245,158,11,0.14)',
                border: '1px solid rgba(245,158,11,0.4)', padding: '1px 6px', borderRadius: 4,
                display: 'inline-flex', alignItems: 'center', gap: 3
              }}>
                <span className="material-symbols-outlined icon-fill" style={{ fontSize: 11 }}>auto_awesome</span>
                {numEvents} Events Fused
              </span>
            )}

            {acknowledged && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--success)',
                background: 'rgba(16,185,129,0.1)', padding: '1px 6px', borderRadius: 3,
                border: '1px solid rgba(16,185,129,0.3)', fontWeight: 700
              }}>
                ✓ ACKNOWLEDGED
              </span>
            )}
          </div>

          {/* Description */}
          <div style={{ fontSize: 12.5, color: acknowledged ? 'var(--text-muted)' : 'var(--text-primary)', lineHeight: 1.4, marginBottom: 6, fontWeight: 500 }}>
            {formatCleanDesc(alert.description || alert.event_type)}
          </div>

          {/* Contextual Badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {/* ANPR Plate */}
            {cluster.license_plate && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 800,
                background: 'rgba(251,146,60,0.15)', color: '#fb923c',
                border: '1px solid rgba(251,146,60,0.4)', padding: '2px 7px', borderRadius: 4,
                display: 'inline-flex', alignItems: 'center', gap: 3
              }}>
                <span className="material-symbols-outlined icon-fill" style={{ fontSize: 10 }}>directions_car</span>
                PLATE: {cluster.license_plate}
              </span>
            )}

            {/* Dwell duration */}
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              background: 'var(--bg-surface)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-light)', padding: '2px 7px', borderRadius: 4,
              display: 'inline-flex', alignItems: 'center', gap: 3
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 10 }}>schedule</span>
              First Seen: {fmtTs(cluster.firstSeen)} · Active: {fmtTs(cluster.lastSeen)}
            </span>

            {/* Multi-Cam Chain */}
            {isMultiCam && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700,
                background: 'rgba(56,189,248,0.12)', color: 'var(--accent)',
                border: '1px solid rgba(56,189,248,0.35)', padding: '2px 7px', borderRadius: 4,
                display: 'inline-flex', alignItems: 'center', gap: 3
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 10 }}>hub</span>
                Cross-Camera Target Chain
              </span>
            )}
          </div>

          {/* Reasons */}
          {alert.reasons && alert.reasons.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0 6px' }}>
              {alert.reasons.slice(0, expanded ? undefined : 3).map((r, i) => (
                <span key={i} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9.5,
                  color: sev === 'CRITICAL' ? 'var(--critical)' : 'var(--text-mono)',
                  background: sev === 'CRITICAL' ? 'var(--critical-bg)' : 'var(--bg-surface)',
                  padding: '2px 7px', borderRadius: 4,
                  border: `1px solid ${sev === 'CRITICAL' ? 'var(--critical-bd)' : 'var(--border-light)'}`,
                  display: 'inline-flex', alignItems: 'center', gap: 4
                }}>
                  <span style={{ color: sev === 'CRITICAL' ? 'var(--critical)' : 'var(--success)', fontWeight: 800 }}>✓</span>
                  {r.replace(/\s*\(\+\d+\)/g, '').replace(/\s*\(-\d+\)/g, '')}
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
                  {expanded ? 'Show less' : `+${alert.reasons.length - 3} more`}
                </button>
              )}
            </div>
          )}

          {/* Sub-Events Collapsible History */}
          {numEvents > 1 && (
            <div style={{ marginTop: 6 }}>
              <button
                onClick={() => setShowSubEvents(s => !s)}
                style={{
                  background: 'none', border: 'none', color: 'var(--accent)',
                  fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer',
                  padding: '2px 0', display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontWeight: 700
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                  {showSubEvents ? 'expand_less' : 'expand_more'}
                </span>
                {showSubEvents ? 'Hide Sub-Events Breakdown' : `View ${numEvents} Sub-Events Breakdown`}
              </button>

              {showSubEvents && (
                <div style={{
                  marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4,
                  background: 'var(--bg-surface)', padding: 8, borderRadius: 6,
                  border: '1px solid var(--border-light)'
                }}>
                  {cluster.events.map((e, idx) => (
                    <div key={e.id || e.event_id || idx} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
                      padding: '3px 6px', borderBottom: idx < numEvents - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: color, fontWeight: 700 }}>#{idx + 1}</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{(e.event_type || '').replace(/_/g, ' ')}</span>
                        <span style={{ opacity: 0.6 }}>({e.id || e.event_id})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: ((e.risk_score || 0) >= 80 ? '#ef4444' : '#f59e0b'), fontWeight: 800 }}>Risk: {e.risk_score}</span>
                        <span>{fmtTs(e.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <button
            className="alert-action-btn"
            onClick={e => { e.stopPropagation(); onInvestigate && onInvestigate(alert) }}
            title="Open Forensic Dossier"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>open_in_new</span>
            Dossier
          </button>

          {needsDispatch && !acknowledged && (
            <button
              className="alert-action-btn alert-action-btn--dispatch"
              onClick={e => { e.stopPropagation(); onOpenDispatch && onOpenDispatch(alert) }}
              title="Dispatch Quick Reaction Force [D]"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>e911_emergency</span>
              Dispatch QRF
            </button>
          )}

          {!acknowledged && (
            <button
              className="alert-action-btn alert-action-btn--ack"
              onClick={e => {
                e.stopPropagation()
                onAcknowledgeCluster && onAcknowledgeCluster(cluster)
              }}
              title="Acknowledge all events for this target"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check_circle</span>
              {numEvents > 1 ? 'Ack All' : 'ACK'}
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
  const [sortBy, setSortBy]           = useState('time')
  const [viewMode, setViewMode]       = useState('clusters') // 'clusters' (fused) | 'raw'
  const [acknowledged, setAcknowledged] = useState(() => {
    try {
      const raw = localStorage.getItem('ibvap_acknowledged_alerts')
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [showAcked, setShowAcked]     = useState(false)
  const [refreshCountdown, setRefreshCountdown] = useState(3)

  // ── Clock & Date / Time Filters ──
  const [timeRange, setTimeRange]     = useState('ALL')
  const [customStartTime, setCustomStartTime] = useState('00:00')
  const [customEndTime, setCustomEndTime]     = useState('23:59')
  const [datePreset, setDatePreset]   = useState('ALL')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [activeTargets, setActiveTargets] = useState([])
  const [lastAlertTime, setLastAlertTime] = useState(null)

  // Live ticking clock, targets poll & refresh countdown
  useEffect(() => {
    const t = setInterval(() => {
      setCurrentTime(new Date())
      setRefreshCountdown(c => c <= 1 ? 3 : c - 1)
    }, 1000)
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

  // Track last alert timestamp
  useEffect(() => {
    if (alerts.length > 0) {
      const latest = alerts.reduce((best, a) => {
        const ts = new Date(a.timestamp || 0).getTime()
        return ts > best ? ts : best
      }, 0)
      if (latest > 0) setLastAlertTime(new Date(latest))
    }
  }, [alerts])

  const handleAcknowledge = useCallback((id) => {
    if (!id) return
    setAcknowledged(prev => {
      const next = new Set([...prev, id])
      try {
        localStorage.setItem('ibvap_acknowledged_alerts', JSON.stringify(Array.from(next).slice(-500)))
      } catch {}
      return next
    })
    fetch(`${API_BASE}/api/v1/alerts/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_id: id })
    }).catch(() => {})
  }, [])

  const handleAcknowledgeCluster = useCallback((cluster) => {
    if (!cluster || !cluster.events) return
    const ids = cluster.events.map(e => e.id || e.event_id).filter(Boolean)
    setAcknowledged(prev => {
      const next = new Set([...prev, ...ids])
      try {
        localStorage.setItem('ibvap_acknowledged_alerts', JSON.stringify(Array.from(next).slice(-500)))
      } catch {}
      return next
    })
    ids.forEach(id => {
      fetch(`${API_BASE}/api/v1/alerts/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: id })
      }).catch(() => {})
    })
  }, [])

  const handleAcknowledgeAll = () => {
    const ids = alerts.map(a => a.id || a.event_id).filter(Boolean)
    setAcknowledged(prev => {
      const next = new Set([...prev, ...ids])
      try {
        localStorage.setItem('ibvap_acknowledged_alerts', JSON.stringify(Array.from(next).slice(-500)))
      } catch {}
      return next
    })
    ids.forEach(id => {
      fetch(`${API_BASE}/api/v1/alerts/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: id })
      }).catch(() => {})
    })
  }

  const handleExportCSV = () => {
    const rows = [
      ['ID', 'Severity', 'Camera', 'Track', 'Risk', 'EventType', 'LicensePlate', 'Description', 'Timestamp'],
      ...filtered.map(a => [
        a.id || a.event_id || '',
        a.severity || '',
        a.camera_id || '',
        a.track_id || '',
        a.risk_score ?? '',
        a.event_type || '',
        a.license_plate || '',
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

    // 2. Filter by Time Window
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
        (a.track_id || '').toString().toLowerCase().includes(q) ||
        (a.id || '').toLowerCase().includes(q) ||
        (a.event_type || '').toLowerCase().includes(q) ||
        (a.license_plate || '').toLowerCase().includes(q)
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

  /* ── Multi-Event Clustering & Aggregation (Noise Elimination) ── */
  const clusters = useMemo(() => {
    if (viewMode === 'raw') {
      return filtered.map(a => ({
        key: a.id || a.event_id,
        primaryEvent: a,
        events: [a],
        camera_id: a.camera_id,
        track_id: a.track_id,
        license_plate: a.license_plate,
        maxRisk: a.risk_score ?? a.riskScore ?? 0,
        maxSeverity: (a.severity || 'INFO').toUpperCase(),
        eventTypes: [a.event_type],
        firstSeen: a.timestamp,
        lastSeen: a.timestamp,
        allAcknowledged: acknowledged.has(a.id || a.event_id),
        snapshot: a.snapshot || a.snapshot_filename
      }))
    }

    // O(N) Hash Map clustering by camera + track / plate
    const map = new Map()
    for (const a of filtered) {
      const aid = a.id || a.event_id
      const clusterKey = a.track_id
        ? `${a.camera_id}_TRK-${a.track_id}`
        : a.license_plate
          ? `${a.camera_id}_PLT-${a.license_plate}`
          : `${a.camera_id}_${aid}`

      const risk = a.risk_score ?? a.riskScore ?? 0
      const sev = (a.severity || 'INFO').toUpperCase()
      const sevRank = SEV_ORDER[sev] ?? 4
      const isAck = acknowledged.has(aid)

      if (!map.has(clusterKey)) {
        map.set(clusterKey, {
          key: clusterKey,
          primaryEvent: a,
          events: [a],
          camera_id: a.camera_id,
          track_id: a.track_id,
          license_plate: a.license_plate,
          maxRisk: risk,
          maxSeverity: sev,
          bestSevRank: sevRank,
          eventTypes: [a.event_type],
          firstSeen: a.timestamp,
          lastSeen: a.timestamp,
          allAcknowledged: isAck,
          snapshot: a.snapshot || a.snapshot_filename
        })
      } else {
        const c = map.get(clusterKey)
        c.events.push(a)
        if (!c.eventTypes.includes(a.event_type)) {
          c.eventTypes.push(a.event_type)
        }
        if (risk > c.maxRisk) {
          c.maxRisk = risk
        }
        if (sevRank < c.bestSevRank) {
          c.bestSevRank = sevRank
          c.maxSeverity = sev
          c.primaryEvent = a
        }
        if (new Date(a.timestamp || 0) < new Date(c.firstSeen || 0)) {
          c.firstSeen = a.timestamp
        }
        if (new Date(a.timestamp || 0) > new Date(c.lastSeen || 0)) {
          c.lastSeen = a.timestamp
        }
        if (!isAck) {
          c.allAcknowledged = false
        }
        if (!c.snapshot && (a.snapshot || a.snapshot_filename)) {
          c.snapshot = a.snapshot || a.snapshot_filename
        }
      }
    }

    return Array.from(map.values())
  }, [filtered, viewMode, acknowledged])

  /* ── Derived counts ── */
  const counts = useMemo(() => ({
    CRITICAL: clusters.filter(c => (c.maxSeverity || '').toUpperCase() === 'CRITICAL').length,
    HIGH:     clusters.filter(c => (c.maxSeverity || '').toUpperCase() === 'HIGH').length,
    WARNING:  clusters.filter(c => (c.maxSeverity || '').toUpperCase() === 'WARNING').length,
    INFO:     clusters.filter(c => (c.maxSeverity || '').toUpperCase() === 'INFO').length,
    TOTAL:    clusters.length,
    RAW_TOTAL: filtered.length,
    UNACKED:  clusters.filter(c => !c.allAcknowledged).length,
  }), [clusters, filtered])

  const lastAlertAgo = lastAlertTime ? fmtRelative(lastAlertTime.toISOString()) : null

  return (
    <div className="view alerts-view-v2" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ═══ 5-Card Summary Stats Bar ═══ */}
      <div className="alert-stats-bar" style={{ padding: '8px 16px', gap: 10, gridTemplateColumns: 'repeat(5,1fr)' }}>
        <StatCard
          label="Critical Threats" value={counts.CRITICAL} color="#ef4444" icon="crisis_alert" pulsing
          sublabel={counts.CRITICAL > 0 ? 'Immediate Action' : 'All clear'}
        />
        <StatCard
          label="High Risk" value={counts.HIGH} color="#f97316" icon="priority_high"
          sublabel="Sentry monitoring req."
        />
        <StatCard
          label="Warnings" value={counts.WARNING} color="#eab308" icon="warning"
          sublabel="Environmental/Zone alerts"
        />
        <StatCard
          label="Unacknowledged" value={counts.UNACKED} color="var(--accent)" icon="notifications_active" pulsing
          sublabel={counts.UNACKED > 0 ? 'Pending operator review' : 'All reviewed'}
        />
        <StatCard
          label="Active Incidents" value={counts.TOTAL} color="var(--text-muted)" icon="event_list"
          sublabel={viewMode === 'clusters' && counts.RAW_TOTAL > counts.TOTAL ? `${counts.RAW_TOTAL} raw events fused` : (lastAlertAgo ? `Last alert: ${lastAlertAgo}` : 'No alerts yet')}
        />
      </div>

      {/* ═══ Unified Single Toolbar ═══ */}
      <div className="view-toolbar" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '6px 16px', flexWrap: 'wrap', gap: 8, height: 'auto', minHeight: 42 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="toolbar-title" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize: 16, color: 'var(--critical)' }}>notifications_active</span>
            Security Incidents Feed
          </span>
          {/* Live refresh indicator */}
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--success)',
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
            padding: '1px 7px', borderRadius: 10,
            display: 'inline-flex', alignItems: 'center', gap: 4
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%', background: 'var(--success)',
              animation: 'pulse-dot 1.2s infinite'
            }} />
            LIVE · {refreshCountdown}s
          </span>
        </div>

        {/* View Mode (Incident Fusion vs Raw Log) */}
        <div className="toolbar-group">
          <button
            className={`toolbar-btn${viewMode === 'clusters' ? ' active' : ''}`}
            onClick={() => setViewMode('clusters')}
            title="Fuse repeated detections per target to eliminate sentry alert fatigue (Recommended)"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 3 }}>auto_awesome</span>
            Fused Incidents ({viewMode === 'clusters' ? counts.TOTAL : clusters.length})
          </button>
          <button
            className={`toolbar-btn${viewMode === 'raw' ? ' active' : ''}`}
            onClick={() => setViewMode('raw')}
            title="Display every individual raw event"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 3 }}>list</span>
            Raw Log ({filtered.length})
          </button>
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

        {/* Sort */}
        <div className="toolbar-group">
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sort:</span>
          {[['time', 'Newest'], ['severity', 'Severity'], ['risk', 'Risk']].map(([val, label]) => (
            <button
              key={val}
              className={`toolbar-btn${sortBy === val ? ' active' : ''}`}
              onClick={() => setSortBy(val)}
            >{label}</button>
          ))}
        </div>

        {/* Search & Actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-muted)', pointerEvents: 'none' }}>search</span>
            <input
              type="text"
              placeholder="Search camera, track, plate, event..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                color: 'var(--text-primary)', padding: '4px 10px 4px 27px',
                borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11, width: 220, outline: 'none',
              }}
            />
          </div>

          <button className="toolbar-btn" onClick={() => setShowAcked(v => !v)} style={{ fontSize: 10, borderColor: showAcked ? 'var(--accent-bd)' : undefined, color: showAcked ? 'var(--accent)' : undefined }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle' }}>{showAcked ? 'visibility' : 'visibility_off'}</span>
            {showAcked ? 'Hide Acked' : 'Show Acked'}
          </button>

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
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {clusters.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: 60 }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize: 52, color: 'var(--success)', marginBottom: 12, display: 'block' }}>verified_user</span>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', marginBottom: 6 }}>
              ALL CLEAR — NO ACTIVE THREATS
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Monitoring boundary zones and tripwire sensors in real-time.
            </div>
          </div>
        ) : (
          clusters.map(c => (
            <IncidentClusterCard
              key={c.key}
              cluster={c}
              onInvestigate={onInvestigate}
              onOpenDispatch={onOpenDispatch}
              onAcknowledgeCluster={handleAcknowledgeCluster}
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
