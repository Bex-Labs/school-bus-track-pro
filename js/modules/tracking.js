/**
 * TRACKING.JS — GPS Broadcasting & Real-time Subscription Telemetry
 * Production Edition: Integrated with core 'buses' table architecture. No simulations.
 */

import { supabase } from '../config.js';
import { msToKmh } from '../utils.js';

let watchId = null;
let realtimeChannel = null;

/**
 * Start tracking the driver's native hardware GPS position and streaming it to Supabase
 * @param {string} busId - The core primary key identification code for the transport unit
 */
export async function startTracking(busId) {
  if (!navigator.geolocation) { 
    console.error('Core Geolocation API is not supported by this browser client.'); 
    return false; 
  }

  watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const { latitude, longitude, speed, heading, accuracy } = position.coords;
      const kmh = speed != null && speed > 0 ? msToKmh(speed) : 0;
      
      // Dispatch hardware updates onto the global screen window loop for responsive client views
      window.dispatchEvent(new CustomEvent('gpsUpdate', {
        detail: { lat: latitude, lng: longitude, speed: kmh, heading, accuracy }
      }));
      
      if (supabase) {
        // FIXED: Re-mapped upsert parameters cleanly onto your production table column schemas
        await supabase.from('buses').upsert({
          id: busId, 
          current_lat: latitude, 
          current_lng: longitude,
          speed: Math.round(kmh), 
          status: 'active',
          last_seen: new Date().toISOString()
        }, { onConflict: 'id' });
      }
    },
    (err) => console.error('GPS Telemetry Stream Interruption:', err.message),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
  
  return true;
}

/**
 * Stop hardware tracking and declare vehicle footprint offline
 * @param {string} busId - The core primary key identification code for the transport unit
 */
export async function stopTracking(busId) {
  if (watchId !== null) { 
    navigator.geolocation.clearWatch(watchId); 
    watchId = null; 
  }
  
  if (supabase && busId) {
    // FIXED: Maps updates back to matching database keys to signal offline vehicle states cleanly
    await supabase.from('buses')
      .update({ 
          status: 'offline', 
          speed: 0,
          last_seen: new Date().toISOString() 
      })
      .eq('id', busId);
  }
  console.log(`Tracking safely decoupled for transit unit reference: ${busId}`);
}

/**
 * Initiates an isolated, single-bus real-time update channel listener for Parent views
 */
export function subscribeToBus(busId, onUpdate) {
  if (!supabase) {
    console.error("Subscription canceled: Supabase instance is down or offline.");
    return;
  }
  
  // FIXED: Syncs changes on the core 'buses' table filter tracking structures natively
  realtimeChannel = supabase.channel(`bus-${busId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'buses', filter: `id=eq.${busId}` },
      (payload) => { 
          if (payload.new && onUpdate) onUpdate(payload.new); 
      })
    .subscribe();
}

/**
 * Initiates an all-inclusive broad fleet synchronization channel listener for Admin Command panels
 */
export function subscribeToFleet(onUpdate) {
  if (!supabase) return;
  
  // FIXED: Subscribes command matrix to map dynamic alterations straight from 'buses' values
  realtimeChannel = supabase.channel('fleet-global-grid')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'buses' },
      (payload) => { 
          if (payload.new && onUpdate) onUpdate(payload.new); 
      })
    .subscribe();
}

/**
 * Safely tear down active real-time replication streams to protect system performance parameters
 */
export function unsubscribe() {
  if (realtimeChannel) { 
    supabase?.removeChannel(realtimeChannel); 
    realtimeChannel = null; 
  }
}

/**
 * Downloads a snapshot containing the most recent synchronization position parameters logged by a bus unit
 */
export async function getLastPosition(busId) {
  if (!supabase) return null;
  
  // FIXED: Queries accurate relational keys securely
  const { data, error } = await supabase
    .from('buses')
    .select('*')
    .eq('id', busId)
    .single();
    
  if (error) {
      console.error(`Position data retrieval crash for ${busId}:`, error.message);
      return null;
  }
  return data;
}