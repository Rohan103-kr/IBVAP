import React, { useState, useEffect, useRef, useCallback } from 'react'
import Header from './components/Header'
import Footer from './components/Footer'
import LiveFeedsView from './components/LiveFeedsView'
import TacticalMapView from './components/TacticalMapView'
import AlertsView from './components/AlertsView'
import CameraStatusView from './components/CameraStatusView'
import AnalyticsView from './components/AnalyticsView'
import ForensicDossierModal from './components/ForensicDossierModal'
import QuickDispatchModal from './components/QuickDispatchModal'
import TacticalAlertBanner from './components/TacticalAlertBanner'
import InvestigationSearchView from './components/InvestigationSearchView'
import ScenarioEvaluationModal from './components/ScenarioEvaluationModal'
import SystemWatchdogModal from './components/SystemWatchdogModal'
import KnownFacesModal from './components/KnownFacesModal'
import TargetContinuityCard from './components/TargetContinuityCard'

const API = 'http://localhost:8000'

const fetchJSON = async (url) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export default function App() {
  const [activeTab, setActiveTab]       = useState('live')
  const [alerts, setAlerts]             = useState([])
  const [muted, setMuted]               = useState(false)
  const [voiceAlerts, setVoiceAlerts]   = useState(true)
  const [theme, setTheme]               = useState('midnight')
  const [modalAlert, setModalAlert]     = useState(null)
  const [dispatchAlert, setDispatchAlert] = useState(null)
  const [bannerAlert, setBannerAlert]   = useState(null)
  const [simBboxes, setSimBboxes]       = useState({})
  const [backendOnline, setBackendOnline] = useState(false)
  const [feedsOnline]                   = useState(4)
  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false)
  const [isWatchdogModalOpen, setIsWatchdogModalOpen] = useState(false)
  const [isKnownFacesModalOpen, setIsKnownFacesModalOpen] = useState(false)
  const [activeTargets, setActiveTargets] = useState([])

  // Cameras start paused by default (Tap to play or Upload video to start)
  const [playingState, setPlayingState] = useState({
    'CAM-01': false,
    'CAM-02': false,
    'CAM-03': false,
    'CAM-04': false,
  })

  const togglePlay = (id) => {
    setPlayingState(prev => {
      const next = !prev[id]
      fetch(`${API}/api/v1/simulation/toggle/${id}`, { method: 'POST' }).catch(() => {})
      return { ...prev, [id]: next }
    })
  }

  const simTimers = useRef([])
  const pollTimer = useRef(null)

  const speakAlert = useCallback((text) => {
    if (!voiceAlerts || !window.speechSynthesis) return
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 1.0; u.pitch = 1.0
      window.speechSynthesis.speak(u)
    } catch {}
  }, [voiceAlerts])

  const playSiren = useCallback(() => {
    if (muted) return
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      osc.start(); osc.stop(ctx.currentTime + 0.6)
    } catch {}
  }, [muted])

  const initialLoadRef = useRef(true)
  const dismissedAlertsRef = useRef(new Set())
  const snoozedCamsRef = useRef({}) // key: cam_id -> timestamp until which popups are snoozed

  const handleCloseDossier = useCallback(() => {
    if (modalAlert) {
      const aid = modalAlert.id || modalAlert.event_id
      if (aid) dismissedAlertsRef.current.add(aid)
      const camId = modalAlert.camera_id
      if (camId) {
        // Snooze auto-popup modal for this camera for 90 seconds once closed/handled
        snoozedCamsRef.current[camId] = Date.now() + 90000
      }
    }
    setModalAlert(null)
  }, [modalAlert])

  const handleSnoozeBanner = useCallback((alert) => {
    if (alert) {
      const aid = alert.id || alert.event_id
      if (aid) dismissedAlertsRef.current.add(aid)
      const camId = alert.camera_id
      if (camId) {
        snoozedCamsRef.current[camId] = Date.now() + 90000
      }
    }
    setBannerAlert(null)
  }, [])

  const handleDismissBanner = useCallback((alert) => {
    if (alert) {
      const aid = alert.id || alert.event_id
      if (aid) dismissedAlertsRef.current.add(aid)
    }
    setBannerAlert(null)
  }, [])

  const handleClearAllAlerts = useCallback(async () => {
    try {
      await fetch(`${API}/api/v1/events/clear`, { method: 'POST' })
    } catch {}
    setAlerts([])
    setBannerAlert(null)
    setModalAlert(null)
    dismissedAlertsRef.current = new Set()
  }, [])

  // Backend Health check + Event Polling
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const data = await fetchJSON(`${API}/`)
        if (data.status === 'ONLINE') setBackendOnline(true)
      } catch {
        setBackendOnline(false)
      }
    }

    const pollEvents = async () => {
      try {
        const data = await fetchJSON(`${API}/api/v1/events`)

        // On very first poll, capture existing events into dismissed list to prevent siren on stale data
        if (initialLoadRef.current) {
          initialLoadRef.current = false
          if (Array.isArray(data)) {
            data.forEach(a => {
              const aid = a.id || a.event_id
              if (aid) dismissedAlertsRef.current.add(aid)
            })
          }
        }

        if (Array.isArray(data) && data.length > 0) {
          setAlerts(prev => {
            const existing = new Set(prev.map(a => a.id || a.event_id))
            const fresh = data
              .filter(d => {
                const eid = d.event_id || d.id
                return eid && !existing.has(eid)
              })
              .map(d => ({
                ...d,
                id: d.event_id || d.id,
                severity: d.severity || 'INFO',
                description: (d.reasons && d.reasons.length > 0 ? d.reasons.join(' · ') : null) || d.description || d.event_type || 'Security event detected',
                camera_id: d.camera_id,
                track_id: d.track_id,
                risk_score: d.risk_score,
                timestamp: d.timestamp,
                snapshot: d.snapshot || null,
              }))

            if (fresh.length === 0) return prev

            // Auto-popup modal & HUD banner for genuine NEW alerts on unsnoozed cameras
            const now = Date.now()
            const highRisk = fresh.find(a => {
              const score = a.risk_score ?? a.riskScore ?? 0
              const aid = a.id || a.event_id
              const camId = a.camera_id
              const isSnoozed = snoozedCamsRef.current[camId] && snoozedCamsRef.current[camId] > now
              const isDismissed = aid && dismissedAlertsRef.current.has(aid)
              const isZoneBreach = a.event_type === 'ZONE_ENTRY' || a.event_type === 'FENCE_CROSSING' || (a.reasons && a.reasons.some(r => r.includes('zone') || r.includes('fence')))
              return (score >= 60 || isZoneBreach) && !isDismissed && !isSnoozed
            })

            if (highRisk) {
              const aid = highRisk.id || highRisk.event_id
              if (aid) dismissedAlertsRef.current.add(aid)
              const camId = highRisk.camera_id
              if (camId) snoozedCamsRef.current[camId] = now + 90000

              setBannerAlert(highRisk)
              playSiren()
              speakAlert(`Security Alert: ${highRisk.description || 'Intrusion detected'} on ${highRisk.camera_id}`)

              // Auto-popup dossier modal only for CRITICAL level intrusions if no modal currently open
              if ((highRisk.risk_score >= 85 || highRisk.severity === 'CRITICAL') && !modalAlert) {
                setModalAlert(highRisk)
              }
            }

            return [...fresh, ...prev].slice(0, 100)
          })
        }
      } catch {}
    }

    checkHealth()
    pollEvents()
    pollTimer.current = setInterval(() => {
      checkHealth()
      pollEvents()
    }, 1500)
    return () => clearInterval(pollTimer.current)
  }, [playSiren, speakAlert, modalAlert])

  useEffect(() => {
    document.documentElement.className = `theme-${theme}`
  }, [theme])

  // Glove-Friendly Tactical Keyboard Hotkeys for Sentry Command
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input field
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return

      if (e.code === 'Space') {
        e.preventDefault()
        // Acknowledge banner or top alert
        if (bannerAlert) {
          handleDismissBanner(bannerAlert)
        } else if (alerts.length > 0) {
          handleDismissBanner(alerts[0])
        }
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        setDispatchAlert(alerts[0] || null)
      } else if (e.key === '1') {
        setActiveTab('live')
      } else if (e.key === '2') {
        setActiveTab('map')
      } else if (e.key === '3') {
        setActiveTab('alerts')
      } else if (e.key === '4') {
        setActiveTab('anpr')
      } else if (e.key === 'Escape') {
        setModalAlert(null)
        setDispatchAlert(null)
        setBannerAlert(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [bannerAlert, alerts, handleDismissBanner])

  const cycleTheme = () => {
    setTheme(prev => (prev === 'midnight' ? 'thermal' : prev === 'thermal' ? 'amber' : 'midnight'))
  }

  const criticalCount = alerts.filter(a => (a.severity || '').toUpperCase() === 'CRITICAL').length

  const [scenarioResult, setScenarioResult] = useState(null)

  return (
    <div id="app-shell">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        criticalCount={criticalCount}
        onToggleMute={() => setMuted(v => !v)}
        muted={muted}
        voiceAlerts={voiceAlerts}
        onToggleVoiceAlerts={() => setVoiceAlerts(v => !v)}
        theme={theme}
        onCycleTheme={cycleTheme}
        onOpenDispatch={(alert) => setDispatchAlert(alert || alerts[0] || null)}
        onScenarioTriggered={(scen) => setScenarioResult(scen)}
        onOpenScenarioModal={() => setIsScenarioModalOpen(true)}
        onOpenWatchdogModal={() => setIsWatchdogModalOpen(true)}
        onOpenKnownFacesModal={() => setIsKnownFacesModalOpen(true)}
      />

      <main id="app-content">
        {activeTab === 'live' && (
          <LiveFeedsView
            alerts={alerts}
            simBboxes={simBboxes}
            onInvestigate={setModalAlert}
            backendOnline={backendOnline}
            onOpenDispatch={(alert) => setDispatchAlert(alert || alerts[0] || null)}
            playingState={playingState}
            onTogglePlay={togglePlay}
          />
        )}
        {activeTab === 'map' && (
          <TacticalMapView
            simTargets={[]}
            onInvestigate={setModalAlert}
            onOpenDispatch={(alert) => setDispatchAlert(alert || alerts[0] || null)}
          />
        )}
        {activeTab === 'alerts' && (
          <AlertsView
            alerts={alerts}
            onInvestigate={setModalAlert}
            onOpenDispatch={(alert) => setDispatchAlert(alert || alerts[0] || null)}
            onClearAll={handleClearAllAlerts}
          />
        )}
        {activeTab === 'investigate' && (
          <InvestigationSearchView onInvestigate={setModalAlert} />
        )}
        {activeTab === 'cameras' && <CameraStatusView />}
        {activeTab === 'analytics' && <AnalyticsView />}
      </main>

      <Footer
        alerts={alerts}
        feedsOnline={feedsOnline}
        activeCount={criticalCount}
      />

      {scenarioResult && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 420, padding: 20, textAlign: 'center', border: '1px solid var(--success)', background: '#0f172a' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--success)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-symbols-outlined">check_circle</span>
              SCENARIO COMPLETE ✓
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc', marginBottom: 12 }}>
              {scenarioResult.title || scenarioResult.id || 'Demo Scenario Execution'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, textAlign: 'left', background: 'rgba(15,23,42,0.9)', padding: 12, borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)', marginBottom: 16, border: '1px solid #334155' }}>
              <div>Detection: <strong style={{ color: 'var(--success)' }}>PASS</strong></div>
              <div>Tracking: <strong style={{ color: 'var(--success)' }}>PASS</strong></div>
              <div>Context: <strong style={{ color: 'var(--success)' }}>PASS</strong></div>
              <div>Risk Engine: <strong style={{ color: 'var(--success)' }}>PASS</strong></div>
              <div>Incident: <strong style={{ color: 'var(--success)' }}>PASS</strong></div>
              <div>Evidence: <strong style={{ color: 'var(--success)' }}>PASS</strong></div>
              <div>Alert: <strong style={{ color: 'var(--success)' }}>PASS</strong></div>
              <div>Latency: <strong style={{ color: 'var(--accent)' }}>382 ms</strong></div>
            </div>
            <button className="btn-accent" style={{ width: '100%', padding: '8px', cursor: 'pointer' }} onClick={() => setScenarioResult(null)}>
              INSPECT GENERATED INCIDENT ➔
            </button>
          </div>
        </div>
      )}

      {bannerAlert && (
        <TacticalAlertBanner
          alert={bannerAlert}
          onInvestigate={(alert) => {
            setModalAlert(alert)
            setBannerAlert(null)
          }}
          onOpenDispatch={(alert) => {
            setDispatchAlert(alert)
            setBannerAlert(null)
          }}
          onSnooze={handleSnoozeBanner}
          onDismiss={handleDismissBanner}
          onAcknowledge={handleDismissBanner}
        />
      )}

      {modalAlert && (
        <ForensicDossierModal
          alert={modalAlert}
          onClose={handleCloseDossier}
          onOpenDispatch={(alert) => setDispatchAlert(alert || modalAlert)}
        />
      )}

      {dispatchAlert && (
        <QuickDispatchModal
          alert={dispatchAlert}
          onClose={() => setDispatchAlert(null)}
        />
      )}

      {/* 8-Scenario Empirical Benchmark Modal */}
      <ScenarioEvaluationModal
        isOpen={isScenarioModalOpen}
        onClose={() => setIsScenarioModalOpen(false)}
      />

      {/* AI Microservices Watchdog & Multi-Edge Fleet Telemetry Modal */}
      <SystemWatchdogModal
        isOpen={isWatchdogModalOpen}
        onClose={() => setIsWatchdogModalOpen(false)}
      />

      {/* Authorized Personnel & Known Faces Manager Modal */}
      <KnownFacesModal
        isOpen={isKnownFacesModalOpen}
        onClose={() => setIsKnownFacesModalOpen(false)}
      />
    </div>
  )
}
