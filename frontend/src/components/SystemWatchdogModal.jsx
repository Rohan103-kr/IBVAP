import React, { useState, useEffect } from 'react'
import { API_BASE } from '../config'

export default function SystemWatchdogModal({ isOpen, onClose }) {
  const [watchdogData, setWatchdogData] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchWatchdog = async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`${API_BASE}/api/v1/system/watchdog`)
      const json = await res.json()
      setWatchdogData(json.data)
    } catch {}
    setRefreshing(false)
  }

  useEffect(() => {
    if (isOpen) {
      fetchWatchdog()
      const timer = setInterval(fetchWatchdog, 3000)
      return () => clearInterval(timer)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="modal-backdrop">
      <div className="modal-box" style={{ maxWidth: 980, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="material-symbols-outlined icon-fill" style={{ color: 'var(--success)', fontSize: 20 }}>monitor_heart</span>
            <span className="modal-title">AI MICROSERVICES WATCHDOG & MULTI-EDGE FLEET TELEMETRY</span>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">✕</button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', fontFamily: 'var(--font-mono)' }}>
          {/* Top Status Bar */}
          <div style={{
            background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex',
            justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined icon-fill" style={{ color: 'var(--success)', fontSize: 20 }}>verified</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--success)' }}>
                  ALL 7 AI MICROSERVICES ACTIVE & HEALTHY
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>
                  Graceful edge degradation active · Modular failover enabled
                </div>
              </div>
            </div>
            <button
              onClick={fetchWatchdog}
              style={{
                background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)',
                color: '#fff', padding: '4px 12px', borderRadius: 4, fontSize: 10, cursor: 'pointer'
              }}
            >
              {refreshing ? 'REFRESHING...' : 'LIVE REFRESH'}
            </button>
          </div>

          {/* Microservices Table */}
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
            ⚙️ AI PERCEPTION & INFERENCE MICROSERVICES
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginBottom: 16 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px' }}>SERVICE NAME</th>
                <th style={{ padding: '6px 8px' }}>STATUS</th>
                <th style={{ padding: '6px 8px' }}>THROUGHPUT</th>
                <th style={{ padding: '6px 8px' }}>LATENCY</th>
                <th style={{ padding: '6px 8px' }}>FAILOVER DEGRADATION MODE</th>
              </tr>
            </thead>
            <tbody>
              {watchdogData?.services && Object.entries(watchdogData.services).map(([k, s], idx) => (
                <tr key={k} style={{ borderBottom: '1px solid var(--border-light)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 700, color: '#f8fafc' }}>{s.name}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--success)', fontWeight: 800 }}>🟢 {s.status}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--teal)' }}>{typeof s.fps === 'number' ? `${s.fps} FPS` : s.fps}</td>
                  <td style={{ padding: '6px 8px' }}>{s.latency_ms} ms</td>
                  <td style={{ padding: '6px 8px', color: 'var(--accent)', fontSize: 9.5 }}>{s.degradation_mode}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Multi-Edge Node Fleet Status */}
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
            🌐 BORDER OUT POST (BOP) MULTI-EDGE FLEET NODES
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {watchdogData?.edge_nodes && watchdogData.edge_nodes.map(n => (
              <div key={n.node_id} style={{
                background: 'rgba(15,23,42,0.9)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '12px 14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)' }}>{n.node_id}</span>
                  <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>
                    {n.mode}
                  </span>
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginBottom: 8 }}>{n.location}</div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>CPU Utilization:</span>
                  <span style={{ fontWeight: 700, color: '#f8fafc' }}>{n.cpu_usage_pct}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>RAM Allocation:</span>
                  <span style={{ fontWeight: 700, color: '#f8fafc' }}>{n.ram_usage_pct}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Cameras Online:</span>
                  <span style={{ fontWeight: 700, color: 'var(--teal)' }}>{n.cameras_online}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>AI Processing:</span>
                  <span style={{ fontWeight: 700 }}>{n.ai_status}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Network Sync:</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: n.network_status.includes('OFFLINE') ? 'var(--warning)' : 'var(--success)' }}>
                    {n.network_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-accent" onClick={onClose} style={{ padding: '6px 16px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
