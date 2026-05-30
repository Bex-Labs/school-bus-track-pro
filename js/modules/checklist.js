/**
 * CHECKLIST.JS — Pre-Trip Inspection Gate Logic
 * Tenant model: organization_id scoped on all inserts
 */

import { supabase } from '../config.js';

/**
 * Initialize pre-trip inspection submission
 * @param {string} orgId - Organization ID for tenant scoping
 */
export function initChecklist(orgId) {
  const form = document.getElementById('checklist-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn      = form.querySelector('button[type="submit"]');
    const odometer = document.getElementById('odometer')?.value;
    const notes    = document.getElementById('notes')?.value || '';

    if (!odometer) {
      alert('Please enter the current odometer reading.');
      return;
    }

    if (btn) {
      btn.disabled  = true;
      btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Logging...';
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated session.');

      const timestamp = new Date().toISOString();

      // inspections — scoped to org
      const { error: inspErr } = await supabase.from('inspections').insert([{
        driver_id:        user.id,
        odometer_reading: parseInt(odometer),
        notes,
        status:           'completed',
        organization_id:  orgId,                   // ← scoped to tenant
        timestamp
      }]);
      if (inspErr) throw inspErr;

      // Get bus for notification message
      const { data: p } = await supabase
        .from('profiles').select('bus_id').eq('id', user.id).single();

      // notifications — scoped to org
      await supabase.from('notifications').insert([{
        user_id:         user.id,
        title:           '✅ DAILY INSPECTION PASSED',
        message:         `Pre-trip check cleared for Bus ${p?.bus_id || 'N/A'}. Odometer: ${parseInt(odometer)} km.`,
        type:            'info',
        status:          'logged',
        organization_id: orgId,                    // ← scoped to tenant
        created_at:      timestamp
      }]);

      localStorage.setItem('checklist_completed_today', new Date().toDateString());
      window.location.href = 'dashboard.html';

    } catch (err) {
      console.error('Checklist submission failed:', err.message);
      alert('Submission failed: ' + err.message);
      if (btn) {
        btn.disabled  = false;
        btn.innerHTML = 'Submit Inspection';
      }
    }
  });
}

export function isChecklistDoneToday() {
  return localStorage.getItem('checklist_completed_today') === new Date().toDateString();
}

export function unlockDashboard() {
  const startBtn = document.getElementById('start-trip-btn');
  if (startBtn) { startBtn.disabled = false; startBtn.title = 'Start your trip'; }
  const checklistLink = document.getElementById('checklist-btn');
  if (checklistLink) checklistLink.classList.remove('highlight');
}