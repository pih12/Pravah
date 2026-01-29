import { db, auth } from './firebase.js';
import { collection, query, orderBy, onSnapshot, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { monitorAuthState, logoutUser } from './auth.js';
import { initMap, updateMapMarkers } from './map.js';

let issuesData = [];

// DOM Elements (Lazy Load)
let issuesTableBody, manageModal, closeManageBtn, closeManageIcon;
let statsTotal, statsCompleted, statsPending;

// Init
async function init() {
    issuesTableBody = document.getElementById('issues-table-body');
    manageModal = document.getElementById('manage-modal');
    closeManageBtn = document.getElementById('close-manage-btn');
    closeManageIcon = document.getElementById('close-manage-modal');
    statsTotal = document.getElementById('stats-total');
    statsCompleted = document.getElementById('stats-completed');
    statsPending = document.getElementById('stats-pending');

    initMap('map');
    monitorAuthState(async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        setupRealtimeListener();
    });

    document.querySelector('.logout-btn').addEventListener('click', logoutUser);

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
                if (modal) modal.classList.add('active'); // Basic open for NGO
            } else if (target === 'dashboard') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (target === 'map') {
                document.querySelector('.map-section')?.scrollIntoView({ behavior: 'smooth' });
            } else if (target === 'issues') {
                document.querySelector('.issues-section')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // Manage Modal Close
    if (closeManageBtn) closeManageBtn.addEventListener('click', () => manageModal.classList.remove('active'));
    if (closeManageIcon) closeManageIcon.addEventListener('click', () => manageModal.classList.remove('active'));
}

function setupRealtimeListener() {
    const q = query(collection(db, "issues"), orderBy("timestamps.created", "desc"));

    onSnapshot(q, (snapshot) => {
        issuesData = [];
        let stats = { total: 0, completed: 0, pending: 0 };

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            issuesData.push({ id: docSnap.id, ...data });

            stats.total++;
            if (data.status?.toLowerCase() === 'completed') stats.completed++;
            else stats.pending++;
        });

        updateTable(issuesData);
        updateMapMarkers(issuesData);

        if (statsTotal) statsTotal.innerText = stats.total;
        if (statsCompleted) statsCompleted.innerText = stats.completed;
        if (statsPending) statsPending.innerText = stats.pending;
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
            <td>${issue.type || 'General'}</td>
            <td><div style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${issue.description}</div></td>
            <td>${issue.district || '-'}</td>
            <td>${issue.status}</td>
            <td>${dateStr}</td>
            <td><button class="btn btn-secondary view-btn" data-id="${issue.id}" style="padding:4px 12px; font-size:12px;">View</button></td>
        `;
        issuesTableBody.appendChild(row);
    });

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openManageModal(e.currentTarget.dataset.id));
    });
}

function openManageModal(id) {
    const issue = issuesData.find(i => i.id === id);
    if (!issue) return;

    const detailsDiv = document.getElementById('manage-details');
    detailsDiv.innerHTML = `
        <div style="margin-bottom:15px;">
            <h3>${issue.type}</h3>
            <p>${issue.description}</p>
            <hr>
            <p><strong>Status:</strong> ${issue.status}</p>
            <p><strong>Authority:</strong> ${issue.assignedAuthority || 'None'}</p>
            <p><strong>Remarks:</strong> ${issue.authorityRemarks || 'None'}</p>
        </div>
    `;

    // Populate form fields but keep them disabled (HTML has disabled attribute, but good to reinforce)
    const inputs = ['manage-authority', 'manage-status', 'manage-note'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = (id === 'manage-authority' ? issue.assignedAuthority :
                id === 'manage-status' ? issue.status :
                    issue.authorityRemarks) || '';
            el.disabled = true;
        }
    });

    manageModal.classList.add('active');
}

document.addEventListener('DOMContentLoaded', init);
