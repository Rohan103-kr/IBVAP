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
import VehicleAdminView from './components/VehicleAdminView'
import AdminPanelView from './components/AdminPanelView'

const API = 'http://localhost:8000'

const fetchJSON = async (url) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export default function App() {
  const [activeTab, setActiveTabState] = useState(() => {
    try {
      const urlTab = new URLSearchParams(window.location.search).get('tab')
      if (urlTab) return urlTab
    } catch {}
    return 'live'
  })

  const setActiveTab = (tab) => {
    setActiveTabState(tab)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', tab)
      window.history.replaceState(null, '', url.toString())
    } catch {}
  }
  const [alerts, setAlerts]             = useState([])
  const [muted, setMuted]               = useState(false)
  const [voiceAlerts, setVoiceAlerts]   = useState(true)
  const [theme, setTheme]               = useState(() => {
    try {
      const urlTheme = new URLSearchParams(window.location.search).get('theme')
      if (urlTheme) return urlTheme
    } catch {}
    return localStorage.getItem('ibvap_theme') || 'light'
  })
  const [modalAlert, setModalAlert]     = useState(null)
  const [dispatchAlert, setDispatchAlert] = useState(null)
  const [bannerAlert, setBannerAlert]   = useState(null)
  const [simBboxes, setSimBboxes]       = useState({})
  const [backendOnline, setBackendOnline] = useState(false)
  const [feedsOnline]                   = useState(8)
  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false)
  const [isWatchdogModalOpen, setIsWatchdogModalOpen] = useState(false)
  const [isKnownFacesModalOpen, setIsKnownFacesModalOpen] = useState(false)
  const [activeTargets, setActiveTargets] = useState([])

  // Default CAM-01 active; others in standby until connected or activated
  const [playingState, setPlayingState] = useState({
    'CAM-01': true,
    'CAM-02': false,
    'CAM-03': false,
    'CAM-04': false,
    'CAM-05': false,
    'CAM-06': false,
    'CAM-07': false,
    'CAM-08': false,
  })

  const playingStateRef = useRef(playingState)
  useEffect(() => {
    playingStateRef.current = playingState
  }, [playingState])

  const modalAlertRef = useRef(modalAlert)
  useEffect(() => {
    modalAlertRef.current = modalAlert
  }, [modalAlert])

  const setPlay = (id, shouldPlay = true) => {
    setPlayingState(prev => ({ ...prev, [id]: shouldPlay }))
    if (shouldPlay) {
      fetch(`${API}/api/v1/simulation/play/${id}`, { method: 'POST' }).catch(() => {})
    } else {
      fetch(`${API}/api/v1/simulation/toggle/${id}`, { method: 'POST' }).catch(() => {})
    }
  }

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
  const getPersistedAcknowledged = () => {
    try {
      const raw = localStorage.getItem('ibvap_acknowledged_alerts')
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch {
      return new Set()
    }
  }
  const acknowledgedAlertsRef = useRef(getPersistedAcknowledged())
  const dismissedAlertsRef = useRef(new Set())
  const snoozedCamsRef = useRef({}) // key: cam_id -> timestamp until which popups are snoozed
  const snoozedTracksRef = useRef({}) // key: track_id -> timestamp until which popups are snoozed
  const bannerAlertRef = useRef(bannerAlert)
  const isBannerHoveredRef = useRef(false)
  const lastAudioTimeRef = useRef(0) // Rate-limit siren/speech to at most 1 every 25s

  useEffect(() => {
    bannerAlertRef.current = bannerAlert
  }, [bannerAlert])

  const persistAcknowledgedId = useCallback((id) => {
    if (!id) return
    acknowledgedAlertsRef.current.add(id)
    dismissedAlertsRef.current.add(id)
    try {
      localStorage.setItem(
        'ibvap_acknowledged_alerts',
        JSON.stringify(Array.from(acknowledgedAlertsRef.current).slice(-500))
      )
    } catch {}
  }, [])

  const handleAcknowledgeAlert = useCallback((alertOrId) => {
    const aid = typeof alertOrId === 'string' ? alertOrId : (alertOrId?.id || alertOrId?.event_id)
    if (!aid) return

    persistAcknowledgedId(aid)

    // Notify backend to register acknowledgement in audit store & extend camera track cooldown
    fetch(`${API}/api/v1/alerts/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_id: aid, operator_id: 'Operator-Command' })
    }).catch(() => {})

    // Instantly close banner and modal if they match this alert
    setBannerAlert(prev => (prev && (prev.id === aid || prev.event_id === aid) ? null : prev))
    setModalAlert(prev => (prev && (prev.id === aid || prev.event_id === aid) ? null : prev))

    // Mark as acknowledged in main dashboard alerts feed
    setAlerts(prev => prev.map(a => (a.id === aid || a.event_id === aid) ? { ...a, acknowledged: true } : a))
  }, [persistAcknowledgedId])

  const handleCloseDossier = useCallback(() => {
    if (modalAlert) {
      const aid = modalAlert.id || modalAlert.event_id
      if (aid) handleAcknowledgeAlert(aid)
      const camId = modalAlert.camera_id
      if (camId) {
        snoozedCamsRef.current[camId] = Date.now() + 180000
      }
      if (modalAlert.track_id) {
        snoozedTracksRef.current[modalAlert.track_id] = Date.now() + 180000
      }
    }
    setModalAlert(null)
  }, [modalAlert, handleAcknowledgeAlert])

  const handleSnoozeBanner = useCallback((alert) => {
    if (alert) {
      const aid = alert.id || alert.event_id
      if (aid) handleAcknowledgeAlert(aid)
      const camId = alert.camera_id
      if (camId) {
        snoozedCamsRef.current[camId] = Date.now() + 180000
      }
      if (alert.track_id) {
        snoozedTracksRef.current[alert.track_id] = Date.now() + 180000
      }
    }
    setBannerAlert(null)
  }, [handleAcknowledgeAlert])

  const handleDismissBanner = useCallback((alert) => {
    if (alert) {
      handleAcknowledgeAlert(alert)
    } else {
      setBannerAlert(null)
    }
  }, [handleAcknowledgeAlert])

  const handleClearAllAlerts = useCallback(async () => {
    try {
      await fetch(`${API}/api/v1/events/clear`, { method: 'POST' })
    } catch {}
    setAlerts([])
    setBannerAlert(null)
    setModalAlert(null)
    acknowledgedAlertsRef.current.clear()
    dismissedAlertsRef.current.clear()
    try { localStorage.removeItem('ibvap_acknowledged_alerts') } catch {}
  }, [])

  const handleClearCameraAlerts = useCallback((camId) => {
    if (!camId) return
    setAlerts(prev => prev.filter(a => a.camera_id !== camId))
    setBannerAlert(prev => prev && prev.camera_id === camId ? null : prev)
    setModalAlert(prev => prev && prev.camera_id === camId ? null : prev)
    fetch(`${API}/api/v1/camera/${camId}/clear-events`, { method: 'POST' }).catch(() => {})
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

        if (Array.isArray(data)) {
          const validBackendIds = new Set(data.map(d => d.event_id || d.id))

          // Instantly dismiss any modal or banner if its underlying event was cleared on backend
          setBannerAlert(prev => (prev && validBackendIds.has(prev.id || prev.event_id) ? prev : null))
          setModalAlert(prev => (prev && validBackendIds.has(prev.id || prev.event_id) ? prev : null))

          setAlerts(prev => {
            // Retain alerts only if they still exist in the backend active events list
            const activePrev = prev.filter(a => {
              const aid = a.id || a.event_id
              return aid && validBackendIds.has(aid)
            })
            const activeIds = new Set(activePrev.map(a => a.id || a.event_id))

            const fresh = data
              .filter(d => {
                const eid = d.event_id || d.id
                // Filter out any alert already acknowledged by operator (never re-arrive on dashboard)
                if (d.acknowledged || (eid && acknowledgedAlertsRef.current.has(eid))) {
                  return false
                }
                return eid && !activeIds.has(eid)
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

            if (fresh.length === 0) return activePrev

            // Non-intrusive Heads-Up Banner for genuine Level-1 threats on active cameras
            const now = Date.now()
            const P1_TYPES = new Set(['FENCE_CROSSING', 'ANPR_WATCHLIST_MATCH', 'FRS_SUSPECT_MATCH', 'VIOLENT_SKIRMISH', 'ZONE_ENTRY', 'RESTRICTED_PENETRATION'])

            // Filter all candidate alerts meeting strict priority criteria
            const candidates = fresh.filter(a => {
              const score = a.risk_score ?? a.riskScore ?? 0
              const aid = a.id || a.event_id
              const camId = a.camera_id
              const trackId = a.track_id
              const isPlaying = playingStateRef.current[camId] ?? false

              // CRITICAL: NEVER fire alerts for paused / inactive cameras!
              if (!isPlaying) return false

              // NEVER re-arrive if acknowledged
              if (a.acknowledged || (aid && acknowledgedAlertsRef.current.has(aid))) return false

              const isCamSnoozed = snoozedCamsRef.current[camId] && snoozedCamsRef.current[camId] > now
              const isTrackSnoozed = trackId && snoozedTracksRef.current[trackId] && snoozedTracksRef.current[trackId] > now
              const isDismissed = aid && dismissedAlertsRef.current.has(aid)
              const isP1 = P1_TYPES.has(a.event_type) || a.severity === 'CRITICAL'

              // Strictly filter out noise: only pop up banner for genuine P1/P2 breaches with risk >= 75
              return isP1 && score >= 75 && !isDismissed && !isCamSnoozed && !isTrackSnoozed
            })

            if (candidates.length > 0) {
              // Sort candidates by priority score / risk descending to pick the most urgent threat
              candidates.sort((a, b) => (b.priority_score || b.risk_score || 0) - (a.priority_score || a.risk_score || 0))
              const topThreat = candidates[0]
              const topScore = topThreat.risk_score ?? topThreat.riskScore ?? 0
              const currentScore = bannerAlertRef.current ? (bannerAlertRef.current.risk_score ?? bannerAlertRef.current.riskScore ?? 0) : 0

              // Anti-noise & anti-interruption: only replace banner if none showing OR incoming is strictly higher risk and not being inspected
              const canShow = !bannerAlertRef.current || (!isBannerHoveredRef.current && topScore > currentScore)

              if (canShow) {
                const aid = topThreat.id || topThreat.event_id
                if (aid) dismissedAlertsRef.current.add(aid)
                const camId = topThreat.camera_id
                if (camId) snoozedCamsRef.current[camId] = now + 60000
                if (topThreat.track_id) snoozedTracksRef.current[topThreat.track_id] = now + 90000

                // Show tactical HUD banner in top-right corner (unobtrusive, auto-dismissing in 10s)
                setBannerAlert(topThreat)

                // Rate-limit audio siren & speech synthesis to at most 1 per 25s
                if (now - lastAudioTimeRef.current > 25000) {
                  lastAudioTimeRef.current = now
                  playSiren()
                  const cleanType = (topThreat.event_type || 'intrusion').replace(/_/g, ' ').toLowerCase()
                  const cleanCam = (topThreat.camera_id || 'Sector 1').replace('-', ' ')
                  speakAlert(`Priority alert: ${cleanType} on ${cleanCam}`)
                }
              }
            }

            return [...fresh, ...activePrev].slice(0, 100)
          })
        }
      } catch {}
    }

    checkHealth()
    pollEvents()
    pollTimer.current = setInterval(() => {
      checkHealth()
      pollEvents()
    }, 2500)
    return () => clearInterval(pollTimer.current)
  }, [playSiren, speakAlert])

  useEffect(() => {
    localStorage.setItem('ibvap_theme', theme)
    document.documentElement.className = theme === 'light' ? 'theme-light' : `theme-${theme}`
  }, [theme])

  // Glove-Friendly Tactical Keyboard Hotkeys for Sentry Command
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input field
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return

      if (e.code === 'Space') {
        e.preventDefault()
        // Acknowledge banner or top alert
        if (bannerAlertRef.current) {
          handleAcknowledgeAlert(bannerAlertRef.current)
        } else if (modalAlertRef.current) {
          handleAcknowledgeAlert(modalAlertRef.current)
        } else if (alerts.length > 0) {
          handleAcknowledgeAlert(alerts[0])
        }
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        setDispatchAlert(bannerAlertRef.current || alerts[0] || null)
      } else if (e.key === '1') {
        setActiveTab('live')
      } else if (e.key === '2') {
        setActiveTab('map')
      } else if (e.key === '3') {
        setActiveTab('alerts')
      } else if (e.key === '4') {
        setActiveTab('anpr')
      } else if (e.key === 'Escape') {
        if (bannerAlertRef.current) {
          handleAcknowledgeAlert(bannerAlertRef.current)
        }
        setModalAlert(null)
        setDispatchAlert(null)
        setBannerAlert(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [bannerAlert, alerts, handleDismissBanner])

  const cycleTheme = () => {
    setTheme(prev => {
      if (prev === 'light') return 'midnight'
      if (prev === 'midnight') return 'thermal'
      if (prev === 'thermal') return 'amber'
      return 'light'
    })
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
            onSetPlay={setPlay}
            onAcknowledge={handleAcknowledgeAlert}
            onClearAll={handleClearAllAlerts}
            onClearCameraAlerts={handleClearCameraAlerts}
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
        {activeTab === 'vehicles' && <VehicleAdminView />}
        {activeTab === 'cameras' && <CameraStatusView />}
        {activeTab === 'analytics' && <AnalyticsView />}
        {activeTab === 'admin' && <AdminPanelView onNavigateToFeeds={() => setActiveTab('live')} />}
      </main>

      <Footer
        alerts={alerts}
        feedsOnline={feedsOnline}
        activeCount={criticalCount}
      />

      {scenarioResult && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 420, padding: 20, textAlign: 'center', border: '1px solid var(--success)', background: 'var(--bg-panel)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--success)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-symbols-outlined">check_circle</span>
              SCENARIO COMPLETE ✓
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
              {scenarioResult.title || scenarioResult.id || 'Demo Scenario Execution'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, textAlign: 'left', background: 'var(--bg-surface)', padding: 12, borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)', marginBottom: 16, border: '1px solid var(--border)' }}>
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
          onHoverChange={(hovered) => {
            isBannerHoveredRef.current = hovered
          }}
          onSnooze={handleSnoozeBanner}
          onDismiss={handleAcknowledgeAlert}
          onAcknowledge={handleAcknowledgeAlert}
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
