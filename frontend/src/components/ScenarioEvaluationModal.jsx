import React, { useState } from 'react'
import { API_BASE } from '../config'

export default function ScenarioEvaluationModal({ isOpen, onClose }) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [evalData, setEvalData] = useState(null)

  if (!isOpen) return null

  const handleRunEvaluation = async () => {
    setRunning(true)
    setProgress(15)
    try {
      const p1 = setTimeout(() => setProgress(45), 200)
      const p2 = setTimeout(() => setProgress(80), 400)
      const res = await fetch(`${API_BASE}/api/v1/evaluation/run`, { method: 'POST' })
      const json = await res.json()
      clearTimeout(p1)
      clearTimeout(p2)
      setProgress(100)
      setTimeout(() => {
        setEvalData(json.data)
        setRunning(false)
      }, 300)
    } catch (e) {
      setRunning(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-box" style={{ maxWidth: 950, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="material-symbols-outlined icon-fill" style={{ color: 'var(--accent)', fontSize: 20 }}>science</span>
            <span className="modal-title">SCENARIO EVALUATION & EMPIRICAL BENCHMARK ENGINE</span>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">✕</button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', fontFamily: 'var(--font-mono)' }}>
          {/* Top Banner */}
          <div style={{
            background: 'rgba(14, 165, 233, 0.08)', border: '1px solid var(--accent-bd)',
            borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex',
            justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>
                AUTOMATED 8-SCENARIO VALIDATION SUITE
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                Evaluates detection recall, alert precision, false alarm rejection, and sentry attention saved.
              </div>
            </div>
            <button
              onClick={handleRunEvaluation}
              disabled={running}
              style={{
                background: running ? 'rgba(255,255,255,0.1)' : 'var(--accent)',
                color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6,
                fontSize: 11, fontWeight: 800, cursor: running ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                {running ? 'sync' : 'play_arrow'}
              </span>
              {running ? `EVALUATING ${progress}%...` : 'RUN EVALUATION SUITE'}
            </button>
          </div>

          {running && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--accent)', marginBottom: 4 }}>
                <span>Running multi-camera scenario simulations & calculating confusion matrix...</span>
                <span>{progress}%</span>
              </div>
              <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s ease' }} />
              </div>
            </div>
          )}

          {/* Evaluation Results */}
          {evalData && (
            <>
              {/* Scorecard Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                <div style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>MEAN DETECTION RECALL</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--success)', marginTop: 2 }}>
                    {evalData.summary.mean_detection_recall_pct}%
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Target Spec: &gt; 90.0%</div>
                </div>
                <div style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>MEAN ALERT PRECISION</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--teal)', marginTop: 2 }}>
                    {evalData.summary.mean_alert_precision_pct}%
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Target Spec: &gt; 90.0%</div>
                </div>
                <div style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>OFFICER ATTENTION SAVED</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--cyan)', marginTop: 2 }}>
                    {evalData.summary.officer_attention_saved_pct}%
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Reduction: {evalData.cognitive_funnel.attention_reduction_factor}</div>
                </div>
                <div style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>PIPELINE LATENCY</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', marginTop: 2 }}>
                    {evalData.summary.mean_pipeline_latency_ms} ms
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Target Spec: &lt; 50.0 ms</div>
                </div>
              </div>

              {/* Cognitive Attention Funnel */}
              <div style={{
                background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-light)',
                borderRadius: 6, padding: '10px 14px', marginBottom: 16
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
                  📉 COGNITIVE LOAD REDUCTION FUNNEL
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-muted)' }}>{evalData.cognitive_funnel.raw_detections}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Raw Detections</div>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>➔</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--warning)' }}>{evalData.cognitive_funnel.contextual_events}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Contextual Events</div>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>➔</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--high)' }}>{evalData.cognitive_funnel.fused_incidents}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Fused Incidents</div>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>➔</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--critical)' }}>{evalData.cognitive_funnel.actionable_alerts_to_sentry}</div>
                    <div style={{ fontSize: 9, color: 'var(--critical)', fontWeight: 700 }}>Actionable Alerts</div>
                  </div>
                </div>
              </div>

              {/* Scenarios Table */}
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
                📋 SCENARIO-BY-SCENARIO BREAKDOWN
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px' }}>SCENARIO</th>
                    <th style={{ padding: '6px 8px' }}>CATEGORY</th>
                    <th style={{ padding: '6px 8px' }}>EXPECTED THREAT</th>
                    <th style={{ padding: '6px 8px' }}>RECALL</th>
                    <th style={{ padding: '6px 8px' }}>PRECISION</th>
                    <th style={{ padding: '6px 8px' }}>LATENCY</th>
                    <th style={{ padding: '6px 8px' }}>VERDICT</th>
                  </tr>
                </thead>
                <tbody>
                  {evalData.scenarios.map((s, idx) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-light)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#f8fafc' }}>{s.name}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{s.category}</td>
                      <td style={{ padding: '6px 8px', color: s.expected_threat.includes('CRITICAL') ? 'var(--critical)' : 'var(--accent)' }}>{s.expected_threat}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--success)', fontWeight: 700 }}>{s.target_recall}%</td>
                      <td style={{ padding: '6px 8px', color: 'var(--teal)', fontWeight: 700 }}>{s.target_precision}%</td>
                      <td style={{ padding: '6px 8px' }}>{s.latency_ms} ms</td>
                      <td style={{ padding: '6px 8px', color: 'var(--success)', fontWeight: 800 }}>✓ {s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {!evalData && !running && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--accent)', marginBottom: 10 }}>biotech</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>No Evaluation Run in Current Session</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Click 'RUN EVALUATION SUITE' to perform automated testing across all 8 border scenarios.</div>
            </div>
          )}
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
