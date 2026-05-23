/**
 * CHECKLIST.JS — Pre-Trip Inspection Gate Logic
 * Production Edition: Auto-syncs KPI entries with the fleet analytics pipeline.
 */

import { supabase } from '../config.js';

/**
 * Initialize pre-trip inspection checklist submission listeners
 */
export function initChecklist() {
  const form = document.getElementById('checklist-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btn = form.querySelector('button[type="submit"]');
    const odometer = document.getElementById('odometer')?.value;
    const notes    = document.getElementById('notes')?.value || '';

    if (!odometer) {
        alert("Please input the current vehicle odometer reading to proceed.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Committing safety logs...';
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Authenticated driver session missing.");

        const executionTimestamp = new Date().toISOString();

        // 1. Commit raw logging entry straight to public.inspections for safety archiving
        const { error: inspectError } = await supabase.from('inspections').insert([{
          driver_id: user.id,
          odometer_reading: parseInt(odometer),
          notes,
          status: 'completed',
          created_at: executionTimestamp
        }]);

        if (inspectError) throw inspectError;

        // 2. Hydrate centralized notification matrix with the token title needed by Analytics KPIs
        let vehicleIdText = "Assigned Transit Unit";
        const { data: profile } = await supabase.from('profiles').select('bus_id').eq('id', user.id).single();
        if (profile && profile.bus_id) {
            vehicleIdText = `Bus ${profile.bus_id}`;
        }

        await supabase.from('notifications').insert([{
            user_id: user.id,
            title: "✅ DAILY INSPECTION PASSED",
            message: `Pre-trip safety gate check cleared successfully for ${vehicleIdText}. Starting odometer: ${parseInt(odometer)} km.`,
            type: 'info',
            status: 'logged',
            created_at: executionTimestamp
        }]);

        // Lock verification status state locally to bypass safety gates for the rest of the day
        localStorage.setItem('checklist_completed_today', new Date().toDateString());
        window.location.href = 'dashboard.html';

    } catch (err) {
        console.error('Checklist verification gate failure:', err.message);
        alert("Verification synchronization stalled: " + err.message);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Complete Gate Verification';
        }
    }
  });
}

/**
 * Validates whether the driver has cleared their safety checks for the calendar date
 * @returns {boolean}
 */
export function isChecklistDoneToday() {
  return localStorage.getItem('checklist_completed_today') === new Date().toDateString();
}

/**
 * Unlocks the live tracking controls panel inside active driver dashboards
 */
export function unlockDashboard() {
  const startBtn = document.getElementById('start-trip-btn');
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.title = 'Start your trip';
  }
  const checklistLink = document.getElementById('checklist-btn');
  if (checklistLink) checklistLink.classList.remove('highlight');
}