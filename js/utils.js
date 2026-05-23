/**
 * UTILS.JS — Helper Functions
 * Distance calc, ETA math, date formatting, geofence checks
 */

// ─── Haversine Distance (km) ───────────────────────────────
export function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) { return deg * (Math.PI / 180); }

// ─── ETA Calculator ────────────────────────────────────────
/**
 * @param {number} distanceKm - distance to destination
 * @param {number} speedKmh   - current speed in km/h
 * @returns {string} formatted ETA string e.g. "8 mins"
 */
export function calcETA(distanceKm, speedKmh = 30) {
  if (speedKmh <= 0 || distanceKm <= 0) return 'Calculating...';
  const minutes = Math.ceil((distanceKm / speedKmh) * 60);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const mins  = minutes % 60;
  return `${hours}h ${mins}m`;
}

// ─── Geofence Check ────────────────────────────────────────
/**
 * Returns true if bus is within alertRadiusKm of homeLocation
 */
export function isWithinGeofence(busLat, busLng, homeLat, homeLng, alertRadiusKm = 1) {
  const dist = getDistance(busLat, busLng, homeLat, homeLng);
  return dist <= alertRadiusKm;
}

// ─── Speed Converter ──────────────────────────────────────
export function msToKmh(speedMs) {
  return Math.round(speedMs * 3.6);
}

// ─── Date / Time Formatters ────────────────────────────────
export function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
}

export function formatRelative(date) {
  const diff = Date.now() - new Date(date).getTime();
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

export function isToday(date) {
  return new Date(date).toDateString() === new Date().toDateString();
}

// ─── Heading / Bearing ────────────────────────────────────
/**
 * Compass bearing from point A to point B (degrees)
 */
export function getBearing(lat1, lon1, lat2, lon2) {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return Math.round(brng);
}

// ─── Generate Unique ID ────────────────────────────────────
export function generateId(prefix = 'ID') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
}

// ─── Debounce ─────────────────────────────────────────────
export function debounce(fn, delay = 300) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// ─── Local Storage Helpers ────────────────────────────────
export const store = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(`sbtp_${key}`)); }
    catch { return null; }
  },
  set(key, value) {
    localStorage.setItem(`sbtp_${key}`, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(`sbtp_${key}`);
  }
};

// ─── Check if checklist done today ───────────────────────
export function isChecklistDoneToday() {
  return localStorage.getItem('checklist_completed_today') === new Date().toDateString();
}

// ─── Fuel Cost Estimator ──────────────────────────────────
export function estimateFuelCost(distanceKm, consumptionLPer100 = 8.4, pricePerLiter = 650) {
  const liters = (distanceKm / 100) * consumptionLPer100;
  return { liters: liters.toFixed(2), cost: (liters * pricePerLiter).toFixed(0) };
}
