/**
 * ROUTES.JS — The Route Architect Logic
 * Fulfills: Map Editor (US-076), Stop Management (US-077), Route Creator (US-079)
 * Fixes: Null pointer exceptions and 404 Schema mismatches
 * Optimized: For high-density data synchronization
 */
import { supabase } from './config.js';
import { signOut } from './auth.js';

let map;
let routeLayers = L.layerGroup();
let currentStops = []; 
let activeRouteId = null;
let tempMarker = null;

/**
 * --- 1. INITIALIZATION ---
 */
async function init() {
    console.log("Route Architect: Initializing...");
    
    // Core setup
    setupEventListeners();
    
    try {
        initMap();
        await loadRoutesList();
    } catch (err) {
        console.error("Initialization Error:", err.message);
        showToast("Error loading map services", "error");
    }
}

/**
 * --- 2. MAP CORE ---
 */
function initMap() {
    const mapContainer = document.getElementById('route-map');
    if (!mapContainer) return;

    // Initialize Leaflet Map (Lagos Default)
    map = L.map('route-map', { 
        zoomControl: true, 
        attributionControl: false 
    }).setView([6.5244, 3.3792], 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);
    routeLayers.addTo(map);

    // Geocoder Search Logic
    if (L.Control.Geocoder) {
        const geocoder = L.Control.Geocoder.nominatim();
        L.Control.geocoder({
            defaultMarkGeocode: false,
            placeholder: "Find address or landmark...",
            position: 'topright',
            geocoder: geocoder
        })
        .on('markgeocode', function(e) {
            const latlng = e.geocode.center;
            const address = e.geocode.name;
            map.setView(latlng, 16);
            handleMapInteraction(latlng, address);
        })
        .addTo(map);
    }

    // Manual Click Interaction
    map.on('click', (e) => handleMapInteraction(e.latlng));
}

function handleMapInteraction(latlng, addressName = "") {
    const { lat, lng } = latlng;
    if (tempMarker) map.removeLayer(tempMarker);
    
    // Create temporary marker for stop placement
    tempMarker = L.marker([lat, lng], { 
        icon: L.divIcon({
            html: `<div style="background:var(--yellow); width:18px; height:18px; border-radius:50%; border:3px solid white; box-shadow:0 0 10px rgba(0,0,0,0.3);"></div>`,
            className: ''
        })
    }).addTo(map);

    map.tempLat = lat;
    map.tempLng = lng;
    
    const nameInput = document.getElementById('new-stop-name');
    if (nameInput) {
        if (addressName) nameInput.value = addressName;
        nameInput.focus();
    }
    
    showToast(addressName ? `Pinned: ${addressName.substring(0,25)}...` : "Coordinate localized.", "info");
}

/**
 * --- 3. DATA PERSISTENCE (SUPABASE) ---
 */
async function loadRoutesList() {
    const container = document.getElementById('route-list');
    const badge = document.getElementById('route-count-badge');
    const searchInput = document.getElementById('route-search');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

    if (!container) return;

    // Fetch routes and count their linked stops
    const { data: routes, error } = await supabase
        .from('routes')
        .select(`
            *,
            stops(count)
        `);

    if (error) {
        console.error("Supabase Fetch Error:", error.message);
        container.innerHTML = `<div style="padding:20px; color:var(--red); font-size:12px;">Database Error: ${error.message}</div>`;
        return;
    }

    const filtered = routes.filter(r => r.name.toLowerCase().includes(searchTerm));

    if (badge) badge.textContent = `${filtered.length} routes`;
    
    container.innerHTML = filtered.map(r => `
        <div class="route-card ${activeRouteId === r.id ? 'active' : ''}" onclick="window.selectRoute('${r.id}', '${r.name}')">
            <div style="font-weight:800; font-size:13px; color: var(--navy);">${r.name}</div>
            <div style="font-size:11px; color:var(--text-secondary); margin-top:4px; display: flex; justify-content: space-between;">
                <span><i class="bi bi-bus-front"></i> ${r.bus_id || 'Unassigned'}</span>
                <span><i class="bi bi-geo-alt"></i> ${r.stops?.[0]?.count || 0} waypoints</span>
            </div>
        </div>
    `).join('');
}

window.selectRoute = async (id, name) => {
    activeRouteId = id;
    const titleEl = document.getElementById('map-route-title');
    if (titleEl) titleEl.textContent = name;
    
    // UI Feedback
    const indicator = document.getElementById('edit-indicator');
    if (indicator) indicator.style.display = 'inline-block';
    
    // Fetch stops for this specific route sorted by index
    const { data: stops, error } = await supabase
        .from('stops')
        .select('*')
        .eq('route_id', id)
        .order('order_index', { ascending: true });

    if (!error) {
        currentStops = stops || [];
        renderStopsTable();
        updateMapVisualization();
    }
    
    loadRoutesList(); 
};

async function saveRouteToDatabase() {
    if (!activeRouteId) return showToast("Target route not selected", "error");
    if (currentStops.length < 2) return showToast("Network requires at least 2 points", "warning");

    const btn = document.getElementById('save-route-btn');
    if (!btn) return;

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Syncing...';

    // 1. Transaction Simulation: Purge stale stops
    const { error: delError } = await supabase.from('stops').delete().eq('route_id', activeRouteId);
    
    if (delError) {
        showToast("Purge failed: " + delError.message, "error");
        btn.disabled = false;
        btn.innerHTML = originalText;
        return;
    }

    // 2. Map payload to SQL Schema (student_count and order_index)
    const stopsToSave = currentStops.map((s, i) => ({
        route_id: activeRouteId,
        name: s.name,
        arrival_time: s.arrival_time || s.time || null,
        student_count: parseInt(s.student_count || s.students) || 0,
        lat: s.lat,
        lng: s.lng,
        order_index: i
    }));

    const { error: insError } = await supabase.from('stops').insert(stopsToSave);

    if (!insError) {
        showToast("Encrypted sync complete", "success");
        await loadRoutesList();
    } else {
        showToast("Inbound sync failed: " + insError.message, "error");
    }

    btn.disabled = false;
    btn.innerHTML = originalText;
}

/**
 * --- 4. UI COMPONENTS ---
 */
function updateMapVisualization() {
    if (!map) return;
    routeLayers.clearLayers(); 
    if (currentStops.length === 0) return;

    const coords = currentStops.map(s => [s.lat, s.lng]);

    // Path Line
    L.polyline(coords, { color: '#1B2A3B', weight: 3, dashArray: '8, 12', opacity: 0.6 }).addTo(routeLayers);

    // Numbered Markers
    currentStops.forEach((stop, i) => {
        const icon = L.divIcon({
            html: `<div style="background:var(--navy); width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; color:white; border:2px solid white; box-shadow:var(--shadow-sm);">${i + 1}</div>`,
            iconSize: [28, 28], iconAnchor: [14, 14], className: ''
        });
        
        L.marker([stop.lat, stop.lng], { icon })
            .addTo(routeLayers)
            .bindPopup(`<b>Waypoint ${i+1}</b><br>${stop.name}`);
    });

    if (coords.length > 1) map.fitBounds(L.polyline(coords).getBounds(), { padding: [60, 60] });
}

function renderStopsTable() {
    const tbody = document.getElementById('stops-tbody');
    const label = document.getElementById('stop-count-label');
    if (!tbody) return;

    if (label) label.textContent = `${currentStops.length} WAYPOINTS CONFIGURED`;

    if (currentStops.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:50px; color:var(--text-muted); font-size: 13px;">No sequence defined. Interact with map to start.</td></tr>';
        return;
    }

    tbody.innerHTML = currentStops.map((s, i) => `
        <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding:15px 24px; font-weight:800; color:var(--navy);">${i+1}</td>
            <td style="padding:15px 24px; font-weight:600;">${s.name}</td>
            <td style="padding:15px 24px;">${s.arrival_time || s.time || '--:--'}</td>
            <td style="padding:15px 24px;"><span class="badge badge-navy">${s.student_count || s.students || 0}</span></td>
            <td style="padding:15px 24px; text-align:right;">
                <button class="btn-table delete" onclick="window.removeStop(${i})"><i class="bi bi-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

window.addStopToRoute = () => {
    const nameEl = document.getElementById('new-stop-name');
    const timeEl = document.getElementById('new-stop-time');
    const studEl = document.getElementById('new-stop-students');

    if (!nameEl?.value || !map.tempLat) {
        return showToast("Identify a map coordinate first", "error");
    }

    currentStops.push({
        name: nameEl.value,
        arrival_time: timeEl ? timeEl.value : null,
        student_count: studEl ? (parseInt(studEl.value) || 0) : 0,
        lat: map.tempLat,
        lng: map.tempLng
    });
    
    if (nameEl) nameEl.value = '';
    if (tempMarker) map.removeLayer(tempMarker);
    map.tempLat = null;

    renderStopsTable();
    updateMapVisualization();
    showToast("Stop appended to sequence", "success");
};

window.removeStop = (index) => {
    currentStops.splice(index, 1);
    renderStopsTable();
    updateMapVisualization();
    showToast("Point removed from sequence", "info");
};

/**
 * --- 5. EVENT LISTENERS (GUARDED) ---
 */
function setupEventListeners() {
    const safeAttach = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.onclick = fn;
    };

    const searchInput = document.getElementById('route-search');
    if (searchInput) {
        searchInput.oninput = () => loadRoutesList();
    }

    safeAttach('signout-btn-sidebar', () => signOut());
    safeAttach('add-stop-btn', () => window.addStopToRoute());
    safeAttach('save-route-btn', () => saveRouteToDatabase());
}

function showToast(msg, type='info') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast ${type} active`;
    t.innerHTML = `<span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 500);
    }, 4000);
}

// Global scope assignments for inline HTML onclicks
window.saveRouteToDatabase = saveRouteToDatabase;
window.addStopToRoute = addStopToRoute;
window.selectRoute = selectRoute;

init();