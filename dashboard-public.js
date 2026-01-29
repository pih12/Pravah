import { db, auth } from './firebase.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { monitorAuthState, logoutUser } from './auth.js';
import { uploadImageToCloudinary } from './cloudinary.js';
import { initMap, updateMapMarkers } from './map.js';

// --- STATE ---
let currentUser = null;
let currentUserData = null;
let issuesData = [];
let uploadFile = null;

// --- DOM ELEMENTS (Lazy Load) ---
let sidebar, toggleSidebarBtn, closeSidebarBtn;
let userNameEl, userRoleEl;
let newReportBtn, reportModal, closeReportBtn, cancelReportBtn, reportForm, fileInput, dropZone, imagePreview, saveReportBtn;
let manageModal, closeManageBtn, closeManageIcon;
let settingsModal, saveSettingsBtn;


// --- INITIALIZATION ---
async function init() {
    // Select DOM Elements NOW that DOM is ready
    sidebar = document.querySelector('.sidebar');
    toggleSidebarBtn = document.getElementById('toggle-sidebar');
    closeSidebarBtn = document.getElementById('close-sidebar');

    userNameEl = document.querySelector('.user-name');
    userRoleEl = document.querySelector('.user-role');

    newReportBtn = document.getElementById('new-report-btn');
    reportModal = document.getElementById('report-modal');
    closeReportBtn = document.getElementById('close-modal');
    cancelReportBtn = document.getElementById('cancel-btn');
    reportForm = document.getElementById('report-form');
    fileInput = document.getElementById('file-input');
    dropZone = document.getElementById('drop-zone');
    imagePreview = document.getElementById('image-preview');
    saveReportBtn = document.getElementById('save-report-btn');

    // Explicitly check if the report button exists for debugging
    if (!document.getElementById('new-report-btn')) console.error("CRITICAL: New Report Button not found in DOM");

    manageModal = document.getElementById('manage-modal');
    closeManageBtn = document.getElementById('close-manage-btn');
    closeManageIcon = document.getElementById('close-manage-modal');

    settingsModal = document.getElementById('settings-modal');
    saveSettingsBtn = document.getElementById('save-settings-btn');

    initMap('map');

    monitorAuthState(async (user, userData) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        currentUser = user;
        // Fallback for missing user data
        if (!userData) {
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                userData = userDoc.exists() ? userDoc.data() : null;
            } catch (e) { console.warn("DB Fetch failed", e); }
        }
        if (!userData && sessionStorage.getItem('temp_user_data')) {
            userData = JSON.parse(sessionStorage.getItem('temp_user_data'));
        }

        currentUserData = userData || { role: 'public', name: user.email.split('@')[0] };
        updateUserUI();
        setupRealtimeListener();
    });

    setupEventListeners();
}

function updateUserUI() {
    if (userNameEl) userNameEl.innerText = currentUserData.name || 'Citizen';
    if (userRoleEl) userRoleEl.innerText = 'Public Citizen';
}

// --- DATA LISTENER (REAL TIME UPDATES) ---
function setupRealtimeListener() {
    // Public: Filter to show all issues? Or only mine? DFD says "Issue Data" flowing back.
    // Usually public dashboards show "Community Reports" (all) + "My Reports".
    // For now, fetching ALL to populate Map and List.
    const q = query(collection(db, "issues"), orderBy("timestamps.created", "desc"));

    onSnapshot(q, (snapshot) => {
        issuesData = [];
        snapshot.forEach(docSnap => {
            issuesData.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Render Cards
        renderPublicCards(issuesData);
        updateMapMarkers(issuesData);
    });
}

function renderPublicCards(issues) {
    const cardContainer = document.querySelector('.issues-table tbody'); // We will replace this container or use a new one
    // Actually, in dashboard.js we dynamically replaced the table. Let's do it cleaner here.

    // Check if grid exists, if not create/use it.
    let grid = document.getElementById('public-issues-grid');
    const tableResp = document.querySelector('.table-responsive');

    if (tableResp) tableResp.style.display = 'none'; // Hide table structure

    if (!grid) {
        grid = document.createElement('div');
        grid.id = 'public-issues-grid';
        grid.className = 'stats-grid';
        grid.style.marginTop = '20px';
        document.querySelector('.issues-section').appendChild(grid);
    }

    grid.innerHTML = '';
    const displayIssues = issues.slice(0, 50); // Limit to 50

    displayIssues.forEach(issue => {
        const dateStr = issue.timestamps?.created ? new Date(issue.timestamps.created.seconds * 1000).toLocaleDateString() : 'Just now';

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div style="height:150px; background:#f3f4f6; position:relative; overflow:hidden; border-radius:8px 8px 0 0;">
                ${issue.imageUrl
                ? `<img src="${issue.imageUrl}" style="width:100%; height:100%; object-fit:cover;">`
                : `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#9ca3af; font-size:30px;"><i class="fa-solid fa-image"></i></div>`}
                <div style="position:absolute; top:10px; right:10px;">
                    ${getStatusBadgeHTML(issue.status)}
                </div>
            </div>
            <div style="padding:15px;">
                <h3 style="font-size:16px; font-weight:600; margin-bottom:8px; text-transform:capitalize;">${issue.type || 'Civic Issue'}</h3>
                <p style="color:#6b7280; font-size:14px; margin-bottom:12px; height:40px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${issue.description || 'No description provided.'}</p>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#4b5563;">
                    <span><i class="fa-solid fa-location-dot"></i> ${issue.district || 'Unknown'}</span>
                    <span><i class="fa-regular fa-clock"></i> ${dateStr}</span>
                </div>
                <button class="btn btn-secondary view-btn" data-id="${issue.id}" style="width:100%; margin-top:16px; font-size:13px; padding:8px;">View Details</button>
            </div>
        `;
        grid.appendChild(card);
    });

    grid.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openManageModal(e.currentTarget.dataset.id));
    });
}

function getStatusBadgeHTML(status) {
    const s = (status || 'Submitted').toLowerCase();
    let badgeClass = 'badge-submitted';
    if (s === 'completed') badgeClass = 'badge-completed';
    else if (s === 'work started' || s === 'under construction') badgeClass = 'badge-work';
    else if (s === 'rejected' || s === 'not started') badgeClass = 'badge-rejected';
    else if (s === 'received by authority') badgeClass = 'badge-received';

    // Style tweaks for inline usage if class missing
    let style = "padding:4px 12px; border-radius:20px; font-size:12px; font-weight:500; background:white; box-shadow:0 2px 4px rgba(0,0,0,0.1);";
    if (s === 'completed') style += "color:#10b981;";
    else if (s === 'submitted') style += "color:#f59e0b;";

    return `<span class="badge ${badgeClass}" style="${style}">${status || 'Submitted'}</span>`;
}

// --- SUBMIT ISSUE FLOW (Level 1 DFD: 1.1 -> 1.2 -> 1.3) ---
async function submitReport(e) {
    e.preventDefault();
    const type = document.getElementById('issue-type').value;
    const locationName = document.getElementById('issue-location').value;
    const desc = document.getElementById('issue-desc').value;
    const feedback = document.getElementById('issue-feedback').value;

    if (!locationName || !desc) return alert("Please fill all required fields.");

    saveReportBtn.innerText = "Processing...";
    saveReportBtn.disabled = true;

    try {
        // 1.2 Image to Cloudinary
        let imageUrl = "";
        if (uploadFile) {
            saveReportBtn.innerText = "Uploading Image...";
            imageUrl = await uploadImageToCloudinary(uploadFile);
        }

        // GPS Fallback
        let lat = sessionStorage.getItem('current_lat') || (22.3072 + (Math.random() - 0.5) * 0.1);
        let lng = sessionStorage.getItem('current_lng') || (73.1812 + (Math.random() - 0.5) * 0.1);

        // 1.3 Store in Firebase
        saveReportBtn.innerText = "Saving to Database...";
        await addDoc(collection(db, "issues"), {
            issueId: Date.now().toString(),
            reporterId: currentUser.uid,
            description: desc,
            type: type,
            feedback: feedback,
            imageUrl: imageUrl,
            district: locationName,
            gps: { lat, lng },
            status: "Submitted", // Initial Status
            timestamps: { created: serverTimestamp(), updated: serverTimestamp() }
        });

        alert("Report Submitted Successfully!");
        closeReportModalFn();

    } catch (e) {
        console.error(e);
        alert("Error: " + e.message);
    } finally {
        saveReportBtn.innerText = "Submit Report";
        saveReportBtn.disabled = false;
    }
}

// --- MODALS & EVENTS ---
function openReportModalFn() {
    reportModal.classList.add('active');
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            sessionStorage.setItem('current_lat', pos.coords.latitude);
            sessionStorage.setItem('current_lng', pos.coords.longitude);
        });
    }
}

function closeReportModalFn() {
    reportModal.classList.remove('active');
    reportForm.reset();
    imagePreview.style.display = 'none';
    uploadFile = null;
}

function openManageModal(id) {
    const issue = issuesData.find(i => i.id === id);
    if (!issue) return;

    // Populate Read-Only Details
    const detailsDiv = document.getElementById('manage-details');
    detailsDiv.innerHTML = `
        <div style="background:#f9fafb; padding:15px; border-radius:8px;">
             <div style="display:flex; gap:15px; margin-bottom:10px;">
                ${issue.imageUrl ? `<img src="${issue.imageUrl}" style="width:100px; height:100px; object-fit:cover; border-radius:6px;">` : ''}
                <div>
                    <h3 style="font-size:16px; font-weight:600; text-transform:capitalize;">${issue.type || 'Issue'}</h3>
                    <p style="font-size:14px; margin-top:5px;">${issue.description}</p>
                </div>
            </div>
            <div class="form-group" style="margin-top:10px;">
                <label class="form-label" style="font-size:12px;">Assigned Authority</label>
                <div class="form-control" style="background:#f3f4f6;">${issue.assignedAuthority || 'Pending Assignment'}</div>
            </div>
            <div class="form-group">
                <label class="form-label" style="font-size:12px;">Status</label>
                <div class="form-control" style="background:#f3f4f6;">${issue.status || 'Submitted'}</div>
            </div>
            <div class="form-group">
                <label class="form-label" style="font-size:12px;">Official Remarks</label>
                <div class="form-control" style="background:#f3f4f6; min-height:60px;">${issue.authorityRemarks || 'No remarks yet.'}</div>
            </div>
        </div>
    `;
    manageModal.classList.add('active');
}

function setupEventListeners() {
    if (newReportBtn) newReportBtn.addEventListener('click', openReportModalFn);
    if (closeReportBtn) closeReportBtn.addEventListener('click', closeReportModalFn);
    if (cancelReportBtn) cancelReportBtn.addEventListener('click', closeReportModalFn);
    if (saveReportBtn) saveReportBtn.addEventListener('click', submitReport);

    if (closeManageBtn) closeManageBtn.addEventListener('click', () => manageModal.classList.remove('active'));
    if (closeManageIcon) closeManageIcon.addEventListener('click', () => manageModal.classList.remove('active'));

    // File Upload Logic
    if (dropZone) {
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                const file = e.target.files[0];
                if (!file.type.startsWith('image/')) return;
                uploadFile = file;
                const reader = new FileReader();
                reader.onload = (ev) => { imagePreview.src = ev.target.result; imagePreview.style.display = 'block'; };
                reader.readAsDataURL(file);
            }
        });
    }

    // Sidebar
    if (toggleSidebarBtn) toggleSidebarBtn.addEventListener('click', () => sidebar.classList.add('active'));
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('active'));

    // Navigation Items
    document.querySelectorAll('.nav-item[data-target]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            // Active Class Toggle
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Close Sidebar on Mobile
            if (window.innerWidth <= 1024 && sidebar) {
                sidebar.classList.remove('active');
            }

            const target = item.dataset.target;

            // Navigation Actions
            if (target === 'settings') {
                const modal = document.getElementById('settings-modal');
                if (modal) {
                    // Pre-fill if needed
                    if (document.getElementById('settings-name')) document.getElementById('settings-name').value = currentUserData.name || '';
                    if (document.getElementById('settings-district')) document.getElementById('settings-district').value = currentUserData.district || '';
                    modal.classList.add('active');
                }
            } else if (target === 'dashboard') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (target === 'map') {
                document.querySelector('.map-section')?.scrollIntoView({ behavior: 'smooth' });
            } else if (target === 'issues') {
                document.querySelector('.issues-section')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // Settings
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', async () => {
        // Simple profile update for Public
        const name = document.getElementById('settings-name').value;
        const district = document.getElementById('settings-district').value;
        await updateDoc(doc(db, "users", currentUser.uid), { name, district });
        currentUserData.name = name;
        updateUserUI();
        settingsModal.classList.remove('active');
    });

    document.querySelector('.logout-btn').addEventListener('click', logoutUser);
}

document.addEventListener('DOMContentLoaded', init);
