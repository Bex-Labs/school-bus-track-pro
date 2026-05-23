/**
 * SAFETY.JS — SOS Asymmetric Emergency Alert System
 * Production Edition: Integrated with core notifications telemetry pipeline.
 */

import { supabase } from '../config.js';

const SOS_HOLD_MS = 3000;
let holdTimer = null;

/**
 * Initialize the hold-to-activate SOS component button triggers
 * @param {Function} onTriggered - Callback executed upon successful activation handshake
 */
export function initSOS(onTriggered) {
  const btn = document.getElementById('sos-btn');
  if (!btn) return;

  const startHold = (e) => {
    e.preventDefault();
    btn.classList.add('holding');
    holdTimer = setTimeout(() => triggerSOS(btn, onTriggered), SOS_HOLD_MS);
  };
  
  const cancelHold = () => {
    clearTimeout(holdTimer);
    btn.classList.remove('holding');
  };

  btn.addEventListener('mousedown', startHold);
  btn.addEventListener('touchstart', startHold, { passive: false });
  btn.addEventListener('mouseup', cancelHold);
  btn.addEventListener('mouseleave', cancelHold);
  btn.addEventListener('touchend', cancelHold);
}

/**
 * Handle high-priority emergency packet dispatch assembly
 */
async function triggerSOS(btn, onTriggered) {
  btn.classList.remove('holding');
  btn.classList.add('sent');
  
  const label = btn.querySelector('#sos-label');
  if (label) label.textContent = '✓ ALERT TRANSMITTED';

  // Core Fallback Coordinates (Nigeria Fleet Cluster Base: Lagos)
  let lat = 6.5244;
  let lng = 3.3792;
  
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000, enableHighAccuracy: true }));
    lat = pos.coords.latitude;
    lng = pos.coords.longitude;
  } catch (geoError) {
    console.warn("Geolocator signal timeout or blocked. Dispatching with fleet base coordinates: ", geoError.message);
  }

  const timestampIsoString = new Date().toISOString();

  if (supabase) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        let driverIdentifierName = "Assigned Transit Driver";
        
        if (user) {
            // Retrieve driver profile parameters to hydrate clean string payloads for the Crisis Feed
            const { data: profile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', user.id)
                .single();
                
            if (profile && profile.full_name) {
                driverIdentifierName = profile.full_name;
            }
        }

        // FIXED: Insert directly into notifications table mapped securely to your system configurations
        await supabase.from('notifications').insert([{
          user_id: user?.id || null,
          title: "🚨 CRITICAL DRIVER SOS ALERT",
          message: `CRITICAL: Driver ${driverIdentifierName} needs help. Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          type: 'emergency',
          status: 'active',
          created_at: timestampIsoString
        }]);

    } catch (dbError) {
        console.error("Critical: Failed to sync fallback message payload to database:", dbError.message);
    }
  }

  if (onTriggered) {
      onTriggered({ lat, lng, timestamp: timestampIsoString });
  }

  // Dual haptic vibration alert loop for mobile screens
  if (navigator.vibrate) {
      navigator.vibrate([300, 150, 300, 150, 400]);
  }
}

/**
 * Archive/Resolve critical alerts inside your database schema parameters
 * @param {string} alertId - The target row ID key constraint string
 */
export async function resolveAlert(alertId) {
  if (!supabase) return;
  await supabase.from('notifications')
    .update({ resolved_at: new Date().toISOString(), status: 'resolved' })
    .eq('id', alertId);
}

/**
 * Download a listing matrix containing all true active safety threats
 */
export async function getActiveAlerts() {
  if (!supabase) return [];
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('type', 'emergency')
    .is('resolved_at', null)
    .order('created_at', { ascending: false });
  return data || [];
}

/**
 * Instantiates real-time WebSocket replication streams on your database pipeline
 * @param {Function} onAlert - Event handler function executed upon row changes
 */
export function subscribeToAlerts(onAlert) {
  if (!supabase) return;
  return supabase.channel('sos-alerts-pipe-feed')
    .on(
      'postgres_changes', 
      { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications', 
          filter: 'type=eq.emergency' 
      },
      (payload) => { 
          if (onAlert) onAlert(payload.new); 
      }
    )
    .subscribe();
}