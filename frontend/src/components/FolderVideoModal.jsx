import React, { useState, useEffect, useCallback } from 'react'

const API_BASE = 'http://localhost:8000'

const CATEGORY_TABS = [
  { id: 'ALL',       label: 'All Folder Videos', icon: 'folder' },
  { id: 'VEHICLE',   label: '🚗 Vehicles & ANPR', icon: 'directions_car' },
  { id: 'FIGHT',     label: '🥊 Altercation / Fight', icon: 'sports_kabaddi' },
  { id: 'BREACH',    label: '🚧 Perimeter Breach', icon: 'fmd_bad' },
  { id: 'NIGHT',     label: '🌙 Night / Thermal', icon: 'bedtime' },
  { id: 'CROWD',     label: '👥 Crowd & Walkway', icon: 'groups' }
]

export default function FolderVideoModal({
  isOpen,
  onClose,
  initialCameraId = 'CAM-01',
  onVideoAssigned
}) {
  const [selectedCamera, setSelectedCamera] = useState(initialCameraId || 'CAM-01')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [searchQuery, setSearchQuery]       = useState('')
  const [videos, setVideos]                 = useState([])
  const [loading, setLoading]               = useState(false)
  const [selectedVideo, setSelectedVideo]   = useState(null)
  const [applying, setApplying]             = useState(false)
  const [customFolder, setCustomFolder]     = useState('')
  const [uploading, setUploading]           = useState(false)
  const [statusMsg, setStatusMsg]           = useState(null)

  useEffect(() => {
    if (initialCameraId) {
      setSelectedCamera(initialCameraId)
    }
  }, [initialCameraId])

  // Fetch Videos in Folders
  const fetchVideos = useCallback(async (folderPath = '') => {
    setLoading(true)
    try {
      const url = folderPath
        ? `${API_BASE}/api/v1/videos/folder?folder_path=${encodeURIComponent(folderPath)}`
        : `${API_BASE}/api/v1/videos/folder`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setVideos(data.videos || [])
        if (data.videos && data.videos.length > 0 && !selectedVideo) {
          setSelectedVideo(data.videos[0])
        }
      }
    } catch (err) {
      console.error('Error discovering folder videos:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedVideo])

  useEffect(() => {
    if (isOpen) {
      fetchVideos(customFolder)
    }
  }, [isOpen, fetchVideos, customFolder])

  // Assign Selected Video to Camera Channel
  const handleAssignVideo = async (videoToAssign) => {
    const target = videoToAssign || selectedVideo
    if (!target) return
    setApplying(true)
    setStatusMsg(null)
    try {
      const res = await fetch(`${API_BASE}/api/v1/camera/${selectedCamera}/set-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_path: target.relative_path || target.absolute_path })
      })
      const data = await res.json()
      if (res.ok) {
        setStatusMsg({ type: 'success', text: `✓ ${target.filename} assigned to ${selectedCamera} · Edge AI inference active!` })
        if (onVideoAssigned) {
          onVideoAssigned(selectedCamera, target)
        }
        setTimeout(() => {
          onClose()
        }, 1200)
      } else {
        setStatusMsg({ type: 'error', text: data.detail || 'Failed to assign video source' })
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: String(err) })
    } finally {
      setApplying(false)
    }
  }

  // Upload Local Video File to Folder
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setStatusMsg(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API_BASE}/api/v1/upload-video/${selectedCamera}`, {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      if (res.ok) {
        setStatusMsg({ type: 'success', text: `✓ Uploaded ${file.name} to demo/videos and started detection on ${selectedCamera}!` })
        fetchVideos(customFolder)
        if (onVideoAssigned) {
          onVideoAssigned(selectedCamera, { filename: file.name, relative_path: data.video_path })
        }
        setTimeout(() => {
          onClose()
        }, 1400)
      } else {
        setStatusMsg({ type: 'error', text: data.detail || 'Upload failed' })
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: String(err) })
    } finally {
      setUploading(false)
    }
  }

  // Filtered Video List
  const filteredVideos = videos.filter(v => {
    const matchesSearch = !searchQuery.trim() ||
      v.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.category.toLowerCase().includes(searchQuery.toLowerCase())

    if (!matchesSearch) return false

    if (categoryFilter === 'ALL') return true
    if (categoryFilter === 'VEHICLE') return v.category.includes('Vehicle')
    if (categoryFilter === 'FIGHT') return v.category.includes('Fight') || v.category.includes('Altercation')
    if (categoryFilter === 'BREACH') return v.category.includes('Breach') || v.category.includes('Perimeter')
    if (categoryFilter === 'NIGHT') return v.category.includes('Night') || v.category.includes('Thermal')
    if (categoryFilter === 'CROWD') return v.category.includes('Crowd') || v.category.includes('Pedestrian')
    return true
  })

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="modal-box" style={{ width: '100%', maxWidth: 880, maxHeight: '90vh', background: '#0b101d', border: '1px solid var(--border-accent)', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.95)' }}>
        
        {/* ── HEADER ── */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-panel)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--accent)', fontSize: 22 }}>folder_open</span>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.5px' }}>
                FOLDER VIDEO DETECTION HUB
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Select or upload video files from folders to run Edge AI Detection, ANPR & Incident Tracking
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        {/* ── CONTROLS TOOLBAR ── */}
        <div style={{ padding: '12px 20px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          {/* Target Camera Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Target Camera:
            </span>
            <select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent-bd)', borderRadius: 6, padding: '4px 10px', color: 'var(--accent)', fontWeight: 800, fontSize: 12, outline: 'none' }}
            >
              {['CAM-01', 'CAM-02', 'CAM-03', 'CAM-04', 'CAM-05', 'CAM-06'].map(id => (
                <option key={id} value={id}>{id} · Feed Channel</option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 320 }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-dim)' }}>
                search
              </span>
              <input
                type="text"
                placeholder="Search folder videos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '5px 24px 5px 28px',
                  color: 'var(--text-primary)',
                  fontSize: 11,
                  outline: 'none'
                }}
              />
              {searchQuery && (
                <span
                  className="material-symbols-outlined"
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  close
                </span>
              )}
            </div>
          </div>

          {/* Upload Button */}
          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 6,
            background: 'rgba(16,185,129,0.15)',
            border: '1px solid rgba(16,185,129,0.4)',
            color: 'var(--success)',
            cursor: uploading ? 'not-allowed' : 'pointer',
            fontSize: 11,
            fontWeight: 700
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
            <span>{uploading ? 'Uploading...' : 'Upload Video File'}</span>
            <input
              type="file"
              accept=".mp4,.avi,.mkv,.mov"
              style={{ display: 'none' }}
              disabled={uploading}
              onChange={handleFileUpload}
            />
          </label>
        </div>

        {/* ── CUSTOM FOLDER PATH SCANNER BAR ── */}
        <div style={{ padding: '8px 20px', background: 'rgba(15,23,42,0.6)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>source</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Scan Folder:</span>
          <input
            type="text"
            placeholder="Default: demo/videos (or enter local folder path e.g. /Users/.../my_videos)"
            value={customFolder}
            onChange={(e) => setCustomFolder(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') fetchVideos(customFolder) }}
            style={{
              flex: 1,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 11,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)'
            }}
          />
          <button
            onClick={() => fetchVideos(customFolder)}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>refresh</span>
            Scan
          </button>
        </div>

        {/* ── CATEGORY FILTER TABS ── */}
        <div style={{ padding: '8px 20px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {CATEGORY_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setCategoryFilter(tab.id)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: `1px solid ${categoryFilter === tab.id ? 'var(--accent)' : 'var(--border)'}`,
                background: categoryFilter === tab.id ? 'rgba(56,189,248,0.2)' : 'var(--bg-surface)',
                color: categoryFilter === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── STATUS BANNER ── */}
        {statusMsg && (
          <div style={{
            padding: '8px 20px',
            background: statusMsg.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
            borderBottom: `1px solid ${statusMsg.type === 'success' ? 'var(--success)' : 'var(--critical)'}`,
            color: statusMsg.type === 'success' ? 'var(--success)' : 'var(--critical)',
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {statusMsg.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* ── VIDEO LIST BODY ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite' }}>sync</span>
              <div style={{ marginTop: 8, fontSize: 12 }}>Scanning folder for video files...</div>
            </div>
          ) : filteredVideos.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--text-dim)' }}>videocam_off</span>
              <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700 }}>No video files found in folder</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                Drop MP4/AVI videos into <code>demo/videos/</code> or click "Upload Video File" above.
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
              {filteredVideos.map((v, idx) => {
                const isSelected = selectedVideo?.filename === v.filename
                const isVeh = v.category.includes('Vehicle')
                const isFight = v.category.includes('Fight')
                const isBreach = v.category.includes('Breach')

                const badgeColor = isVeh ? '#38bdf8' : isFight ? '#f43f5e' : isBreach ? '#f59e0b' : '#10b981'

                return (
                  <div
                    key={v.filename || idx}
                    onClick={() => setSelectedVideo(v)}
                    onDoubleClick={() => handleAssignVideo(v)}
                    style={{
                      background: isSelected ? 'rgba(56,189,248,0.12)' : 'var(--bg-panel)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 8,
                      padding: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 0 12px rgba(56,189,248,0.25)' : 'none'
                    }}
                    className="hover-card"
                  >
                    <div>
                      {/* Category Badge & Size */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          background: 'rgba(255,255,255,0.06)',
                          color: badgeColor,
                          border: `1px solid ${badgeColor}`
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{v.icon || 'videocam'}</span>
                          <span>{v.category}</span>
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                          {v.size_mb} MB
                        </span>
                      </div>

                      {/* File Name */}
                      <div style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                        lineHeight: 1.3,
                        marginBottom: 6,
                        wordBreak: 'break-word'
                      }}>
                        {v.filename}
                      </div>

                      {/* Meta Tags */}
                      <div style={{ display: 'flex', gap: 6, fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                        <span>{v.resolution}</span>
                        <span>•</span>
                        <span>30 FPS</span>
                        <span>•</span>
                        <span>Looped</span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAssignVideo(v)
                        }}
                        disabled={applying}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 10px',
                          borderRadius: 4,
                          background: isSelected ? 'var(--accent)' : 'var(--bg-surface)',
                          border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-light)'}`,
                          color: isSelected ? '#0b101d' : 'var(--text-primary)',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>play_arrow</span>
                        <span>Run on {selectedCamera}</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div style={{ padding: '14px 20px', background: 'var(--bg-panel)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {selectedVideo ? (
              <span>Selected: <strong style={{ color: 'var(--accent)' }}>{selectedVideo.filename}</strong> ({selectedVideo.size_mb} MB)</span>
            ) : (
              <span>Click a video to select</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={onClose}
              style={{ padding: '6px 14px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancel
            </button>

            <button
              onClick={() => handleAssignVideo(selectedVideo)}
              disabled={!selectedVideo || applying}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 16px',
                borderRadius: 6,
                background: 'var(--accent)',
                border: 'none',
                color: '#0b101d',
                fontSize: 12,
                fontWeight: 800,
                cursor: (!selectedVideo || applying) ? 'not-allowed' : 'pointer'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_circle</span>
              <span>{applying ? 'Launching Sentry...' : `▶ Run AI Detection on ${selectedCamera}`}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
