/**
 * SAFETY.JS — SOS Emergency Alert System
 * Tenant model: organization_id scoped on all inserts
 */

import { supabase } from '../config.js';

const SOS_HOLD_MS = 5000;
let holdTimer = null;

/**
 * Initialize hold-to-activate SOS button
 * @param {string} orgId       - Organization ID for tenant scoping
 * @param {Function} onTriggered - Callback on successful activation
 */
export function initSOS(orgId, onTriggered) {
  const btn = document.getElementById('sos-btn');
  if (!btn) return;

  const startHold = (e) => {
    e.preventDefault();
    btn.classList.add('holding');
    holdTimer = setTimeout(() => triggerSOS(btn, orgId, onTriggered), SOS_HOLD_MS);
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

async function triggerSOS(btn, orgId, onTriggered) {
  btn.classList.remove('holding');
  btn.classList.add('sent');

  const label = btn.querySelector('#sos-label');
  if (label) label.textContent = '✓ ALERT TRANSMITTED';

  let lat = 6.5244;
  let lng = 3.3792;

  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000, enableHighAccuracy: true }));
    lat = pos.coords.latitude;
    lng = pos.coords.longitude;
  } catch (geoErr) {
    console.warn('GPS timeout — using fallback coords:', geoErr.message);
  }

  const timestamp = new Date().toISOString();

  if (supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let driverName = 'Assigned Driver';

      if (user) {
        const { data: p } = await supabase
          .from('profiles').select('full_name').eq('id', user.id).single();
        if (p?.full_name) driverName = p.full_name;
      }

      // emergency_alerts — scoped to org
      await supabase.from('emergency_alerts').insert([{
        driver_id:       user?.id || null,
        lat,
        lng,
        status:          'active',
        organization_id: orgId,                    // ← scoped to tenant
        timestamp
      }]);

      // notifications — scoped to org
      await supabase.from('notifications').insert([{
        user_id:         user?.id || null,
        title:           '🚨 CRITICAL DRIVER SOS ALERT',
        message:         `CRITICAL: Driver ${driverName} needs help. Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        type:            'emergency',
        status:          'active',
        organization_id: orgId,                    // ← scoped to tenant
        created_at:      timestamp
      }]);

    } catch (err) {
      console.error('SOS DB write failed:', err.message);
    }
  }

  if (onTriggered) onTriggered({ lat, lng, timestamp });
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 400]);
}

export async function resolveAlert(alertId, orgId) {
  if (!supabase) return;
  await supabase.from('notifications')
    .update({ resolved_at: new Date().toISOString(), status: 'resolved' })
    .eq('id', alertId)
    .eq('organization_id', orgId);
}

export async function getActiveAlerts(orgId) {
  if (!supabase) return [];
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('type', 'emergency')
    .eq('organization_id', orgId)
    .is('resolved_at', null)
    .order('created_at', { ascending: false });
  return data || [];
}

export function subscribeToAlerts(orgId, onAlert) {
  if (!supabase) return;
  return supabase.channel(`sos-${orgId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
      filter: `organization_id=eq.${orgId}`        // ← scoped to tenant
    }, (payload) => {
      if (payload.new.type === 'emergency' && onAlert) onAlert(payload.new);
    })
    .subscribe();
}