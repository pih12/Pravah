let map = null;
let markersGroup = null;

// Status Badge Helper for Popup
function getStatusBadge(status) {
    const s = status.toLowerCase();
    let color = '#6B7280'; // gray
    let label = status;

    if (s === 'completed') color = '#10B981'; // green
    else if (s === 'work started') color = '#3B82F6'; // blue
    else if (s === 'under construction') color = '#F59E0B'; // orange
    else if (s === 'rejected' || s === 'not started') color = '#EF4444'; // red
    else if (s === 'received by authority') color = '#4B5563'; // dark gray

    return `<span style="background:${color}; color:white; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:600; text-transform:uppercase;">${label}</span>`;
}

function getStatusColor(status) {
    const s = status.toLowerCase();
    if (s === 'completed') return '#10B981';
    if (s === 'work started') return '#3B82F6';
    if (s === 'under construction') return '#F59E0B';
    if (s === 'rejected' || s === 'not started') return '#EF4444';
    if (s === 'received by authority') return '#4B5563';
    return '#6B7280'; // submitted
}

export function initMap(elementId, centerLat = 20.5937, centerLng = 78.9629) {
    if (map) return map; // Already initialized

    if (typeof L === 'undefined') {
        console.error("Leaflet not loaded");
        return null;
    }

    map = L.map(elementId).setView([centerLat, centerLng], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    markersGroup = L.featureGroup().addTo(map);

    // Add "Locate Me" control if needed, or just rely on browser location for reporting
    return map;
}

export function updateMapMarkers(issues) {
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    issues.forEach(issue => {
        if (issue.gps && issue.gps.lat && issue.gps.lng) {
            const lat = parseFloat(issue.gps.lat);
            const lng = parseFloat(issue.gps.lng);

            if (isNaN(lat) || isNaN(lng)) return;

            const marker = L.circleMarker([lat, lng], {
                radius: 8,
                fillColor: getStatusColor(issue.status),
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            });

            const dateStr = issue.timestamps?.created ? new Date(issue.timestamps.created.seconds * 1000).toLocaleDateString() : 'N/A';

            marker.bindPopup(`
                <div style="min-width: 200px; font-family: 'Inter', sans-serif;">
                    <h3 style="font-weight:600; margin-bottom:5px; text-transform:capitalize; font-size:14px;">${issue.description.substring(0, 30)}...</h3>
                    ${issue.imageUrl ? `<img src="${issue.imageUrl}" style="width:100%; height:120px; object-fit:cover; border-radius:4px; margin-bottom:8px;" alt="Issue Image">` : ''}
                    <div style="margin-bottom:5px;">
                        ${getStatusBadge(issue.status)}
                    </div>
                    <p style="margin:5px 0 0 0; font-size:11px; color:#666;">Reported on ${dateStr}</p>
                </div>
            `);

            markersGroup.addLayer(marker);
        }
    });

    if (markersGroup.getLayers().length > 0) {
        map.fitBounds(markersGroup.getBounds(), { padding: [50, 50] });
    }
}
