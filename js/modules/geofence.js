/**
 * GEOFENCE.JS — Proximity Alert Engine
 * Monitors bus position vs. parent home stops and fires alerts.
 * Production Edition: Zero simulation fallback dependencies.
 */

import { supabase } from '../config.js';
import { getDistance } from '../utils.js';

// ─── State ─────────────────────────────────────────────────
let geofenceSubscription = null;
const triggeredAlerts = new Set(); // Prevent duplicate alerts per session

// ─── Config ────────────────────────────────────────────────
const DEFAULT_RADIUS_KM = 1;

/**
 * Start monitoring a bus for proximity to a home stop.
 * @param {string} busId         - Bus ID to watch (e.g. "SB-102")
 * @param {number} homeLat       - Parent's home latitude
 * @param {number} homeLng       - Parent's home longitude
 * @param {number} radiusKm      - Alert threshold in km (default 1)
 * @param {Function} onAlert     - Callback when bus enters radius
 */
export function startGeofenceWatch(busId, homeLat, homeLng, radiusKm = DEFAULT_RADIUS_KM, onAlert) {
  if (!supabase) {
    console.error('Geofence Execution Aborted: Supabase client is disconnected or uninitialized.');
    return;
  }

  // Subscribe to real-time telemetry streaming updates directly from the 'buses' table
  geofenceSubscription = supabase
    .channel(`geofence-${busId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'buses',
        filter: `id=eq.${busId}`
      },
      (payload) => {
        const { current_lat, current_lng } = payload.new;
        if (current_lat && current_lng) {
            checkGeofence(current_lat, current_lng, homeLat, homeLng, radiusKm, busId, onAlert);
        }
      }
    )
    .subscribe();

  console.log(`Geofence link active for transit unit ${busId} — monitoring boundary: ${radiusKm}km`);
}

/**
 * Stop geofence monitoring
 */
export function stopGeofenceWatch() {
  if (geofenceSubscription) {
    supabase?.removeChannel(geofenceSubscription);
    geofenceSubscription = null;
    console.log('Geofence watch stopped.');
  }
}

// ─── Core Check ───────────────────────────────────────────
function checkGeofence(busLat, busLng, homeLat, homeLng, radiusKm, busId, onAlert) {
  const distance = getDistance(busLat, busLng, homeLat, homeLng);

  if (distance <= radiusKm && !triggeredAlerts.has(busId)) {
    triggeredAlerts.add(busId);

    const minsAway = Math.max(1, Math.round((distance / 30) * 60)); // estimate at 30km/h
    const payload  = {
      busId,
      distance: distance.toFixed(2),
      minsAway,
      timestamp: new Date().toISOString()
    };

    // Fire callback interface hook
    if (onAlert) onAlert(payload);

    // Intercepts active parent profiling preferences before spawning push notification overlays
    verifyPreferencesAndNotify(busId, minsAway, distance, busLat, busLng);

    // Reset trigger after bus has moved away (5 min cooldown to prevent alert spam)
    setTimeout(() => triggeredAlerts.delete(busId), 5 * 60 * 1000);
  }
}

// ─── Preference Verification Wrapper ────────────────────────
async function verifyPreferencesAndNotify(busId, minsAway, distance, busLat, busLng) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch parent user's profile to verify preferences
        const { data: profile } = await supabase
            .from('profiles')
            .select('push_enabled')
            .eq('id', user.id)
            .single();

        // Standard Toast Alert (Always display on parent map app context)
        const toastMsg = `🚌 Transit Unit ${busId} is ${distance.toFixed(1)}km away — approx. ${minsAway} min remaining.`;
        if (window.showToast) {
            window.showToast(toastMsg, 'info');
        } else {
            console.log("Geofence Toast Alert Broadcast:", toastMsg);
        }

        // Send native system browser push if permission is toggled true by the parent user
        if (profile && profile.push_enabled !== false) {
            sendPushNotification(busId, minsAway, distance);
        }

        // Log transaction historical entries to Supabase
        logGeofenceAlert(busId, busLat, busLng, distance, user.id);

    } catch (err) {
        console.error("Geofence preference evaluation stalled:", err.message);
    }
}

// ─── Push Notification ────────────────────────────────────
async function sendPushNotification(busId, minsAway, distanceKm) {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }

  if (Notification.permission === 'granted') {
    new Notification('🚌 School Bus Approaching!', {
      body: `Transit Unit ${busId} is ${distanceKm.toFixed(1)}km away — arriving in ~${minsAway} minute${minsAway === 1 ? '' : 's'}.`,
      icon: '../assets/images/logo.png',
      badge: '../assets/images/logo.png',
      tag: `geofence-${busId}`,
      renotify: true,
    });
  }
}

// ─── Log Alert to Supabase ────────────────────────────────
async function logGeofenceAlert(busId, busLat, busLng, distanceKm, userId) {
  if (!supabase) return;
  
  // 1. Write telemetry record straight to analytics logs table
  await supabase.from('geofence_alerts').insert([{
    bus_id: busId,
    bus_lat: busLat,
    bus_lng: busLng,
    distance_km: distanceKm,
    triggered_at: new Date().toISOString()
  }]);

  // 2. Inject row card entry straight to Parent's Alert Center feed history log block
  await supabase.from('notifications').insert([{
    user_id: userId,
    title: "🚌 PROXIMITY BOUNDARY ENTERED",
    message: `Transit Unit ${busId} has crossed your configured safety perimeter radius. Estimated arrival window: ~${Math.max(1, Math.round((distanceKm / 30) * 60))} mins.`,
    type: 'info',
    status: 'active'
  }]);
}