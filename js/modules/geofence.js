/**
 * GEOFENCE.JS — Proximity Alert Engine
 * Tenant model: organization_id scoped on all inserts
 */

import { supabase } from '../config.js';
import { getDistance } from '../utils.js';

let geofenceSubscription = null;
const triggeredAlerts    = new Set();
const DEFAULT_RADIUS_KM  = 1;

/**
 * Start monitoring bus proximity to parent home
 * @param {string}   busId      - Bus ID
 * @param {number}   homeLat    - Parent home latitude
 * @param {number}   homeLng    - Parent home longitude
 * @param {string}   orgId      - Organization ID for tenant scoping
 * @param {number}   radiusKm   - Alert threshold in km
 * @param {Function} onAlert    - Callback when bus enters radius
 */
export function startGeofenceWatch(busId, homeLat, homeLng, orgId, radiusKm = DEFAULT_RADIUS_KM, onAlert) {
  if (!supabase) return;

  geofenceSubscription = supabase
    .channel(`geofence-${busId}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'buses', filter: `id=eq.${busId}`
    }, (payload) => {
      const { current_lat, current_lng } = payload.new;
      if (current_lat && current_lng) {
        checkGeofence(current_lat, current_lng, homeLat, homeLng, radiusKm, busId, orgId, onAlert);
      }
    })
    .subscribe();
}

export function stopGeofenceWatch() {
  if (geofenceSubscription) {
    supabase?.removeChannel(geofenceSubscription);
    geofenceSubscription = null;
  }
}

function checkGeofence(busLat, busLng, homeLat, homeLng, radiusKm, busId, orgId, onAlert) {
  const distance = getDistance(busLat, busLng, homeLat, homeLng);

  if (distance <= radiusKm && !triggeredAlerts.has(busId)) {
    triggeredAlerts.add(busId);

    const minsAway = Math.max(1, Math.round((distance / 30) * 60));
    const payload  = { busId, distance: distance.toFixed(2), minsAway, timestamp: new Date().toISOString() };

    if (onAlert) onAlert(payload);
    verifyPreferencesAndNotify(busId, minsAway, distance, busLat, busLng, orgId);
    setTimeout(() => triggeredAlerts.delete(busId), 5 * 60 * 1000);
  }
}

async function verifyPreferencesAndNotify(busId, minsAway, distance, busLat, busLng, orgId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles').select('push_enabled').eq('id', user.id).single();

    const toastMsg = `🚌 Bus ${busId} is ${distance.toFixed(1)}km away — approx. ${minsAway} min.`;
    if (window.showToast) window.showToast(toastMsg, 'info');

    if (profile && profile.push_enabled !== false) {
      sendPushNotification(busId, minsAway, distance);
    }

    // Log geofence alert — scoped to org
    logGeofenceAlert(busId, busLat, busLng, distance, user.id, orgId);

  } catch (err) {
    console.error('Geofence preference check failed:', err.message);
  }
}

async function sendPushNotification(busId, minsAway, distanceKm) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission === 'granted') {
    new Notification('🚌 School Bus Approaching!', {
      body:     `Bus ${busId} is ${distanceKm.toFixed(1)}km away — ~${minsAway} min${minsAway === 1 ? '' : 's'}.`,
      icon:     '../assets/images/logo.png',
      tag:      `geofence-${busId}`,
      renotify: true,
    });
  }
}

async function logGeofenceAlert(busId, busLat, busLng, distanceKm, userId, orgId) {
  if (!supabase) return;

  // Notification — scoped to org
  await supabase.from('notifications').insert([{
    user_id:         userId,
    title:           '🚌 PROXIMITY BOUNDARY ENTERED',
    message:         `Bus ${busId} has entered your safety perimeter. ETA ~${Math.max(1, Math.round((distanceKm / 30) * 60))} mins.`,
    type:            'info',
    status:          'active',
    organization_id: orgId                         // ← scoped to tenant
  }]);
}