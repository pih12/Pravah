import { db, auth } from './firebase.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { monitorAuthState, logoutUser } from './auth.js';
import { uploadImageToCloudinary } from './cloudinary.js';
import { initMap, updateMapMarkers } from './map.js';

// --- STATE ---
let currentUser = null;
let currentUserData = null; // Role, etc.
let issuesData = [];
let uploadFile = null;

// --- DOM ELEMENTS ---
// Nav
// Nav
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
const closeSidebarBtn = document.getElementById('close-sidebar');
const userRoleEl = document.querySelector('.user-role');
const userNameEl = document.querySelector('.user-name');
const logoutBtns = document.querySelectorAll('.logout-btn');

// Dashboard
const statsGrid = document.querySelector('.stats-grid');
const issuesTableSection = document.querySelector('.issues-section');
const issuesTableBody = document.getElementById('issues-table-body');
const newReportBtn = document.getElementById('new-report-btn');

// Stats Elements
const statsTotal = document.getElementById('stats-total');
const statsPending = document.getElementById('stats-pending');
const statsWork = document.getElementById('stats-work');
const statsCompleted = document.getElementById('stats-completed');
const statsDelayed = document.getElementById('stats-delayed');

// Report Modal
const reportModal = document.getElementById('report-modal');
const closeReportBtn = document.getElementById('close-modal');
const cancelReportBtn = document.getElementById('cancel-btn');
const reportForm = document.getElementById('report-form');
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const imagePreview = document.getElementById('image-preview');
const saveReportBtn = document.getElementById('save-report-btn');

// Manage Modal (Admin)
const manageModal = document.getElementById('manage-modal');
const closeManageBtn = document.getElementById('close-manage-btn');
const closeManageIcon = document.getElementById('close-manage-modal');
const saveManageBtn = document.getElementById('save-manage-btn');
const deleteIssueBtn = document.getElementById('delete-issue-btn');
let currentManageId = null;

// Settings Modal
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const closeSettingsIcon = document.getElementById('close-settings-modal');
const saveSettingsBtn = document.getElementById('save-settings-btn');

// --- INITIALIZATION ---
async function init() {
    initMap('map');

    monitorAuthState(async (user, userData) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        currentUser = user;

        // 1. Try Firestore Data
        if (!userData) {
            // Retry fetch...
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                userData = userDoc.exists() ? userDoc.data() : null;
            } catch (e) { console.warn("DB Fetch failed", e); }
        }

        // 2. Fallback to Local Session if DB failed
        if (!userData) {
            const localData = sessionStorage.getItem('temp_user_data');
            if (localData) {
                userData = JSON.parse(localData);
                console.log("Using Local Session Data:", userData);
            }
        }

        currentUserData = userData || { role: 'public' };
        console.log("Logged in as:", currentUser.email, "| Role:", currentUserData.role);

        updateUserUI();
        setupRealtimeListener();
    });

    setupEventListeners();
}

// --- UI UPDATES ---
function updateUserUI() {
    // Update Sidebar User Info
    if (userNameEl) userNameEl.innerText = currentUserData.name || currentUser.email.split('@')[0];
    if (userRoleEl) userRoleEl.innerText = getRoleLabel(currentUserData.role);

    // Toggle Admin Elements based on PAGE_ROLE (HTML file type) primarily
    // This fixes the issue where slow profile fetch (defaulting to public) hides admin UI on the admin page
    const pageRole = window.PAGE_ROLE || 'public';
    const isPageAdmin = pageRole === 'admin' || pageRole === 'ngo'; // NGO also needs some access

    // We can also double check user role, but for UI layout, rely on Page Role
    // to prevent "flickering" or empty dashboards.

    if (statsGrid) statsGrid.style.display = isPageAdmin ? 'grid' : 'none';

    // Adjust logic for 'Analytics' nav item if present
    const analyticsNav = document.querySelector('[data-target="analytics"]');
    if (analyticsNav) analyticsNav.style.display = isPageAdmin ? 'flex' : 'none';
}

function getRoleLabel(role) {
    const r = (role || '').toLowerCase();
    if (r === 'admin' || r === 'authority') return 'Authority Official';
    if (r === 'ngo') return 'NGO / Supervisor';
    return 'Citizen';
}

function isUserAdmin() {
    // For functionality checks (can I delete?), we must rely on the REAL User Data
    const role = (currentUserData.role || '').toLowerCase();
    return role === 'admin' || role === 'authority';
}

// --- DATA LISTENER ---
function setupRealtimeListener() {
    const q = query(collection(db, "issues"), orderBy("timestamps.created", "desc"));

    onSnapshot(q, (snapshot) => {
        issuesData = [];
        let stats = { total: 0, pending: 0, work: 0, completed: 0, delayed: 0 };

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const issue = { id: docSnap.id, ...data };
            issuesData.push(issue);

            // Calculate Stats
            stats.total++;
            const s = (issue.status || '').toLowerCase();

            if (s === 'completed') stats.completed++;
            else if (s === 'rejected' || s === 'not started') stats.delayed++;
            else if (s === 'work started' || s === 'under construction') stats.work++;
            else stats.pending++; // submitted, received
        });

        updateTable(issuesData);
        updateMapMarkers(issuesData);
        if (currentUserData.role === 'admin' || currentUserData.role === 'authority') {
            updateStatsUI(stats);
        }
    });
}

function updateStatsUI(stats) {
    if (statsTotal) statsTotal.innerText = stats.total;
    if (statsPending) statsPending.innerText = stats.pending;
    if (statsWork) statsWork.innerText = stats.work;
    if (statsCompleted) statsCompleted.innerText = stats.completed;
    if (statsDelayed) statsDelayed.innerText = stats.delayed;
}

// --- UI RENDERER ---
function updateTable(issues) {
    if (!issuesTableBody) return;
    issuesTableBody.innerHTML = '';

    // Sort by Date Descending
    const sortedIssues = [...issues].sort((a, b) => (b.timestamps?.created?.seconds || 0) - (a.timestamps?.created?.seconds || 0));
    const displayIssues = sortedIssues.slice(0, 50);

    const role = window.PAGE_ROLE || 'public';
    const isPublic = role === 'public';

    // PUBLIC: Card Layout
    if (isPublic) {
        // Ensure table is hidden and card container exists
        const tableWrapper = document.querySelector('.table-responsive');
        if (tableWrapper) tableWrapper.style.display = 'none';

        let cardContainer = document.getElementById('public-issues-grid');
        if (!cardContainer && tableWrapper) {
            cardContainer = document.createElement('div');
            cardContainer.id = 'public-issues-grid';
            cardContainer.className = 'stats-grid'; // Reuse grid layout
            cardContainer.style.marginTop = '20px';
            // Adjust grid columns for cards if needed in CSS, but stats-grid works fine (4 cols)
            // For smaller screens, stats-grid is responsive.
            tableWrapper.parentElement.appendChild(cardContainer);
        }

        if (cardContainer) {
            cardContainer.innerHTML = ''; // Clear
            displayIssues.forEach(issue => {
                const dateStr = issue.timestamps?.created ? new Date(issue.timestamps.created.seconds * 1000).toLocaleDateString() : 'Just now';

                const card = document.createElement('div');
                card.className = 'card issue-card-public';
                // Minimal inline style for image area
                card.innerHTML = `
                    <div style="height:150px; background:#f3f4f6; position:relative; overflow:hidden;">
                        ${issue.imageUrl
                        ? `<img src="${issue.imageUrl}" style="width:100%; height:100%; object-fit:cover;">`
                        : `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#9ca3af; font-size:30px;"><i class="fa-solid fa-image"></i></div>`}
                        <div style="position:absolute; top:10px; right:10px;">
                            ${getStatusBadgeHTML(issue.status)}
                        </div>
                    </div>
                    <div class="card-body">
                        <h3 style="font-size:16px; font-weight:600; margin-bottom:8px; text-transform:capitalize;">${issue.type || 'Civic Issue'}</h3>
                        <p style="color:#6b7280; font-size:14px; margin-bottom:12px; height:40px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${issue.description || 'No description provided.'}</p>
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#4b5563;">
                            <span><i class="fa-solid fa-location-dot"></i> ${issue.district || 'Unknown'}</span>
                            <span><i class="fa-regular fa-clock"></i> ${dateStr}</span>
                        </div>
                        
                        <button class="btn btn-secondary view-btn" data-id="${issue.id}" style="width:100%; margin-top:16px; font-size:13px; padding:8px;">
                            View Details
                        </button>
                    </div>
                `;
                cardContainer.appendChild(card);
            });

            // Listeners
            cardContainer.querySelectorAll('.view-btn').forEach(btn => {
                btn.addEventListener('click', (e) => openManageModal(e.currentTarget.dataset.id, true));
                // true = readOnly
            });
            return;
        }
    }

    // ADMIN & NGO: Table Layout
    // Ensure table is visible
    const tableWrapper = document.querySelector('.table-responsive');
    if (tableWrapper) tableWrapper.style.display = 'block';
    const cardContainer = document.getElementById('public-issues-grid');
    if (cardContainer) cardContainer.style.display = 'none';

    // Ensure header is visible
    const tableHeader = document.querySelector('.issues-table thead');
    if (tableHeader) tableHeader.style.display = 'table-header-group';

    displayIssues.forEach(issue => {
        const row = document.createElement('tr');
        const dateStr = issue.timestamps?.created ? new Date(issue.timestamps.created.seconds * 1000).toLocaleDateString() : '-';

        const actionBtn = `<button class="btn btn-primary edit-btn" data-id="${issue.id}" style="padding:4px 12px; font-size:12px;">Manage</button>`;

        row.innerHTML = `
            <td><span style="font-family:monospace; color:#6B7280;">#${(issue.issueId || issue.id).substring(0, 6)}</span></td>
            <td style="text-transform: capitalize; font-weight:500;">${issue.type || 'General'}</td>
            <td><div style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${issue.description || '-'}</div></td>
            <td>${issue.district || '-'}</td>
            <td>${getStatusBadgeHTML(issue.status)}</td>
            <td>${dateStr}</td>
            <td>${actionBtn}</td>
        `;
        issuesTableBody.appendChild(row);
    });

    // Attach Table Listeners
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openManageModal(e.currentTarget.dataset.id));
    });
}

function getStatusBadgeHTML(status) {
    const s = (status || 'Submitted').toLowerCase();
    let badgeClass = 'badge-submitted'; // Default

    if (s === 'completed') badgeClass = 'badge-completed';
    else if (s === 'work started' || s === 'under construction') badgeClass = 'badge-work';
    else if (s === 'rejected' || s === 'not started') badgeClass = 'badge-rejected';
    else if (s === 'received by authority') badgeClass = 'badge-received';

    return `<span class="badge ${badgeClass}">${status || 'Submitted'}</span>`;
}

// --- EVENT HANDLERS ---
function setupEventListeners() {
    // Logout
    // Sidebar Toggles
    if (toggleSidebarBtn) toggleSidebarBtn.addEventListener('click', () => sidebar.classList.add('active'));
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('active'));

    // Close Sidebar when clicking outside (Mobile)
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 1024 && sidebar && sidebar.classList.contains('active')) {
            if (!sidebar.contains(e.target) && !toggleSidebarBtn.contains(e.target)) {
                sidebar.classList.remove('active');
            }
        }
    });

    // Navigation Items
    document.querySelectorAll('.nav-item[data-target]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            // UI Active State
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Close sidebar on mobile selection
            if (window.innerWidth <= 1024 && sidebar) {
                sidebar.classList.remove('active');
            }

            const target = item.dataset.target;

            // Navigation Logic
            if (target === 'settings') {
                openSettingsModal();
            } else if (target === 'dashboard') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (target === 'map') {
                document.querySelector('.map-section')?.scrollIntoView({ behavior: 'smooth' });
            } else if (target === 'issues') {
                document.querySelector('.issues-section')?.scrollIntoView({ behavior: 'smooth' });
            } else if (target === 'analytics') {
                const analytics = document.getElementById('analytics-section');
                if (analytics && analytics.style.display !== 'none') {
                    analytics.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    });

    // Logout
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.innerText.includes('Logout')) {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                logoutUser();
            });
        }
    });

    // Report Modal
    if (newReportBtn) newReportBtn.addEventListener('click', openReportModal);
    if (closeReportBtn) closeReportBtn.addEventListener('click', closeReportModal);
    if (cancelReportBtn) cancelReportBtn.addEventListener('click', closeReportModal);

    // File Upload
    if (dropZone) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#4F46E5'; });
        dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.borderColor = '#e2e8f0'; });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#e2e8f0';
            if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files[0]);
        });
    }
    if (fileInput) fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFileSelect(e.target.files[0]);
    });

    if (saveReportBtn) saveReportBtn.addEventListener('click', submitReport);

    // Manage Modal
    if (closeManageBtn) closeManageBtn.addEventListener('click', closeManageModalInstance);
    if (saveManageBtn) saveManageBtn.addEventListener('click', updateIssueStatus);
    if (deleteIssueBtn) deleteIssueBtn.addEventListener('click', deleteIssue);
    if (closeManageIcon) closeManageIcon.addEventListener('click', closeManageModalInstance);

    // Settings Modal
    // Settings Listener moved to general nav handler to avoid duplicates, 
    // but keeping specific close/save listeners here.
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
    if (closeSettingsIcon) closeSettingsIcon.addEventListener('click', () => settingsModal.classList.remove('active'));
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', updateProfile);
}

// --- REPORT FLOW ---
function openReportModal() {
    reportModal.classList.add('active');
    // Attempt to get location immediately
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                sessionStorage.setItem('current_lat', pos.coords.latitude);
                sessionStorage.setItem('current_lng', pos.coords.longitude);
                console.log("Location fetched:", pos.coords);
            },
            (err) => console.warn("Location error:", err),
            { enableHighAccuracy: true }
        );
    }
}

function closeReportModal() {
    reportModal.classList.remove('active');
    reportForm.reset();
    imagePreview.style.display = 'none';
    uploadFile = null;
}

function handleFileSelect(file) {
    if (!file.type.startsWith('image/')) return alert("Select an image.");
    uploadFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
        imagePreview.style.display = 'block';
    }
    reader.readAsDataURL(file);
}

async function submitReport(e) {
    e.preventDefault();
    const type = document.getElementById('issue-type').value; // mapping to description or add type
    const locationName = document.getElementById('issue-location').value;
    const desc = document.getElementById('issue-desc').value;
    const feedback = document.getElementById('issue-feedback').value;

    if (!locationName || !desc) return alert("Please fill all required fields.");

    saveReportBtn.innerText = "Processing...";
    saveReportBtn.disabled = true;

    try {
        // 1. Upload Image
        let imageUrl = "";
        if (uploadFile) {
            saveReportBtn.innerText = "Uploading Image...";
            imageUrl = await uploadImageToCloudinary(uploadFile);
        }

        // 2. Get GPS
        let lat = sessionStorage.getItem('current_lat');
        let lng = sessionStorage.getItem('current_lng');

        if (!lat || !lng) {
            // Fallback: Random near center of India or allow user to pick on map (Not implemented for brevity, using randomized near Vadodara as placeholder for demo if location off)
            lat = 22.3072 + (Math.random() - 0.5) * 0.1;
            lng = 73.1812 + (Math.random() - 0.5) * 0.1;
        }

        // 3. Save to Firestore
        saveReportBtn.innerText = "Saving...";
        await addDoc(collection(db, "issues"), {
            issueId: Date.now().toString(),
            reporterId: currentUser.uid,
            description: desc, // Using description as main text
            type: type, // Keeping type for categorization
            feedback: feedback,
            imageUrl: imageUrl,
            district: locationName,
            gps: { lat, lng },
            status: "Submitted",
            assignedAuthority: "",
            authorityRemarks: "",
            timestamps: {
                created: serverTimestamp(),
                updated: serverTimestamp()
            }
        });

        alert("Report Submitted Successfully!");
        closeReportModal();

    } catch (e) {
        console.error(e);
        alert("Error: " + e.message);
    } finally {
        saveReportBtn.innerText = "Submit Report";
        saveReportBtn.disabled = false;
    }
}

// --- ADMIN MANAGEMENT FLOW ---
function openManageModal(id, readOnly = false) {
    currentManageId = id;
    const issue = issuesData.find(i => i.id === id);
    if (!issue) return;

    // Populate Details
    const detailsDiv = document.getElementById('manage-details');
    detailsDiv.innerHTML = `
        <div style="background:#f9fafb; padding:15px; border-radius:8px;">
            <div style="display:flex; gap:15px; margin-bottom:10px;">
                ${issue.imageUrl ? `<img src="${issue.imageUrl}" style="width:100px; height:100px; object-fit:cover; border-radius:6px;">` : ''}
                <div>
                    <h3 style="font-size:16px; font-weight:600; text-transform:capitalize;">${issue.type || 'Issue'}</h3>
                    <p style="font-size:14px; margin-top:5px;">${issue.description}</p>
                    <p style="font-size:12px; color:#666; margin-top:5px;"><i class="fa-solid fa-location-dot"></i> ${issue.district}</p>
                </div>
            </div>
            ${issue.feedback ? `<div style="background:#e0f2fe; padding:8px; border-radius:4px; font-size:13px; color:#0369a1;"><strong>User Feedback:</strong> ${issue.feedback}</div>` : ''}
        </div>
    `;

    // Populate Form
    const authInput = document.getElementById('manage-authority');
    const statusSelect = document.getElementById('manage-status');
    const noteInput = document.getElementById('manage-note');

    authInput.value = issue.assignedAuthority || '';
    noteInput.value = issue.authorityRemarks || '';

    // Set Status Options properly
    statusSelect.innerHTML = `
        <option value="Submitted">Submitted</option>
        <option value="Received by Authority">Received by Authority</option>
        <option value="Work Started">Work Started</option>
        <option value="Under Construction">Under Construction</option>
        <option value="Completed">Completed</option>
        <option value="Rejected">Rejected</option>
        <option value="Not Started">Not Started</option>
    `;
    statusSelect.value = issue.status || 'Submitted';

    // Handle Read Only
    const isAdmin = isUserAdmin();
    const canEdit = isAdmin && !readOnly;

    console.log(`Opening Modal. ID: ${id}, Role: ${currentUserData.role}, ReadOnly: ${readOnly}, CanEdit: ${canEdit}`);

    authInput.disabled = !canEdit;
    statusSelect.disabled = !canEdit;
    noteInput.disabled = !canEdit;
    saveManageBtn.style.display = canEdit ? 'block' : 'none';
    deleteIssueBtn.style.display = canEdit ? 'block' : 'none';

    manageModal.classList.add('active');
}

function closeManageModalInstance() {
    manageModal.classList.remove('active');
    currentManageId = null;
}

async function updateIssueStatus() {
    if (!currentManageId) return;

    const authVal = document.getElementById('manage-authority').value;
    const statusVal = document.getElementById('manage-status').value;
    const noteVal = document.getElementById('manage-note').value;

    saveManageBtn.innerText = "Updating...";

    try {
        await updateDoc(doc(db, "issues", currentManageId), {
            assignedAuthority: authVal,
            status: statusVal,
            authorityRemarks: noteVal,
            "timestamps.updated": serverTimestamp()
        });
        alert("Updated successfully");
        closeManageModalInstance();
    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        saveManageBtn.innerText = "Update Status";
    }
}

async function deleteIssue() {
    if (!currentManageId || !confirm("Delete this report permanently?")) return;
    try {
        await deleteDoc(doc(db, "issues", currentManageId));
        closeManageModalInstance();
    } catch (e) {
        alert("Error: " + e.message);
    }
}

// --- SETTINGS FLOW ---
function openSettingsModal() {
    document.getElementById('settings-name').value = currentUserData.name || '';
    document.getElementById('settings-district').value = currentUserData.district || '';

    const pubNameInput = document.getElementById('settings-public-name');
    if (pubNameInput) pubNameInput.value = currentUserData.publicName || '';

    settingsModal.classList.add('active');
}

async function updateProfile(e) {
    e.preventDefault();
    const name = document.getElementById('settings-name').value;
    const district = document.getElementById('settings-district').value;
    const publicName = document.getElementById('settings-public-name')?.value || '';

    saveSettingsBtn.innerText = "Saving...";

    try {
        await updateDoc(doc(db, "users", currentUser.uid), {
            name, district, publicName
        });
        // Update local state temporarily to reflect immediate change
        currentUserData.name = name;
        currentUserData.district = district;
        currentUserData.publicName = publicName;
        updateUserUI();

        alert("Profile Updated");
        settingsModal.classList.remove('active');
    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        saveSettingsBtn.innerText = "Save Changes";
    }
}

// Start
document.addEventListener('DOMContentLoaded', init);
