import React, { useState, useEffect, useMemo } from 'react'
import { API } from '../config'

export default function AdminPanelView({ onNavigateToFeeds }) {
  // ── Top Navigation Sub-Section ──
  const [activeSection, setActiveSection] = useState('vehicles') // 'personnel' | 'vehicles'

  // ── Authentication State ──
  const [authToken, setAuthToken] = useState(() => sessionStorage.getItem('ibvap_admin_auth') || '')
  const [loginId, setLoginId] = useState('')
  const [loginPwd, setLoginPwd] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // ── Shared Notifications ──
  const [notification, setNotification] = useState('')

  // ──────────────────────────────────────────────────────────────────────────
  // 1. PERSONNEL & FRS CLEARANCE STATE
  // ──────────────────────────────────────────────────────────────────────────
  const [identities, setIdentities] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL') // 'ALL' | 'AUTHORIZED' | 'UNAUTHORIZED' | 'HAS_PHOTOS'
  const [sortBy, setSortBy] = useState('name') // 'name' | 'samples' | 'updated'
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'table'

  // Personnel Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPerson, setEditingPerson] = useState(null)
  const [formData, setFormData] = useState({
    person_id: '',
    full_name: '',
    role: '',
    department: 'Sector Alpha Command',
    status: 'AUTHORIZED',
    notes: ''
  })
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [filePreviews, setFilePreviews] = useState([])
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [lightboxPhoto, setLightboxPhoto] = useState(null)

  // ──────────────────────────────────────────────────────────────────────────
  // 2. VEHICLES & ANPR FLEET DIRECTORY STATE
  // ──────────────────────────────────────────────────────────────────────────
  const [vehicles, setVehicles] = useState([])
  const [vehiclesLoading, setVehiclesLoading] = useState(false)
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('')
  const [vehicleFilterStatus, setVehicleFilterStatus] = useState('ALL') // 'ALL' | 'AUTHORIZED' | 'UNAUTHORIZED' | 'HAS_PHOTOS'
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('ALL') // 'ALL' | 'TRUCK' | 'CAR' | 'SUV' | 'MOTORCYCLE' | 'BUS'
  const [vehicleSortBy, setVehicleSortBy] = useState('plate') // 'plate' | 'driver' | 'type' | 'photos'
  const [vehicleViewMode, setVehicleViewMode] = useState('grid') // 'grid' | 'table'

  // Vehicle Modal State
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState(null)
  const [vehicleFormData, setVehicleFormData] = useState({
    plate_number: '',
    vehicle_type: 'TRUCK',
    owner_name: '',
    driver_phone: '',
    department: 'Tactical Logistics & Supply',
    status: 'AUTHORIZED',
    color: 'Olive Drab',
    make_model: 'Tata Defense 4x4',
    notes: 'Convoy clearance. Zone alert completely suppressed'
  })
  const [uploadedVehicleFiles, setUploadedVehicleFiles] = useState([])
  const [vehicleFilePreviews, setVehicleFilePreviews] = useState([])
  const [vehicleFormSaving, setVehicleFormSaving] = useState(false)
  const [vehicleFormError, setVehicleFormError] = useState('')
  const [vehicleLightbox, setVehicleLightbox] = useState(null)

  // ──────────────────────────────────────────────────────────────────────────
  // 3. 🚨 LOST & SUSPICIOUS WATCHLIST STATE (MOST WANTED & LOST VEHICLES)
  // ──────────────────────────────────────────────────────────────────────────
  const [watchlistPersons, setWatchlistPersons] = useState([])
  const [watchlistVehicles, setWatchlistVehicles] = useState([])
  const [watchlistLoading, setWatchlistLoading] = useState(false)
  const [watchlistSubTab, setWatchlistSubTab] = useState('persons') // 'persons' | 'vehicles'

  // Watchlist Filtering & Sorting
  const [watchlistSearch, setWatchlistSearch] = useState('')
  const [watchlistCategoryFilter, setWatchlistCategoryFilter] = useState('ALL')
  const [watchlistThreatFilter, setWatchlistThreatFilter] = useState('ALL')
  const [watchlistSortBy, setWatchlistSortBy] = useState('sighting') // 'sighting' | 'threat' | 'name'
  const [watchlistViewMode, setWatchlistViewMode] = useState('grid') // 'grid' | 'table'

  // Watchlist Person Modal State
  const [isWatchlistPersonModalOpen, setIsWatchlistPersonModalOpen] = useState(false)
  const [editingWatchlistPerson, setEditingWatchlistPerson] = useState(null)
  const [watchlistPersonForm, setWatchlistPersonForm] = useState({
    id: '',
    full_name: '',
    alias: '',
    category: 'MOST_WANTED',
    threat_level: 'EXTREME',
    fir_number: '',
    reward_inr: '',
    directives: 'Priority 1 apprehension order. Detain immediately on camera match.',
    notes: ''
  })
  const [watchlistPersonFiles, setWatchlistPersonFiles] = useState([])
  const [watchlistPersonPreviews, setWatchlistPersonPreviews] = useState([])
  const [watchlistPersonSaving, setWatchlistPersonSaving] = useState(false)
  const [watchlistPersonError, setWatchlistPersonError] = useState('')

  // Watchlist Vehicle Modal State
  const [isWatchlistVehicleModalOpen, setIsWatchlistVehicleModalOpen] = useState(false)
  const [editingWatchlistVehicle, setEditingWatchlistVehicle] = useState(null)
  const [watchlistVehicleForm, setWatchlistVehicleForm] = useState({
    plate_number: '',
    vehicle_type: 'SUV',
    make_model: '',
    color: '',
    category: 'STOLEN_VEHICLE',
    threat_level: 'EXTREME',
    fir_number: '',
    reported_by: '',
    directives: 'Immediate gate barrier lock. Intercept and detain occupants.',
    notes: ''
  })
  const [watchlistVehicleFiles, setWatchlistVehicleFiles] = useState([])
  const [watchlistVehiclePreviews, setWatchlistVehiclePreviews] = useState([])
  const [watchlistVehicleSaving, setWatchlistVehicleSaving] = useState(false)
  const [watchlistVehicleError, setWatchlistVehicleError] = useState('')

  // Watchlist Lightbox
  const [watchlistLightbox, setWatchlistLightbox] = useState(null)

  // ── Fetch Operations ──
  const fetchIdentities = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/frs/identities`)
      if (res.ok) {
        const data = await res.json()
        setIdentities(data.identities || [])
      }
    } catch (err) {
      console.error('Failed to load FRS identities:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchVehicles = async () => {
    setVehiclesLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/vehicles/enrolled`)
      if (res.ok) {
        const data = await res.json()
        setVehicles(data.vehicles || [])
      }
    } catch (err) {
      console.error('Failed to load enrolled vehicles:', err)
    } finally {
      setVehiclesLoading(false)
    }
  }

  const fetchWatchlistPersons = async () => {
    try {
      const res = await fetch(`${API}/api/v1/admin/watchlist/persons`)
      if (res.ok) {
        const data = await res.json()
        setWatchlistPersons(data.persons || [])
      }
    } catch (err) {
      console.error('Failed to load watchlist persons:', err)
    }
  }

  const fetchWatchlistVehicles = async () => {
    try {
      const res = await fetch(`${API}/api/v1/admin/watchlist/vehicles`)
      if (res.ok) {
        const data = await res.json()
        setWatchlistVehicles(data.vehicles || [])
      }
    } catch (err) {
      console.error('Failed to load watchlist vehicles:', err)
    }
  }

  useEffect(() => {
    if (authToken) {
      fetchIdentities()
      fetchVehicles()
      fetchWatchlistPersons()
      fetchWatchlistVehicles()

      // Real-time background sync every 4s to track live camera sightings
      const syncInterval = setInterval(() => {
        fetchWatchlistPersons()
        fetchWatchlistVehicles()
      }, 4000)

      return () => clearInterval(syncInterval)
    }
  }, [authToken])

  // ── Authentication Handlers ──
  const handleLogin = async (e) => {
    e?.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginId.trim(), password: loginPwd.trim() })
      })
      if (res.ok) {
        const data = await res.json()
        sessionStorage.setItem('ibvap_admin_auth', data.token || 'verified')
        setAuthToken(data.token || 'verified')
        setLoginError('')
      } else {
        const err = await res.json().catch(() => ({}))
        setLoginError(err.detail || 'Invalid Master Credentials. Access Denied.')
      }
    } catch (err) {
      setLoginError('Authentication server unreachable. Verify backend is running.')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleQuickAutofill = () => {
    setLoginId('root')
    setLoginPwd('1234')
  }

  const handleLogout = () => {
    sessionStorage.removeItem('ibvap_admin_auth')
    setAuthToken('')
    setLoginId('')
    setLoginPwd('')
    setLoginError('')
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PERSONNEL HANDLERS
  // ──────────────────────────────────────────────────────────────────────────
  const openAddModal = () => {
    setEditingPerson(null)
    setFormData({
      person_id: `PERS-${Math.floor(100 + Math.random() * 900)}`,
      full_name: '',
      role: 'Sector Recon Officer',
      department: 'Sector Alpha Command',
      status: 'AUTHORIZED',
      notes: 'Zone alert completely suppressed'
    })
    setUploadedFiles([])
    setFilePreviews([])
    setFormError('')
    setIsModalOpen(true)
  }

  const openEditModal = (person) => {
    setEditingPerson(person)
    setFormData({
      person_id: person.person_id || person.name,
      full_name: person.full_name || person.name,
      role: person.role || 'Authorized Border Patrol',
      department: person.department || 'Sector Alpha Command',
      status: person.status || 'AUTHORIZED',
      notes: person.notes || ''
    })
    setUploadedFiles([])
    setFilePreviews([])
    setFormError('')
    setIsModalOpen(true)
  }

  const handleFileSelection = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploadedFiles(prev => [...prev, ...files])
    const newPreviews = files.map(f => URL.createObjectURL(f))
    setFilePreviews(prev => [...prev, ...newPreviews])
  }

  const handleRemovePendingFile = (index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
    setFilePreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handleSavePerson = async (e) => {
    e.preventDefault()
    if (!formData.full_name.trim() && !formData.person_id.trim()) {
      setFormError('Please enter a Person ID or Full Name')
      return
    }

    setFormSaving(true)
    setFormError('')

    const nameToRegister = formData.person_id
      ? `${formData.person_id}_${formData.full_name.trim().replace(/\s+/g, '_')}`
      : formData.full_name.trim().replace(/\s+/g, '_')

    try {
      const payload = new FormData()
      payload.append('person_id', formData.person_id)
      payload.append('name', nameToRegister)
      payload.append('full_name', formData.full_name)
      payload.append('role', formData.role)
      payload.append('department', formData.department)
      payload.append('status', formData.status)
      payload.append('notes', formData.notes)

      if (editingPerson) {
        payload.append('old_name', editingPerson.dir_name || editingPerson.name)
      }

      uploadedFiles.forEach(file => {
        payload.append('files', file)
      })

      const res = await fetch(`${API}/api/v1/frs/identities`, {
        method: 'POST',
        body: payload
      })

      if (res.ok) {
        setIsModalOpen(false)
        setNotification(`✓ Successfully saved "${formData.full_name}". FRS Retrained (${formData.status === 'AUTHORIZED' ? 'Zone Alerts Suppressed' : 'Watchlist Active'}).`)
        setTimeout(() => setNotification(''), 6000)
        fetchIdentities()
      } else {
        const err = await res.json().catch(() => ({}))
        setFormError(err.detail || 'Failed to save identity')
      }
    } catch (err) {
      setFormError('Failed to communicate with backend server.')
    } finally {
      setFormSaving(false)
    }
  }

  const handleDeletePerson = async (person) => {
    const confirmDelete = window.confirm(`Permanently remove ${person.full_name || person.name} from FRS database? This will remove all face embeddings.`)
    if (!confirmDelete) return

    try {
      const targetName = person.dir_name || person.name
      const res = await fetch(`${API}/api/v1/frs/identities/${encodeURIComponent(targetName)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setNotification(`✓ Removed "${person.full_name || person.name}" from database. Model retrained.`)
        setTimeout(() => setNotification(''), 5000)
        fetchIdentities()
      }
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  const handleDeletePhoto = async (personName, photoUrl) => {
    const filename = photoUrl.split('/').pop()
    const confirmDelete = window.confirm(`Delete photo "${filename}"?`)
    if (!confirmDelete) return

    try {
      const res = await fetch(`${API}/api/v1/frs/photo/${encodeURIComponent(personName)}/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setLightboxPhoto(null)
        fetchIdentities()
      }
    } catch (err) {
      console.error('Photo delete error:', err)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VEHICLE HANDLERS
  // ──────────────────────────────────────────────────────────────────────────
  const openAddVehicleModal = () => {
    setEditingVehicle(null)
    setVehicleFormData({
      plate_number: '',
      vehicle_type: 'TRUCK',
      owner_name: '',
      driver_phone: '',
      department: 'Tactical Logistics & Supply',
      status: 'AUTHORIZED',
      color: 'Military Matte Olive',
      make_model: 'Tata Defense 4x4',
      notes: 'Convoy clearance. Zone alert completely suppressed'
    })
    setUploadedVehicleFiles([])
    setVehicleFilePreviews([])
    setVehicleFormError('')
    setIsVehicleModalOpen(true)
  }

  const openEditVehicleModal = (veh) => {
    setEditingVehicle(veh)
    setVehicleFormData({
      plate_number: veh.plate_number || '',
      vehicle_type: veh.vehicle_type || 'CAR',
      owner_name: veh.owner_name || '',
      driver_phone: veh.driver_phone || '',
      department: veh.department || 'Sector Alpha Command',
      status: veh.status || 'AUTHORIZED',
      color: veh.color || 'Standard Tactical',
      make_model: veh.make_model || '',
      notes: veh.notes || ''
    })
    setUploadedVehicleFiles([])
    setVehicleFilePreviews([])
    setVehicleFormError('')
    setIsVehicleModalOpen(true)
  }

  const handleVehicleFileSelection = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploadedVehicleFiles(prev => [...prev, ...files])
    const newPreviews = files.map(f => URL.createObjectURL(f))
    setVehicleFilePreviews(prev => [...prev, ...newPreviews])
  }

  const handleRemovePendingVehicleFile = (index) => {
    setUploadedVehicleFiles(prev => prev.filter((_, i) => i !== index))
    setVehicleFilePreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handleSaveVehicle = async (e) => {
    e.preventDefault()
    if (!vehicleFormData.plate_number.trim()) {
      setVehicleFormError('Please enter a valid License Plate Number.')
      return
    }

    setVehicleFormSaving(true)
    setVehicleFormError('')

    try {
      const payload = new FormData()
      payload.append('plate_number', vehicleFormData.plate_number.trim().toUpperCase())
      payload.append('vehicle_type', vehicleFormData.vehicle_type)
      payload.append('owner_name', vehicleFormData.owner_name.trim())
      payload.append('driver_phone', vehicleFormData.driver_phone.trim())
      payload.append('department', vehicleFormData.department.trim())
      payload.append('status', vehicleFormData.status)
      payload.append('color', vehicleFormData.color)
      payload.append('make_model', vehicleFormData.make_model)
      payload.append('notes', vehicleFormData.notes.trim())

      if (editingVehicle) {
        payload.append('old_plate', editingVehicle.plate_number)
      }

      uploadedVehicleFiles.forEach(file => {
        payload.append('files', file)
      })

      const res = await fetch(`${API}/api/v1/vehicles/enrolled`, {
        method: 'POST',
        body: payload
      })

      if (res.ok) {
        setIsVehicleModalOpen(false)
        const isAuth = vehicleFormData.status === 'AUTHORIZED'
        setNotification(`✓ Vehicle "${vehicleFormData.plate_number.toUpperCase()}" registered successfully! (${isAuth ? 'Zone Alerts Suppressed' : 'Watchlist Siren Active'}).`)
        setTimeout(() => setNotification(''), 6000)
        fetchVehicles()
      } else {
        const err = await res.json().catch(() => ({}))
        setVehicleFormError(err.detail || 'Failed to enroll vehicle.')
      }
    } catch (err) {
      setVehicleFormError('Failed to communicate with vehicle database.')
    } finally {
      setVehicleFormSaving(false)
    }
  }

  const handleDeleteVehicle = async (veh) => {
    const confirmDelete = window.confirm(`Permanently remove vehicle "${veh.plate_number}" (${veh.owner_name || 'Convoy'}) from ANPR registry?`)
    if (!confirmDelete) return

    try {
      const res = await fetch(`${API}/api/v1/vehicles/enrolled/${encodeURIComponent(veh.plate_number)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setNotification(`✓ Removed vehicle "${veh.plate_number}" from registry.`)
        setTimeout(() => setNotification(''), 5000)
        fetchVehicles()
      }
    } catch (err) {
      console.error('Vehicle delete error:', err)
    }
  }

  const handleDeleteVehiclePhoto = async (plate, photoUrl) => {
    const filename = photoUrl.split('/').pop()
    const confirmDelete = window.confirm(`Delete photo "${filename}" for plate ${plate}?`)
    if (!confirmDelete) return

    try {
      const res = await fetch(`${API}/api/v1/vehicles/enrolled/photo/${encodeURIComponent(plate)}/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setVehicleLightbox(null)
        fetchVehicles()
      }
    } catch (err) {
      console.error('Vehicle photo delete error:', err)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // WATCHLIST HANDLERS (MOST WANTED PERSONS & LOST VEHICLES)
  // ──────────────────────────────────────────────────────────────────────────
  const openAddWatchlistPersonModal = () => {
    setEditingWatchlistPerson(null)
    setWatchlistPersonForm({
      id: `WANTED-${String(Math.floor(100 + Math.random() * 900))}`,
      full_name: '',
      alias: '',
      category: 'MOST_WANTED',
      threat_level: 'EXTREME',
      fir_number: '',
      reward_inr: '₹5,00,000',
      directives: 'Priority 1 apprehension order. Detain immediately on camera match.',
      notes: ''
    })
    setWatchlistPersonFiles([])
    setWatchlistPersonPreviews([])
    setWatchlistPersonError('')
    setIsWatchlistPersonModalOpen(true)
  }

  const openEditWatchlistPersonModal = (person) => {
    setEditingWatchlistPerson(person)
    setWatchlistPersonForm({
      id: person.id || '',
      full_name: person.full_name || '',
      alias: person.alias || '',
      category: person.category || 'MOST_WANTED',
      threat_level: person.threat_level || 'EXTREME',
      fir_number: person.fir_number || '',
      reward_inr: person.reward_inr || '',
      directives: person.directives || '',
      notes: person.notes || ''
    })
    setWatchlistPersonFiles([])
    setWatchlistPersonPreviews([])
    setWatchlistPersonError('')
    setIsWatchlistPersonModalOpen(true)
  }

  const handleWatchlistPersonFileSelection = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setWatchlistPersonFiles(prev => [...prev, ...files])
    const newPreviews = files.map(f => URL.createObjectURL(f))
    setWatchlistPersonPreviews(prev => [...prev, ...newPreviews])
  }

  const handleRemovePendingWatchlistPersonFile = (idx) => {
    setWatchlistPersonFiles(prev => prev.filter((_, i) => i !== idx))
    setWatchlistPersonPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSaveWatchlistPerson = async (e) => {
    e.preventDefault()
    if (!watchlistPersonForm.full_name.trim()) {
      setWatchlistPersonError('Full Name is required')
      return
    }
    setWatchlistPersonSaving(true)
    setWatchlistPersonError('')
    try {
      const fd = new FormData()
      fd.append('id', watchlistPersonForm.id.trim() || `WANTED-${Date.now().toString().slice(-4)}`)
      fd.append('full_name', watchlistPersonForm.full_name.trim())
      fd.append('alias', watchlistPersonForm.alias.trim())
      fd.append('category', watchlistPersonForm.category)
      fd.append('threat_level', watchlistPersonForm.threat_level)
      fd.append('fir_number', watchlistPersonForm.fir_number.trim())
      fd.append('reward_inr', watchlistPersonForm.reward_inr.trim())
      fd.append('directives', watchlistPersonForm.directives.trim())
      fd.append('notes', watchlistPersonForm.notes.trim())
      watchlistPersonFiles.forEach(f => fd.append('photos', f))

      const res = await fetch(`${API}/api/v1/admin/watchlist/persons`, {
        method: 'POST',
        body: fd
      })
      if (res.ok) {
        setIsWatchlistPersonModalOpen(false)
        setNotification(`🚨 High-Alert Target "${watchlistPersonForm.full_name}" registered! Live camera alerts active.`)
        setTimeout(() => setNotification(''), 6000)
        fetchWatchlistPersons()
      } else {
        const err = await res.json().catch(() => ({}))
        setWatchlistPersonError(err.detail || 'Failed to save wanted target.')
      }
    } catch (e) {
      setWatchlistPersonError('Network communication failure.')
    } finally {
      setWatchlistPersonSaving(false)
    }
  }

  const handleDeleteWatchlistPerson = async (person) => {
    if (!window.confirm(`Remove or mark "${person.full_name}" (${person.id}) as APPREHENDED from Watchlist?`)) return
    try {
      const res = await fetch(`${API}/api/v1/admin/watchlist/persons/${encodeURIComponent(person.id)}`, { method: 'DELETE' })
      if (res.ok) {
        setNotification(`✓ Target "${person.full_name}" removed from Watchlist.`)
        setTimeout(() => setNotification(''), 5000)
        fetchWatchlistPersons()
      }
    } catch (e) {
      alert('Failed to remove watchlist target.')
    }
  }

  const openAddWatchlistVehicleModal = () => {
    setEditingWatchlistVehicle(null)
    setWatchlistVehicleForm({
      plate_number: '',
      vehicle_type: 'SUV',
      make_model: 'Mahindra Scorpio-N',
      color: 'Black',
      category: 'STOLEN_VEHICLE',
      threat_level: 'EXTREME',
      fir_number: '',
      reported_by: 'State Police Control Room',
      directives: 'Immediate gate barrier lock. Intercept and detain occupants.',
      notes: ''
    })
    setWatchlistVehicleFiles([])
    setWatchlistVehiclePreviews([])
    setWatchlistVehicleError('')
    setIsWatchlistVehicleModalOpen(true)
  }

  const openEditWatchlistVehicleModal = (veh) => {
    setEditingWatchlistVehicle(veh)
    setWatchlistVehicleForm({
      plate_number: veh.plate_number || '',
      vehicle_type: veh.vehicle_type || 'CAR',
      make_model: veh.make_model || '',
      color: veh.color || '',
      category: veh.category || 'STOLEN_VEHICLE',
      threat_level: veh.threat_level || 'EXTREME',
      fir_number: veh.fir_number || '',
      reported_by: veh.reported_by || '',
      directives: veh.directives || '',
      notes: veh.notes || ''
    })
    setWatchlistVehicleFiles([])
    setWatchlistVehiclePreviews([])
    setWatchlistVehicleError('')
    setIsWatchlistVehicleModalOpen(true)
  }

  const handleWatchlistVehicleFileSelection = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setWatchlistVehicleFiles(prev => [...prev, ...files])
    const newPreviews = files.map(f => URL.createObjectURL(f))
    setWatchlistVehiclePreviews(prev => [...prev, ...newPreviews])
  }

  const handleRemovePendingWatchlistVehicleFile = (idx) => {
    setWatchlistVehicleFiles(prev => prev.filter((_, i) => i !== idx))
    setWatchlistVehiclePreviews(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSaveWatchlistVehicle = async (e) => {
    e.preventDefault()
    if (!watchlistVehicleForm.plate_number.trim()) {
      setWatchlistVehicleError('License Plate Number is required')
      return
    }
    setWatchlistVehicleSaving(true)
    setWatchlistVehicleError('')
    try {
      const fd = new FormData()
      fd.append('plate_number', watchlistVehicleForm.plate_number.trim().toUpperCase())
      fd.append('vehicle_type', watchlistVehicleForm.vehicle_type)
      fd.append('make_model', watchlistVehicleForm.make_model.trim())
      fd.append('color', watchlistVehicleForm.color.trim())
      fd.append('category', watchlistVehicleForm.category)
      fd.append('threat_level', watchlistVehicleForm.threat_level)
      fd.append('fir_number', watchlistVehicleForm.fir_number.trim())
      fd.append('reported_by', watchlistVehicleForm.reported_by.trim())
      fd.append('directives', watchlistVehicleForm.directives.trim())
      fd.append('notes', watchlistVehicleForm.notes.trim())
      watchlistVehicleFiles.forEach(f => fd.append('photos', f))

      const res = await fetch(`${API}/api/v1/admin/watchlist/vehicles`, {
        method: 'POST',
        body: fd
      })
      if (res.ok) {
        setIsWatchlistVehicleModalOpen(false)
        setNotification(`🚗 Hotlist Vehicle "${watchlistVehicleForm.plate_number.toUpperCase()}" registered! Live ANPR alerts active.`)
        setTimeout(() => setNotification(''), 6000)
        fetchWatchlistVehicles()
      } else {
        const err = await res.json().catch(() => ({}))
        setWatchlistVehicleError(err.detail || 'Failed to save hotlist vehicle.')
      }
    } catch (e) {
      setWatchlistVehicleError('Network communication failure.')
    } finally {
      setWatchlistVehicleSaving(false)
    }
  }

  const handleDeleteWatchlistVehicle = async (veh) => {
    if (!window.confirm(`Remove or mark vehicle "${veh.plate_number}" as RECOVERED from Watchlist?`)) return
    try {
      const res = await fetch(`${API}/api/v1/admin/watchlist/vehicles/${encodeURIComponent(veh.plate_number)}`, { method: 'DELETE' })
      if (res.ok) {
        setNotification(`✓ Vehicle "${veh.plate_number}" removed from Watchlist.`)
        setTimeout(() => setNotification(''), 5000)
        fetchWatchlistVehicles()
      }
    } catch (e) {
      alert('Failed to remove watchlist vehicle.')
    }
  }

  // ── Watchlist Metrics & Filtering ──
  const watchlistMetrics = useMemo(() => {
    const totalPersons = watchlistPersons.length
    const totalVehicles = watchlistVehicles.length
    const criticalFugitives = watchlistPersons.filter(p => p.threat_level === 'EXTREME').length
    const sightedPersons = watchlistPersons.filter(p => p.last_sighting && p.last_sighting.camera_id).length
    const sightedVehicles = watchlistVehicles.filter(v => v.last_sighting && v.last_sighting.camera_id).length
    return {
      totalPersons,
      totalVehicles,
      criticalFugitives,
      totalSighted: sightedPersons + sightedVehicles
    }
  }, [watchlistPersons, watchlistVehicles])

  const filteredWatchlistPersons = useMemo(() => {
    return watchlistPersons
      .filter(p => {
        if (watchlistCategoryFilter !== 'ALL' && p.category !== watchlistCategoryFilter) return false
        if (watchlistThreatFilter !== 'ALL' && p.threat_level !== watchlistThreatFilter) return false
        if (watchlistSearch.trim()) {
          const q = watchlistSearch.toLowerCase()
          const matchName = (p.full_name || '').toLowerCase().includes(q)
          const matchAlias = (p.alias || '').toLowerCase().includes(q)
          const matchId = (p.id || '').toLowerCase().includes(q)
          const matchFir = (p.fir_number || '').toLowerCase().includes(q)
          const matchDirectives = (p.directives || '').toLowerCase().includes(q)
          return matchName || matchAlias || matchId || matchFir || matchDirectives
        }
        return true
      })
      .sort((a, b) => {
        if (watchlistSortBy === 'sighting') {
          const aSight = a.last_sighting ? 1 : 0
          const bSight = b.last_sighting ? 1 : 0
          if (bSight !== aSight) return bSight - aSight
          return (a.full_name || '').localeCompare(b.full_name || '')
        }
        if (watchlistSortBy === 'threat') {
          const tRank = { EXTREME: 3, HIGH: 2, AMBER_ALERT: 1 }
          return (tRank[b.threat_level] || 0) - (tRank[a.threat_level] || 0)
        }
        if (watchlistSortBy === 'name') {
          return (a.full_name || '').localeCompare(b.full_name || '')
        }
        return 0
      })
  }, [watchlistPersons, watchlistCategoryFilter, watchlistThreatFilter, watchlistSearch, watchlistSortBy])

  const filteredWatchlistVehicles = useMemo(() => {
    return watchlistVehicles
      .filter(v => {
        if (watchlistCategoryFilter !== 'ALL' && v.category !== watchlistCategoryFilter) return false
        if (watchlistThreatFilter !== 'ALL' && v.threat_level !== watchlistThreatFilter) return false
        if (watchlistSearch.trim()) {
          const q = watchlistSearch.toLowerCase()
          const matchPlate = (v.plate_number || '').toLowerCase().includes(q)
          const matchMake = (v.make_model || '').toLowerCase().includes(q)
          const matchFir = (v.fir_number || '').toLowerCase().includes(q)
          const matchReported = (v.reported_by || '').toLowerCase().includes(q)
          const matchDirectives = (v.directives || '').toLowerCase().includes(q)
          return matchPlate || matchMake || matchFir || matchReported || matchDirectives
        }
        return true
      })
      .sort((a, b) => {
        if (watchlistSortBy === 'sighting') {
          const aSight = a.last_sighting ? 1 : 0
          const bSight = b.last_sighting ? 1 : 0
          if (bSight !== aSight) return bSight - aSight
          return (a.plate_number || '').localeCompare(b.plate_number || '')
        }
        if (watchlistSortBy === 'threat') {
          const tRank = { EXTREME: 3, HIGH: 2, AMBER_ALERT: 1 }
          return (tRank[b.threat_level] || 0) - (tRank[a.threat_level] || 0)
        }
        if (watchlistSortBy === 'name') {
          return (a.plate_number || '').localeCompare(b.plate_number || '')
        }
        return 0
      })
  }, [watchlistVehicles, watchlistCategoryFilter, watchlistThreatFilter, watchlistSearch, watchlistSortBy])

  // ── Metrics Calculation ──
  const metrics = useMemo(() => {
    const total = identities.length
    const authorized = identities.filter(i => i.status === 'AUTHORIZED').length
    const suspects = identities.filter(i => i.status === 'UNAUTHORIZED').length
    const totalPhotos = identities.reduce((acc, i) => acc + (i.sample_count || 0), 0)
    return { total, authorized, suspects, totalPhotos }
  }, [identities])

  const vehicleMetrics = useMemo(() => {
    const total = vehicles.length
    const authorized = vehicles.filter(v => v.status === 'AUTHORIZED').length
    const watchlist = vehicles.filter(v => v.status === 'UNAUTHORIZED').length
    const totalPhotos = vehicles.reduce((acc, v) => acc + (v.photos ? v.photos.length : 0), 0)
    return { total, authorized, watchlist, totalPhotos }
  }, [vehicles])

  // ── Filtered & Sorted Personnel ──
  const filteredIdentities = useMemo(() => {
    return identities
      .filter(item => {
        if (filterStatus === 'AUTHORIZED' && item.status !== 'AUTHORIZED') return false
        if (filterStatus === 'UNAUTHORIZED' && item.status !== 'UNAUTHORIZED') return false
        if (filterStatus === 'HAS_PHOTOS' && (!item.photos || item.photos.length === 0)) return false

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          const matchName = (item.full_name || '').toLowerCase().includes(q)
          const matchId = (item.person_id || '').toLowerCase().includes(q)
          const matchRole = (item.role || '').toLowerCase().includes(q)
          const matchDept = (item.department || '').toLowerCase().includes(q)
          const matchNotes = (item.notes || '').toLowerCase().includes(q)
          return matchName || matchId || matchRole || matchDept || matchNotes
        }
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return (a.full_name || a.name).localeCompare(b.full_name || b.name)
        }
        if (sortBy === 'samples') {
          return (b.sample_count || 0) - (a.sample_count || 0)
        }
        if (sortBy === 'updated') {
          return (b.updated_at || '').localeCompare(a.updated_at || '')
        }
        return 0
      })
  }, [identities, filterStatus, searchQuery, sortBy])

  // ── Filtered & Sorted Vehicles ──
  const filteredVehicles = useMemo(() => {
    return vehicles
      .filter(veh => {
        if (vehicleFilterStatus === 'AUTHORIZED' && veh.status !== 'AUTHORIZED') return false
        if (vehicleFilterStatus === 'UNAUTHORIZED' && veh.status !== 'UNAUTHORIZED') return false
        if (vehicleFilterStatus === 'HAS_PHOTOS' && (!veh.photos || veh.photos.length === 0)) return false

        if (vehicleTypeFilter !== 'ALL' && veh.vehicle_type?.toUpperCase() !== vehicleTypeFilter) return false

        if (vehicleSearchQuery.trim()) {
          const q = vehicleSearchQuery.toLowerCase()
          const matchPlate = (veh.plate_number || '').toLowerCase().includes(q)
          const matchOwner = (veh.owner_name || '').toLowerCase().includes(q)
          const matchDept = (veh.department || '').toLowerCase().includes(q)
          const matchType = (veh.vehicle_type || '').toLowerCase().includes(q)
          const matchNotes = (veh.notes || '').toLowerCase().includes(q)
          const matchMake = (veh.make_model || '').toLowerCase().includes(q)
          return matchPlate || matchOwner || matchDept || matchType || matchNotes || matchMake
        }
        return true
      })
      .sort((a, b) => {
        if (vehicleSortBy === 'plate') {
          return (a.plate_number || '').localeCompare(b.plate_number || '')
        }
        if (vehicleSortBy === 'driver') {
          return (a.owner_name || '').localeCompare(b.owner_name || '')
        }
        if (vehicleSortBy === 'type') {
          return (a.vehicle_type || '').localeCompare(b.vehicle_type || '')
        }
        if (vehicleSortBy === 'photos') {
          return (b.photos?.length || 0) - (a.photos?.length || 0)
        }
        return 0
      })
  }, [vehicles, vehicleFilterStatus, vehicleTypeFilter, vehicleSearchQuery, vehicleSortBy])

  // Helper: icon for vehicle type
  const getVehicleIcon = (type) => {
    switch ((type || '').toUpperCase()) {
      case 'TRUCK': return 'local_shipping'
      case 'SUV': return 'directions_car'
      case 'CAR': return 'directions_car'
      case 'MOTORCYCLE': return 'two_wheeler'
      case 'BUS': return 'directions_bus'
      default: return 'commute'
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW: AUTHENTICATION LOCK SCREEN (root : 1234)
  // ──────────────────────────────────────────────────────────────────────────
  if (!authToken) {
    return (
      <div style={{ minHeight: 'calc(100vh - 120px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{
          maxWidth: 440,
          width: '100%',
          background: 'var(--bg-panel)',
          border: '1px solid rgba(14,165,233,0.3)',
          borderRadius: 12,
          padding: '32px 28px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.6), 0 0 20px rgba(14,165,233,0.15)',
          textAlign: 'center'
        }}>
          {/* Tactical Admin Icon */}
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'rgba(14,165,233,0.12)',
            border: '2px solid var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--accent)' }}>
              admin_panel_settings
            </span>
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)', letterSpacing: '0.05em', margin: '0 0 6px' }}>
            COMMAND ADMIN PORTAL
          </h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Restricted Personnel & Fleet Clearance Admin
          </p>

          {loginError && (
            <div style={{
              background: 'rgba(244,63,94,0.15)',
              border: '1px solid var(--critical)',
              color: 'var(--critical)',
              padding: '10px 12px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              marginBottom: 16,
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ textAlign: 'left' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                ADMIN OPERATOR ID
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="root"
                  className="temporal-input"
                  style={{ width: '100%', padding: '10px 12px 10px 36px', fontSize: 13, boxSizing: 'border-box' }}
                  required
                />
                <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-muted)' }}>
                  badge
                </span>
              </div>
            </div>

            <div style={{ textAlign: 'left' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                ADMIN PASSCODE
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={loginPwd}
                  onChange={(e) => setLoginPwd(e.target.value)}
                  placeholder="••••"
                  className="temporal-input"
                  style={{ width: '100%', padding: '10px 36px 10px 36px', fontSize: 13, boxSizing: 'border-box' }}
                  required
                />
                <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-muted)' }}>
                  key
                </span>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="btn-accent"
              style={{
                marginTop: 8,
                padding: '12px',
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.06em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: loginLoading ? 'wait' : 'pointer'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                lock_open
              </span>
              {loginLoading ? 'AUTHENTICATING...' : 'AUTHORIZE ADMIN ACCESS'}
            </button>
          </form>

          {/* Master Credential Auto-fill for Hackathon Evaluators */}
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Master Demo Creds: <code style={{ color: 'var(--accent)', background: 'rgba(14,165,233,0.1)', padding: '2px 5px', borderRadius: 4 }}>root : 1234</code>
            </span>
            <button
              type="button"
              onClick={handleQuickAutofill}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid #334155',
                color: '#f8fafc',
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: 10,
                cursor: 'pointer',
                fontWeight: 700
              }}
            >
              Auto-Fill
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW: AUTHENTICATED ADMIN DASHBOARD
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px 60px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Top Header Ribbon ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-color)',
        padding: '16px 20px',
        borderRadius: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            background: activeSection === 'watchlist' ? 'rgba(239,68,68,0.15)' : activeSection === 'vehicles' ? 'rgba(14,165,233,0.15)' : 'rgba(16,185,129,0.15)',
            border: `1px solid ${activeSection === 'watchlist' ? 'var(--critical)' : activeSection === 'vehicles' ? 'var(--accent)' : 'var(--success)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: activeSection === 'watchlist' ? 'var(--critical)' : activeSection === 'vehicles' ? 'var(--accent)' : 'var(--success)' }}>
              {activeSection === 'watchlist' ? 'emergency' : activeSection === 'vehicles' ? 'local_shipping' : 'shield_person'}
            </span>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                {activeSection === 'watchlist'
                  ? '🚨 LOST & SUSPICIOUS WATCHLIST'
                  : activeSection === 'vehicles'
                  ? 'VEHICLES & ANPR FLEET DIRECTORY'
                  : 'PERSONNEL DIRECTORY & FRS CLEARANCE'}
              </h1>
              <span style={{
                fontSize: 10,
                fontWeight: 800,
                background: activeSection === 'watchlist' ? 'rgba(239,68,68,0.2)' : 'rgba(14,165,233,0.2)',
                color: activeSection === 'watchlist' ? 'var(--critical)' : 'var(--accent)',
                border: `1px solid ${activeSection === 'watchlist' ? 'var(--critical)' : 'var(--accent)'}`,
                padding: '2px 8px',
                borderRadius: 4
              }}>
                {activeSection === 'watchlist' ? 'PRIORITY 1 INTERCEPT' : 'LEVEL 5 CLEARANCE'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
              {activeSection === 'watchlist'
                ? 'Active fugitive tracking & stolen vehicle intercept hub. Automated camera sighting alarms triggered on match.'
                : activeSection === 'vehicles'
                ? 'Authorized convoys suppress perimeter alerts & sirens. Watchlist plates trigger high-priority alerts.'
                : 'Whitelisted personnel photos suppress all sector perimeter breaches, loitering alarms & threat sirens.'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {activeSection === 'watchlist' ? (
            <button
              className="btn-accent"
              onClick={watchlistSubTab === 'persons' ? openAddWatchlistPersonModal : openAddWatchlistVehicleModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 6,
                background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                border: '1px solid #ef4444',
                color: '#ffffff'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_alert</span>
              {watchlistSubTab === 'persons' ? 'ENROLL WANTED TARGET' : 'ENROLL LOST VEHICLE'}
            </button>
          ) : activeSection === 'vehicles' ? (
            <button
              className="btn-accent"
              onClick={openAddVehicleModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 6
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span>
              ENROLL NEW VEHICLE
            </button>
          ) : (
            <button
              className="btn-accent"
              onClick={openAddModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 6
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
              ENROLL NEW PERSON
            </button>
          )}

          <button
            onClick={() => {
              fetchIdentities()
              fetchVehicles()
              fetchWatchlistPersons()
              fetchWatchlistVehicles()
            }}
            title="Refresh Database"
            className="icon-btn"
            style={{ borderRadius: 6, width: 36, height: 36 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
          </button>

          <button
            onClick={handleLogout}
            title="Log Out of Admin Panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              background: 'rgba(244,63,94,0.1)',
              border: '1px solid rgba(244,63,94,0.4)',
              color: 'var(--critical)',
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>logout</span>
            LOGOUT (ROOT)
          </button>
        </div>
      </div>

      {/* ── Sub-Section Navigation Tabs ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--bg-panel)',
        padding: '6px',
        borderRadius: 8,
        border: '1px solid var(--border)'
      }}>
        <button
          onClick={() => setActiveSection('watchlist')}
          style={{
            flex: 1.2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '10px 18px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.04em',
            border: activeSection === 'watchlist' ? '1px solid var(--critical)' : '1px solid transparent',
            background: activeSection === 'watchlist' ? 'var(--critical-bg)' : 'transparent',
            color: activeSection === 'watchlist' ? 'var(--critical)' : 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>emergency</span>
          🚨 LOST & SUSPICIOUS WATCHLIST
          <span style={{
            fontSize: 10,
            padding: '2px 7px',
            borderRadius: 10,
            background: activeSection === 'watchlist' ? 'var(--critical)' : 'var(--bg-hover)',
            color: activeSection === 'watchlist' ? '#ffffff' : 'var(--text-muted)',
            fontWeight: 900
          }}>
            {watchlistPersons.length + watchlistVehicles.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSection('vehicles')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '10px 18px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.04em',
            border: activeSection === 'vehicles' ? '1px solid var(--accent)' : '1px solid transparent',
            background: activeSection === 'vehicles' ? 'var(--accent-bg)' : 'transparent',
            color: activeSection === 'vehicles' ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>local_shipping</span>
          🚗 VEHICLES & FLEET DIRECTORY
          <span style={{
            fontSize: 10,
            padding: '2px 7px',
            borderRadius: 10,
            background: activeSection === 'vehicles' ? 'var(--accent)' : 'var(--bg-hover)',
            color: activeSection === 'vehicles' ? '#ffffff' : 'var(--text-muted)',
            fontWeight: 900
          }}>
            {vehicles.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSection('personnel')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '10px 18px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.04em',
            border: activeSection === 'personnel' ? '1px solid var(--success)' : '1px solid transparent',
            background: activeSection === 'personnel' ? 'var(--success-bg)' : 'transparent',
            color: activeSection === 'personnel' ? 'var(--success)' : 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>shield_person</span>
          🛡️ PERSONNEL DIRECTORY (FRS)
          <span style={{
            fontSize: 10,
            padding: '2px 7px',
            borderRadius: 10,
            background: activeSection === 'personnel' ? 'var(--success)' : 'var(--bg-hover)',
            color: activeSection === 'personnel' ? '#ffffff' : 'var(--text-muted)',
            fontWeight: 900
          }}>
            {identities.length}
          </span>
        </button>
      </div>

      {/* ── Real-time Notification Banner ── */}
      {notification && (
        <div style={{
          background: 'rgba(16,185,129,0.15)',
          border: '1px solid var(--success)',
          color: 'var(--success)',
          padding: '12px 16px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>
          {notification}
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 1: VEHICLES & ANPR FLEET DIRECTORY                           */}
      {/* ==================================================================== */}
      {activeSection === 'vehicles' && (
        <>
          {/* ── Vehicle Fleet Metrics Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div className="dossier-card" style={{ padding: '16px', borderLeft: '4px solid var(--accent)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Total Enrolled Fleet
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-main)', marginTop: 6 }}>
                {vehicleMetrics.total}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                Active in ANPR plate cross-reference
              </div>
            </div>

            <div className="dossier-card" style={{ padding: '16px', borderLeft: '4px solid var(--success)' }}>
              <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>verified</span>
                Whitelisted Convoys
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--success)', marginTop: 6 }}>
                {vehicleMetrics.authorized}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                Perimeter & zone alarms suppressed
              </div>
            </div>

            <div className="dossier-card" style={{ padding: '16px', borderLeft: '4px solid var(--critical)' }}>
              <div style={{ fontSize: 11, color: 'var(--critical)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
                Watchlist Vehicles
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--critical)', marginTop: 6 }}>
                {vehicleMetrics.watchlist}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                Critical sirens & intercept alerts fire
              </div>
            </div>

            <div className="dossier-card" style={{ padding: '16px', borderLeft: '4px solid #38bdf8' }}>
              <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>photo_library</span>
                Enrolled Vehicle Photos
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#7dd3fc', marginTop: 6 }}>
                {vehicleMetrics.totalPhotos}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                High-resolution vehicle & plate chips
              </div>
            </div>
          </div>

          {/* ── Vehicle Search & Filter Controls ── */}
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            padding: '14px 18px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12
          }}>
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 380 }}>
              <input
                type="text"
                value={vehicleSearchQuery}
                onChange={(e) => setVehicleSearchQuery(e.target.value)}
                placeholder="Search plate, driver, make, dept..."
                className="temporal-input"
                style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: 12, boxSizing: 'border-box' }}
              />
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-muted)' }}>
                search
              </span>
              {vehicleSearchQuery && (
                <button
                  onClick={() => setVehicleSearchQuery('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Status Filter Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button
                className={`tab-btn${vehicleFilterStatus === 'ALL' ? ' active' : ''}`}
                onClick={() => setVehicleFilterStatus('ALL')}
                style={{ padding: '6px 12px', fontSize: 11, height: 32 }}
              >
                All ({vehicles.length})
              </button>
              <button
                className={`tab-btn${vehicleFilterStatus === 'AUTHORIZED' ? ' active' : ''}`}
                onClick={() => setVehicleFilterStatus('AUTHORIZED')}
                style={{ padding: '6px 12px', fontSize: 11, height: 32, color: vehicleFilterStatus === 'AUTHORIZED' ? undefined : 'var(--success)' }}
              >
                🛡️ Authorized ({vehicleMetrics.authorized})
              </button>
              <button
                className={`tab-btn${vehicleFilterStatus === 'UNAUTHORIZED' ? ' active' : ''}`}
                onClick={() => setVehicleFilterStatus('UNAUTHORIZED')}
                style={{ padding: '6px 12px', fontSize: 11, height: 32, color: vehicleFilterStatus === 'UNAUTHORIZED' ? undefined : 'var(--critical)' }}
              >
                🚨 Watchlist ({vehicleMetrics.watchlist})
              </button>
              <button
                className={`tab-btn${vehicleFilterStatus === 'HAS_PHOTOS' ? ' active' : ''}`}
                onClick={() => setVehicleFilterStatus('HAS_PHOTOS')}
                style={{ padding: '6px 12px', fontSize: 11, height: 32 }}
              >
                📷 With Photos
              </button>
            </div>

            {/* Vehicle Type Filter */}
            <select
              value={vehicleTypeFilter}
              onChange={(e) => setVehicleTypeFilter(e.target.value)}
              className="temporal-input"
              style={{ padding: '6px 10px', fontSize: 11, height: 32 }}
            >
              <option value="ALL">All Types (All Vehicles)</option>
              <option value="TRUCK">🚚 Trucks & Convoys</option>
              <option value="SUV">🚙 SUVs & Jeeps</option>
              <option value="CAR">🚗 Cars & Sedans</option>
              <option value="MOTORCYCLE">🏍️ Motorcycles</option>
              <option value="BUS">🚌 Buses & Troop Transports</option>
              <option value="VAN">🚐 Vans & Ambulances</option>
            </select>

            {/* Sort & View Mode Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select
                value={vehicleSortBy}
                onChange={(e) => setVehicleSortBy(e.target.value)}
                className="temporal-input"
                style={{ padding: '6px 10px', fontSize: 11, height: 32 }}
              >
                <option value="plate">Sort: Plate (A-Z)</option>
                <option value="driver">Sort: Driver / Owner</option>
                <option value="type">Sort: Vehicle Type</option>
                <option value="photos">Sort: Photos Count</option>
              </select>

              <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
                <button
                  onClick={() => setVehicleViewMode('grid')}
                  style={{
                    background: vehicleViewMode === 'grid' ? 'var(--accent)' : 'transparent',
                    color: vehicleViewMode === 'grid' ? '#0f172a' : 'var(--text-muted)',
                    border: 'none',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Card Grid View"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>grid_view</span>
                </button>
                <button
                  onClick={() => setVehicleViewMode('table')}
                  style={{
                    background: vehicleViewMode === 'table' ? 'var(--accent)' : 'transparent',
                    color: vehicleViewMode === 'table' ? '#0f172a' : 'var(--text-muted)',
                    border: 'none',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Table List View"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>view_list</span>
                </button>
              </div>
            </div>
          </div>

          {/* ── Loading / Empty States ── */}
          {vehiclesLoading && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: 13 }}>
              Loading ANPR vehicle registry and fleet telemetry...
            </div>
          )}

          {!vehiclesLoading && filteredVehicles.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: 'var(--bg-panel)',
              borderRadius: 8,
              border: '1px dashed var(--border-color)'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', marginBottom: 12 }}>
                no_crash
              </span>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
                No vehicles found matching current criteria
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
                Try clearing search filters or enroll a new vehicle into the fleet database.
              </div>
              <button className="btn-accent" onClick={openAddVehicleModal} style={{ padding: '8px 16px', fontSize: 12 }}>
                + ENROLL NEW VEHICLE
              </button>
            </div>
          )}

          {/* ── VEHICLES GRID VIEW ── */}
          {!vehiclesLoading && vehicleViewMode === 'grid' && filteredVehicles.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
              gap: 16
            }}>
              {filteredVehicles.map(veh => {
                const isAuth = veh.status === 'AUTHORIZED'
                const primaryImgUrl = veh.primary_photo ? `${API}${veh.primary_photo}` : null

                return (
                  <div
                    key={veh.plate_number}
                    className="dossier-card"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: 16,
                      position: 'relative',
                      border: `1px solid ${isAuth ? 'rgba(16,185,129,0.35)' : 'rgba(244,63,94,0.35)'}`,
                      background: isAuth ? 'rgba(16,185,129,0.03)' : 'rgba(244,63,94,0.03)'
                    }}
                  >
                    {/* Top Row: Vehicle Photo Thumbnail + Plate Summary */}
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      {/* Photo Thumbnail */}
                      <div
                        onClick={() => {
                          if (veh.photos && veh.photos.length > 0) {
                            setVehicleLightbox({ vehicle: veh, url: `${API}${veh.photos[0]}`, all: veh.photos })
                          }
                        }}
                        style={{
                          width: 84,
                          height: 72,
                          borderRadius: 8,
                          overflow: 'hidden',
                          background: '#0a0f1d',
                          border: `2px solid ${isAuth ? 'var(--success)' : 'var(--critical)'}`,
                          flexShrink: 0,
                          cursor: veh.photos && veh.photos.length > 0 ? 'pointer' : 'default',
                          position: 'relative'
                        }}
                        title={veh.photos && veh.photos.length > 0 ? 'Click to inspect vehicle photo' : 'No photos available'}
                      >
                        {primaryImgUrl ? (
                          <img
                            src={primaryImgUrl}
                            alt={veh.plate_number}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--text-muted)' }}>
                              {getVehicleIcon(veh.vehicle_type)}
                            </span>
                            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>
                              {veh.vehicle_type}
                            </span>
                          </div>
                        )}
                        {veh.photos && veh.photos.length > 1 && (
                          <div style={{
                            position: 'absolute',
                            bottom: 2,
                            right: 2,
                            background: 'rgba(0,0,0,0.8)',
                            color: '#fff',
                            fontSize: 9,
                            padding: '1px 4px',
                            borderRadius: 3,
                            fontWeight: 700
                          }}>
                            +{veh.photos.length - 1}
                          </div>
                        )}
                      </div>

                      {/* Plate Details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <span style={{
                            fontSize: 9,
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: isAuth ? 'rgba(16,185,129,0.18)' : 'rgba(244,63,94,0.18)',
                            color: isAuth ? 'var(--success)' : 'var(--critical)',
                            border: `1px solid ${isAuth ? 'var(--success)' : 'var(--critical)'}`
                          }}>
                            {isAuth ? '✓ AUTHORIZED' : '🚨 WATCHLIST'}
                          </span>
                          <span style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: 'var(--text-muted)',
                            background: 'rgba(255,255,255,0.06)',
                            padding: '2px 5px',
                            borderRadius: 3
                          }}>
                            {veh.vehicle_type}
                          </span>
                        </div>

                        {/* Tactical IND Plate HUD Badge */}
                        <div style={{
                          marginTop: 6,
                          display: 'inline-flex',
                          alignItems: 'center',
                          background: '#ffffff',
                          color: '#000000',
                          borderRadius: 4,
                          border: '2px solid #000000',
                          padding: '2px 6px 2px 4px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
                        }}>
                          <div style={{
                            background: '#003399',
                            color: '#ffffff',
                            fontSize: 8,
                            fontWeight: 900,
                            padding: '2px 3px',
                            borderRadius: 2,
                            marginRight: 6,
                            letterSpacing: '0.04em'
                          }}>
                            IND
                          </div>
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            fontWeight: 900,
                            letterSpacing: '0.08em',
                            color: '#111827'
                          }}>
                            {veh.plate_number}
                          </span>
                        </div>

                        <div style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--text-main)',
                          marginTop: 6,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {veh.owner_name || 'Convoy Patrol'}
                        </div>

                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          {veh.department}
                        </div>
                      </div>
                    </div>

                    {/* Zone Alert Suppression Indicator */}
                    <div style={{
                      marginTop: 12,
                      padding: '6px 10px',
                      borderRadius: 6,
                      background: isAuth ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                      border: `1px dashed ${isAuth ? 'rgba(16,185,129,0.4)' : 'rgba(244,63,94,0.4)'}`,
                      fontSize: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: isAuth ? 'var(--success)' : 'var(--critical)' }}>
                        {isAuth ? 'shield' : 'notifications_active'}
                      </span>
                      <span style={{ color: isAuth ? 'var(--success)' : 'var(--critical)', fontWeight: 700 }}>
                        {isAuth ? 'CONVOY EXEMPT: Zone & fence alarms suppressed' : 'WATCHLIST SIREN: Priority intercept alerts fire'}
                      </span>
                    </div>

                    {/* Notes / Directives */}
                    {veh.notes && (
                      <div style={{
                        marginTop: 8,
                        fontSize: 10,
                        color: 'var(--text-muted)',
                        background: 'rgba(0,0,0,0.2)',
                        padding: '6px 8px',
                        borderRadius: 4,
                        lineHeight: 1.4
                      }}>
                        <strong style={{ color: 'var(--text-main)' }}>Directive: </strong>
                        {veh.notes}
                      </div>
                    )}

                    {/* Vehicle Photo Gallery Strip */}
                    {veh.photos && veh.photos.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                          <span>Enrolled Photos ({veh.photos.length})</span>
                          <span style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => setVehicleLightbox({ vehicle: veh, url: `${API}${veh.photos[0]}`, all: veh.photos })}>
                            View All
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                          {veh.photos.map((pUrl, idx) => (
                            <img
                              key={idx}
                              src={`${API}${pUrl}`}
                              alt={`sample-${idx}`}
                              onClick={() => setVehicleLightbox({ vehicle: veh, url: `${API}${pUrl}`, all: veh.photos })}
                              style={{
                                width: 44,
                                height: 38,
                                borderRadius: 4,
                                objectFit: 'cover',
                                border: '1px solid #334155',
                                cursor: 'pointer'
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Footer Actions */}
                    <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {veh.photos ? veh.photos.length : 0} photo(s) on file
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => openEditVehicleModal(veh)}
                          style={{
                            padding: '4px 10px',
                            fontSize: 10,
                            fontWeight: 700,
                            background: 'rgba(14,165,233,0.15)',
                            border: '1px solid var(--accent)',
                            color: 'var(--accent)',
                            borderRadius: 4,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>edit</span>
                          Edit
                        </button>

                        <button
                          onClick={() => handleDeleteVehicle(veh)}
                          style={{
                            padding: '4px 8px',
                            fontSize: 10,
                            background: 'rgba(244,63,94,0.1)',
                            border: '1px solid rgba(244,63,94,0.3)',
                            color: 'var(--critical)',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                          title="Delete Vehicle"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── VEHICLES TABLE VIEW ── */}
          {!vehiclesLoading && vehicleViewMode === 'table' && filteredVehicles.length > 0 && (
            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11 }}>
                    <th style={{ padding: '12px 16px' }}>PHOTO</th>
                    <th style={{ padding: '12px 16px' }}>LICENSE PLATE</th>
                    <th style={{ padding: '12px 16px' }}>TYPE</th>
                    <th style={{ padding: '12px 16px' }}>DRIVER / CONVOY LEAD</th>
                    <th style={{ padding: '12px 16px' }}>DEPARTMENT</th>
                    <th style={{ padding: '12px 16px' }}>ZONE STATUS</th>
                    <th style={{ padding: '12px 16px' }}>PHOTOS</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVehicles.map(veh => {
                    const isAuth = veh.status === 'AUTHORIZED'
                    const primaryImgUrl = veh.primary_photo ? `${API}${veh.primary_photo}` : null

                    return (
                      <tr key={veh.plate_number} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <div
                            onClick={() => {
                              if (veh.photos && veh.photos.length > 0) {
                                setVehicleLightbox({ vehicle: veh, url: `${API}${veh.photos[0]}`, all: veh.photos })
                              }
                            }}
                            style={{
                              width: 46,
                              height: 38,
                              borderRadius: 6,
                              overflow: 'hidden',
                              border: `1px solid ${isAuth ? 'var(--success)' : 'var(--critical)'}`,
                              cursor: 'pointer',
                              background: '#0a0f1d'
                            }}
                          >
                            {primaryImgUrl ? (
                              <img src={primaryImgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>
                                  {getVehicleIcon(veh.vehicle_type)}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            background: '#ffffff',
                            color: '#000000',
                            borderRadius: 4,
                            border: '1px solid #000000',
                            padding: '1px 6px'
                          }}>
                            <span style={{ background: '#003399', color: '#ffffff', fontSize: 8, fontWeight: 900, padding: '1px 3px', borderRadius: 2, marginRight: 5 }}>
                              IND
                            </span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 12 }}>
                              {veh.plate_number}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--accent)', fontWeight: 600 }}>
                          {veh.vehicle_type}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>{veh.owner_name || 'Convoy Leader'}</div>
                          {veh.driver_phone && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{veh.driver_phone}</div>}
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>
                          {veh.department}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: isAuth ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
                            color: isAuth ? 'var(--success)' : 'var(--critical)',
                            border: `1px solid ${isAuth ? 'var(--success)' : 'var(--critical)'}`
                          }}>
                            {isAuth ? '🛡️ ZONE SUPPRESSED' : '🚨 CRITICAL SIREN'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>
                          {veh.photos ? veh.photos.length : 0} photos
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => openEditVehicleModal(veh)}
                            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', marginRight: 10, fontSize: 15 }}
                            title="Edit Vehicle"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteVehicle(veh)}
                            style={{ background: 'none', border: 'none', color: 'var(--critical)', cursor: 'pointer', fontSize: 15 }}
                            title="Delete Vehicle"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ==================================================================== */}
      {/* SECTION 2: PERSONNEL DIRECTORY (FRS)                                 */}
      {/* ==================================================================== */}
      {activeSection === 'personnel' && (
        <>
          {/* ── Metrics Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div className="dossier-card" style={{ padding: '16px', borderLeft: '4px solid var(--accent)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Total Enrolled Personnel
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-main)', marginTop: 6 }}>
                {metrics.total}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                Active in LBPH recognition index
              </div>
            </div>

            <div className="dossier-card" style={{ padding: '16px', borderLeft: '4px solid var(--success)' }}>
              <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>verified</span>
                Whitelisted (Zero-Alert)
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--success)', marginTop: 6 }}>
                {metrics.authorized}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                Zone alarms completely suppressed
              </div>
            </div>

            <div className="dossier-card" style={{ padding: '16px', borderLeft: '4px solid var(--critical)' }}>
              <div style={{ fontSize: 11, color: 'var(--critical)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
                Watchlist Targets
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--critical)', marginTop: 6 }}>
                {metrics.suspects}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                Immediate Critical alert triggers
              </div>
            </div>

            <div className="dossier-card" style={{ padding: '16px', borderLeft: '4px solid #a855f7' }}>
              <div style={{ fontSize: 11, color: '#a855f7', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>photo_library</span>
                Total Face Training Photos
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#c084fc', marginTop: 6 }}>
                {metrics.totalPhotos}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                Multi-angle augmented samples
              </div>
            </div>
          </div>

          {/* ── Search & Filter Controls Bar ── */}
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            padding: '14px 18px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12
          }}>
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 420 }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, ID, role, department..."
                className="temporal-input"
                style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: 12, boxSizing: 'border-box' }}
              />
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-muted)' }}>
                search
              </span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button
                className={`tab-btn${filterStatus === 'ALL' ? ' active' : ''}`}
                onClick={() => setFilterStatus('ALL')}
                style={{ padding: '6px 12px', fontSize: 11, height: 32 }}
              >
                All ({identities.length})
              </button>
              <button
                className={`tab-btn${filterStatus === 'AUTHORIZED' ? ' active' : ''}`}
                onClick={() => setFilterStatus('AUTHORIZED')}
                style={{ padding: '6px 12px', fontSize: 11, height: 32, color: filterStatus === 'AUTHORIZED' ? undefined : 'var(--success)' }}
              >
                🛡️ Authorized ({metrics.authorized})
              </button>
              <button
                className={`tab-btn${filterStatus === 'UNAUTHORIZED' ? ' active' : ''}`}
                onClick={() => setFilterStatus('UNAUTHORIZED')}
                style={{ padding: '6px 12px', fontSize: 11, height: 32, color: filterStatus === 'UNAUTHORIZED' ? undefined : 'var(--critical)' }}
              >
                🚨 Watchlist ({metrics.suspects})
              </button>
              <button
                className={`tab-btn${filterStatus === 'HAS_PHOTOS' ? ' active' : ''}`}
                onClick={() => setFilterStatus('HAS_PHOTOS')}
                style={{ padding: '6px 12px', fontSize: 11, height: 32 }}
              >
                📷 With Photos
              </button>
            </div>

            {/* Sort & View Mode Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="temporal-input"
                style={{ padding: '6px 10px', fontSize: 11, height: 32 }}
              >
                <option value="name">Sort: Name (A-Z)</option>
                <option value="samples">Sort: Photos Count</option>
                <option value="updated">Sort: Recently Updated</option>
              </select>

              <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
                <button
                  onClick={() => setViewMode('grid')}
                  style={{
                    background: viewMode === 'grid' ? 'var(--accent)' : 'transparent',
                    color: viewMode === 'grid' ? '#0f172a' : 'var(--text-muted)',
                    border: 'none',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Card Grid View"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>grid_view</span>
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  style={{
                    background: viewMode === 'table' ? 'var(--accent)' : 'transparent',
                    color: viewMode === 'table' ? '#0f172a' : 'var(--text-muted)',
                    border: 'none',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Table List View"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>view_list</span>
                </button>
              </div>
            </div>
          </div>

          {/* ── Loading / Empty States ── */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: 13 }}>
              Loading personnel directory and face recognition index...
            </div>
          )}

          {!loading && filteredIdentities.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: 'var(--bg-panel)',
              borderRadius: 8,
              border: '1px dashed var(--border-color)'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', marginBottom: 12 }}>
                person_search
              </span>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
                No personnel found matching criteria
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
                Try resetting your search query or enroll a new person.
              </div>
              <button className="btn-accent" onClick={openAddModal} style={{ padding: '8px 16px', fontSize: 12 }}>
                + ENROLL NEW PERSON
              </button>
            </div>
          )}

          {/* ── PERSONNEL GRID VIEW ── */}
          {!loading && viewMode === 'grid' && filteredIdentities.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16
            }}>
              {filteredIdentities.map(person => {
                const isAuth = person.status === 'AUTHORIZED'
                const primaryImgUrl = person.primary_photo ? `${API}${person.primary_photo}` : null

                return (
                  <div
                    key={person.name}
                    className="dossier-card"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: 16,
                      position: 'relative',
                      border: `1px solid ${isAuth ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`,
                      background: isAuth ? 'rgba(16,185,129,0.03)' : 'rgba(244,63,94,0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <div
                        onClick={() => {
                          if (person.photos && person.photos.length > 0) {
                            setLightboxPhoto({ person, url: `${API}${person.photos[0]}`, all: person.photos })
                          }
                        }}
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 8,
                          overflow: 'hidden',
                          background: 'rgba(15,23,42,0.8)',
                          border: `2px solid ${isAuth ? 'var(--success)' : 'var(--critical)'}`,
                          flexShrink: 0,
                          cursor: person.photos && person.photos.length > 0 ? 'pointer' : 'default',
                          position: 'relative'
                        }}
                        title={person.photos && person.photos.length > 0 ? 'Click to inspect full photos' : 'No photos'}
                      >
                        {primaryImgUrl ? (
                          <img
                            src={primaryImgUrl}
                            alt={person.full_name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--text-muted)' }}>
                              account_circle
                            </span>
                          </div>
                        )}
                        {person.photos && person.photos.length > 1 && (
                          <div style={{
                            position: 'absolute',
                            bottom: 2,
                            right: 2,
                            background: 'rgba(0,0,0,0.75)',
                            color: '#fff',
                            fontSize: 9,
                            padding: '1px 4px',
                            borderRadius: 3,
                            fontWeight: 700
                          }}>
                            +{person.photos.length - 1}
                          </div>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <span style={{
                            fontSize: 9,
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: isAuth ? 'rgba(16,185,129,0.18)' : 'rgba(244,63,94,0.18)',
                            color: isAuth ? 'var(--success)' : 'var(--critical)',
                            border: `1px solid ${isAuth ? 'var(--success)' : 'var(--critical)'}`
                          }}>
                            {isAuth ? '✓ AUTHORIZED' : '🚨 WATCHLIST'}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {person.person_id}
                          </span>
                        </div>

                        <div style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: 'var(--text-main)',
                          marginTop: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {person.full_name || person.name}
                        </div>

                        <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>
                          {person.role}
                        </div>

                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          {person.department}
                        </div>
                      </div>
                    </div>

                    <div style={{
                      marginTop: 12,
                      padding: '6px 10px',
                      borderRadius: 6,
                      background: isAuth ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                      border: `1px dashed ${isAuth ? 'rgba(16,185,129,0.4)' : 'rgba(244,63,94,0.4)'}`,
                      fontSize: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: isAuth ? 'var(--success)' : 'var(--critical)' }}>
                        {isAuth ? 'shield' : 'notifications_active'}
                      </span>
                      <span style={{ color: isAuth ? 'var(--success)' : 'var(--critical)', fontWeight: 700 }}>
                        {isAuth ? 'ZONE EXEMPT: Alerts suppressed in all sectors' : 'ALERT ACTIVE: Zone breach sirens fire on entry'}
                      </span>
                    </div>

                    {person.photos && person.photos.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                          <span>Enrolled Face Photos ({person.photos.length})</span>
                          <span style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => setLightboxPhoto({ person, url: `${API}${person.photos[0]}`, all: person.photos })}>
                            View All
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                          {person.photos.map((pUrl, idx) => (
                            <img
                              key={idx}
                              src={`${API}${pUrl}`}
                              alt={`sample-${idx}`}
                              onClick={() => setLightboxPhoto({ person, url: `${API}${pUrl}`, all: person.photos })}
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: 4,
                                objectFit: 'cover',
                                border: '1px solid #334155',
                                cursor: 'pointer'
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {person.sample_count} sample chips
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => openEditModal(person)}
                          style={{
                            padding: '4px 10px',
                            fontSize: 10,
                            fontWeight: 700,
                            background: 'rgba(14,165,233,0.15)',
                            border: '1px solid var(--accent)',
                            color: 'var(--accent)',
                            borderRadius: 4,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>edit</span>
                          Edit
                        </button>

                        <button
                          onClick={() => handleDeletePerson(person)}
                          style={{
                            padding: '4px 8px',
                            fontSize: 10,
                            background: 'rgba(244,63,94,0.1)',
                            border: '1px solid rgba(244,63,94,0.3)',
                            color: 'var(--critical)',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                          title="Delete Person"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── PERSONNEL TABLE VIEW ── */}
          {!loading && viewMode === 'table' && filteredIdentities.length > 0 && (
            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11 }}>
                    <th style={{ padding: '12px 16px' }}>PHOTO</th>
                    <th style={{ padding: '12px 16px' }}>NAME & PERSON ID</th>
                    <th style={{ padding: '12px 16px' }}>ROLE / DESIGNATION</th>
                    <th style={{ padding: '12px 16px' }}>DEPARTMENT</th>
                    <th style={{ padding: '12px 16px' }}>ZONE STATUS</th>
                    <th style={{ padding: '12px 16px' }}>SAMPLES</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIdentities.map(person => {
                    const isAuth = person.status === 'AUTHORIZED'
                    const primaryImgUrl = person.primary_photo ? `${API}${person.primary_photo}` : null

                    return (
                      <tr key={person.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <div
                            onClick={() => {
                              if (person.photos && person.photos.length > 0) {
                                setLightboxPhoto({ person, url: `${API}${person.photos[0]}`, all: person.photos })
                              }
                            }}
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 6,
                              overflow: 'hidden',
                              border: `1px solid ${isAuth ? 'var(--success)' : 'var(--critical)'}`,
                              cursor: 'pointer',
                              background: '#0f172a'
                            }}
                          >
                            {primaryImgUrl ? (
                              <img src={primaryImgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>person</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>{person.full_name || person.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{person.person_id}</div>
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--accent)', fontWeight: 600 }}>{person.role}</td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{person.department}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: isAuth ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
                            color: isAuth ? 'var(--success)' : 'var(--critical)',
                            border: `1px solid ${isAuth ? 'var(--success)' : 'var(--critical)'}`
                          }}>
                            {isAuth ? '🛡️ ZONE SUPPRESSED' : '🚨 ALERT ACTIVE'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{person.sample_count} photos</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => openEditModal(person)}
                            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', marginRight: 10, fontSize: 15 }}
                            title="Edit Details"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeletePerson(person)}
                            style={{ background: 'none', border: 'none', color: 'var(--critical)', cursor: 'pointer', fontSize: 15 }}
                            title="Delete Person"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ==================================================================== */}
      {/* SECTION 3: 🚨 LOST & SUSPICIOUS WATCHLIST                             */}
      {/* ==================================================================== */}
      {activeSection === 'watchlist' && (
        <>
          {/* Sub-tab Navigation (Persons vs Vehicles) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, background: 'var(--bg-panel)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => setWatchlistSubTab('persons')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 18px',
                  borderRadius: 6,
                  border: watchlistSubTab === 'persons' ? '1px solid var(--critical)' : '1px solid transparent',
                  background: watchlistSubTab === 'persons' ? 'var(--critical-bg)' : 'transparent',
                  color: watchlistSubTab === 'persons' ? 'var(--critical)' : 'var(--text-muted)',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_alert</span>
                🎯 MOST WANTED & LOST PERSONS (FRS)
                <span style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 8,
                  background: watchlistSubTab === 'persons' ? 'var(--critical)' : 'var(--bg-hover)',
                  color: watchlistSubTab === 'persons' ? '#fff' : 'var(--text-muted)',
                  fontWeight: 900
                }}>
                  {watchlistPersons.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setWatchlistSubTab('vehicles')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 18px',
                  borderRadius: 6,
                  border: watchlistSubTab === 'vehicles' ? '1px solid var(--critical)' : '1px solid transparent',
                  background: watchlistSubTab === 'vehicles' ? 'var(--critical-bg)' : 'transparent',
                  color: watchlistSubTab === 'vehicles' ? 'var(--critical)' : 'var(--text-muted)',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>car_crash</span>
                🚗 LOST & STOLEN VEHICLES (ANPR)
                <span style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 8,
                  background: watchlistSubTab === 'vehicles' ? 'var(--critical)' : 'var(--bg-hover)',
                  color: watchlistSubTab === 'vehicles' ? '#fff' : 'var(--text-muted)',
                  fontWeight: 900
                }}>
                  {watchlistVehicles.length}
                </span>
              </button>
            </div>

            {/* Live Camera Sighting Indicator Beacon */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 20,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--critical)'
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--critical)',
                boxShadow: '0 0 8px var(--critical)'
              }} />
              <span>LIVE CAMERA ALERTS ARMED ACROSS ALL SECTORS</span>
            </div>
          </div>

          {/* ── Metrics Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div className="dossier-card" style={{ padding: '16px', borderLeft: '4px solid var(--critical)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Total Hotlist Targets
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--critical)', marginTop: 6 }}>
                {watchlistMetrics.totalPersons + watchlistMetrics.totalVehicles}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                Active in biometric & optical registries
              </div>
            </div>

            <div className="dossier-card" style={{ padding: '16px', borderLeft: '4px solid #f97316' }}>
              <div style={{ fontSize: 11, color: '#f97316', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
                Critical Fugitives (Extreme)
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#f97316', marginTop: 6 }}>
                {watchlistMetrics.criticalFugitives}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                Priority 1 immediate detainment
              </div>
            </div>

            <div className="dossier-card" style={{ padding: '16px', borderLeft: '4px solid var(--accent)' }}>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>directions_car</span>
                Lost / Stolen Vehicles
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--accent)', marginTop: 6 }}>
                {watchlistMetrics.totalVehicles}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                Instant gate barrier lockdown
              </div>
            </div>

            <div className="dossier-card" style={{ padding: '16px', borderLeft: '4px solid #a855f7' }}>
              <div style={{ fontSize: 11, color: '#a855f7', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>videocam</span>
                Camera Sighting Intercepts
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#a855f7', marginTop: 6 }}>
                {watchlistMetrics.totalSighted}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                Targets spotted on active camera feeds
              </div>
            </div>
          </div>

          {/* ── Toolbar: Search, Filters & Action ── */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            background: 'var(--bg-panel)',
            padding: '12px 16px',
            borderRadius: 8,
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--text-muted)' }}>
                  search
                </span>
                <input
                  type="text"
                  placeholder={watchlistSubTab === 'persons' ? "Search Name, Alias, FIR #, Directives..." : "Search Plate Number, Make/Model, FIR #..."}
                  value={watchlistSearch}
                  onChange={(e) => setWatchlistSearch(e.target.value)}
                  className="temporal-input"
                  style={{ width: '100%', padding: '8px 12px 8px 36px', fontSize: 12, boxSizing: 'border-box' }}
                />
              </div>

              {/* Category Filter */}
              <select
                value={watchlistCategoryFilter}
                onChange={(e) => setWatchlistCategoryFilter(e.target.value)}
                className="temporal-input"
                style={{ padding: '8px 12px', fontSize: 12 }}
              >
                <option value="ALL">All Categories</option>
                {watchlistSubTab === 'persons' ? (
                  <>
                    <option value="MOST_WANTED">🚨 Most Wanted</option>
                    <option value="SUSPICIOUS_PERSON">⚠️ Suspicious Subject</option>
                    <option value="MISSING_LOST">🔍 Missing / Lost Person</option>
                  </>
                ) : (
                  <>
                    <option value="STOLEN_VEHICLE">🚗 Stolen Vehicle</option>
                    <option value="TERROR_HOTLIST">🚨 Terror Hotlist</option>
                    <option value="SUSPICIOUS_RECON">⚠️ Suspicious Recon</option>
                    <option value="LOST_VEHICLE">🔍 Missing Vehicle</option>
                  </>
                )}
              </select>

              {/* Threat Filter */}
              <select
                value={watchlistThreatFilter}
                onChange={(e) => setWatchlistThreatFilter(e.target.value)}
                className="temporal-input"
                style={{ padding: '8px 12px', fontSize: 12 }}
              >
                <option value="ALL">All Threat Levels</option>
                <option value="EXTREME">🔴 EXTREME (Priority 1)</option>
                <option value="HIGH">🟠 HIGH</option>
                <option value="AMBER_ALERT">🟡 AMBER ALERT</option>
              </select>

              {/* Sort By */}
              <select
                value={watchlistSortBy}
                onChange={(e) => setWatchlistSortBy(e.target.value)}
                className="temporal-input"
                style={{ padding: '8px 12px', fontSize: 12 }}
              >
                <option value="sighting">📍 Sighting Status First</option>
                <option value="threat">⚡ Threat Severity</option>
                <option value="name">🔤 Alphabetical</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Grid / Table View Mode Toggle */}
              <div style={{ display: 'flex', background: 'var(--bg-panel)', padding: 2, borderRadius: 6, border: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setWatchlistViewMode('grid')}
                  style={{
                    background: watchlistViewMode === 'grid' ? 'var(--critical)' : 'transparent',
                    color: watchlistViewMode === 'grid' ? '#fff' : 'var(--text-muted)',
                    border: 'none',
                    padding: '6px 10px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Card Grid View"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>grid_view</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWatchlistViewMode('table')}
                  style={{
                    background: watchlistViewMode === 'table' ? 'var(--critical)' : 'transparent',
                    color: watchlistViewMode === 'table' ? '#fff' : 'var(--text-muted)',
                    border: 'none',
                    padding: '6px 10px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Table View"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>table_rows</span>
                </button>
              </div>

              {/* Add Target Button */}
              {watchlistSubTab === 'persons' ? (
                <button
                  type="button"
                  className="btn-accent"
                  onClick={openAddWatchlistPersonModal}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 800,
                    borderRadius: 6,
                    background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                    border: '1px solid #ef4444',
                    color: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
                  + ENROLL WANTED TARGET
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-accent"
                  onClick={openAddWatchlistVehicleModal}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 800,
                    borderRadius: 6,
                    background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                    border: '1px solid #ef4444',
                    color: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span>
                  + ENROLL LOST VEHICLE
                </button>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* SUB-TAB 1: MOST WANTED & LOST PERSONS                               */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {watchlistSubTab === 'persons' && (
            <>
              {filteredWatchlistPersons.length === 0 ? (
                <div className="dossier-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#475569', marginBottom: 10 }}>person_search</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>No Wanted / Lost Targets Found</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Enroll target photos and FIR details to activate real-time camera alerts.</div>
                </div>
              ) : watchlistViewMode === 'grid' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                  {filteredWatchlistPersons.map(person => {
                    const sighting = person.last_sighting
                    const photoUrl = person.photos && person.photos.length > 0
                      ? `${API}/api/v1/admin/watchlist/persons/photo/${person.id}/${person.photos[0]}`
                      : null

                    const isExtreme = person.threat_level === 'EXTREME'
                    const isHigh = person.threat_level === 'HIGH'

                    return (
                      <div
                        key={person.id}
                        className="dossier-card"
                        style={{
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                          border: sighting && sighting.camera_id ? '1px solid var(--critical)' : '1px solid var(--border-color)',
                          background: sighting && sighting.camera_id ? 'rgba(239,68,68,0.06)' : 'var(--bg-panel)',
                          boxShadow: sighting && sighting.camera_id ? '0 0 16px rgba(239,68,68,0.2)' : 'none'
                        }}
                      >
                        {/* Target Header with Photo and Badges */}
                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                          <div
                            onClick={() => {
                              if (photoUrl) {
                                setWatchlistLightbox({
                                  title: person.full_name,
                                  sub: `Alias: ${person.alias || 'None'} · FIR: ${person.fir_number || 'N/A'}`,
                                  url: photoUrl
                                })
                              }
                            }}
                            style={{
                              width: 72,
                              height: 72,
                              borderRadius: 8,
                              overflow: 'hidden',
                              border: `2px solid ${isExtreme ? 'var(--critical)' : '#f97316'}`,
                              background: '#020617',
                              flexShrink: 0,
                              cursor: photoUrl ? 'pointer' : 'default',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              position: 'relative'
                            }}
                            title={photoUrl ? "Click to view full photo" : "No photo uploaded"}
                          >
                            {photoUrl ? (
                              <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--critical)' }}>person</span>
                            )}
                            {photoUrl && (
                              <div style={{
                                position: 'absolute',
                                bottom: 2,
                                right: 2,
                                background: 'rgba(0,0,0,0.7)',
                                borderRadius: 3,
                                padding: '1px 3px',
                                fontSize: 9,
                                color: '#fff'
                              }}>
                                🔍
                              </div>
                            )}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                              <span style={{
                                fontSize: 9,
                                fontWeight: 900,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: isExtreme ? 'rgba(239,68,68,0.2)' : isHigh ? 'rgba(249,115,22,0.2)' : 'rgba(234,179,8,0.2)',
                                color: isExtreme ? 'var(--critical)' : isHigh ? '#f97316' : '#eab308',
                                border: `1px solid ${isExtreme ? 'var(--critical)' : isHigh ? '#f97316' : '#eab308'}`
                              }}>
                                {person.threat_level || 'EXTREME'}
                              </span>

                              <span style={{
                                fontSize: 9,
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'rgba(14,165,233,0.15)',
                                color: 'var(--accent)',
                                border: '1px solid var(--accent)'
                              }}>
                                {(person.category || 'MOST_WANTED').replace('_', ' ')}
                              </span>
                            </div>

                            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {person.full_name}
                            </div>

                            {person.alias && (
                              <div style={{ fontSize: 11, color: '#cbd5e1', fontStyle: 'italic', marginTop: 1 }}>
                                a.k.a. "{person.alias}"
                              </div>
                            )}

                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                              ID: {person.id} {person.fir_number && `· FIR: ${person.fir_number}`}
                            </div>
                          </div>
                        </div>

                        {/* Sighting Status Beacon */}
                        {sighting && sighting.camera_id ? (
                          <div style={{
                            background: 'rgba(239,68,68,0.2)',
                            border: '1px solid #ef4444',
                            padding: '8px 12px',
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                          }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: '#ffffff', fontWeight: 900, fontSize: 11 }}>
                                📍 SPOTTED ON {sighting.camera_id} ({sighting.camera_name || 'Camera Feed'})
                              </div>
                              <div style={{ fontSize: 10, color: '#fca5a5', marginTop: 2 }}>
                                {sighting.location} · {new Date(sighting.timestamp).toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div style={{
                            background: 'rgba(51,65,85,0.3)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            color: 'var(--text-muted)',
                            padding: '6px 10px',
                            borderRadius: 6,
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>radar</span>
                            SCANNING ALL CAMERAS (STANDBY)
                          </div>
                        )}

                        {/* Directives & Bounty */}
                        <div style={{ background: '#020617', padding: '8px 10px', borderRadius: 6, border: '1px solid #1e293b' }}>
                          {person.reward_inr && (
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#eab308', marginBottom: 4 }}>
                              💰 Reward / Bounty: {person.reward_inr}
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                            {person.directives || 'Detain immediately upon optical or facial identification.'}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <button
                            type="button"
                            onClick={() => openEditWatchlistPersonModal(person)}
                            style={{
                              flex: 1,
                              padding: '6px 10px',
                              borderRadius: 4,
                              border: '1px solid #334155',
                              background: '#1e293b',
                              color: '#f8fafc',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            ✏️ Edit Target
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteWatchlistPerson(person)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 4,
                              border: '1px solid rgba(239,68,68,0.4)',
                              background: 'rgba(239,68,68,0.1)',
                              color: 'var(--critical)',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                            title="Mark as Apprehended / Remove"
                          >
                            Apprehended / Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* Table View */
                <div style={{ background: 'var(--bg-panel)', borderRadius: 8, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11 }}>
                        <th style={{ padding: '12px 16px', width: 50 }}>PHOTO</th>
                        <th style={{ padding: '12px 16px' }}>TARGET NAME & ALIAS</th>
                        <th style={{ padding: '12px 16px' }}>CATEGORY</th>
                        <th style={{ padding: '12px 16px' }}>THREAT</th>
                        <th style={{ padding: '12px 16px' }}>LIVE SIGHTING STATUS</th>
                        <th style={{ padding: '12px 16px' }}>FIR / CASE #</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWatchlistPersons.map(person => {
                        const sighting = person.last_sighting
                        const photoUrl = person.photos && person.photos.length > 0
                          ? `${API}/api/v1/admin/watchlist/persons/photo/${person.id}/${person.photos[0]}`
                          : null

                        return (
                          <tr key={person.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '10px 16px' }}>
                              <div
                                onClick={() => {
                                  if (photoUrl) {
                                    setWatchlistLightbox({ title: person.full_name, sub: `FIR: ${person.fir_number || 'N/A'}`, url: photoUrl })
                                  }
                                }}
                                style={{
                                  width: 40,
                                  height: 40,
                                  borderRadius: 6,
                                  overflow: 'hidden',
                                  border: '1px solid var(--critical)',
                                  cursor: photoUrl ? 'pointer' : 'default',
                                  background: '#020617'
                                }}
                              >
                                {photoUrl ? (
                                  <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--critical)' }}>person</span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>{person.full_name}</div>
                              {person.alias && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>a.k.a. "{person.alias}"</div>}
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)' }}>
                                {(person.category || 'MOST_WANTED').replace('_', ' ')}
                              </span>
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <span style={{
                                fontSize: 9,
                                fontWeight: 900,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: person.threat_level === 'EXTREME' ? 'rgba(239,68,68,0.2)' : 'rgba(249,115,22,0.2)',
                                color: person.threat_level === 'EXTREME' ? 'var(--critical)' : '#f97316',
                                border: `1px solid ${person.threat_level === 'EXTREME' ? 'var(--critical)' : '#f97316'}`
                              }}>
                                {person.threat_level}
                              </span>
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              {sighting && sighting.camera_id ? (
                                <span style={{
                                  fontSize: 11,
                                  fontWeight: 900,
                                  color: 'var(--critical)',
                                  background: 'rgba(239,68,68,0.15)',
                                  border: '1px solid var(--critical)',
                                  padding: '4px 8px',
                                  borderRadius: 4
                                }}>
                                  📍 {sighting.camera_id} ({sighting.camera_name})
                                </span>
                              ) : (
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>STANDBY (Scanning)</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#94a3b8' }}>
                              {person.fir_number || 'N/A'}
                            </td>
                            <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => openEditWatchlistPersonModal(person)}
                                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, marginRight: 8 }}
                                title="Edit Target"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteWatchlistPerson(person)}
                                style={{ background: 'none', border: 'none', color: 'var(--critical)', cursor: 'pointer', fontSize: 14 }}
                                title="Apprehend / Delete"
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* SUB-TAB 2: LOST & STOLEN VEHICLES                                   */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {watchlistSubTab === 'vehicles' && (
            <>
              {filteredWatchlistVehicles.length === 0 ? (
                <div className="dossier-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#475569', marginBottom: 10 }}>directions_car</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>No Lost / Stolen Vehicles Found</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Enroll license plates and vehicle photos to trigger real-time camera alerts.</div>
                </div>
              ) : watchlistViewMode === 'grid' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                  {filteredWatchlistVehicles.map(veh => {
                    const sighting = veh.last_sighting
                    const photoUrl = veh.photos && veh.photos.length > 0
                      ? `${API}/api/v1/admin/watchlist/vehicles/photo/${veh.plate_number}/${veh.photos[0]}`
                      : null

                    const isExtreme = veh.threat_level === 'EXTREME'
                    const isHigh = veh.threat_level === 'HIGH'

                    return (
                      <div
                        key={veh.plate_number}
                        className="dossier-card"
                        style={{
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                          border: sighting && sighting.camera_id ? '1px solid var(--critical)' : '1px solid var(--border-color)',
                          background: sighting && sighting.camera_id ? 'rgba(239,68,68,0.06)' : 'var(--bg-panel)',
                          boxShadow: sighting && sighting.camera_id ? '0 0 16px rgba(239,68,68,0.2)' : 'none'
                        }}
                      >
                        {/* Vehicle Card Header */}
                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                          <div
                            onClick={() => {
                              if (photoUrl) {
                                setWatchlistLightbox({
                                  title: veh.plate_number,
                                  sub: `${veh.color || ''} ${veh.make_model || ''} · FIR: ${veh.fir_number || 'N/A'}`,
                                  url: photoUrl
                                })
                              }
                            }}
                            style={{
                              width: 72,
                              height: 72,
                              borderRadius: 8,
                              overflow: 'hidden',
                              border: `2px solid ${isExtreme ? 'var(--critical)' : '#f97316'}`,
                              background: '#020617',
                              flexShrink: 0,
                              cursor: photoUrl ? 'pointer' : 'default',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              position: 'relative'
                            }}
                            title={photoUrl ? "Click to view full photo" : "No photo uploaded"}
                          >
                            {photoUrl ? (
                              <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--critical)' }}>directions_car</span>
                            )}
                            {photoUrl && (
                              <div style={{
                                position: 'absolute',
                                bottom: 2,
                                right: 2,
                                background: 'rgba(0,0,0,0.7)',
                                borderRadius: 3,
                                padding: '1px 3px',
                                fontSize: 9,
                                color: '#fff'
                              }}>
                                🔍
                              </div>
                            )}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                              <span style={{
                                fontSize: 9,
                                fontWeight: 900,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: isExtreme ? 'rgba(239,68,68,0.2)' : isHigh ? 'rgba(249,115,22,0.2)' : 'rgba(234,179,8,0.2)',
                                color: isExtreme ? 'var(--critical)' : isHigh ? '#f97316' : '#eab308',
                                border: `1px solid ${isExtreme ? 'var(--critical)' : isHigh ? '#f97316' : '#eab308'}`
                              }}>
                                {veh.threat_level || 'EXTREME'}
                              </span>

                              <span style={{
                                fontSize: 9,
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'rgba(14,165,233,0.15)',
                                color: 'var(--accent)',
                                border: '1px solid var(--accent)'
                              }}>
                                {(veh.category || 'STOLEN_VEHICLE').replace('_', ' ')}
                              </span>
                            </div>

                            {/* Tactical IND License Plate Badge */}
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              background: '#ffffff',
                              color: '#0f172a',
                              border: '2px solid #0f172a',
                              borderRadius: 4,
                              fontWeight: 900,
                              fontFamily: 'var(--font-mono)',
                              letterSpacing: '0.08em',
                              fontSize: 13,
                              overflow: 'hidden',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                              marginBottom: 4
                            }}>
                              <span style={{
                                background: '#003399',
                                color: '#ffffff',
                                padding: '2px 5px',
                                fontSize: 9,
                                fontWeight: 900,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                IND
                              </span>
                              <span style={{ padding: '2px 8px' }}>
                                {veh.plate_number}
                              </span>
                            </div>

                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)', marginTop: 2 }}>
                              {veh.color} {veh.make_model}
                            </div>
                            {veh.fir_number && (
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                FIR: {veh.fir_number}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Sighting Status Beacon */}
                        {sighting && sighting.camera_id ? (
                          <div style={{
                            background: 'rgba(239,68,68,0.2)',
                            border: '1px solid #ef4444',
                            padding: '8px 12px',
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                          }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: '#ffffff', fontWeight: 900, fontSize: 11 }}>
                                📍 INTERCEPTED ON {sighting.camera_id} ({sighting.camera_name || 'Camera Feed'})
                              </div>
                              <div style={{ fontSize: 10, color: '#fca5a5', marginTop: 2 }}>
                                {sighting.location} · {new Date(sighting.timestamp).toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div style={{
                            background: 'rgba(51,65,85,0.3)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            color: 'var(--text-muted)',
                            padding: '6px 10px',
                            borderRadius: 6,
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>radar</span>
                            SCANNING ALL CAMERAS (STANDBY)
                          </div>
                        )}

                        {/* Directives & Reporter */}
                        <div style={{ background: '#020617', padding: '8px 10px', borderRadius: 6, border: '1px solid #1e293b' }}>
                          {veh.reported_by && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1', marginBottom: 2 }}>
                              Reported by: {veh.reported_by}
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                            {veh.directives || 'Immediate gate barrier lock. Intercept and detain occupants.'}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <button
                            type="button"
                            onClick={() => openEditWatchlistVehicleModal(veh)}
                            style={{
                              flex: 1,
                              padding: '6px 10px',
                              borderRadius: 4,
                              border: '1px solid #334155',
                              background: '#1e293b',
                              color: '#f8fafc',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            ✏️ Edit Vehicle
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteWatchlistVehicle(veh)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 4,
                              border: '1px solid rgba(239,68,68,0.4)',
                              background: 'rgba(239,68,68,0.1)',
                              color: 'var(--critical)',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                            title="Mark as Recovered / Remove"
                          >
                            Recovered / Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* Table View */
                <div style={{ background: 'var(--bg-panel)', borderRadius: 8, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11 }}>
                        <th style={{ padding: '12px 16px', width: 50 }}>PHOTO</th>
                        <th style={{ padding: '12px 16px' }}>LICENSE PLATE</th>
                        <th style={{ padding: '12px 16px' }}>MAKE & MODEL</th>
                        <th style={{ padding: '12px 16px' }}>CATEGORY</th>
                        <th style={{ padding: '12px 16px' }}>THREAT</th>
                        <th style={{ padding: '12px 16px' }}>LIVE SIGHTING STATUS</th>
                        <th style={{ padding: '12px 16px' }}>FIR #</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWatchlistVehicles.map(veh => {
                        const sighting = veh.last_sighting
                        const photoUrl = veh.photos && veh.photos.length > 0
                          ? `${API}/api/v1/admin/watchlist/vehicles/photo/${veh.plate_number}/${veh.photos[0]}`
                          : null

                        return (
                          <tr key={veh.plate_number} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '10px 16px' }}>
                              <div
                                onClick={() => {
                                  if (photoUrl) {
                                    setWatchlistLightbox({ title: veh.plate_number, sub: `FIR: ${veh.fir_number || 'N/A'}`, url: photoUrl })
                                  }
                                }}
                                style={{
                                  width: 40,
                                  height: 40,
                                  borderRadius: 6,
                                  overflow: 'hidden',
                                  border: '1px solid var(--critical)',
                                  cursor: photoUrl ? 'pointer' : 'default',
                                  background: '#020617'
                                }}
                              >
                                {photoUrl ? (
                                  <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--critical)' }}>directions_car</span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <span style={{ fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--critical)', fontSize: 13 }}>
                                {veh.plate_number}
                              </span>
                            </td>
                            <td style={{ padding: '10px 16px', color: 'var(--text-main)', fontWeight: 700 }}>
                              {veh.color} {veh.make_model}
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)' }}>
                                {(veh.category || 'STOLEN_VEHICLE').replace('_', ' ')}
                              </span>
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <span style={{
                                fontSize: 9,
                                fontWeight: 900,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: veh.threat_level === 'EXTREME' ? 'rgba(239,68,68,0.2)' : 'rgba(249,115,22,0.2)',
                                color: veh.threat_level === 'EXTREME' ? 'var(--critical)' : '#f97316',
                                border: `1px solid ${veh.threat_level === 'EXTREME' ? 'var(--critical)' : '#f97316'}`
                              }}>
                                {veh.threat_level}
                              </span>
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              {sighting && sighting.camera_id ? (
                                <span style={{
                                  fontSize: 11,
                                  fontWeight: 900,
                                  color: 'var(--critical)',
                                  background: 'rgba(239,68,68,0.15)',
                                  border: '1px solid var(--critical)',
                                  padding: '4px 8px',
                                  borderRadius: 4
                                }}>
                                  📍 {sighting.camera_id} ({sighting.camera_name})
                                </span>
                              ) : (
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>STANDBY (Scanning)</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#94a3b8' }}>
                              {veh.fir_number || 'N/A'}
                            </td>
                            <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => openEditWatchlistVehicleModal(veh)}
                                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, marginRight: 8 }}
                                title="Edit Vehicle"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteWatchlistVehicle(veh)}
                                style={{ background: 'none', border: 'none', color: 'var(--critical)', cursor: 'pointer', fontSize: 14 }}
                                title="Recovered / Delete"
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL: ADD / EDIT VEHICLE & UPLOAD VEHICLE PHOTOS
          ──────────────────────────────────────────────────────────────────────── */}
      {isVehicleModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div className="modal-header-left">
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: vehicleFormData.status === 'AUTHORIZED' ? 'var(--success)' : 'var(--critical)' }}>
                  {editingVehicle ? 'edit_square' : 'local_shipping'}
                </span>
                <span className="modal-title">
                  {editingVehicle ? `EDIT ENROLLED VEHICLE: ${editingVehicle.plate_number}` : 'ENROLL NEW VEHICLE TO ANPR REGISTRY'}
                </span>
              </div>
              <button className="modal-close-btn" onClick={() => setIsVehicleModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveVehicle} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {vehicleFormError && (
                <div style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid var(--critical)', color: 'var(--critical)', padding: 10, borderRadius: 6, fontSize: 11 }}>
                  {vehicleFormError}
                </div>
              )}

              {/* License Plate & Vehicle Type Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    LICENSE PLATE NUMBER *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={vehicleFormData.plate_number}
                      onChange={(e) => setVehicleFormData({ ...vehicleFormData, plate_number: e.target.value.toUpperCase() })}
                      className="temporal-input"
                      style={{ width: '100%', padding: '8px 10px 8px 30px', fontSize: 13, fontWeight: 900, letterSpacing: '0.05em', boxSizing: 'border-box' }}
                      placeholder="e.g. UK-07-TA-5521"
                      required
                    />
                    <span className="material-symbols-outlined" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-muted)' }}>
                      pin
                    </span>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    VEHICLE TYPE *
                  </label>
                  <select
                    value={vehicleFormData.vehicle_type}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, vehicle_type: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                  >
                    <option value="TRUCK">🚚 Heavy Transport Truck</option>
                    <option value="SUV">🚙 Armored SUV / Recon Jeep</option>
                    <option value="CAR">🚗 Patrol Car / Sedan</option>
                    <option value="MOTORCYCLE">🏍️ Border Patrol Motorcycle</option>
                    <option value="BUS">🚌 Troop Transport Bus</option>
                    <option value="VAN">🚐 Tactical Van / Ambulance</option>
                  </select>
                </div>
              </div>

              {/* Driver / Owner & Phone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    DRIVER / CONVOY COMMANDER NAME
                  </label>
                  <input
                    type="text"
                    value={vehicleFormData.owner_name}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, owner_name: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="e.g. Col. Ranjit Singh"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    DRIVER CONTACT / RADIO CH
                  </label>
                  <input
                    type="text"
                    value={vehicleFormData.driver_phone}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, driver_phone: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="+91-98765-43210 / TAC-1"
                  />
                </div>
              </div>

              {/* Department & Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    ASSIGNED DEPARTMENT / CONVOY UNIT
                  </label>
                  <input
                    type="text"
                    value={vehicleFormData.department}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, department: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="Tactical Logistics & Supply"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    SECURITY CLEARANCE STATUS *
                  </label>
                  <select
                    value={vehicleFormData.status}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, status: e.target.value })}
                    className="temporal-input"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      fontSize: 12,
                      boxSizing: 'border-box',
                      color: vehicleFormData.status === 'AUTHORIZED' ? 'var(--success)' : 'var(--critical)',
                      fontWeight: 700
                    }}
                  >
                    <option value="AUTHORIZED">🛡️ AUTHORIZED (Suppress Zone Alarms)</option>
                    <option value="UNAUTHORIZED">🚨 WATCHLIST (Trigger Critical Sirens)</option>
                  </select>
                </div>
              </div>

              {/* Make/Model & Color */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    MAKE & MODEL
                  </label>
                  <input
                    type="text"
                    value={vehicleFormData.make_model}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, make_model: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="e.g. Tata Defense 4x4 / Mahindra Scorpio"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    VEHICLE COLOR
                  </label>
                  <input
                    type="text"
                    value={vehicleFormData.color}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, color: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="e.g. Olive Drab / White / Matte Black"
                  />
                </div>
              </div>

              {/* Photo Upload Zone */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  UPLOAD VEHICLE & PLATE PHOTOS (OPTIONAL)
                </label>
                <label style={{
                  border: '2px dashed var(--accent)',
                  borderRadius: 8,
                  background: 'rgba(14,165,233,0.05)',
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  gap: 6
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--accent)' }}>
                    add_a_photo
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)' }}>
                    Click or Drag & Drop Vehicle Photos Here
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    Supports JPG and PNG images. Photos are stored in the vehicle gallery for visual verification.
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    multiple
                    onChange={handleVehicleFileSelection}
                    style={{ display: 'none' }}
                  />
                </label>

                {/* Previews of pending uploads */}
                {vehicleFilePreviews.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginBottom: 6 }}>
                      {vehicleFilePreviews.length} New Photo(s) Selected for Upload:
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 80, overflowY: 'auto' }}>
                      {vehicleFilePreviews.map((src, i) => (
                        <div key={i} style={{ position: 'relative' }}>
                          <img
                            src={src}
                            alt=""
                            style={{ width: 50, height: 44, borderRadius: 4, objectFit: 'cover', border: '1px solid var(--accent)' }}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemovePendingVehicleFile(i)}
                            style={{
                              position: 'absolute',
                              top: -4,
                              right: -4,
                              background: 'var(--critical)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '50%',
                              width: 14,
                              height: 14,
                              fontSize: 9,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  SECURITY DIRECTIVES / ACCESS NOTES
                </label>
                <input
                  type="text"
                  value={vehicleFormData.notes}
                  onChange={(e) => setVehicleFormData({ ...vehicleFormData, notes: e.target.value })}
                  className="temporal-input"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                  placeholder="e.g. Convoy clearance. Zone alert completely suppressed across all checkpoints."
                />
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button
                  type="submit"
                  disabled={vehicleFormSaving}
                  className="btn-accent"
                  style={{
                    flex: 1,
                    padding: 10,
                    fontWeight: 800,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: vehicleFormSaving ? 'wait' : 'pointer'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
                  {vehicleFormSaving ? 'ENROLLING VEHICLE...' : (editingVehicle ? 'SAVE VEHICLE SPECIFICATIONS' : 'ENROLL VEHICLE IN ANPR REGISTRY')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsVehicleModalOpen(false)}
                  style={{
                    padding: '10px 16px',
                    background: '#334155',
                    color: '#f8fafc',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL: ADD / EDIT PERSONNEL & UPLOAD FACE PHOTOS
          ──────────────────────────────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div className="modal-header-left">
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: formData.status === 'AUTHORIZED' ? 'var(--success)' : 'var(--critical)' }}>
                  {editingPerson ? 'edit_square' : 'person_add'}
                </span>
                <span className="modal-title">
                  {editingPerson ? `EDIT PERSONNEL: ${editingPerson.full_name || editingPerson.name}` : 'ENROLL NEW PERSONNEL TO FRS'}
                </span>
              </div>
              <button className="modal-close-btn" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSavePerson} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {formError && (
                <div style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid var(--critical)', color: 'var(--critical)', padding: 10, borderRadius: 6, fontSize: 11 }}>
                  {formError}
                </div>
              )}

              {/* ID & Name Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    PERSONNEL ID *
                  </label>
                  <input
                    type="text"
                    value={formData.person_id}
                    onChange={(e) => setFormData({ ...formData, person_id: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="PERS-101"
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    FULL NAME *
                  </label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="Major Vikram Sharma"
                    required
                  />
                </div>
              </div>

              {/* Role & Department */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    TACTICAL ROLE / DESIGNATION
                  </label>
                  <input
                    type="text"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="Sector Recon Officer"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    ASSIGNED SECTOR / DEPARTMENT
                  </label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="Sector Alpha Command"
                  />
                </div>
              </div>

              {/* Clearance Status */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  SECURITY CLEARANCE STATUS *
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="temporal-input"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: 12,
                    boxSizing: 'border-box',
                    color: formData.status === 'AUTHORIZED' ? 'var(--success)' : 'var(--critical)',
                    fontWeight: 700
                  }}
                >
                  <option value="AUTHORIZED">🛡️ AUTHORIZED (Suppress Zone Alarms)</option>
                  <option value="UNAUTHORIZED">🚨 WATCHLIST (Trigger Critical Alerts)</option>
                </select>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                  Authorized personnel entering restricted zones or crossing fences will have alarms suppressed automatically.
                </span>
              </div>

              {/* Photo Upload Zone */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  UPLOAD FACE SAMPLES (FOR LBPH MODEL TRAINING)
                </label>
                <label style={{
                  border: '2px dashed var(--accent)',
                  borderRadius: 8,
                  background: 'rgba(14,165,233,0.05)',
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  gap: 6
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--accent)' }}>
                    add_a_photo
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)' }}>
                    Click or Drag & Drop Face Photos Here
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    Supports single or multiple images. Face chips are automatically cropped and augmented for LBPH training.
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    multiple
                    onChange={handleFileSelection}
                    style={{ display: 'none' }}
                  />
                </label>

                {/* Previews of pending uploads */}
                {filePreviews.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginBottom: 6 }}>
                      {filePreviews.length} New Photo(s) Selected for Upload:
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 80, overflowY: 'auto' }}>
                      {filePreviews.map((src, i) => (
                        <div key={i} style={{ position: 'relative' }}>
                          <img
                            src={src}
                            alt=""
                            style={{ width: 44, height: 44, borderRadius: 4, objectFit: 'cover', border: '1px solid var(--accent)' }}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemovePendingFile(i)}
                            style={{
                              position: 'absolute',
                              top: -4,
                              right: -4,
                              background: 'var(--critical)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '50%',
                              width: 14,
                              height: 14,
                              fontSize: 9,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  SECURITY DIRECTIVES / NOTES
                </label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="temporal-input"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                  placeholder="Base commander with all-zone clearance."
                />
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="btn-accent"
                  style={{
                    flex: 1,
                    padding: 10,
                    fontWeight: 800,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: formSaving ? 'wait' : 'pointer'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
                  {formSaving ? 'ENROLLING & RETRAINING FRS...' : (editingPerson ? 'SAVE & RETRAIN FRS MODEL' : 'ENROLL & TRAIN FRS MODEL')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '10px 16px',
                    background: '#334155',
                    color: '#f8fafc',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          LIGHTBOX MODAL: VEHICLE PHOTO VIEWER & MANAGER
          ──────────────────────────────────────────────────────────────────────── */}
      {vehicleLightbox && (
        <div className="modal-backdrop" onClick={() => setVehicleLightbox(null)}>
          <div
            className="modal-box"
            style={{ maxWidth: 580, padding: 20, textAlign: 'center', background: '#0a0f1d' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    background: '#ffffff',
                    color: '#000',
                    padding: '1px 6px',
                    borderRadius: 3,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 900,
                    fontSize: 12
                  }}>
                    {vehicleLightbox.vehicle.plate_number}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                    {vehicleLightbox.vehicle.owner_name || vehicleLightbox.vehicle.vehicle_type}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  ANPR Enrolled Asset · {vehicleLightbox.vehicle.status}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setVehicleLightbox(null)}>✕</button>
            </div>

            <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #334155', background: '#020617', maxHeight: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={vehicleLightbox.url}
                alt="Enrolled Vehicle Asset"
                style={{ maxWidth: '100%', maxHeight: 380, objectFit: 'contain' }}
              />
            </div>

            {/* Thumbnail Strip for Multi-photo Vehicles */}
            {vehicleLightbox.all && vehicleLightbox.all.length > 1 && (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12, overflowX: 'auto' }}>
                {vehicleLightbox.all.map((pUrl, idx) => (
                  <img
                    key={idx}
                    src={`${API}${pUrl}`}
                    alt=""
                    onClick={() => setVehicleLightbox({ ...vehicleLightbox, url: `${API}${pUrl}` })}
                    style={{
                      width: 50,
                      height: 40,
                      borderRadius: 4,
                      objectFit: 'cover',
                      border: vehicleLightbox.url === `${API}${pUrl}` ? '2px solid var(--accent)' : '1px solid #334155',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, borderTop: '1px solid #334155', paddingTop: 12 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Path: {vehicleLightbox.url.split('/').pop()}
              </span>
              <button
                onClick={() => handleDeleteVehiclePhoto(vehicleLightbox.vehicle.plate_number, vehicleLightbox.url)}
                style={{
                  background: 'rgba(244,63,94,0.15)',
                  border: '1px solid var(--critical)',
                  color: 'var(--critical)',
                  padding: '6px 12px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                Delete This Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          LIGHTBOX MODAL: FULL RESOLUTION PERSON PHOTO VIEWER & MANAGER
          ──────────────────────────────────────────────────────────────────────── */}
      {lightboxPhoto && (
        <div className="modal-backdrop" onClick={() => setLightboxPhoto(null)}>
          <div
            className="modal-box"
            style={{ maxWidth: 540, padding: 20, textAlign: 'center', background: '#0f172a' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)' }}>
                  {lightboxPhoto.person.full_name || lightboxPhoto.person.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  Enrolled Facial Sample · {lightboxPhoto.person.status}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setLightboxPhoto(null)}>✕</button>
            </div>

            <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #334155', background: '#020617', maxHeight: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={lightboxPhoto.url}
                alt="Enrolled Face"
                style={{ maxWidth: '100%', maxHeight: 380, objectFit: 'contain' }}
              />
            </div>

            {/* Thumbnail Strip for Multi-photo people */}
            {lightboxPhoto.all && lightboxPhoto.all.length > 1 && (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12, overflowX: 'auto' }}>
                {lightboxPhoto.all.map((pUrl, idx) => (
                  <img
                    key={idx}
                    src={`${API}${pUrl}`}
                    alt=""
                    onClick={() => setLightboxPhoto({ ...lightboxPhoto, url: `${API}${pUrl}` })}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 4,
                      objectFit: 'cover',
                      border: lightboxPhoto.url === `${API}${pUrl}` ? '2px solid var(--accent)' : '1px solid #334155',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, borderTop: '1px solid #334155', paddingTop: 12 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Path: {lightboxPhoto.url.split('/').pop()}
              </span>
              <button
                onClick={() => handleDeletePhoto(lightboxPhoto.person.dir_name || lightboxPhoto.person.name, lightboxPhoto.url)}
                style={{
                  background: 'rgba(244,63,94,0.15)',
                  border: '1px solid var(--critical)',
                  color: 'var(--critical)',
                  padding: '6px 12px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                Delete This Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL: ADD / EDIT MOST WANTED & LOST PERSON
          ──────────────────────────────────────────────────────────────────────── */}
      {isWatchlistPersonModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div className="modal-header-left">
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--critical)' }}>
                  {editingWatchlistPerson ? 'edit_square' : 'emergency'}
                </span>
                <span className="modal-title">
                  {editingWatchlistPerson ? `EDIT TARGET: ${editingWatchlistPerson.full_name}` : 'ENROLL WANTED TARGET TO WATCHLIST'}
                </span>
              </div>
              <button className="modal-close-btn" onClick={() => setIsWatchlistPersonModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveWatchlistPerson} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {watchlistPersonError && (
                <div style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid var(--critical)', color: 'var(--critical)', padding: 10, borderRadius: 6, fontSize: 11 }}>
                  {watchlistPersonError}
                </div>
              )}

              {/* ID & Full Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    TARGET ID *
                  </label>
                  <input
                    type="text"
                    value={watchlistPersonForm.id}
                    onChange={(e) => setWatchlistPersonForm({ ...watchlistPersonForm, id: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="WANTED-004"
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    FULL LEGAL NAME *
                  </label>
                  <input
                    type="text"
                    value={watchlistPersonForm.full_name}
                    onChange={(e) => setWatchlistPersonForm({ ...watchlistPersonForm, full_name: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="e.g. Tariq Mansoor / Vikram Rawat"
                    required
                  />
                </div>
              </div>

              {/* Alias & FIR # */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    ALIAS / KNOWN MONIKER
                  </label>
                  <input
                    type="text"
                    value={watchlistPersonForm.alias}
                    onChange={(e) => setWatchlistPersonForm({ ...watchlistPersonForm, alias: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="e.g. Tiger / Shadow / Rana"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    FIR / CRIME DOCKET #
                  </label>
                  <input
                    type="text"
                    value={watchlistPersonForm.fir_number}
                    onChange={(e) => setWatchlistPersonForm({ ...watchlistPersonForm, fir_number: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="e.g. FIR-2026/890-NIA"
                  />
                </div>
              </div>

              {/* Category & Threat Level */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    WATCHLIST CATEGORY *
                  </label>
                  <select
                    value={watchlistPersonForm.category}
                    onChange={(e) => setWatchlistPersonForm({ ...watchlistPersonForm, category: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                  >
                    <option value="MOST_WANTED">🚨 MOST WANTED FUGITIVE</option>
                    <option value="SUSPICIOUS_PERSON">⚠️ SUSPICIOUS RECON PERSON</option>
                    <option value="MISSING_LOST">🔍 MISSING / LOST CITIZEN</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    THREAT SEVERITY LEVEL *
                  </label>
                  <select
                    value={watchlistPersonForm.threat_level}
                    onChange={(e) => setWatchlistPersonForm({ ...watchlistPersonForm, threat_level: e.target.value })}
                    className="temporal-input"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      fontSize: 12,
                      boxSizing: 'border-box',
                      color: watchlistPersonForm.threat_level === 'EXTREME' ? 'var(--critical)' : '#f97316',
                      fontWeight: 800
                    }}
                  >
                    <option value="EXTREME">🔴 EXTREME (Priority 1 Armed Siren)</option>
                    <option value="HIGH">🟠 HIGH (Critical Alert)</option>
                    <option value="AMBER_ALERT">🟡 AMBER ALERT (Missing Search)</option>
                  </select>
                </div>
              </div>

              {/* Bounty Reward */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  BOUNTY / CASH REWARD (INR)
                </label>
                <input
                  type="text"
                  value={watchlistPersonForm.reward_inr}
                  onChange={(e) => setWatchlistPersonForm({ ...watchlistPersonForm, reward_inr: e.target.value })}
                  className="temporal-input"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                  placeholder="e.g. ₹5,00,000 / Nil"
                />
              </div>

              {/* Directives */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  INTERCEPT DIRECTIVES / SENTRY ORDERS
                </label>
                <input
                  type="text"
                  value={watchlistPersonForm.directives}
                  onChange={(e) => setWatchlistPersonForm({ ...watchlistPersonForm, directives: e.target.value })}
                  className="temporal-input"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                  placeholder="Immediate armed detachment dispatch. Seal sector exits."
                />
              </div>

              {/* Photo Upload */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  TARGET PHOTOS / BIOMETRIC FACE CHIPS (JPG / PNG)
                </label>
                <div style={{
                  border: '2px dashed rgba(239,68,68,0.4)',
                  borderRadius: 8,
                  padding: '14px',
                  textAlign: 'center',
                  background: 'rgba(239,68,68,0.03)',
                  cursor: 'pointer'
                }}>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleWatchlistPersonFileSelection}
                    style={{ display: 'none' }}
                    id="watchlist-person-photos"
                  />
                  <label htmlFor="watchlist-person-photos" style={{ cursor: 'pointer' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--critical)' }}>add_a_photo</span>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc', marginTop: 4 }}>
                      Click to Browse Target Photos
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      Face chips will be synced immediately to FRS LBPH model
                    </div>
                  </label>
                </div>

                {watchlistPersonPreviews.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--critical)', fontWeight: 700, marginBottom: 6 }}>
                      {watchlistPersonPreviews.length} Photo(s) Selected:
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {watchlistPersonPreviews.map((src, i) => (
                        <div key={i} style={{ position: 'relative' }}>
                          <img
                            src={src}
                            alt=""
                            style={{ width: 50, height: 50, borderRadius: 4, objectFit: 'cover', border: '1px solid var(--critical)' }}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemovePendingWatchlistPersonFile(i)}
                            style={{
                              position: 'absolute',
                              top: -4,
                              right: -4,
                              background: 'var(--critical)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '50%',
                              width: 16,
                              height: 16,
                              fontSize: 10,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button
                  type="submit"
                  disabled={watchlistPersonSaving}
                  className="btn-accent"
                  style={{
                    flex: 1,
                    padding: 10,
                    fontWeight: 800,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                    border: '1px solid #ef4444',
                    color: '#fff',
                    cursor: watchlistPersonSaving ? 'wait' : 'pointer'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
                  {watchlistPersonSaving ? 'INDEXING TARGET...' : 'REGISTER & ARM CAMERA ALERTS'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsWatchlistPersonModalOpen(false)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 6,
                    border: '1px solid #334155',
                    background: '#1e293b',
                    color: '#cbd5e1',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL: ADD / EDIT LOST & STOLEN VEHICLE
          ──────────────────────────────────────────────────────────────────────── */}
      {isWatchlistVehicleModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div className="modal-header-left">
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--critical)' }}>
                  {editingWatchlistVehicle ? 'edit_square' : 'car_crash'}
                </span>
                <span className="modal-title">
                  {editingWatchlistVehicle ? `EDIT HOTLIST VEHICLE: ${editingWatchlistVehicle.plate_number}` : 'ENROLL LOST / STOLEN VEHICLE'}
                </span>
              </div>
              <button className="modal-close-btn" onClick={() => setIsWatchlistVehicleModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveWatchlistVehicle} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {watchlistVehicleError && (
                <div style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid var(--critical)', color: 'var(--critical)', padding: 10, borderRadius: 6, fontSize: 11 }}>
                  {watchlistVehicleError}
                </div>
              )}

              {/* Plate & Vehicle Type */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    LICENSE PLATE NUMBER *
                  </label>
                  <input
                    type="text"
                    value={watchlistVehicleForm.plate_number}
                    onChange={(e) => setWatchlistVehicleForm({ ...watchlistVehicleForm, plate_number: e.target.value.toUpperCase() })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }}
                    placeholder="DL-01-AB-1234"
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    VEHICLE TYPE *
                  </label>
                  <select
                    value={watchlistVehicleForm.vehicle_type}
                    onChange={(e) => setWatchlistVehicleForm({ ...watchlistVehicleForm, vehicle_type: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                  >
                    <option value="SUV">SUV</option>
                    <option value="CAR">CAR / SEDAN</option>
                    <option value="TRUCK">TRUCK / HEAVY</option>
                    <option value="TANKER">TANKER / OIL</option>
                    <option value="MOTORCYCLE">MOTORCYCLE / BIKE</option>
                    <option value="BUS">BUS</option>
                  </select>
                </div>
              </div>

              {/* Make/Model & Color */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    MAKE & MODEL
                  </label>
                  <input
                    type="text"
                    value={watchlistVehicleForm.make_model}
                    onChange={(e) => setWatchlistVehicleForm({ ...watchlistVehicleForm, make_model: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="e.g. Mahindra Scorpio / Fortuner"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    COLOR
                  </label>
                  <input
                    type="text"
                    value={watchlistVehicleForm.color}
                    onChange={(e) => setWatchlistVehicleForm({ ...watchlistVehicleForm, color: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="e.g. Black / White / Olive"
                  />
                </div>
              </div>

              {/* Category & Threat Level */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    WATCHLIST CATEGORY *
                  </label>
                  <select
                    value={watchlistVehicleForm.category}
                    onChange={(e) => setWatchlistVehicleForm({ ...watchlistVehicleForm, category: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                  >
                    <option value="STOLEN_VEHICLE">🚗 STOLEN VEHICLE</option>
                    <option value="TERROR_HOTLIST">🚨 TERROR HOTLIST VEHICLE</option>
                    <option value="SUSPICIOUS_RECON">⚠️ SUSPICIOUS RECON VEHICLE</option>
                    <option value="LOST_VEHICLE">🔍 MISSING CITIZEN VEHICLE</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    THREAT SEVERITY LEVEL *
                  </label>
                  <select
                    value={watchlistVehicleForm.threat_level}
                    onChange={(e) => setWatchlistVehicleForm({ ...watchlistVehicleForm, threat_level: e.target.value })}
                    className="temporal-input"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      fontSize: 12,
                      boxSizing: 'border-box',
                      color: watchlistVehicleForm.threat_level === 'EXTREME' ? 'var(--critical)' : '#f97316',
                      fontWeight: 800
                    }}
                  >
                    <option value="EXTREME">🔴 EXTREME (Priority 1 Armed Intercept)</option>
                    <option value="HIGH">🟠 HIGH (Immediate Stop Order)</option>
                    <option value="AMBER_ALERT">🟡 AMBER ALERT (Search Bulletin)</option>
                  </select>
                </div>
              </div>

              {/* FIR & Reported By */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    FIR / THEFT REPORT #
                  </label>
                  <input
                    type="text"
                    value={watchlistVehicleForm.fir_number}
                    onChange={(e) => setWatchlistVehicleForm({ ...watchlistVehicleForm, fir_number: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="FIR-STOLEN-2026/041"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    REPORTING POLICE STATION / OWNER
                  </label>
                  <input
                    type="text"
                    value={watchlistVehicleForm.reported_by}
                    onChange={(e) => setWatchlistVehicleForm({ ...watchlistVehicleForm, reported_by: e.target.value })}
                    className="temporal-input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                    placeholder="e.g. Kotwali PS / Highway Patrol"
                  />
                </div>
              </div>

              {/* Directives */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  INTERCEPT DIRECTIVES / ACTION PLAN
                </label>
                <input
                  type="text"
                  value={watchlistVehicleForm.directives}
                  onChange={(e) => setWatchlistVehicleForm({ ...watchlistVehicleForm, directives: e.target.value })}
                  className="temporal-input"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }}
                  placeholder="Drop hydraulic barrier. Dispatch response team immediately."
                />
              </div>

              {/* Photos */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  VEHICLE / EVIDENCE PHOTOS (JPG / PNG)
                </label>
                <div style={{
                  border: '2px dashed rgba(239,68,68,0.4)',
                  borderRadius: 8,
                  padding: '14px',
                  textAlign: 'center',
                  background: 'rgba(239,68,68,0.03)',
                  cursor: 'pointer'
                }}>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleWatchlistVehicleFileSelection}
                    style={{ display: 'none' }}
                    id="watchlist-vehicle-photos"
                  />
                  <label htmlFor="watchlist-vehicle-photos" style={{ cursor: 'pointer' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--critical)' }}>add_photo_alternate</span>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc', marginTop: 4 }}>
                      Click to Browse Vehicle Photos
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      Optical profiles will assist sentry verification upon camera hit
                    </div>
                  </label>
                </div>

                {watchlistVehiclePreviews.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--critical)', fontWeight: 700, marginBottom: 6 }}>
                      {watchlistVehiclePreviews.length} Photo(s) Selected:
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {watchlistVehiclePreviews.map((src, i) => (
                        <div key={i} style={{ position: 'relative' }}>
                          <img
                            src={src}
                            alt=""
                            style={{ width: 50, height: 44, borderRadius: 4, objectFit: 'cover', border: '1px solid var(--critical)' }}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemovePendingWatchlistVehicleFile(i)}
                            style={{
                              position: 'absolute',
                              top: -4,
                              right: -4,
                              background: 'var(--critical)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '50%',
                              width: 16,
                              height: 16,
                              fontSize: 10,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button
                  type="submit"
                  disabled={watchlistVehicleSaving}
                  className="btn-accent"
                  style={{
                    flex: 1,
                    padding: 10,
                    fontWeight: 800,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                    border: '1px solid #ef4444',
                    color: '#fff',
                    cursor: watchlistVehicleSaving ? 'wait' : 'pointer'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
                  {watchlistVehicleSaving ? 'ENROLLING VEHICLE...' : 'REGISTER & ARM ANPR ALERTS'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsWatchlistVehicleModalOpen(false)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 6,
                    border: '1px solid #334155',
                    background: '#1e293b',
                    color: '#cbd5e1',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          WATCHLIST LIGHTBOX: FULL RESOLUTION EVIDENCE VIEWER
          ──────────────────────────────────────────────────────────────────────── */}
      {watchlistLightbox && (
        <div className="modal-backdrop" onClick={() => setWatchlistLightbox(null)}>
          <div
            className="modal-box"
            style={{ maxWidth: 580, padding: 20, textAlign: 'center', background: '#0f172a' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--critical)' }}>
                  🚨 {watchlistLightbox.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {watchlistLightbox.sub}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setWatchlistLightbox(null)}>✕</button>
            </div>

            <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #334155', background: '#020617', maxHeight: 420, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={watchlistLightbox.url}
                alt="Watchlist Evidence"
                style={{ maxWidth: '100%', maxHeight: 420, objectFit: 'contain' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, borderTop: '1px solid #334155', paddingTop: 10 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Target Profile Evidence
              </span>
              <button
                type="button"
                onClick={() => setWatchlistLightbox(null)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid #334155',
                  color: '#cbd5e1',
                  padding: '6px 14px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
