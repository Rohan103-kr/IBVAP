import React from 'react'

const CAMERAS = [
  { id: 'CAM-01', label: 'North Gate · Zone Alpha', fps: 15.1, bandwidth: '2.4 Mbps', uptime: '99.9%', health: 'HEALTHY', resolution: '1920x1080 (1080p)', temp: '42°C' },
  { id: 'CAM-02', label: 'East Checkpoint · ANPR', fps: 14.8, bandwidth: '3.1 Mbps', uptime: '99.8%', health: 'HEALTHY', resolution: '1920x1080 (1080p)', temp: '44°C' },
  { id: 'CAM-03', label: 'West Perimeter · Electric Tripwire', fps: 15.0, bandwidth: '2.2 Mbps', uptime: '99.5%', health: 'HEALTHY', resolution: '1280x720 (Night IR)', temp: '39°C' },
  { id: 'CAM-04', label: 'South Perimeter · Thermal Post', fps: 15.2, bandwidth: '1.9 Mbps', uptime: '100%', health: 'HEALTHY', resolution: '640x480 (FLIR Thermal)', temp: '48°C' },
]

export default function CameraStatusView() {
  return (
    <div className="view" style={{ overflowY: 'auto' }}>
      <div className="view-toolbar">
        <span className="toolbar-title">
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>sensors</span>
          Camera Hardware & Stream Health Monitor
        </span>
        <div className="ml-auto" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--success)' }}>
          4/4 SENSORS ONLINE
        </div>
      </div>

      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {CAMERAS.map(c => (
          <div key={c.id} className="panel-box" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {c.id} — {c.label}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  SENSOR RESOLUTION: {c.resolution}
                </div>
              </div>
              <span className="alert-severity-tag tag-info" style={{ background: 'var(--success-bg)', color: 'var(--success)', borderColor: 'var(--success-bd)' }}>
                {c.health}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, background: 'var(--bg-surface)', padding: 10, borderRadius: 6, marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>STREAM FPS</div>
                <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{c.fps} FPS</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>BANDWIDTH</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.bandwidth}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>UPTIME</div>
                <div style={{ fontWeight: 700, color: 'var(--success)' }}>{c.uptime}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>TEMP</div>
                <div style={{ fontWeight: 700, color: 'var(--warning)' }}>{c.temp}</div>
              </div>
            </div>

            {/* Static Frame Freeze Diagnostic */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              <span>Frame Static Freeze Anomaly: <strong style={{ color: 'var(--success)' }}>PASSED (0.0% variance)</strong></span>
              <button className="btn-ghost" style={{ fontSize: 9, padding: '2px 8px' }}>
                Ping Sensor
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
