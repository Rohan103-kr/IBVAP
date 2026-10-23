import React, { useState, useEffect, useRef } from 'react'
import { API_BASE } from '../config'

const TABS = [
  { id: 'live',      label: 'Live Feeds',      icon: 'videocam' },
  { id: 'alerts',    label: 'Alerts & Map',    icon: 'warning', showBadge: true },
  { id: 'vehicles',  label: 'Vehicles & ANPR', icon: 'directions_car' },
  { id: 'analytics', label: 'Analytics & Intel', icon: 'bar_chart' },
  { id: 'admin',     label: 'Admin Panel',     icon: 'admin_panel_settings' },
]

export default function Header({
  activeTab,
  onTabChange,
  simRunning,
  onToggleSim,
  criticalCount,
  onToggleMute,
  muted,
  voiceAlerts,
  onToggleVoiceAlerts,
  theme,
  onCycleTheme,
  onOpenDispatch,
  onScenarioTriggered,
  onOpenScenarioModal,
  onOpenWatchdogModal,
  onOpenKnownFacesModal
}) {
  const [time, setTime] = useState(new Date())
  const [toolsOpen, setToolsOpen] = useState(false)
  const toolsMenuRef = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Close tools menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target)) {
        setToolsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fmt = (d) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <header id="app-header">
      {/* Brand */}
      <div className="header-brand">
        <div className="header-brand-icon">
          <span className="material-symbols-outlined icon-fill" style={{ fontSize: 18 }}>shield</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="header-brand-text">IBVAP</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--accent-bd)', padding: '1px 5px', borderRadius: 3, letterSpacing: '0.04em' }}>
              BORDER INTEL
            </span>
          </div>
          <span className="header-brand-sub">TACTICAL COMMAND</span>
        </div>
        <div className="header-live-dot" title="AI Inference Loop Active" />
      </div>

      {/* Tab Navigation */}
      <nav className="header-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            className={`header-tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="material-symbols-outlined tab-icon" style={{ fontSize: 16 }}>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.showBadge && criticalCount > 0 && (
              <span className="tab-badge">{criticalCount}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Right Controls */}
      <div className="header-controls">
        {/* Clock */}
        <div className="clock-display" title="System Time (IST)">
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--accent)' }}>schedule</span>
          <span className="time">{fmt(time)}</span>
        </div>

        {/* System Tools Menu Dropdown */}
        <div style={{ position: 'relative' }} ref={toolsMenuRef}>
          <button
            className={`icon-btn${toolsOpen ? ' active-accent' : ''}`}
            onClick={() => setToolsOpen(!toolsOpen)}
            title="System Tools & Demo Scenarios"
            style={{ width: 'auto', padding: '0 8px', gap: 4, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>tune</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>Tools</span>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              {toolsOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {toolsOpen && (
            <div className="tools-dropdown-menu">
              <div className="dropdown-section-title">Demo Scenario Simulator</div>
              <select
                id="scenario-select"
                className="dropdown-select-input"
                onChange={async (e) => {
                  const scenarioId = e.target.value
                  if (scenarioId) {
                    try {
                      const res = await fetch(`${API_BASE}/api/v1/simulation/trigger/${scenarioId}`, { method: 'POST' })
                      const data = await res.json()
                      if (onScenarioTriggered) {
                        onScenarioTriggered(data.scenario || { id: scenarioId })
                      }
                      onTabChange('alerts')
                      setToolsOpen(false)
                    } catch (err) {
                      console.error('Scenario trigger error', err)
                    }
                  }
                }}
              >
                <option value="">▶ Select Scenario...</option>
                <option value="SCENARIO_01_PERIMETER_INTRUSION">01. Perimeter Intrusion</option>
                <option value="SCENARIO_02_SUSPICIOUS_LOITERING">02. Suspicious Loitering</option>
                <option value="SCENARIO_03_NIGHT_INFILTRATION">03. Night Infiltration</option>
                <option value="SCENARIO_04_VEHICLE_ANPR">04. Vehicle ANPR Match</option>
                <option value="SCENARIO_05_CROSS_CAMERA_CHAIN">05. Cross-Camera Chain</option>
                <option value="SCENARIO_06_CAMERA_COVERAGE_GAP">06. Coverage Gap</option>
                <option value="SCENARIO_07_OFFLINE_EDGE_SYNC">07. Edge Sync Test</option>
                <option value="SCENARIO_08_FRIENDLY_PATROL">08. Authorized Patrol</option>
              </select>

              <div className="dropdown-divider" />

              <button
                className="dropdown-item-btn"
                onClick={() => { onOpenScenarioModal && onOpenScenarioModal(); setToolsOpen(false); }}
              >
                <span className="material-symbols-outlined">science</span>
                <span>Evaluation Benchmarks</span>
              </button>

              <button
                className="dropdown-item-btn"
                onClick={() => { onOpenWatchdogModal && onOpenWatchdogModal(); setToolsOpen(false); }}
              >
                <span className="material-symbols-outlined">monitor_heart</span>
                <span>AI Watchdog Telemetry</span>
              </button>

              <button
                className="dropdown-item-btn"
                onClick={() => { onOpenKnownFacesModal && onOpenKnownFacesModal(); setToolsOpen(false); }}
              >
                <span className="material-symbols-outlined">badge</span>
                <span>Quick Faces Uploader</span>
              </button>

              <button
                className="dropdown-item-btn"
                onClick={() => { onTabChange('admin'); setToolsOpen(false); }}
                style={{ color: 'var(--accent)', fontWeight: 700 }}
              >
                <span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>admin_panel_settings</span>
                <span>Admin Clearance & FRS</span>
              </button>
            </div>
          )}
        </div>

        {/* Theme Switcher */}
        <button
          className="icon-btn"
          onClick={onCycleTheme}
          title={`Theme: ${theme.toUpperCase()}`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            {theme === 'light' ? 'light_mode' : theme === 'midnight' ? 'dark_mode' : theme === 'thermal' ? 'device_thermostat' : 'wb_sunny'}
          </span>
        </button>

        {/* Siren Mute / Unmute */}
        <button
          id="mute-btn"
          className={`icon-btn${muted ? ' active-danger' : ''}`}
          onClick={onToggleMute}
          title={muted ? 'Unmute Siren' : 'Mute Siren'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            {muted ? 'volume_off' : 'volume_up'}
          </span>
        </button>

        {/* Voice AI Alert Toggle */}
        <button
          className={`icon-btn${voiceAlerts ? ' active-accent' : ''}`}
          onClick={onToggleVoiceAlerts}
          title={voiceAlerts ? 'Voice Alerts: ACTIVE' : 'Voice Alerts: OFF'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            {voiceAlerts ? 'record_voice_over' : 'voice_over_off'}
          </span>
        </button>

        {/* Quick Dispatch SOP Button */}
        <button
          className="quick-dispatch-btn"
          onClick={() => onOpenDispatch()}
          title="Trigger Emergency SOP Dispatch"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>e911_emergency</span>
          SOP DISPATCH
        </button>

      </div>
    </header>
  )
}

