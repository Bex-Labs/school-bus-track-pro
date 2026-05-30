/**
 * TRACKING.JS — GPS Broadcasting & Real-time Subscription Telemetry
 * Tenant model: organization_id scoped on all bus writes
 */

import { supabase } from '../config.js';
import { msToKmh } from '../utils.js';

let watchId = null;
let realtimeChannel = null;

/**
 * Start tracking driver GPS and stream to Supabase buses table
 * @param {string} busId   - Bus primary key
 * @param {string} orgId   - Organization ID for tenant scoping
 */
export async function startTracking(busId, orgId) {
  if (!navigator.geolocation) {
    console.error('Geolocation API not supported.');
    return false;
  }

  watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const { latitude, longitude, speed, heading, accuracy } = position.coords;
      const kmh = speed != null && speed > 0 ? msToKmh(speed) : 0;

      window.dispatchEvent(new CustomEvent('gpsUpdate', {
        detail: { lat: latitude, lng: longitude, speed: kmh, heading, accuracy }
      }));

      if (supabase) {
        await supabase.from('buses').upsert({
          id:              busId,
          current_lat:     latitude,
          current_lng:     longitude,
          speed:           Math.round(kmh),
          status:          'active',
          last_seen:       new Date().toISOString(),
          organization_id: orgId                    // ← scoped to tenant
        }, { onConflict: 'id' });
      }
    },
    (err) => console.error('GPS stream error:', err.message),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );

  return true;
}

/**
 * Stop tracking and mark bus offline
 */
export async function stopTracking(busId, orgId) {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  if (supabase && busId) {
    await supabase.from('buses')
      .update({ status: 'offline', speed: 0, last_seen: new Date().toISOString() })
      .eq('id', busId)
      .eq('organization_id', orgId);               // ← scoped to tenant
  }
}

/**
 * Subscribe to a single bus for parent views
 */
export function subscribeToBus(busId, onUpdate) {
  if (!supabase) return;
  realtimeChannel = supabase.channel(`bus-${busId}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'buses', filter: `id=eq.${busId}`
    }, (payload) => { if (payload.new && onUpdate) onUpdate(payload.new); })
    .subscribe();
}

/**
 * Subscribe to entire org fleet for manager views
 */
export function subscribeToFleet(orgId, onUpdate) {
  if (!supabase) return;
  realtimeChannel = supabase.channel(`fleet-${orgId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'buses',
      filter: `organization_id=eq.${orgId}`        // ← scoped to tenant
    }, (payload) => { if (payload.new && onUpdate) onUpdate(payload.new); })
    .subscribe();
}

export function unsubscribe() {
  if (realtimeChannel) {
    supabase?.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

export async function getLastPosition(busId, orgId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('buses')
    .select('*')
    .eq('id', busId)
    .eq('organization_id', orgId)
    .single();
  if (error) return null;
  return data;
}