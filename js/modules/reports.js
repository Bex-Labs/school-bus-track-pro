/**
 * REPORTS.JS — Anonymous Incident Reporting Engine
 * Production Edition: Real-time broadcast syncing integrated.
 */

import { supabase } from '../config.js';

/**
 * Initialize individual page event listeners for parent submission workflows
 */
export function initReporting() {
  const form = document.getElementById('incident-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btn = form.querySelector('button[type="submit"]');
    const type    = document.getElementById('report-type')?.value;
    const details = document.getElementById('report-details')?.value;
    const time    = document.getElementById('incident-time')?.value;

    if (!type || !details) {
        alert("Please provide the required report category and structural details.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Transmitting securely...';
    }

    const refNumber = 'RPT-' + Date.now().toString().slice(-8);
    const executionTimestamp = new Date().toISOString();

    if (supabase) {
      try {
          // 1. Commit explicit data state straight to public.incident_reports table
          const { error } = await supabase.from('incident_reports').insert([{
            report_type: type,
            details,
            incident_time: time ? new Date(time).toISOString() : executionTimestamp,
            reference: refNumber,
            status: 'open',
            submitted_at: executionTimestamp
            // No account user_id assigned — strict anonymity enforced by architectural design
          }]);

          if (error) throw error;

          // 2. Fire live WebSocket channel broadcast to hydrate Admin Crisis center view instantly
          const liveBroadcastPipe = supabase.channel('global-fleet-broadcast');
          liveBroadcastPipe.send({
              type: 'broadcast',
              event: 'incident-report-submitted',
              payload: {
                  reference: refNumber,
                  report_type: type,
                  details: details,
                  submitted_at: executionTimestamp
              }
          });

          showSuccess(refNumber);

      } catch (err) {
          console.error('Incident transmission protocol failure:', err.message);
          alert("Data write blocked: Verify connection matrices and try again.");
          if (btn) {
              btn.disabled = false;
              btn.innerHTML = 'Submit Incident Report';
          }
      }
    }
  });
}

/**
 * Renders success confirmation views onto screen nodes
 * @param {string} refNumber - The generated tracking ticket code
 */
function showSuccess(refNumber) {
  const formView    = document.getElementById('report-form-view');
  const successView = document.getElementById('success-view');
  const refEl       = document.getElementById('ref-number');

  if (formView) formView.style.display = 'none';
  if (successView) successView.style.display = 'block';
  if (refEl) refEl.textContent = refNumber;
}

/**
 * Downloads a structured data listing containing logged complaints
 * @param {string} status - Filter criterion parameter string ('open' / 'resolved')
 */
export async function getReports(status = 'open') {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('incident_reports')
    .select('*')
    .eq('status', status)
    .order('submitted_at', { ascending: false });
    
  if (error) {
      console.error("Failed to query reports collection archive:", error.message);
      return [];
  }
  return data || [];
}

/**
 * Resolves and archives active parent complaints inside database layers
 * @param {string} reportId - The unique primary key identifier code
 */
export async function resolveReport(reportId) {
  if (!supabase) return;
  const { error } = await supabase.from('incident_reports')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', reportId);
    
  if (error) {
      console.error("Failed to commit case resolution state update:", error.message);
  }
}