/**
 * ROUTES.JS — Route Architect Logic
 * Tenant model: organization_id scoped on all queries and inserts
 */
import { supabase, getUserProfile } from './config.js';
import { signOut } from './auth.js';

let map;
let routeLayers   = L.layerGroup();
let currentStops  = [];
let activeRouteId = null;
let tempMarker    = null;
let ORG_ID        = null;

async function init() {
  const profile = await getUserProfile();
  if (!profile || !profile.organization_id) {
    console.error('Routes: No organization_id on profile.');
    return;
  }
  ORG_ID = profile.organization_id;

  setupEventListeners();
  try {
    initMap();
    await loadRoutesList();
  } catch (err) {
    console.error('Routes init error:', err.message);
    showToast('Error loading map services', 'error');
  }
}

function initMap() {
  const mapContainer = document.getElementById('route-map');
  if (!mapContainer) return;

  map = L.map('route-map', { zoomControl: true, attributionControl: false }).setView([6.5244, 3.3792], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);
  routeLayers.addTo(map);

  if (L.Control.Geocoder) {
    L.Control.geocoder({
      defaultMarkGeocode: false,
      placeholder: 'Find address or landmark...',
      position: 'topright',
      geocoder: L.Control.Geocoder.nominatim()
    })
    .on('markgeocode', (e) => handleMapInteraction(e.geocode.center, e.geocode.name))
    .addTo(map);
  }

  map.on('click', (e) => handleMapInteraction(e.latlng));
}

function handleMapInteraction(latlng, addressName = '') {
  const { lat, lng } = latlng;
  if (tempMarker) map.removeLayer(tempMarker);

  tempMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      html: '<div style="background:var(--yellow);width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px rgba(0,0,0,0.3);"></div>',
      className: ''
    })
  }).addTo(map);

  map.tempLat = lat;
  map.tempLng = lng;

  const nameInput = document.getElementById('new-stop-name');
  if (nameInput && addressName) { nameInput.value = addressName; nameInput.focus(); }

  showToast(addressName ? `Pinned: ${addressName.substring(0, 25)}...` : 'Coordinate pinned.', 'info');
}

// Routes list — scoped to org
async function loadRoutesList() {
  const container  = document.getElementById('route-list');
  const badge      = document.getElementById('route-count-badge');
  const searchTerm = (document.getElementById('route-search')?.value || '').toLowerCase();

  if (!container) return;

  const { data: routes, error } = await supabase
    .from('routes')
    .select('*, stops(count)')
    .eq('organization_id', ORG_ID);

  if (error) {
    container.innerHTML = `<div style="padding:20px;color:var(--red);font-size:12px;">Error: ${error.message}</div>`;
    return;
  }

  const filtered = (routes || []).filter(r => r.name.toLowerCase().includes(searchTerm));
  if (badge) badge.textContent = `${filtered.length} routes`;

  if (!filtered.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:13px;"><i class="bi bi-map" style="font-size:28px;display:block;margin-bottom:8px;opacity:0.4;"></i>No routes yet. Create one above.</div>';
    return;
  }

  container.innerHTML = filtered.map(r => `
    <div class="route-card ${activeRouteId === r.id ? 'active' : ''}" onclick="window.selectRoute('${r.id}','${r.name}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="font-weight:800;font-size:13px;color:var(--navy);flex:1;">${r.name}</div>
        <button class="btn btn-ghost btn-sm text-red" style="padding:2px 6px;margin-left:8px;flex-shrink:0;" 
          onclick="event.stopPropagation(); window.deleteRoute('${r.id}','${r.name.replace(/'/g, "\\'")}')">
          <i class="bi bi-trash"></i>
        </button>
      </div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;display:flex;justify-content:space-between;">
        <span><i class="bi bi-bus-front"></i> ${r.bus_id || 'Unassigned'}</span>
        <span><i class="bi bi-geo-alt"></i> ${r.stops?.[0]?.count || 0} stops</span>
      </div>
    </div>`).join('');
}

// Delete route — also deletes its stops
window.deleteRoute = async (id, name) => {
  if (!confirm(`Delete route "${name}"? All stops on this route will also be removed.`)) return;

  // Delete stops first
  await supabase.from('stops').delete().eq('route_id', id).eq('organization_id', ORG_ID);

  // Delete route
  const { error } = await supabase.from('routes').delete().eq('id', id).eq('organization_id', ORG_ID);

  if (error) { showToast('Delete failed: ' + error.message, 'error'); return; }

  // Clear active route if it was the deleted one
  if (activeRouteId === id) {
    activeRouteId = null;
    currentStops  = [];
    renderStopsTable();
    routeLayers.clearLayers();
    const titleEl = document.getElementById('map-route-title');
    if (titleEl) titleEl.textContent = 'Drafting Canvas';
    const indicator = document.getElementById('edit-indicator');
    if (indicator) indicator.style.display = 'none';
  }

  showToast(`Route "${name}" deleted.`, 'success');
  loadRoutesList();
};

// Select route — stops scoped to org
window.selectRoute = async (id, name) => {
  activeRouteId = id;
  const titleEl = document.getElementById('map-route-title');
  if (titleEl) titleEl.textContent = name;

  const indicator = document.getElementById('edit-indicator');
  if (indicator) indicator.style.display = 'inline-block';

  const { data: stops, error } = await supabase
    .from('stops')
    .select('*')
    .eq('route_id', id)
    .eq('organization_id', ORG_ID)
    .order('order_index', { ascending: true });

  if (!error) {
    currentStops = stops || [];
    renderStopsTable();
    updateMapVisualization();
  }

  loadRoutesList();
};

// Save route — stops scoped to org
async function saveRouteToDatabase() {
  if (!activeRouteId) return showToast('No route selected', 'error');
  if (currentStops.length < 2) return showToast('Need at least 2 stops', 'warning');

  const btn = document.getElementById('save-route-btn');
  if (!btn) return;

  btn.disabled  = true;
  const origTxt = btn.innerHTML;
  btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Syncing...';

  await supabase.from('stops').delete()
    .eq('route_id', activeRouteId)
    .eq('organization_id', ORG_ID);

  const stopsToSave = currentStops.map((s, i) => ({
    route_id:        activeRouteId,
    name:            s.name,
    arrival_time:    s.arrival_time || s.time || null,
    students:        parseInt(s.students || s.student_count) || 0,
    lat:             s.lat,
    lng:             s.lng,
    order_index:     i,
    organization_id: ORG_ID
  }));

  const { error: insError } = await supabase.from('stops').insert(stopsToSave);

  if (!insError) {
    showToast('Route saved successfully', 'success');
    await loadRoutesList();
  } else {
    showToast('Save failed: ' + insError.message, 'error');
  }

  btn.disabled  = false;
  btn.innerHTML = origTxt;
}

function updateMapVisualization() {
  if (!map) return;
  routeLayers.clearLayers();
  if (!currentStops.length) return;

  const coords = currentStops.map(s => [s.lat, s.lng]);
  L.polyline(coords, { color: '#1B2A3B', weight: 3, dashArray: '8, 12', opacity: 0.6 }).addTo(routeLayers);

  currentStops.forEach((stop, i) => {
    const icon = L.divIcon({
      html: `<div style="background:var(--navy);width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;border:2px solid white;box-shadow:var(--shadow-sm);">${i + 1}</div>`,
      iconSize: [28, 28], iconAnchor: [14, 14], className: ''
    });
    L.marker([stop.lat, stop.lng], { icon })
      .addTo(routeLayers)
      .bindPopup(`<b>Stop ${i + 1}</b><br>${stop.name}`);
  });

  if (coords.length > 1) map.fitBounds(L.polyline(coords).getBounds(), { padding: [60, 60] });
}

function renderStopsTable() {
  const tbody = document.getElementById('stops-tbody');
  const label = document.getElementById('stop-count-label');
  if (!tbody) return;

  if (label) label.textContent = `${currentStops.length} STOPS CONFIGURED`;

  if (!currentStops.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:50px;color:var(--text-muted);">No stops yet. Click the map to add.</td></tr>';
    return;
  }

  tbody.innerHTML = currentStops.map((s, i) => `
    <tr style="border-bottom:1px solid var(--border);">
      <td style="padding:15px 24px;font-weight:800;color:var(--navy);">${i + 1}</td>
      <td style="padding:15px 24px;font-weight:600;">${s.name}</td>
      <td style="padding:15px 24px;">${s.arrival_time || s.time || '--:--'}</td>
      <td style="padding:15px 24px;"><span class="badge badge-navy">${s.students || s.student_count || 0}</span></td>
      <td style="padding:15px 24px;text-align:right;">
        <button class="btn-table delete" onclick="window.removeStop(${i})"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`).join('');
}

window.addStopToRoute = () => {
  const nameEl = document.getElementById('new-stop-name');
  const timeEl = document.getElementById('new-stop-time');
  const studEl = document.getElementById('new-stop-students');

  if (!nameEl?.value || !map.tempLat) return showToast('Pin a location on the map first', 'error');

  currentStops.push({
    name:         nameEl.value,
    arrival_time: timeEl ? timeEl.value : null,
    students:     studEl ? (parseInt(studEl.value) || 0) : 0,
    lat:          map.tempLat,
    lng:          map.tempLng
  });

  nameEl.value = '';
  if (tempMarker) map.removeLayer(tempMarker);
  map.tempLat = null;

  renderStopsTable();
  updateMapVisualization();
  showToast('Stop added', 'success');
};

window.removeStop = (index) => {
  currentStops.splice(index, 1);
  renderStopsTable();
  updateMapVisualization();
  showToast('Stop removed', 'info');
};

function setupEventListeners() {
  const safeAttach = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  const searchInput = document.getElementById('route-search');
  if (searchInput) searchInput.oninput = () => loadRoutesList();
  safeAttach('signout-btn-sidebar', () => signOut());
  safeAttach('add-stop-btn',        () => window.addStopToRoute());
  safeAttach('save-route-btn',      () => saveRouteToDatabase());
}

function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type} active`;
  t.innerHTML = `<span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4000);
}

window.saveRouteToDatabase = saveRouteToDatabase;

// ── Create Route Modal ────────────────────────────────────────────────────

window.createNewRoutePrompt = async () => {
  document.getElementById('new-route-name').value  = '';
  document.getElementById('selected-bus-id').value = '';
  document.getElementById('create-route-modal').style.display = 'flex';

  const picker = document.getElementById('route-bus-picker');
  picker.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">
    <i class="bi bi-arrow-clockwise spin" style="display:inline-block;margin-right:6px;"></i> Loading buses...
  </div>`;

  const { data: buses } = await supabase
    .from('buses').select('id, plate_number, status, driver_id')
    .eq('organization_id', ORG_ID).order('id');

  if (!buses || !buses.length) {
    picker.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">No buses registered in your school.</div>`;
    return;
  }

  const driverIds = buses.filter(b => b.driver_id).map(b => b.driver_id);
  let driversMap = {};
  if (driverIds.length > 0) {
    const { data: drivers } = await supabase.from('profiles').select('id, full_name, phone, avatar_url').in('id', driverIds);
    if (drivers) drivers.forEach(d => { driversMap[d.id] = d; });
  }

  // Default: no bus selected
  picker.innerHTML = `
    <div id="bus-card-none" onclick="selectRouteBus('', this)"
      style="padding:12px 16px;border:2px solid var(--border);border-radius:12px;cursor:pointer;background:var(--bg);display:flex;align-items:center;gap:10px;transition:0.2s;">
      <i class="bi bi-slash-circle" style="font-size:20px;color:var(--text-muted);"></i>
      <div style="font-weight:700;color:var(--navy);font-size:13px;">No bus assigned</div>
      <i class="bi bi-check-circle-fill route-check" style="margin-left:auto;color:var(--navy);font-size:18px;display:none;"></i>
    </div>` +
    buses.map(b => {
      const driver   = b.driver_id ? driversMap[b.driver_id] : null;
      const isActive = b.status === 'active';
      const avatar   = driver?.avatar_url
        ? `<div style="width:34px;height:34px;border-radius:50%;background:url(${driver.avatar_url}) center/cover;flex-shrink:0;border:2px solid var(--border);"></div>`
        : `<div style="width:34px;height:34px;border-radius:50%;background:var(--yellow);color:var(--navy);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0;">${driver ? driver.full_name.charAt(0) : '?'}</div>`;

      return `<div id="bus-card-${b.id}" onclick="selectRouteBus('${b.id}', this)"
        style="padding:14px 16px;border:2px solid var(--border);border-radius:12px;cursor:pointer;background:var(--bg);transition:0.2s;display:flex;align-items:center;gap:12px;">
        <div style="width:42px;height:42px;border-radius:10px;background:var(--navy);color:white;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
          <i class="bi bi-bus-front-fill"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:900;font-size:15px;color:var(--navy);font-family:monospace;">${b.id}</div>
          <div style="font-size:11px;color:var(--text-muted);font-weight:700;margin-top:1px;">
            ${b.plate_number || 'No plate'} · <span style="color:${isActive ? 'var(--green)' : 'var(--text-muted)'};">${isActive ? 'Active' : 'Offline'}</span>
          </div>
          ${driver
            ? `<div style="display:flex;align-items:center;gap:6px;margin-top:6px;">${avatar}
                <div>
                  <div style="font-size:12px;font-weight:700;color:var(--navy);">${driver.full_name}</div>
                  ${driver.phone ? `<div style="font-size:10px;color:var(--text-muted);">${driver.phone}</div>` : ''}
                </div>
               </div>`
            : `<div style="font-size:11px;color:#f59e0b;font-weight:700;margin-top:4px;"><i class="bi bi-person-dash"></i> No driver assigned</div>`
          }
        </div>
        <i class="bi bi-check-circle-fill route-check" style="margin-left:auto;color:var(--navy);font-size:18px;display:none;flex-shrink:0;"></i>
      </div>`;
    }).join('');
};

window.selectRouteBus = (busId, el) => {
  document.querySelectorAll('#route-bus-picker > div').forEach(c => {
    c.style.borderColor = 'var(--border)';
    c.style.background  = 'var(--bg)';
    const check = c.querySelector('.route-check');
    if (check) check.style.display = 'none';
  });
  el.style.borderColor = 'var(--navy)';
  el.style.background  = '#f0f4ff';
  const check = el.querySelector('.route-check');
  if (check) check.style.display = 'block';
  document.getElementById('selected-bus-id').value = busId;
};

window.submitCreateRoute = async () => {
  const routeName = document.getElementById('new-route-name').value.trim();
  const busId     = document.getElementById('selected-bus-id').value || null;
  const btn       = document.getElementById('btn-create-route');
  if (!routeName) { showToast('Route name is required.', 'error'); return; }
  btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Creating...';
  const { error } = await supabase.from('routes').insert([{ name: routeName, organization_id: ORG_ID, bus_id: busId || null }]);
  btn.disabled = false; btn.innerHTML = '<i class="bi bi-plus-circle-fill"></i> Create Route';
  if (error) { showToast('Creation failed: ' + error.message, 'error'); return; }
  showToast(busId ? `Route created and assigned to Bus ${busId}.` : 'Route created.', 'success');
  window.closeCreateModal();
  loadRoutesList();
};

window.closeCreateModal = () => {
  document.getElementById('create-route-modal').style.display = 'none';
};

init();