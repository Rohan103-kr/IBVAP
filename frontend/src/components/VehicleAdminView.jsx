import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { API_BASE } from '../config'

const VEHICLE_CONFIGS = {
  ALL:        { label: 'All Types',    icon: 'apps',               color: '#94a3b8' },
  TRUCK:      { label: 'Trucks',       icon: 'local_shipping',     color: '#f59e0b', emoji: '🚚' },
  CAR:        { label: 'Cars',         icon: 'directions_car',     color: '#38bdf8', emoji: '🚗' },
  SUV:        { label: 'SUVs',         icon: 'airport_shuttle',    color: '#818cf8', emoji: '🚙' },
  MOTORCYCLE: { label: 'Bikes / 2W',   icon: 'two_wheeler',        color: '#34d399', emoji: '🏍️' },
  BICYCLE:    { label: 'Cycles',       icon: 'pedal_bike',         color: '#a3e635', emoji: '🚲' },
  BUS:        { label: 'Buses',        icon: 'directions_bus',     color: '#fb923c', emoji: '🚌' }
}

const TIME_WINDOWS = [
  { id: 'ALL',       label: 'All Day (24h)',     desc: '00:00 – 23:59', icon: 'schedule' },
  { id: 'MORNING',   label: 'Morning Shift',     desc: '06:00 – 12:00', icon: 'wb_sunny' },
  { id: 'AFTERNOON', label: 'Afternoon Shift',   desc: '12:00 – 18:00', icon: 'light_mode' },
  { id: 'EVENING',   label: 'Evening Dusk',      desc: '18:00 – 22:00', icon: 'wb_twilight' },
  { id: 'NIGHT',     label: 'Night Sentry Watch', desc: '22:00 – 06:00', icon: 'bedtime' }
]

const CAMERAS = [
  { id: 'ALL',    label: 'All Cameras' },
  { id: 'CAM-01', label: 'CAM-01 (Sector North)' },
  { id: 'CAM-02', label: 'CAM-02 (Perimeter Gate)' },
  { id: 'CAM-03', label: 'CAM-03 (East Watchtower)' },
  { id: 'CAM-04', label: 'CAM-04 (Sector South)' },
  { id: 'CAM-05', label: 'CAM-05 (West Highway)' },
  { id: 'CAM-06', label: 'CAM-06 (Restricted Zone)' }
]

export default function VehicleAdminView() {
  // ── Filters State ──
  const [dayPreset, setDayPreset]         = useState('today') // 'today', 'yesterday', '7days', 'all', 'custom'
  const [dateFrom, setDateFrom]           = useState(new Date().toISOString().slice(0, 10))
  const [dateTo, setDateTo]               = useState(new Date().toISOString().slice(0, 10))
  const [timeWindow, setTimeWindow]       = useState('ALL')
  const [useCustomHours, setUseCustomHours] = useState(false)
  const [hourFrom, setHourFrom]           = useState(0)
  const [hourTo, setHourTo]               = useState(23)
  const [vehicleType, setVehicleType]     = useState('ALL')
  const [camera, setCamera]               = useState('ALL')
  const [watchlistStatus, setWatchlistStatus] = useState('ALL')
  const [search, setSearch]               = useState('')
  const [page, setPage]                   = useState(1)
  const pageSize = 50

  // ── Data & UI State ──
  const [loading, setLoading]             = useState(false)
  const [records, setRecords]             = useState([])
  const [totalCount, setTotalCount]       = useState(0)
  const [kpis, setKpis]                   = useState(null)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [exporting, setExporting]         = useState(false)
  const [seedSuccess, setSeedSuccess]     = useState(false)
  const [liveSync, setLiveSync]           = useState(true)

  // ── Day Preset Handler ──
  const handleDayPresetChange = (preset) => {
    setDayPreset(preset)
    setPage(1)
    const today = new Date()
    const fmt = (d) => d.toISOString().slice(0, 10)

    if (preset === 'today') {
      const d = fmt(today)
      setDateFrom(d)
      setDateTo(d)
    } else if (preset === 'yesterday') {
      const y = new Date(today)
      y.setDate(y.getDate() - 1)
      const d = fmt(y)
      setDateFrom(d)
      setDateTo(d)
    } else if (preset === '3days') {
      const p = new Date(today)
      p.setDate(p.getDate() - 3)
      setDateFrom(fmt(p))
      setDateTo(fmt(today))
    } else if (preset === '7days') {
      const p = new Date(today)
      p.setDate(p.getDate() - 7)
      setDateFrom(fmt(p))
      setDateTo(fmt(today))
    } else if (preset === 'all') {
      setDateFrom('')
      setDateTo('')
    }
  }

  // ── Fetch Vehicle Sighting Registry from Backend ──
  const fetchRegistry = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()

      // Day-wise
      if (dateFrom && dateTo && dateFrom === dateTo) {
        params.set('date', dateFrom)
      } else {
        if (dateFrom) params.set('date_from', dateFrom)
        if (dateTo)   params.set('date_to', dateTo)
      }

      // Time-wise
      if (useCustomHours) {
        params.set('hour_from', hourFrom.toString())
        params.set('hour_to', hourTo.toString())
      } else if (timeWindow && timeWindow !== 'ALL') {
        params.set('time_window', timeWindow)
      }

      // Classification
      if (vehicleType && vehicleType !== 'ALL') {
        params.set('vehicle_type', vehicleType)
      }

      // Camera
      if (camera && camera !== 'ALL') {
        params.set('camera_id', camera)
      }

      // Status
      if (watchlistStatus && watchlistStatus !== 'ALL') {
        params.set('watchlist_status', watchlistStatus)
      }

      // Search query
      if (search.trim()) {
        params.set('search', search.trim())
      }

      params.set('limit', pageSize.toString())
      params.set('offset', ((page - 1) * pageSize).toString())

      const res = await fetch(`${API_BASE}/api/v1/vehicles/registry?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setRecords(data.records || [])
        setTotalCount(data.total_count || 0)
        setKpis(data.kpis || null)
      }
    } catch (err) {
      console.error('Error fetching vehicle registry:', err)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, useCustomHours, hourFrom, hourTo, timeWindow, vehicleType, camera, watchlistStatus, search, page])

  useEffect(() => {
    fetchRegistry()
  }, [fetchRegistry])

  // Live auto-refresh polling for real-time toll crossings
  useEffect(() => {
    if (!liveSync) return
    const pollInterval = setInterval(() => {
      const params = new URLSearchParams()
      if (dateFrom && dateTo && dateFrom === dateTo) {
        params.set('date', dateFrom)
      } else {
        if (dateFrom) params.set('date_from', dateFrom)
        if (dateTo)   params.set('date_to', dateTo)
      }
      if (vehicleType && vehicleType !== 'ALL') params.set('vehicle_type', vehicleType)
      if (camera && camera !== 'ALL') params.set('camera_id', camera)
      if (watchlistStatus && watchlistStatus !== 'ALL') params.set('watchlist_status', watchlistStatus)
      if (search.trim()) params.set('search', search.trim())
      params.set('limit', pageSize.toString())
      params.set('offset', ((page - 1) * pageSize).toString())

      fetch(`${API_BASE}/api/v1/vehicles/registry?${params.toString()}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.records) {
            setRecords(data.records)
            setTotalCount(data.total_count || 0)
            if (data.kpis) setKpis(data.kpis)
          }
        })
        .catch(() => {})
    }, 2500)

    return () => clearInterval(pollInterval)
  }, [liveSync, dateFrom, dateTo, vehicleType, camera, watchlistStatus, search, page])

  // ── Export CSV Handler ──
  const handleExportCSV = () => {
    setExporting(true)
    const params = new URLSearchParams()
    if (dateFrom && dateTo && dateFrom === dateTo) {
      params.set('date', dateFrom)
    } else {
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo)   params.set('date_to', dateTo)
    }
    if (useCustomHours) {
      params.set('hour_from', hourFrom.toString())
      params.set('hour_to', hourTo.toString())
    } else if (timeWindow && timeWindow !== 'ALL') {
      params.set('time_window', timeWindow)
    }
    if (vehicleType !== 'ALL') params.set('vehicle_type', vehicleType)
    if (camera !== 'ALL')      params.set('camera_id', camera)
    if (watchlistStatus !== 'ALL') params.set('watchlist_status', watchlistStatus)
    if (search.trim())         params.set('search', search.trim())

    window.open(`${API_BASE}/api/v1/vehicles/export-csv?${params.toString()}`, '_blank')
    setTimeout(() => setExporting(false), 1500)
  }

  // ── Seed More Test Data ──
  const handleSeedData = async () => {
    try {
      await fetch(`${API_BASE}/api/v1/analytics/seed?days=14`, { method: 'POST' })
      setSeedSuccess(true)
      fetchRegistry()
      setTimeout(() => setSeedSuccess(false), 3000)
    } catch (err) {
      console.error('Error seeding data:', err)
    }
  }

  // ── Helper: Format Timestamp ──
  const formatSightingTime = (ts) => {
    if (!ts) return 'N/A'
    try {
      const d = new Date(ts.replace(' ', 'T'))
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    } catch {
      return ts
    }
  }

  // Total pages
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  // Calculated Plate recognition percentage
  const plateRate = useMemo(() => {
    if (!kpis || !kpis.total_vehicles) return 0
    return ((kpis.recognized_plates / kpis.total_vehicles) * 100).toFixed(1)
  }, [kpis])

  return (
    <div id="vehicle-admin-view" style={{ padding: '16px 20px 60px', height: '100%', boxSizing: 'border-box', overflowY: 'auto', background: 'var(--bg-primary)' }}>
      {/* ── TOP HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--accent)' }}>directions_car</span>
            <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.5px', margin: 0, color: 'var(--text-primary)' }}>
              VEHICLE REGISTRY & ANPR AUDIT PANEL
            </h1>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'rgba(56,189,248,0.15)', color: 'var(--accent)', border: '1px solid rgba(56,189,248,0.3)' }}>
              ADMIN CONSOLE
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Fine-grained vehicle classification, license plate extraction, camera localization & day/time audit logs
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setLiveSync(!liveSync)}
            title="Auto-refresh vehicle crossings in real time"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6,
              background: liveSync ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-surface)',
              border: `1px solid ${liveSync ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-light)'}`,
              color: liveSync ? 'var(--success)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 12, fontWeight: 600
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: liveSync ? '#10b981' : '#94a3b8',
              boxShadow: liveSync ? '0 0 8px #10b981' : 'none',
              animation: liveSync ? 'pulse-btn 1.5s infinite' : 'none'
            }} />
            {liveSync ? 'Live Sync (2.5s)' : 'Live Sync Paused'}
          </button>

          <button
            onClick={fetchRegistry}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, animation: loading ? 'spin 1s linear infinite' : 'none' }}>sync</span>
            Refresh
          </button>

          <button
            onClick={handleExportCSV}
            disabled={exporting || totalCount === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: 'var(--success)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
            {exporting ? 'Exporting...' : 'Export Audit CSV'}
          </button>

          <button
            onClick={handleSeedData}
            title="Generate realistic traffic history for demonstration"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'rgba(129,140,248,0.15)', border: '1px solid rgba(129,140,248,0.4)', color: '#a5b4fc', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bolt</span>
            {seedSuccess ? '✓ Seeded!' : 'Seed Demo Data'}
          </button>
        </div>
      </div>

      {/* ── KPI METRIC CARDS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        {/* Total Vehicles */}
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 8, background: 'rgba(56,189,248,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--accent)', fontSize: 24 }}>commute</span>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Filtered Sightings</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {totalCount.toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Across all matching sectors</div>
          </div>
        </div>

        {/* Plates Recognized */}
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 8, background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--success)', fontSize: 24 }}>badge</span>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>ANPR Plates Logged</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>
              {kpis ? kpis.recognized_plates.toLocaleString() : '—'} <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>({plateRate}%)</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>OCR matched with optical tracker</div>
          </div>
        </div>

        {/* Watchlist Suspects */}
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 8, background: 'rgba(244,63,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--critical)', fontSize: 24 }}>fmd_bad</span>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Watchlist Alerts</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--critical)', fontFamily: 'var(--font-mono)' }}>
              {kpis ? kpis.watchlist_alerts.toLocaleString() : '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Stolen / Banned / Suspect plates</div>
          </div>
        </div>

        {/* Fleet Composition Breakdown */}
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
            <span>Vehicle Type Mix</span>
            <span style={{ color: 'var(--accent)' }}>{kpis ? Object.keys(kpis.by_type || {}).length : 0} Classes</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['TRUCK', 'CAR', 'SUV', 'MOTORCYCLE', 'BICYCLE', 'BUS'].map((vt) => {
              const count = kpis?.by_type?.[vt] || 0
              const cfg = VEHICLE_CONFIGS[vt] || {}
              return (
                <div
                  key={vt}
                  onClick={() => { setVehicleType(vt); setPage(1); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: vehicleType === vt ? 'rgba(56,189,248,0.25)' : 'var(--bg-surface)',
                    border: `1px solid ${vehicleType === vt ? 'var(--accent)' : 'var(--border)'}`,
                    cursor: 'pointer',
                    fontSize: 10,
                    fontWeight: 600
                  }}
                  title={`Click to filter by ${vt}`}
                >
                  <span>{cfg.emoji || '🚘'}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── FILTER CONTROL PANEL ── */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
        {/* ROW 1: Day-Wise Filters */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>calendar_today</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Day-Wise Sighting Filter:
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'today',     label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: '3days',     label: 'Last 3 Days' },
              { id: '7days',     label: 'Last 7 Days' },
              { id: 'all',       label: 'All Dates' },
              { id: 'custom',    label: 'Custom Range' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => handleDayPresetChange(p.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: `1px solid ${dayPreset === p.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: dayPreset === p.id ? 'rgba(56,189,248,0.2)' : 'var(--bg-surface)',
                  color: dayPreset === p.id ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {p.label}
              </button>
            ))}

            {(dayPreset === 'custom' || dayPreset === 'today' || dayPreset === 'yesterday') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setDayPreset('custom'); setPage(1); }}
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                />
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setDayPreset('custom'); setPage(1); }}
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                />
              </div>
            )}
          </div>
        </div>

        {/* ROW 2: Time-Wise Filters */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#f59e0b' }}>schedule</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Time-Wise Shift Window:
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {TIME_WINDOWS.map(tw => (
              <button
                key={tw.id}
                onClick={() => { setTimeWindow(tw.id); setUseCustomHours(false); setPage(1); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: `1px solid ${(!useCustomHours && timeWindow === tw.id) ? '#f59e0b' : 'var(--border)'}`,
                  background: (!useCustomHours && timeWindow === tw.id) ? 'rgba(245,158,11,0.2)' : 'var(--bg-surface)',
                  color: (!useCustomHours && timeWindow === tw.id) ? '#f59e0b' : 'var(--text-muted)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                title={tw.desc}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{tw.icon}</span>
                <span>{tw.label}</span>
              </button>
            ))}

            <button
              onClick={() => { setUseCustomHours(true); setPage(1); }}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: `1px solid ${useCustomHours ? '#f59e0b' : 'var(--border)'}`,
                background: useCustomHours ? 'rgba(245,158,11,0.2)' : 'var(--bg-surface)',
                color: useCustomHours ? '#f59e0b' : 'var(--text-muted)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Custom Hour
            </button>

            {useCustomHours && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
                <select
                  value={hourFrom}
                  onChange={(e) => { setHourFrom(parseInt(e.target.value)); setPage(1); }}
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', color: 'var(--text-primary)', fontSize: 11 }}
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>
                  ))}
                </select>
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>to</span>
                <select
                  value={hourTo}
                  onChange={(e) => { setHourTo(parseInt(e.target.value)); setPage(1); }}
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', color: 'var(--text-primary)', fontSize: 11 }}
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>{h.toString().padStart(2, '0')}:59</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* ROW 3: Vehicle Type Classification Buttons + Camera + Status + Search */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          {/* Classification Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: 2 }}>
              Type:
            </span>
            {Object.keys(VEHICLE_CONFIGS).map(vtKey => {
              const cfg = VEHICLE_CONFIGS[vtKey]
              const active = vehicleType === vtKey
              return (
                <button
                  key={vtKey}
                  onClick={() => { setVehicleType(vtKey); setPage(1); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: `1px solid ${active ? cfg.color : 'var(--border)'}`,
                    background: active ? `rgba(255,255,255,0.1)` : 'var(--bg-surface)',
                    color: active ? cfg.color : 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {cfg.emoji && <span>{cfg.emoji}</span>}
                  <span>{cfg.label}</span>
                </button>
              )
            })}
          </div>

          {/* Camera, Watchlist, and Search Inputs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Camera Select */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>videocam</span>
              <select
                value={camera}
                onChange={(e) => { setCamera(e.target.value); setPage(1); }}
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', fontSize: 11 }}
              >
                {CAMERAS.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Watchlist Select */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>verified_user</span>
              <select
                value={watchlistStatus}
                onChange={(e) => { setWatchlistStatus(e.target.value); setPage(1); }}
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', fontSize: 11 }}
              >
                <option value="ALL">All Statuses</option>
                <option value="CLEARED">Cleared Only</option>
                <option value="SUSPECT">Suspect Alert</option>
                <option value="FLAGGED">Flagged Alert</option>
                <option value="VIP">VIP Escort</option>
              </select>
            </div>

            {/* Search Box */}
            <div style={{ position: 'relative', minWidth: 200 }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-dim)' }}>
                search
              </span>
              <input
                type="text"
                placeholder="Search plate, cam, track..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                style={{
                  width: '100%',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '4px 26px 4px 28px',
                  color: 'var(--text-primary)',
                  fontSize: 11,
                  outline: 'none'
                }}
              />
              {search && (
                <span
                  className="material-symbols-outlined"
                  onClick={() => { setSearch(''); setPage(1); }}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  close
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── HOURLY TRAFFIC HEATMAP / BAR CHART ── */}
      {kpis?.by_hour && Object.keys(kpis.by_hour).length > 0 && (
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>bar_chart</span>
              Hourly Sighting Distribution (24-Hour Timeline in Filtered Window)
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Peak hour highlighted in bright cyan
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60, paddingTop: 10 }}>
            {Array.from({ length: 24 }).map((_, h) => {
              const cnt = kpis.by_hour[h] || 0
              const maxVal = Math.max(...Object.values(kpis.by_hour), 1)
              const heightPct = Math.round((cnt / maxVal) * 100)
              const isPeak = cnt === maxVal && cnt > 0
              return (
                <div
                  key={h}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}
                  title={`${h.toString().padStart(2, '0')}:00 — ${cnt} vehicle sightings`}
                >
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.max(heightPct, 4)}%`,
                      background: isPeak ? 'var(--accent)' : cnt > 0 ? 'rgba(56,189,248,0.45)' : 'rgba(255,255,255,0.05)',
                      borderRadius: '2px 2px 0 0',
                      transition: 'height 0.3s ease'
                    }}
                  />
                  <div style={{ fontSize: 9, color: isPeak ? 'var(--accent)' : 'var(--text-dim)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                    {h % 3 === 0 ? `${h}h` : ''}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── VEHICLE SIGHTINGS TABLE ── */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Vehicle Sighting Records ({totalCount.toLocaleString()} total, showing page {page} of {totalPages})
          </div>

          {/* Pagination Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: 11 }}
            >
              ◀ Prev
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontSize: 11 }}
            >
              Next ▶
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '560px', borderBottom: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-panel)' }}>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '10px 14px' }}>Sighting Time</th>
                <th style={{ padding: '10px 14px' }}>Camera</th>
                <th style={{ padding: '10px 14px' }}>Classification</th>
                <th style={{ padding: '10px 14px' }}>License Plate (ANPR)</th>
                <th style={{ padding: '10px 14px' }}>Watchlist Status</th>
                <th style={{ padding: '10px 14px' }}>Speed</th>
                <th style={{ padding: '10px 14px' }}>Confidence</th>
                <th style={{ padding: '10px 14px' }}>Track ID</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 28, animation: 'spin 1s linear infinite' }}>sync</span>
                    <div style={{ marginTop: 8, fontSize: 12 }}>Loading vehicle sightings database...</div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--text-dim)' }}>no_crash</span>
                    <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600 }}>No vehicle sightings match the applied filters.</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Try broadening the day, time window, or classification filters.</div>
                  </td>
                </tr>
              ) : (
                records.map((r, idx) => {
                  const cfg = VEHICLE_CONFIGS[r.vehicle_type] || VEHICLE_CONFIGS.CAR
                  const isSuspect = r.watchlist_status === 'SUSPECT' || r.watchlist_status === 'FLAGGED'
                  const isVIP = r.watchlist_status === 'VIP'
                  const isAuth = r.watchlist_status === 'AUTHORIZED'
                  const hasPlate = r.plate_number && !r.plate_number.startsWith('VEH-') && r.plate_number !== 'UNASSIGNED' && r.plate_number !== 'NON-MOTORIZED' && r.plate_number !== 'SCANNING...' && r.plate_number !== 'PENDING'

                  return (
                    <tr
                      key={r.id || idx}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isSuspect ? 'rgba(244,63,94,0.06)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                        transition: 'background 0.15s'
                      }}
                      className="hover-table-row"
                    >
                      {/* Sighting Time */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {formatSightingTime(r.timestamp)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                          {r.date} (Hour {r.hour}:00)
                        </div>
                      </td>

                      {/* Camera */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: 'rgba(56,189,248,0.1)',
                          border: '1px solid rgba(56,189,248,0.25)',
                          color: 'var(--accent)',
                          fontWeight: 700,
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)'
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>videocam</span>
                          {r.camera_id}
                        </span>
                      </td>

                      {/* Classification Type */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: 'var(--bg-surface)',
                          border: `1px solid ${cfg.color}`,
                          color: cfg.color,
                          fontWeight: 700,
                          fontSize: 11
                        }}>
                          <span>{cfg.emoji || '🚘'}</span>
                          <span>{r.vehicle_type}</span>
                        </span>
                      </td>

                      {/* License Plate */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        {hasPlate ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: '#0f172a',
                            border: `1px solid ${isSuspect ? 'var(--critical)' : '#94a3b8'}`,
                            color: isSuspect ? 'var(--critical)' : '#f8fafc',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            letterSpacing: '1px',
                            fontSize: 12,
                            boxShadow: isSuspect ? '0 0 8px rgba(244,63,94,0.4)' : 'none'
                          }}>
                            <span style={{ fontSize: 9, padding: '1px 3px', background: '#334155', borderRadius: 2, color: '#94a3b8' }}>IND</span>
                            <span>{r.plate_number}</span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                            {r.plate_number || 'SCANNING...'}
                          </span>
                        )}
                      </td>

                      {/* Watchlist Status */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: 12,
                          fontSize: 10,
                          fontWeight: 700,
                          background: isSuspect ? 'var(--critical-bg)' : isVIP ? 'rgba(56,189,248,0.15)' : isAuth ? 'rgba(16,185,129,0.2)' : 'var(--success-bg)',
                          border: `1px solid ${isSuspect ? 'var(--critical-bd)' : isVIP ? 'var(--border-accent)' : isAuth ? '#10b981' : 'var(--success-bd)'}`,
                          color: isSuspect ? 'var(--critical)' : isVIP ? 'var(--accent)' : isAuth ? '#10b981' : 'var(--success)'
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                            {isSuspect ? 'warning' : isVIP ? 'star' : isAuth ? 'verified' : 'check_circle'}
                          </span>
                          {r.watchlist_status}
                        </span>
                      </td>

                      {/* Speed */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ color: r.speed_kmh > 50 ? 'var(--high)' : 'var(--text-primary)', fontWeight: 600 }}>
                          {r.speed_kmh} <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>km/h</span>
                        </span>
                      </td>

                      {/* AI Confidence */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          background: r.confidence >= 0.85 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                          border: `1px solid ${r.confidence >= 0.85 ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
                          color: r.confidence >= 0.85 ? '#10b981' : '#f59e0b'
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                            {r.confidence >= 0.85 ? 'check' : 'query_builder'}
                          </span>
                          {Math.round(r.confidence * 100)}%
                        </span>
                      </td>

                      {/* Track ID */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                        #{r.track_id}
                      </td>

                      {/* Action */}
                      <td style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => setSelectedRecord(r)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-light)',
                            color: 'var(--accent)',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Telemetry
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── DETAIL TELEMETRY MODAL ── */}
      {selectedRecord && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box" style={{ width: 500, background: '#0f172a', border: '1px solid var(--border-light)', borderRadius: 8, padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--accent)', fontSize: 22 }}>local_shipping</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Vehicle Sighting Dossier</div>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* License Plate Display */}
            <div style={{ textAlign: 'center', padding: 14, background: 'rgba(15,23,42,0.9)', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 4 }}>
                Recognized License Plate
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                background: '#020617',
                border: '2px solid #64748b',
                borderRadius: 4,
                fontFamily: 'var(--font-mono)',
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: '1.5px',
                color: '#f8fafc'
              }}>
                <span style={{ fontSize: 10, background: '#1e293b', padding: '2px 4px', borderRadius: 2, color: '#38bdf8' }}>IND</span>
                <span>{selectedRecord.plate_number || 'UNASSIGNED'}</span>
              </div>
            </div>

            {/* Telemetry Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12, marginBottom: 16 }}>
              <div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 6 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>CAMERA SOURCE</div>
                <div style={{ fontWeight: 700, color: 'var(--accent)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{selectedRecord.camera_id}</div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 6 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>VEHICLE CLASSIFICATION</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{selectedRecord.vehicle_type}</div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 6 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>SIGHTING TIMESTAMP</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{selectedRecord.timestamp}</div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 6 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>ESTIMATED VELOCITY</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{selectedRecord.speed_kmh} km/h</div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 6 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>SECURITY WATCHLIST</div>
                <div style={{
                  fontWeight: 700,
                  color: selectedRecord.watchlist_status === 'CLEARED' ? 'var(--success)' : 'var(--critical)',
                  marginTop: 2
                }}>
                  {selectedRecord.watchlist_status}
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 6 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>DETECTION CONFIDENCE</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                  {Math.round(selectedRecord.confidence * 100)}%
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 6 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>TEMPORAL OCR CONSENSUS</div>
                <div style={{ fontWeight: 700, color: 'var(--accent)', marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  {selectedRecord.consensus_ratio ? `${selectedRecord.consensus_ratio} Frames (Verified)` : 'Multi-Frame Validated'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 6 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>CROSS-CAMERA TRAJECTORY</div>
                <div style={{ fontWeight: 700, color: '#38bdf8', marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  {selectedRecord.camera_id === 'CAM-02' ? 'CAM-01 ➔ CAM-02 (Correlated)' : `${selectedRecord.camera_id} (Perimeter Watch)`}
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedRecord(null)}
              style={{ width: '100%', padding: '8px', borderRadius: 6, background: 'var(--accent)', border: 'none', color: '#0f172a', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
            >
              CLOSE DOSSIER
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
