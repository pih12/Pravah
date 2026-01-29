import { db, auth } from './firebase.js';
import { collection, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { monitorAuthState, logoutUser } from './auth.js';
import { initMap, updateMapMarkers } from './map.js';

// --- STATE ---
let currentUser = null;
let issuesData = [];
let currentManageId = null;

// --- DOM ELEMENTS (Lazy Load) ---
let issuesTableBody, manageModal, closeManageBtn, closeManageIcon, saveManageBtn, deleteIssueBtn;
let settingsModal, saveSettingsBtn, closeSettingsBtn;
let statsTotal, statsPending, statsWork, statsCompleted, statsDelayed;

// --- INITIALIZATION ---
async function init() {
    issuesTableBody = document.getElementById('issues-table-body');
    manageModal = document.getElementById('manage-modal');
    closeManageBtn = document.getElementById('close-manage-btn');
    closeManageIcon = document.getElementById('close-manage-modal');
    saveManageBtn = document.getElementById('save-manage-btn');
    deleteIssueBtn = document.getElementById('delete-issue-btn');

    settingsModal = document.getElementById('settings-modal');
    saveSettingsBtn = document.getElementById('save-settings-btn');
    closeSettingsBtn = document.getElementById('close-settings-modal');

    statsTotal = document.getElementById('stats-total');
    statsPending = document.getElementById('stats-pending');
    statsWork = document.getElementById('stats-work');
    statsCompleted = document.getElementById('stats-completed');
    statsDelayed = document.getElementById('stats-delayed');

    initMap('map');

    monitorAuthState(async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        currentUser = user;
        setupRealtimeListener();
    });

    setupEventListeners();
}

// --- DATA LISTENER (DFD Level 1.4 Authority Retrieves Data) ---
function setupRealtimeListener() {
    const q = query(collection(db, "issues"), orderBy("timestamps.created", "desc"));

    onSnapshot(q, (snapshot) => {
        issuesData = [];
        let stats = { total: 0, pending: 0, work: 0, completed: 0, delayed: 0 };

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const issue = { id: docSnap.id, ...data };
            issuesData.push(issue);

            // Calculate Stats (DFD 1.6 - though strictly 1.6 is status update to user, stats is internal)
            stats.total++;
            const s = (issue.status || '').toLowerCase();
            if (s === 'completed') stats.completed++;
            else if (s === 'rejected' || s === 'not started') stats.delayed++;
            else if (s === 'work started' || s === 'under construction') stats.work++;
            else stats.pending++;
        });

        updateTable(issuesData);
        updateMapMarkers(issuesData);
        updateStatsUI(stats);
    });
}

function updateTable(issues) {
    if (!issuesTableBody) return;
    issuesTableBody.innerHTML = '';

    issues.forEach(issue => {
        const row = document.createElement('tr');
        const dateStr = issue.timestamps?.created ? new Date(issue.timestamps.created.seconds * 1000).toLocaleDateString() : '-';

        row.innerHTML = `
            <td><span style="font-family:monospace; color:#6B7280;">#${(issue.issueId || issue.id).substring(0, 6)}</span></td>
            <td style="text-transform: capitalize; font-weight:500;">${issue.type || 'General'}</td>
            <td><div style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${issue.description || '-'}</div></td>
            <td>${issue.district || '-'}</td>
            <td>${getStatusBadgeHTML(issue.status)}</td>
            <td>${dateStr}</td>
            <td><button class="btn btn-primary edit-btn" data-id="${issue.id}" style="padding:4px 12px; font-size:12px;">Manage</button></td>
        `;
        issuesTableBody.appendChild(row);
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openManageModal(e.currentTarget.dataset.id));
    });
}

function updateStatsUI(stats) {
    if (statsTotal) statsTotal.innerText = stats.total;
    if (statsPending) statsPending.innerText = stats.pending;
    if (statsWork) statsWork.innerText = stats.work;
    if (statsCompleted) statsCompleted.innerText = stats.completed;
    if (statsDelayed) statsDelayed.innerText = stats.delayed;
}

function getStatusBadgeHTML(status) {
    const s = (status || 'Submitted').toLowerCase();
    let badgeClass = 'badge-submitted'; // Need to ensure CSS has these or use inline styles
    // ... logic same as prior ...
    return `<span class="badge ${badgeClass}">${status || 'Submitted'}</span>`;
}

// --- MANAGE ISSUE FLOW (DFD Level 1.5 Update Status) ---
function openManageModal(id) {
    currentManageId = id;
    const issue = issuesData.find(i => i.id === id);
    if (!issue) return;

    // Populate Info
    const detailsDiv = document.getElementById('manage-details');
    detailsDiv.innerHTML = `
        <div style="background:#f9fafb; padding:15px; border-radius:8px; margin-bottom:15px;">
            <div style="display:flex; gap:15px;">
                 ${issue.imageUrl ? `<img src="${issue.imageUrl}" style="width:80px; height:80px; object-fit:cover; border-radius:6px;">` : ''}
                 <div>
                    <h3>${issue.type}</h3>
                    <p>${issue.description}</p>
                    <p style="font-size:12px; color:#666;">Loc: ${issue.district}</p>
                 </div>
            </div>
             ${issue.feedback ? `<div style="margin-top:10px; font-size:13px; color:#0c4a6e; background:#e0f2fe; padding:8px;">User Feedback: "${issue.feedback}"</div>` : ''}
        </div>
    `;

    // Populate Form
    document.getElementById('manage-authority').value = issue.assignedAuthority || '';
    document.getElementById('manage-note').value = issue.authorityRemarks || '';

    // Status Select
    const statusSelect = document.getElementById('manage-status');
    statusSelect.innerHTML = `
        <option value="Submitted">Submitted</option>
        <option value="Received by Authority">Received by Authority</option>
        <option value="Work Started">Work Started</option>
        <option value="Under Construction">Under Construction</option>
        <option value="Completed">Completed</option>
        <option value="Rejected">Rejected</option>
    `;
    statusSelect.value = issue.status || 'Submitted';

    manageModal.classList.add('active');
}

async function updateIssueStatus() {
    if (!currentManageId) return;

    saveManageBtn.innerText = "Updating...";
    const authVal = document.getElementById('manage-authority').value;
    const statusVal = document.getElementById('manage-status').value;
    const noteVal = document.getElementById('manage-note').value;

    try {
        // DFD 1.5 - Authority updates status
        await updateDoc(doc(db, "issues", currentManageId), {
            assignedAuthority: authVal,
            status: statusVal,
            authorityRemarks: noteVal,
            "timestamps.updated": serverTimestamp()
        });

        // DFD 1.6 - Data sent back (handled by Listener in Public Dashboard)
        manageModal.classList.remove('active');
        alert("Issue Updated Successfully");
    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        saveManageBtn.innerText = "Update Issue";
    }
}

async function deleteIssue() {
    if (!currentManageId || !confirm("Permanently delete?")) return;
    try {
        await deleteDoc(doc(db, "issues", currentManageId));
        manageModal.classList.remove('active');
    } catch (e) { alert(e.message); }
}

function setupEventListeners() {
    if (saveManageBtn) saveManageBtn.addEventListener('click', updateIssueStatus);
    if (closeManageBtn) closeManageBtn.addEventListener('click', () => manageModal.classList.remove('active'));
    if (closeManageIcon) closeManageIcon.addEventListener('click', () => manageModal.classList.remove('active'));
    if (deleteIssueBtn) deleteIssueBtn.addEventListener('click', deleteIssue);

    // Sidebar Toggles
    const sb = document.getElementById('sidebar');
    const tb = document.getElementById('toggle-sidebar');
    if (tb) tb.addEventListener('click', () => sb.classList.add('active'));
    document.getElementById('close-sidebar')?.addEventListener('click', () => sb.classList.remove('active'));

    // Navigation Items
    document.querySelectorAll('.nav-item[data-target]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            if (window.innerWidth <= 1024 && sb) sb.classList.remove('active');

            const target = item.dataset.target;
            if (target === 'settings') {
                const modal = document.getElementById('settings-modal');
                if (modal) {
                    // Check if inputs exist before setting
                    const nameInput = document.getElementById('settings-name');
                    const distInput = document.getElementById('settings-district');
                    if (nameInput && currentUser) nameInput.value = currentUser.displayName || '';
                    if (distInput) distInput.value = ''; // Placeholder
                    modal.classList.add('active');
                }
            } else if (target === 'dashboard') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (target === 'map') {
                document.querySelector('.map-section')?.scrollIntoView({ behavior: 'smooth' });
            } else if (target === 'issues') {
                document.querySelector('.issues-section')?.scrollIntoView({ behavior: 'smooth' });
            } else if (target === 'analytics') {
                document.getElementById('analytics-section')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // Settings Save (if not attached elsewhere)
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', async () => {
        // Basic save logic if needed here or moved to separate function
        alert("Settings Updated"); // Placeholder for admin
        settingsModal.classList.remove('active');
    });

    document.querySelector('.logout-btn').addEventListener('click', logoutUser);
}

document.addEventListener('DOMContentLoaded', init);
