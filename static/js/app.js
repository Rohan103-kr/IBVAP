// SENTINEL AI Multi-Camera ReID & Journey Dashboard Controller

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

let currentCameras = [];
let allPersonsData = [];
let selectedPersonId = null;
let quickUploadTargetCamId = null;
let selectedModalFile = null;

function initDashboard() {
    setupEventListeners();
    setupUploadHandlers();
    fetchCameras();
    fetchSystemStatus();
    fetchActiveUnderCctv();
    fetchAllPersons();

    // High-frequency telemetry polling for live "Under CCTV" radar
    setInterval(fetchActiveUnderCctv, 1200);
    // Medium-frequency update for table and stats
    setInterval(fetchSystemStatus, 3000);
    setInterval(fetchAllPersons, 3500);
}

function setupEventListeners() {
    // CSV Export
    document.getElementById('btn-export-csv').addEventListener('click', () => {
        window.location.href = '/api/export/csv';
    });

    // Toggle Grid Layout
    const toggleLayoutBtn = document.getElementById('btn-toggle-layout');
    const gridContainer = document.getElementById('cctv-grid-container');
    toggleLayoutBtn.addEventListener('click', () => {
        gridContainer.classList.toggle('layout-2col');
    });

    // Add / Upload Camera Modal Controls
    const addCamBtn = document.getElementById('btn-add-camera');
    const addCamModal = document.getElementById('add-camera-modal');
    const closeCamModal = document.getElementById('btn-close-camera-modal');
    const cancelCamBtn = document.getElementById('btn-cancel-cam');
    const cancelUploadBtn = document.getElementById('btn-cancel-upload');
    const addCamForm = document.getElementById('add-camera-form');

    addCamBtn.addEventListener('click', () => {
        populateUploadCameraSelect();
        addCamModal.classList.add('show');
    });

    const hideAddCamModal = () => addCamModal.classList.remove('show');
    closeCamModal.addEventListener('click', hideAddCamModal);
    if (cancelCamBtn) cancelCamBtn.addEventListener('click', hideAddCamModal);
    if (cancelUploadBtn) cancelUploadBtn.addEventListener('click', hideAddCamModal);

    // Modal Tabs Switching
    const tabUpload = document.getElementById('tab-upload-video');
    const tabStream = document.getElementById('tab-stream-source');
    const uploadForm = document.getElementById('upload-camera-form');

    tabUpload.addEventListener('click', () => {
        tabUpload.classList.add('active');
        tabStream.classList.remove('active');
        uploadForm.style.display = 'block';
        addCamForm.style.display = 'none';
    });

    tabStream.addEventListener('click', () => {
        tabStream.classList.add('active');
        tabUpload.classList.remove('active');
        uploadForm.style.display = 'none';
        addCamForm.style.display = 'block';
    });

    // Target Camera select change
    const targetSelect = document.getElementById('upload-target-select');
    const newCamMetaGroup = document.getElementById('group-new-cam-meta');
    targetSelect.addEventListener('change', () => {
        if (targetSelect.value === 'new') {
            newCamMetaGroup.style.display = 'block';
        } else {
            newCamMetaGroup.style.display = 'none';
        }
    });

    // RTSP/Webcam form submission
    addCamForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            id: document.getElementById('cam-id-input').value.trim(),
            name: document.getElementById('cam-name-input').value.trim(),
            location: document.getElementById('cam-location-input').value.trim(),
            source: document.getElementById('cam-source-input').value.trim()
        };

        try {
            const res = await fetch('/api/cameras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                hideAddCamModal();
                addCamForm.reset();
                showToast(`Camera feed '${payload.name}' connected successfully!`);
                fetchCameras();
            } else {
                showToast('Failed to connect camera stream', 'error');
            }
        } catch (err) {
            console.error('Error adding camera:', err);
            showToast('Connection error adding camera', 'error');
        }
    });

    // Journey Details Modal Controls
    const journeyModal = document.getElementById('journey-modal');
    const closeJourneyBtn = document.getElementById('btn-close-modal');
    const closeJourneyFooterBtn = document.getElementById('btn-close-modal-footer');
    const hideJourneyModal = () => journeyModal.classList.remove('show');
    closeJourneyBtn.addEventListener('click', hideJourneyModal);
    closeJourneyFooterBtn.addEventListener('click', hideJourneyModal);

    // Export single person report
    document.getElementById('btn-export-single-person').addEventListener('click', () => {
        if (selectedPersonId) {
            window.location.href = `/api/export/csv?person_id=${selectedPersonId}`;
        }
    });

    // Search filter
    const searchInput = document.getElementById('person-search-input');
    searchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        filterPersonsTable(q);
    });
}

// Video Upload Drag-and-Drop and File Selection
function setupUploadHandlers() {
    const dropzone = document.getElementById('upload-dropzone');
    const browseBtn = document.getElementById('btn-browse-file');
    const modalFileInput = document.getElementById('modal-file-input');
    const selectedFileName = document.getElementById('selected-file-name');
    const submitUploadBtn = document.getElementById('btn-submit-upload');
    const uploadForm = document.getElementById('upload-camera-form');

    browseBtn.addEventListener('click', () => modalFileInput.click());
    dropzone.addEventListener('click', (e) => {
        if (e.target !== browseBtn) modalFileInput.click();
    });

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelection(e.dataTransfer.files[0]);
        }
    });

    modalFileInput.addEventListener('change', () => {
        if (modalFileInput.files && modalFileInput.files.length > 0) {
            handleFileSelection(modalFileInput.files[0]);
        }
    });

    function handleFileSelection(file) {
        selectedModalFile = file;
        selectedFileName.textContent = `📁 ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
        selectedFileName.style.display = 'inline-block';
        submitUploadBtn.removeAttribute('disabled');
    }

    // Modal Upload Form Submission
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedModalFile) return;

        const targetCam = document.getElementById('upload-target-select').value;
        const customName = document.getElementById('upload-cam-name').value.trim();

        const formData = new FormData();
        formData.append('file', selectedModalFile);
        if (targetCam !== 'new') {
            formData.append('camera_id', targetCam);
        }
        if (customName) {
            formData.append('camera_name', customName);
        }

        const progressContainer = document.getElementById('upload-progress-container');
        const progressBar = document.getElementById('upload-progress-bar');
        const progressStatus = document.getElementById('upload-progress-status');

        progressContainer.style.display = 'block';
        progressBar.style.width = '45%';
        progressStatus.textContent = 'Uploading video file...';
        submitUploadBtn.setAttribute('disabled', 'true');

        try {
            const res = await fetch('/api/cameras/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            progressBar.style.width = '100%';
            progressStatus.textContent = 'Upload complete! Starting stream...';

            setTimeout(() => {
                document.getElementById('add-camera-modal').classList.remove('show');
                uploadForm.reset();
                selectedModalFile = null;
                selectedFileName.style.display = 'none';
                progressContainer.style.display = 'none';
                progressBar.style.width = '0%';
                submitUploadBtn.removeAttribute('disabled');
                showToast(data.message || 'Video stream loaded successfully!');
                fetchCameras();
            }, 800);

        } catch (err) {
            console.error('Error uploading video:', err);
            progressStatus.textContent = 'Upload failed. Check server logs.';
            submitUploadBtn.removeAttribute('disabled');
        }
    });

    // Hidden direct camera replacement uploader
    const directUploader = document.getElementById('camera-file-uploader');
    directUploader.addEventListener('change', async () => {
        if (!directUploader.files || directUploader.files.length === 0 || !quickUploadTargetCamId) {
            return;
        }
        const file = directUploader.files[0];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('camera_id', quickUploadTargetCamId);

        showToast(`Uploading ${file.name} to ${quickUploadTargetCamId}...`);

        try {
            const res = await fetch('/api/cameras/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            showToast(data.message || 'Video stream updated!');
            
            // Reload stream
            setTimeout(() => {
                const img = document.querySelector(`#card-${quickUploadTargetCamId} .camera-stream-img`);
                if (img) {
                    img.src = `/video_feed/${quickUploadTargetCamId}?t=${Date.now()}`;
                }
                fetchCameras();
            }, 600);
        } catch (err) {
            console.error('Error uploading video to camera:', err);
            showToast('Failed to upload video', 'error');
        } finally {
            directUploader.value = '';
            quickUploadTargetCamId = null;
        }
    });
}

// Quick Upload Button trigger from camera card
window.triggerQuickUpload = function(camId, camName) {
    quickUploadTargetCamId = camId;
    const uploader = document.getElementById('camera-file-uploader');
    uploader.click();
};

function populateUploadCameraSelect() {
    const select = document.getElementById('upload-target-select');
    select.innerHTML = '<option value="new">+ Create New Camera Feed</option>';
    currentCameras.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `Replace: ${c.name} (${c.location || c.id})`;
        select.appendChild(opt);
    });
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast-notification');
    toast.textContent = `✓ ${message}`;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3800);
}

// Fetch Cameras and Render Feeds
async function fetchCameras() {
    try {
        const res = await fetch('/api/cameras');
        const data = await res.json();
        currentCameras = data.cameras || [];
        renderCameraGrid(currentCameras);
    } catch (err) {
        console.error('Error fetching cameras:', err);
    }
}

function renderCameraGrid(cameras) {
    const container = document.getElementById('cctv-grid-container');
    container.innerHTML = '';

    cameras.forEach(cam => {
        const card = document.createElement('div');
        card.className = 'camera-card';
        card.id = `card-${cam.id}`;

        card.innerHTML = `
            <div class="camera-card-header">
                <div class="camera-title-group">
                    <span class="telemetry-dot live"></span>
                    <div>
                        <div class="camera-name">${escapeHtml(cam.name)}</div>
                        <div class="camera-loc">${escapeHtml(cam.location)}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button class="btn-quick-upload" title="Upload video file to this camera feed" onclick="triggerQuickUpload('${cam.id}', '${escapeHtml(cam.name)}')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                        Upload Video
                    </button>
                    <span class="status-badge" id="badge-${cam.id}">REC // ${cam.fps || 15} FPS</span>
                </div>
            </div>
            <div class="camera-video-wrapper">
                <img class="camera-stream-img" src="/video_feed/${cam.id}" alt="${escapeHtml(cam.name)}" loading="lazy">
                <div class="camera-feed-overlay-tag" id="tag-${cam.id}">
                    ACTIVE TARGETS: ${cam.active_persons_count || 0}
                </div>
            </div>
        `;

        container.appendChild(card);
    });

    document.getElementById('stat-cameras-count').textContent = cameras.length;
}

// Fetch System Status Metrics
async function fetchSystemStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        document.getElementById('stat-cameras-count').textContent = data.total_cameras || 0;
        document.getElementById('stat-active-count').textContent = data.currently_under_cctv_count || 0;
        document.getElementById('stat-total-persons').textContent = data.total_unique_persons_tracked || 0;
    } catch (err) {
        console.error('Error fetching status:', err);
    }
}

// Fetch Persons Currently Under CCTV
async function fetchActiveUnderCctv() {
    try {
        const res = await fetch('/api/active-cctv');
        const data = await res.json();
        renderActivePersons(data.persons || []);
        document.getElementById('stat-active-count').textContent = data.count || 0;
        document.getElementById('live-active-badge').textContent = `${data.count || 0} Active`;
    } catch (err) {
        console.error('Error fetching active persons:', err);
    }
}

function renderActivePersons(persons) {
    const container = document.getElementById('active-persons-container');

    if (!persons || persons.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📡</div>
                <p>No persons currently in camera field of view.</p>
                <span>Persons will appear here automatically when detected by any CCTV.</span>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    persons.forEach(p => {
        const card = document.createElement('div');
        card.className = 'active-person-card';
        card.onclick = () => openJourneyModal(p.person_id);

        const faceImg = p.face_snapshot 
            ? `<img src="${p.face_snapshot}" alt="Face of ${p.person_id}">`
            : (p.body_snapshot ? `<img src="${p.body_snapshot}" alt="Body of ${p.person_id}">` : `<div class="placeholder-avatar">👤</div>`);

        const dwellSeconds = Math.max(1, Math.round(p.camera_duration_seconds || 1));
        const formattedDwell = formatDuration(dwellSeconds);

        card.innerHTML = `
            <div class="person-avatar-box">
                ${faceImg}
            </div>
            <div class="person-card-info">
                <div class="person-card-top">
                    <span class="person-card-id">${escapeHtml(p.person_id)}</span>
                    <span class="pulse-badge"><span class="telemetry-dot pulse"></span> LIVE UNDER CCTV</span>
                </div>
                <div class="person-card-camera">
                    📍 ${escapeHtml(p.current_camera_name || 'Surveillance Feed')}
                </div>
                <div class="person-card-dwell">
                    ⏱️ Dwell Time: <strong>${formattedDwell}</strong>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

// Fetch All Registered Persons
async function fetchAllPersons() {
    try {
        const res = await fetch('/api/persons');
        const data = await res.json();
        allPersonsData = data.persons || [];
        const searchVal = document.getElementById('person-search-input').value.toLowerCase().trim();
        filterPersonsTable(searchVal);
    } catch (err) {
        console.error('Error fetching all persons:', err);
    }
}

function filterPersonsTable(query) {
    const tbody = document.getElementById('persons-table-body');
    const filtered = allPersonsData.filter(p => {
        if (!query) return true;
        return p.person_id.toLowerCase().includes(query) ||
               (p.current_camera_name && p.current_camera_name.toLowerCase().includes(query));
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">
                    No person records found matching criteria.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(p => {
        const tr = document.createElement('tr');

        const thumb = p.face_snapshot || p.body_snapshot;
        const thumbHtml = thumb 
            ? `<img class="table-thumbnail" src="${thumb}" alt="${p.person_id}">`
            : `<div class="table-thumbnail" style="display:flex;align-items:center;justify-content:center;">👤</div>`;

        const isUnderCctv = (p.status === 'UNDER_CCTV');
        const statusBadge = isUnderCctv
            ? `<span class="status-tag-active">● UNDER CCTV (${escapeHtml(p.current_camera_name || 'Active')})</span>`
            : `<span class="status-tag-exited">DEPARTED</span>`;

        tr.innerHTML = `
            <td class="table-person-id">${escapeHtml(p.person_id)}</td>
            <td>${thumbHtml}</td>
            <td>${statusBadge}</td>
            <td>${escapeHtml(p.first_seen || '-')}</td>
            <td>${escapeHtml(p.last_seen || '-')}</td>
            <td><span class="status-badge">${p.cameras_count || 1} Camera(s)</span></td>
            <td>
                <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.78rem;" onclick="openJourneyModal('${p.person_id}')">
                    Inspect Journey ➔
                </button>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

// Open and Render Journey Modal
async function openJourneyModal(personId) {
    selectedPersonId = personId;
    const modal = document.getElementById('journey-modal');
    modal.classList.add('show');

    document.getElementById('modal-person-title').textContent = `${personId} — Cross-Camera Journey`;

    try {
        const res = await fetch(`/api/persons/${personId}/journey`);
        if (!res.ok) return;
        const data = await res.json();
        renderJourneyDetails(data);
    } catch (err) {
        console.error('Error fetching journey:', err);
    }
}

function renderJourneyDetails(data) {
    const person = data.person;
    const sightings = data.sightings || [];

    // Update status badge
    const statusBadge = document.getElementById('modal-person-status');
    if (person.status === 'UNDER_CCTV') {
        statusBadge.className = 'status-tag-active';
        statusBadge.textContent = `● CURRENTLY UNDER CCTV (${person.current_camera_name})`;
    } else {
        statusBadge.className = 'status-tag-exited';
        statusBadge.textContent = 'DEPARTED / EXITED COVERAGE';
    }

    // Render Banner with Face & Body snapshots
    const banner = document.getElementById('modal-subject-banner');
    const faceImg = person.face_snapshot ? `<img src="${person.face_snapshot}" alt="Face">` : '<div class="table-thumbnail" style="width:72px;height:84px;display:flex;align-items:center;justify-content:center;">👤</div>';
    const bodyImg = person.body_snapshot ? `<img src="${person.body_snapshot}" alt="Body">` : '<div class="table-thumbnail" style="width:72px;height:84px;display:flex;align-items:center;justify-content:center;">🧍</div>';

    let totalDuration = 0;
    sightings.forEach(s => { totalDuration += (s.duration_seconds || 0); });

    banner.innerHTML = `
        <div class="snapshots-duo">
            <div class="snapshot-box">
                ${faceImg}
                <span>FACE SCAN</span>
            </div>
            <div class="snapshot-box">
                ${bodyImg}
                <span>FULL BODY</span>
            </div>
        </div>
        <div class="summary-meta-grid">
            <div class="meta-item">
                <div class="meta-label">Subject ID</div>
                <div class="meta-val">${escapeHtml(person.person_id)}</div>
            </div>
            <div class="meta-item">
                <div class="meta-label">Current Status</div>
                <div class="meta-val" style="color: ${person.status === 'UNDER_CCTV' ? 'var(--accent-emerald)' : 'var(--text-muted)'};">
                    ${escapeHtml(person.status)}
                </div>
            </div>
            <div class="meta-item">
                <div class="meta-label">Initial Detection</div>
                <div class="meta-val">${escapeHtml(person.first_seen)}</div>
            </div>
            <div class="meta-item">
                <div class="meta-label">Total Surveillance Dwell</div>
                <div class="meta-val" style="color: var(--accent-cyan);">${formatDuration(Math.round(totalDuration))}</div>
            </div>
        </div>
    `;

    // Render Step-by-Step Spatio-Temporal Timeline
    const timelineContainer = document.getElementById('modal-timeline-container');
    timelineContainer.innerHTML = '';

    if (sightings.length === 0) {
        timelineContainer.innerHTML = '<p style="color: var(--text-muted);">No camera transitions recorded yet.</p>';
        return;
    }

    sightings.forEach((s, idx) => {
        const step = document.createElement('div');
        const isActive = (s.is_active === 1);
        step.className = `timeline-step ${isActive ? 'active-step' : ''}`;

        const durationStr = formatDuration(Math.round(s.duration_seconds || 1));
        const statusLabel = isActive ? '● CURRENTLY HERE (UNDER CCTV)' : 'COMPLETED INTERVAL';

        step.innerHTML = `
            <div class="timeline-node-dot"></div>
            <div class="timeline-step-header">
                <div class="step-camera-name">
                    <span>${idx + 1}.</span> 📹 ${escapeHtml(s.camera_name)}
                </div>
                <span class="step-interval-badge" style="${isActive ? 'background: rgba(16,185,129,0.2); color: var(--accent-emerald);' : ''}">
                    ${statusLabel}
                </span>
            </div>
            <div class="timeline-step-times">
                <div class="time-from-to">
                    From: <span>${escapeHtml(s.start_time)}</span> ➔ To: <span>${escapeHtml(s.end_time)}</span>
                </div>
                <div class="time-dwell">
                    Duration: <span>${durationStr}</span>
                </div>
            </div>
        `;

        timelineContainer.appendChild(step);
    });
}

function formatDuration(seconds) {
    if (isNaN(seconds) || seconds < 1) return '1 sec';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
