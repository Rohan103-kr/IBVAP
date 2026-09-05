import React from 'react'

export default function Footer({ alerts = [], feedsOnline = 4, activeCount = 0 }) {
  const latest = alerts[0]

  const formatLatest = (alert) => {
    if (!alert) return 'SYSTEM NORMAL — Monitoring perimeter buffer zones...'
    let text = alert.description || 'Intrusion activity recorded'
    text = text.replace(/^BIIE SYNTHESIS:\s*/i, '').replace(/\s*\(\+\d+\)/g, '')
    const parts = text.split(/\s*·\s*/)
    return `[${alert.camera_id || 'CAM-01'}] ${parts.slice(0, 2).join(' · ')}`
  }

  return (
    <footer id="app-footer">
      {/* Left: System Telemetry */}
      <div className="footer-left">
        <div className="footer-stat" title="Active CCTV Camera Feeds">
          <span className="stat-dot green" />
          <span>FEEDS: <strong>{feedsOnline} ONLINE</strong></span>
        </div>
        <div className="footer-stat" title="Detection Engine Latency">
          <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--accent)' }}>bolt</span>
          <span>LATENCY: <strong>14 ms</strong></span>
        </div>
        <div className="footer-stat" title="System Status">
          <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--success)' }}>verified</span>
          <span>STATUS: <strong>OPERATIONAL</strong></span>
        </div>
      </div>

      {/* Center: Live Ticker */}
      <div className="footer-ticker-wrap">
        <span className="ticker-label">LATEST INCIDENT:</span>
        <div className="ticker-content">
          <span style={{ color: latest?.severity === 'CRITICAL' ? 'var(--critical)' : 'var(--accent)' }}>
            {formatLatest(latest)}
          </span>
        </div>
      </div>

      {/* Right: Operator & Clearance */}
      <div className="footer-right">
        {activeCount > 0 && (
          <div className="active-threat-pill">
            <span className="pulse-dot-red" />
            <span>{activeCount} ALERTS</span>
          </div>
        )}
        <div className="operator-pill">
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>shield_person</span>
          <span>COMMANDER-01</span>
        </div>
      </div>
    </footer>
  )
}

