import React, { useState, useEffect, useMemo, useCallback } from 'react'

const API_BASE = 'http://localhost:8000'

export default function AnalyticsView() {
  // ── Period & Filter State ──
  const [period, setPeriod]           = useState('daily') // 'hourly', 'daily', 'monthly'
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [selectedCamera, setSelectedCamera] = useState('ALL')
  const [loading, setLoading]         = useState(false)
  const [analyticsData, setAnalyticsData] = useState(null)

  // ── ANPR Plates State ──
  const [plateSearch, setPlateSearch] = useState('')
  const [plateStatus, setPlateStatus] = useState('ALL')
  const [platesList, setPlatesList]   = useState([])

  // ── Report Modal State ──
  const [isReportOpen, setIsReportOpen] = useState(false)

  // ── Policy Config State ──
  const [policyWeights, setPolicyWeights] = useState({
    restricted_zone: 25,
    fence_crossed: 30,
    night_time: 20,
    loitering: 10,
    identity: 15,
    multi_camera: 15
  })
  const [policySaved, setPolicySaved] = useState(false)

  // Fetch Analytics Summary from SQLite Database
  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        period,
        date: selectedDate,
        month: selectedMonth,
        camera_id: selectedCamera
      })
      const res = await fetch(`${API_BASE}/api/v1/analytics/summary?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setAnalyticsData(data)
      }
    } catch (err) {
      console.error('Error fetching analytics:', err)
    } finally {
      setLoading(false)
    }
  }, [period, selectedDate, selectedMonth, selectedCamera])

  // Fetch ANPR Plates from SQLite Database
  const fetchPlates = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        search: plateSearch,
        status: plateStatus,
        limit: '50'
      })
      const res = await fetch(`${API_BASE}/api/v1/analytics/plates?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setPlatesList(data)
      }
    } catch (err) {
      console.error('Error fetching plates:', err)
    }
  }, [plateSearch, plateStatus])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  useEffect(() => {
    fetchPlates()
  }, [fetchPlates])

  // Load Policy
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/config/risk_policy`)
      .then(res => res.json())
      .then(data => {
        if (data && data.weights) setPolicyWeights(prev => ({ ...prev, ...data.weights }))
      })
      .catch(() => {})
  }, [])

  const handleSavePolicy = async () => {
    try {
      await fetch(`${API_BASE}/api/v1/config/risk_policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights: policyWeights })
      })
      setPolicySaved(true)
      setTimeout(() => setPolicySaved(false), 2000)
    } catch {
      setPolicySaved(true)
      setTimeout(() => setPolicySaved(false), 2000)
    }
  }

  const handleReseedData = async () => {
    if (!window.confirm('Re-seed SQLite database with 35 days of synthetic historical traffic records?')) return
    try {
      await fetch(`${API_BASE}/api/v1/analytics/seed?days=35`, { method: 'POST' })
      fetchAnalytics()
      fetchPlates()
    } catch (err) {
      console.error(err)
    }
  }

  const handleExportCSV = () => {
    if (!analyticsData || !analyticsData.time_series) return
    const headers = ['TimeLabel', 'Persons', 'Males', 'Females', 'Vehicles', 'TotalTraffic']
    const rows = analyticsData.time_series.map(t => [
      t.label || t.full_date || t.month_key || '',
      t.persons,
      t.males,
      t.females,
      t.vehicles,
      t.total
    ])
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `IBVAP_SQL_Analytics_${period}_${selectedDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const kpis = analyticsData?.summary_kpis || {
    total_persons: 0,
    male_persons: 0,
    female_persons: 0,
    unknown_persons: 0,
    male_ratio_pct: 0,
    female_ratio_pct: 0,
    total_vehicles: 0,
    flagged_vehicles: 0,
    peak_time_label: 'N/A',
    peak_traffic_volume: 0,
    grand_total_traffic: 0
  }

  const timeSeries = analyticsData?.time_series || []
  const maxVal = useMemo(() => {
    return Math.max(...timeSeries.map(t => Math.max(t.persons, t.vehicles)), 10)
  }, [timeSeries])

  return (
    <div className="view" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 30 }}>

      {/* ═══ Header & Control Toolbar ═══ */}
      <div className="view-toolbar" style={{ flexWrap: 'wrap', gap: 10, padding: '10px 16px', background: 'rgba(12,18,30,0.98)' }}>
        
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize: 20, color: 'var(--accent)' }}>database</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13, letterSpacing: '0.05em' }}>
            SQL ANALYTICS & DEMOGRAPHIC INTELLIGENCE
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            background: 'var(--bg-surface)', color: 'var(--success)',
            padding: '2px 6px', borderRadius: 4, border: '1px solid var(--success-bd)'
          }}>
            SQLite WAL Mode · Active
          </span>
        </div>

        {/* Period Selector Tabs */}
        <div className="toolbar-group" style={{ marginLeft: 10 }}>
          <button
            className={`toolbar-btn${period === 'hourly' ? ' active' : ''}`}
            onClick={() => setPeriod('hourly')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13, marginRight: 3 }}>schedule</span>
            HOURLY (24H)
          </button>
          <button
            className={`toolbar-btn${period === 'daily' ? ' active' : ''}`}
            onClick={() => setPeriod('daily')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13, marginRight: 3 }}>calendar_today</span>
            DAILY (MONTH)
          </button>
          <button
            className={`toolbar-btn${period === 'monthly' ? ' active' : ''}`}
            onClick={() => setPeriod('monthly')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13, marginRight: 3 }}>date_range</span>
            MONTHLY (YEAR)
          </button>
        </div>

        {/* Dynamic Date / Month Pickers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {period === 'hourly' && (
            <input
              type="date"
              className="temporal-input"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              title="Select Date for Hourly Breakdown"
            />
          )}

          {period === 'daily' && (
            <input
              type="month"
              className="temporal-input"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              title="Select Month for Daily Breakdown"
            />
          )}

          {period === 'monthly' && (
            <input
              type="number"
              className="temporal-input"
              style={{ width: 75 }}
              min="2020"
              max="2035"
              value={selectedMonth.split('-')[0]}
              onChange={e => setSelectedMonth(`${e.target.value}-01`)}
              title="Select Year for Monthly Breakdown"
            />
          )}

          {/* Camera Filter */}
          <select
            className="temporal-input"
            value={selectedCamera}
            onChange={e => setSelectedCamera(e.target.value)}
            style={{ padding: '3px 6px' }}
          >
            <option value="ALL">ALL SECTORS</option>
            <option value="CAM-01">CAM-01 (Sector North)</option>
            <option value="CAM-02">CAM-02 (Perimeter West)</option>
            <option value="CAM-03">CAM-03 (East Gatehouse)</option>
            <option value="CAM-04">CAM-04 (Buffer South)</option>
            <option value="CAM-05">CAM-05 (Vehicle Checkpoint)</option>
            <option value="CAM-06">CAM-06 (UAV Recon Deck)</option>
          </select>
        </div>

        {/* Action Buttons */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            className="btn-accent"
            onClick={() => setIsReportOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 10 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>summarize</span>
            EXECUTIVE AUDIT REPORT
          </button>

          <button
            className="btn-ghost"
            onClick={handleExportCSV}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 10 }}
            title="Download SQL Analytics as CSV"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>download</span>
            EXPORT CSV
          </button>

          <button
            className="btn-ghost"
            onClick={handleReseedData}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 10, color: 'var(--text-muted)' }}
            title="Seed synthetic dataset"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>refresh</span>
            RE-SEED
          </button>
        </div>
      </div>

      {/* ═══ Main Analytics Content ═══ */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── 4 Top KPI Stat Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          
          {/* Persons & Gender */}
          <div className="alert-stat-card" style={{ borderColor: 'rgba(14, 165, 233, 0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Total Persons Arrived
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 800, color: 'var(--accent)', marginTop: 2 }}>
                  {kpis.total_persons.toLocaleString()}
                </div>
              </div>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize: 24, color: 'var(--accent)' }}>groups</span>
            </div>
            {/* Gender Ratio Mini Bar */}
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 3 }}>
                <span>♂ Male: {kpis.male_persons} ({kpis.male_ratio_pct}%)</span>
                <span>♀ Female: {kpis.female_persons} ({kpis.female_ratio_pct}%)</span>
              </div>
              <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${kpis.male_ratio_pct}%`, height: '100%', background: 'var(--accent)' }} />
                <div style={{ width: `${kpis.female_ratio_pct}%`, height: '100%', background: '#ec4899' }} />
              </div>
            </div>
          </div>

          {/* Vehicles & Fleet */}
          <div className="alert-stat-card" style={{ borderColor: 'rgba(16, 185, 129, 0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Total Vehicles Logged
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 800, color: 'var(--success)', marginTop: 2 }}>
                  {kpis.total_vehicles.toLocaleString()}
                </div>
              </div>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize: 24, color: 'var(--success)' }}>directions_car</span>
            </div>
            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 8 }}>
              Cars, SUVs, Trucks, Buses & Motorcycles
            </div>
          </div>

          {/* ANPR Plate Watchlist */}
          <div className="alert-stat-card" style={{ borderColor: 'rgba(239, 68, 68, 0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  ANPR Watchlist Hits
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 800, color: 'var(--critical)', marginTop: 2 }}>
                  {kpis.flagged_vehicles}
                </div>
              </div>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize: 24, color: 'var(--critical)' }}>document_scanner</span>
            </div>
            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--critical)', marginTop: 8 }}>
              Flagged & Suspect Plates Intercepted
            </div>
          </div>

          {/* Peak Traffic Period */}
          <div className="alert-stat-card" style={{ borderColor: 'rgba(249, 115, 22, 0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Peak Traffic Window
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 800, color: 'var(--high)', marginTop: 2 }}>
                  {kpis.peak_time_label}
                </div>
              </div>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize: 24, color: 'var(--high)' }}>trending_up</span>
            </div>
            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 8 }}>
              Peak Volume: {kpis.peak_traffic_volume} entities
            </div>
          </div>

        </div>

        {/* ── Visual Charts: Time-Series & Categorization ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
          
          {/* Time Series Bar Chart */}
          <div className="panel-box" style={{ padding: 14, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>query_stats</span>
                {period === 'hourly' && `24-HOUR HOURLY TRAFFIC FLOW (${selectedDate})`}
                {period === 'daily' && `DAILY TRAFFIC VOLUME (${selectedMonth})`}
                {period === 'monthly' && `MONTHLY TRAFFIC DISTRIBUTION (${selectedMonth.split('-')[0]})`}
              </div>
              
              {/* Legend */}
              <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: 2 }} />
                  Persons
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: 'var(--success)', borderRadius: 2 }} />
                  Vehicles
                </span>
              </div>
            </div>

            {/* SVG Interactive Bar Chart */}
            <div style={{ width: '100%', height: 210, overflowX: 'auto', display: 'flex', alignItems: 'flex-end', gap: timeSeries.length > 20 ? 3 : 8, padding: '10px 4px 20px', borderBottom: '1px solid var(--border)' }}>
              {timeSeries.length === 0 ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  No SQL records found for this timeframe.
                </div>
              ) : (
                timeSeries.map((t, idx) => {
                  const pH = Math.round((t.persons / maxVal) * 160)
                  const vH = Math.round((t.vehicles / maxVal) * 160)
                  return (
                    <div key={idx} style={{ flex: 1, minWidth: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', position: 'relative' }}>
                      
                      {/* Bars Group */}
                      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 160 }}>
                        {/* Person Bar */}
                        <div
                          title={`Time: ${t.label}\nPersons: ${t.persons} (♂${t.males}, ♀${t.females})\nVehicles: ${t.vehicles}`}
                          style={{
                            width: 7, height: Math.max(pH, 2),
                            background: 'var(--accent)',
                            borderRadius: '2px 2px 0 0',
                            transition: 'height 0.4s ease'
                          }}
                        />
                        {/* Vehicle Bar */}
                        <div
                          title={`Time: ${t.label}\nVehicles: ${t.vehicles}`}
                          style={{
                            width: 7, height: Math.max(vH, 2),
                            background: 'var(--success)',
                            borderRadius: '2px 2px 0 0',
                            transition: 'height 0.4s ease'
                          }}
                        />
                      </div>

                      {/* X-axis Label */}
                      <div style={{ position: 'absolute', bottom: -18, fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {t.label}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Demographic & Vehicle Fleet Breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            
            {/* Gender Categorization Box */}
            <div className="panel-box" style={{ padding: 12 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                PERSON GENDER CATEGORIZATION
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: 'var(--accent)' }}>♂</span> Male Arrivals
                  </span>
                  <span style={{ fontWeight: 800, color: 'var(--accent)' }}>
                    {analyticsData?.gender_distribution?.MALE || 0} ({kpis.male_ratio_pct}%)
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: '#ec4899' }}>♀</span> Female Arrivals
                  </span>
                  <span style={{ fontWeight: 800, color: '#ec4899' }}>
                    {analyticsData?.gender_distribution?.FEMALE || 0} ({kpis.female_ratio_pct}%)
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>⚪ Uncategorized</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {analyticsData?.gender_distribution?.UNKNOWN || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Vehicle Categorization Box */}
            <div className="panel-box" style={{ padding: 12 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                VEHICLE FLEET CATEGORIZATION
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                {Object.entries(analyticsData?.vehicle_distribution || {}).map(([vt, count]) => (
                  <div key={vt} style={{ background: 'var(--bg-surface)', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{vt}</span>
                    <span style={{ fontWeight: 700, color: 'var(--success)' }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

        {/* ── ANPR License Plate Registry Table ── */}
        <div className="panel-box" style={{ display: 'flex', flexDirection: 'column' }}>
          
          {/* Table Header Controls */}
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div className="panel-title">
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>pin</span>
              DAILY ANPR LICENSE PLATE AUDIT REGISTRY ({platesList.length} RECORDS)
            </div>

            {/* Search & Watchlist Filter */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search Plate, Cam, Type..."
                className="temporal-input"
                style={{ width: 180 }}
                value={plateSearch}
                onChange={e => setPlateSearch(e.target.value)}
              />

              <select
                className="temporal-input"
                value={plateStatus}
                onChange={e => setPlateStatus(e.target.value)}
              >
                <option value="ALL">ALL STATUSES</option>
                <option value="CLEARED">CLEARED ONLY</option>
                <option value="SUSPECT">SUSPECT ONLY</option>
                <option value="FLAGGED">FLAGGED ONLY</option>
                <option value="VIP">VIP ONLY</option>
              </select>
            </div>
          </div>

          {/* Table Body */}
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--font-mono)', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: 9 }}>
                  <th style={{ padding: '6px 12px' }}>TIMESTAMP</th>
                  <th style={{ padding: '6px 12px' }}>PLATE NUMBER</th>
                  <th style={{ padding: '6px 12px' }}>VEHICLE TYPE</th>
                  <th style={{ padding: '6px 12px' }}>CAMERA</th>
                  <th style={{ padding: '6px 12px' }}>SPEED</th>
                  <th style={{ padding: '6px 12px' }}>CONFIDENCE</th>
                  <th style={{ padding: '6px 12px' }}>WATCHLIST STATUS</th>
                </tr>
              </thead>
              <tbody>
                {platesList.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                      No license plate records matched the search query.
                    </td>
                  </tr>
                ) : (
                  platesList.map((p, i) => {
                    const isFlagged = p.watchlist_status === 'FLAGGED' || p.watchlist_status === 'SUSPECT'
                    return (
                      <tr key={p.id || i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                        <td style={{ padding: '6px 12px', color: 'var(--text-muted)' }}>{p.timestamp || p.date}</td>
                        <td style={{ padding: '6px 12px', fontWeight: 800, color: isFlagged ? 'var(--critical)' : 'var(--text-primary)' }}>
                          {p.plate_number}
                        </td>
                        <td style={{ padding: '6px 12px', color: 'var(--text-mono)' }}>{p.vehicle_type}</td>
                        <td style={{ padding: '6px 12px', color: 'var(--accent)' }}>{p.camera_id}</td>
                        <td style={{ padding: '6px 12px' }}>{p.speed_kmh} km/h</td>
                        <td style={{ padding: '6px 12px', color: 'var(--success)' }}>{Math.round((p.confidence || 0.9) * 100)}%</td>
                        <td style={{ padding: '6px 12px' }}>
                          <span style={{
                            fontSize: 8, padding: '2px 6px', borderRadius: 3, fontWeight: 700,
                            background: isFlagged ? 'var(--critical-bg)' : (p.watchlist_status === 'VIP' ? 'rgba(234,179,8,0.15)' : 'var(--success-bg)'),
                            color: isFlagged ? 'var(--critical)' : (p.watchlist_status === 'VIP' ? 'var(--warning)' : 'var(--success)'),
                            border: `1px solid ${isFlagged ? 'var(--critical-bd)' : 'var(--success-bd)'}`
                          }}>
                            {p.watchlist_status}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

      </div>

      {/* ═══ Executive Audit Report Modal ═══ */}
      {isReportOpen && (
        <div className="modal-backdrop">
          <div className="modal-box report-modal" style={{ maxWidth: 840, maxHeight: '92vh' }}>
            
            {/* Header */}
            <div className="modal-header" style={{ borderBottomColor: 'var(--accent-bd)', background: 'rgba(14, 165, 233, 0.05)' }}>
              <div className="modal-header-left">
                <span className="material-symbols-outlined icon-fill" style={{ color: 'var(--accent)', fontSize: 22 }}>
                  description
                </span>
                <span className="modal-title" style={{ color: 'var(--text-primary)' }}>
                  BORDER SECTOR TRAFFIC AUDIT REPORT
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  background: 'var(--bg-surface)', padding: '2px 6px',
                  borderRadius: 4, border: '1px solid var(--border-light)',
                  color: 'var(--accent)'
                }}>
                  PERIOD: {period.toUpperCase()} · {selectedDate}
                </span>
              </div>
              <button className="modal-close-btn" onClick={() => setIsReportOpen(false)}>✕</button>
            </div>

            {/* Body */}
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
              
              {/* Metadata Box */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
                background: 'var(--bg-surface)', padding: 12, borderRadius: 6,
                border: '1px solid var(--border-light)', fontFamily: 'var(--font-mono)', fontSize: 11
              }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase' }}>Scope Period</div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{period.toUpperCase()}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase' }}>Scope Date / Month</div>
                  <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{period === 'hourly' ? selectedDate : selectedMonth}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase' }}>Target Sector</div>
                  <div style={{ color: 'var(--text-mono)' }}>{selectedCamera}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase' }}>Security Level</div>
                  <div style={{ color: 'var(--success)', fontWeight: 700 }}>LEVEL-3 CLEARANCE</div>
                </div>
              </div>

              {/* KPI Summary Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <div className="alert-stat-card">
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>PERSONS (♂/♀)</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{kpis.total_persons}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{kpis.male_persons}M · {kpis.female_persons}F</div>
                </div>
                <div className="alert-stat-card">
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>VEHICLES</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--success)' }}>{kpis.total_vehicles}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>All classes logged</div>
                </div>
                <div className="alert-stat-card">
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>FLAGGED PLATES</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--critical)' }}>{kpis.flagged_vehicles}</div>
                  <div style={{ fontSize: 9, color: 'var(--critical)' }}>Interceptions required</div>
                </div>
                <div className="alert-stat-card">
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>PEAK WINDOW</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--high)' }}>{kpis.peak_time_label}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{kpis.peak_traffic_volume} entities</div>
                </div>
              </div>

              {/* Sector Breakdown */}
              <div className="panel-box" style={{ padding: 12 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                  BORDER SECTOR TRAFFIC DENSITY BREAKDOWN
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  {Object.entries(analyticsData?.sector_distribution || {}).map(([cam, data]) => (
                    <div key={cam} style={{ background: 'var(--bg-surface)', padding: 8, borderRadius: 4, border: '1px solid var(--border-light)' }}>
                      <div style={{ fontWeight: 800, color: 'var(--accent)' }}>{cam}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                        Persons: {data.persons} · Vehicles: {data.vehicles}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--success)' }}>verified</span>
                  AUTHENTICATED BY IBVAP SQL AUDIT ENGINE
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost" onClick={handleExportCSV}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 4 }}>data_object</span>
                    EXPORT CSV
                  </button>
                  <button className="btn-accent" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>print</span>
                    PRINT / SAVE PDF
                  </button>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  )
}
