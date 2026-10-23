import React, { useState, useEffect } from 'react'
import { API } from '../config'

export default function KnownFacesModal({ isOpen, onClose }) {
  const [identities, setIdentities] = useState([])
  const [loading, setLoading] = useState(false)
  const [personId, setPersonId] = useState('')
  const [fullName, setFullName] = useState('')
  const [roleType, setRoleType] = useState('AUTHORIZED')
  const [successMsg, setSuccessMsg] = useState('')

  const [selectedFiles, setSelectedFiles] = useState([])
  const [previews, setPreviews] = useState([])
  const [editingItem, setEditingItem] = useState(null)

  const fetchIdentities = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/frs/identities`)
      if (res.ok) {
        const data = await res.json()
        setIdentities(data.identities || [])
      }
    } catch (err) {
      console.error('Failed to fetch FRS identities:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchIdentities()
    }
  }, [isOpen])

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setSelectedFiles(prev => [...prev, ...files])
    const newPreviews = files.map(file => URL.createObjectURL(file))
    setPreviews(prev => [...prev, ...newPreviews])
  }

  const handleClearFiles = () => {
    setSelectedFiles([])
    setPreviews([])
  }

  const handleStartEdit = (item) => {
    setEditingItem(item)
    let pId = item.person_id || item.name
    let fName = item.name
    if (item.name.includes('_')) {
      const parts = item.name.split('_')
      pId = parts[0]
      fName = parts.slice(1).join('_')
    }
    setPersonId(pId)
    setFullName(fName)
    setRoleType(item.status === 'AUTHORIZED' ? 'AUTHORIZED' : 'UNAUTHORIZED')
    setSelectedFiles([])
    setPreviews([])
  }

  const handleCancelEdit = () => {
    setEditingItem(null)
    setPersonId('')
    setFullName('')
    setRoleType('AUTHORIZED')
    setSelectedFiles([])
    setPreviews([])
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (!fullName && !personId) return

    const nameToRegister = personId ? `${personId}_${fullName}` : fullName

    try {
      const formData = new FormData()
      formData.append('person_id', personId)
      formData.append('name', nameToRegister)
      formData.append('role', roleType === 'AUTHORIZED' ? 'Authorized Border Patrol' : 'Watchlist Suspect')

      if (editingItem) {
        formData.append('old_name', editingItem.name)
      }

      selectedFiles.forEach(file => {
        formData.append('files', file)
      })

      const res = await fetch(`${API}/api/v1/frs/identities`, {
        method: 'POST',
        body: formData
      })

      if (res.ok) {
        const data = await res.json()
        const actionText = editingItem ? 'Updated' : 'Registered'
        setSuccessMsg(`✓ ${actionText} ${fullName || personId} with ${data.uploaded_photos || selectedFiles.length} face photo(s). Alerts will be suppressed when detected in any zone.`)
        setEditingItem(null)
        setPersonId('')
        setFullName('')
        setSelectedFiles([])
        setPreviews([])
        fetchIdentities()
        setTimeout(() => setSuccessMsg(''), 5000)
      }
    } catch (err) {
      console.error('Error saving identity:', err)
    }
  }

  const handleDelete = async (name) => {
    try {
      const res = await fetch(`${API}/api/v1/frs/identities/${encodeURIComponent(name)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        fetchIdentities()
      }
    } catch (err) {
      console.error('Error deleting identity:', err)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-backdrop">
      <div className="modal-box" style={{ maxWidth: 880 }}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--success)' }}>
              badge
            </span>
            <div>
              <span className="modal-title">AUTHORIZED PERSONNEL & KNOWN FACES MANAGER</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 10, fontFamily: 'var(--font-sans)' }}>
                Upload Known Faces → Green Box + Person Name + Alert Suppression Active
              </span>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ gridTemplateColumns: '1.1fr 0.9fr', gap: 20 }}>
          {/* Left: Register Form */}
          <div className="modal-col">
            <div className="dossier-card" style={{ background: 'var(--bg-panel)' }}>
              <div className="dossier-card-title" style={{ color: editingItem ? 'var(--accent)' : 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{editingItem ? 'edit' : 'person_add'}</span>
                  {editingItem ? `EDIT IDENTITY: ${editingItem.name}` : 'REGISTER NEW KNOWN FACE IDENTITY'}
                </span>
                {editingItem && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid #334155', color: '#f8fafc', padding: '2px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
                  >
                    ✕ Cancel Edit
                  </button>
                )}
              </div>

              {successMsg && (
                <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid var(--success)', color: 'var(--success)', padding: 10, borderRadius: 8, fontSize: 11, marginBottom: 12, lineHeight: 1.4 }}>
                  {successMsg}
                </div>
              )}

              <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                    OFFICER / PERSON ID (e.g. OFFICER-BRAVO)
                  </label>
                  <input
                    type="text"
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 12 }}
                    placeholder="OFFICER-002"
                    value={personId}
                    onChange={(e) => setPersonId(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                    FULL NAME (Will be displayed on Green Box)
                  </label>
                  <input
                    type="text"
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 12 }}
                    placeholder="Capt. Rahul Sharma"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                    AUTHORIZATION STATUS
                  </label>
                  <select
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 12 }}
                    value={roleType}
                    onChange={(e) => setRoleType(e.target.value)}
                  >
                    <option value="AUTHORIZED">✓ AUTHORIZED — Friendly Patrol (Green Box, Suppress Alert)</option>
                    <option value="UNAUTHORIZED">🚨 UNAUTHORIZED — Watchlist Target (Red Alert)</option>
                  </select>
                </div>

                {/* Face Image File Upload Dropzone */}
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                    {editingItem ? 'ADD MORE FACE PHOTOS / IMAGES (.JPG, .PNG)' : 'UPLOAD FACE PHOTOS / IMAGES (.JPG, .PNG)'}
                  </label>
                  <label
                    style={{
                      border: '2px dashed rgba(16,185,129,0.4)',
                      borderRadius: 8,
                      background: 'rgba(15,23,42,0.6)',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      gap: 6
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--success)' }}>
                      add_a_photo
                    </span>
                    <span style={{ fontSize: 11, color: '#f8fafc', fontWeight: 600 }}>
                      Click to Browse & Upload Face Photos
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      Select 1 or multiple facial images for AI training
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/jpg"
                      multiple
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                  </label>

                  {/* Thumbnail Previews */}
                  {previews.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700 }}>
                          {previews.length} Photo(s) Selected for Upload:
                        </span>
                        <button
                          type="button"
                          onClick={handleClearFiles}
                          style={{ background: 'none', border: 'none', color: 'var(--critical)', fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Clear Photos
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 90, overflowY: 'auto' }}>
                        {previews.map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            alt={`preview-${i}`}
                            style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--success)' }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    type="submit"
                    className="btn-accent"
                    style={{ flex: 1, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: editingItem ? 'var(--accent)' : undefined }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      {editingItem ? 'save' : 'cloud_upload'}
                    </span>
                    {editingItem ? 'SAVE UPDATED IDENTITY & RETRAIN FRS' : 'REGISTER IDENTITY & TRAIN FRS MODEL'}
                  </button>

                  {editingItem && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      style={{ padding: '10px 14px', background: '#334155', color: '#f8fafc', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                    >
                      CANCEL
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* Right: Registered List */}
          <div className="modal-col">
            <div className="dossier-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="dossier-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>REGISTERED FACES DATABASE ({identities.length})</span>
                <span className="toolbar-badge">FRS ACTIVE</span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading identities...</div>}

                {identities.length === 0 && !loading && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                    No registered personnel yet. Add an identity to suppress alerts.
                  </div>
                )}

                {identities.map((item) => {
                  const isAuth = item.status === 'AUTHORIZED'
                  const isBeingEdited = editingItem && editingItem.name === item.name
                  return (
                    <div
                      key={item.name}
                      style={{
                        background: isBeingEdited ? 'rgba(14,165,233,0.15)' : isAuth ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)',
                        border: `1px solid ${isBeingEdited ? 'var(--accent)' : isAuth ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`,
                        padding: '10px 12px',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: isAuth ? 'var(--success)' : 'var(--critical)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                            {isAuth ? 'verified_user' : 'warning'}
                          </span>
                          {item.name}
                          {isBeingEdited && (
                            <span style={{ fontSize: 9, background: 'var(--accent)', color: '#0f172a', padding: '1px 5px', borderRadius: 4, fontWeight: 800 }}>
                              EDITING
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          {item.role} · {item.sample_count} sample chips
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent)',
                            cursor: 'pointer',
                            fontSize: 16
                          }}
                          onClick={() => handleStartEdit(item)}
                          title="Edit identity details"
                        >
                          ✏️
                        </button>
                        <button
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: 16
                          }}
                          onClick={() => handleDelete(item.name)}
                          title="Remove identity"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
