/**
 * ANALYTICS.JS — Fleet Performance Engine
 * Tenant model: organization_id scoped on all queries
 */
import { supabase, getUserProfile } from './config.js';
import { signOut } from './auth.js';

let ORG_ID = null;

async function initAnalytics() {
  // ── 0. Resolve tenant ────────────────────────────────────────────────
  const profile = await getUserProfile();
  if (!profile || !profile.organization_id) {
    console.error('Analytics: No organization_id on profile.');
    return;
  }
  ORG_ID = profile.organization_id;

  const loader = document.getElementById('leaderboard-body');
  if (loader) loader.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:50px;"><i class="bi bi-arrow-clockwise spin" style="font-size:2rem;color:var(--navy);"></i></td></tr>';

  try {
    await updateKPICards();
    await renderCharts();
    await renderLeaderboard();
    setupGlobalListeners();
  } catch (err) {
    console.error('Analytics Error:', err);
  }
}

// ── 1. KPI CARDS ────────────────────────────────────────────────────────
async function updateKPICards() {
  const [tripsRes, incidentRes, delayRes, fuelRes] = await Promise.all([
    supabase.from('inspections')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', ORG_ID)
      .eq('status', 'completed'),

    supabase.from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'emergency')
      .eq('organization_id', ORG_ID),

    supabase.from('notifications')
      .select('*', { count: 'exact', head: true })
      .ilike('message', '%delayed%')
      .eq('organization_id', ORG_ID),

    supabase.from('inspections')
      .select('odometer_reading')
      .eq('organization_id', ORG_ID)
      .order('timestamp', { ascending: true })
  ]);

  const tripCount     = tripsRes.count   || 0;
  const incidentCount = incidentRes.count || 0;
  const delayCount    = delayRes.count   || 0;
  const odometerData  = fuelRes.data     || [];

  const onTimeRate  = tripCount > 0 ? Math.round(((tripCount - delayCount) / tripCount) * 100) : 100;
  const safetyScore = Math.max(0, 100 - (incidentCount * 12));

  let fuelBurned = 0;
  if (odometerData.length > 1) {
    const distance = odometerData[odometerData.length - 1].odometer_reading - odometerData[0].odometer_reading;
    fuelBurned = (distance / 8.5).toFixed(1);
  }

  const kpiMap = {
    'on-time-kpi':    `${onTimeRate}%`,
    'fuel-kpi':       `${fuelBurned}L`,
    'trip-count-kpi': tripCount.toLocaleString(),
    'safety-kpi':     `${safetyScore}%`,
    'incident-kpi':   incidentCount
  };

  Object.entries(kpiMap).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
}

// ── 2. CHARTS ────────────────────────────────────────────────────────────
async function renderCharts() {
  const last7Days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();

  const [tripLogs, incidentLogs, fuelLogs] = await Promise.all([
    supabase.from('inspections')
      .select('timestamp')
      .eq('organization_id', ORG_ID)
      .eq('status', 'completed'),

    supabase.from('notifications')
      .select('created_at')
      .eq('type', 'emergency')
      .eq('organization_id', ORG_ID),

    supabase.from('inspections')
      .select('timestamp, odometer_reading')
      .eq('organization_id', ORG_ID)
  ]);

  const labels        = last7Days.map(d => new Date(d).toLocaleDateString('en-US', { weekday: 'short' }));
  const tripDaily     = last7Days.map(date => tripLogs.data?.filter(t => t.timestamp?.startsWith(date)).length || 0);
  const incidentDaily = last7Days.map(date => incidentLogs.data?.filter(i => i.created_at?.startsWith(date)).length || 0);
  const fuelDaily     = last7Days.map(date => {
    const dayData = fuelLogs.data?.filter(f => f.timestamp?.startsWith(date)) || [];
    if (dayData.length < 2) return 0;
    const dist = Math.max(...dayData.map(d => d.odometer_reading)) - Math.min(...dayData.map(d => d.odometer_reading));
    return (dist / 8.5).toFixed(1);
  });

  const chartStyle = (color) => ({
    borderColor: color, backgroundColor: color + '1A',
    fill: true, tension: 0.4, borderWidth: 3, pointRadius: 4
  });

  const commonOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
      x: { grid: { display: false } }
    }
  };

  const ontimeEl = document.getElementById('ontime-chart');
  const fuelEl   = document.getElementById('fuel-trend-chart');
  const tripsEl  = document.getElementById('trips-chart');

  if (ontimeEl) new Chart(ontimeEl, { type: 'line', data: { labels, datasets: [{ data: tripDaily,     ...chartStyle('#22C55E') }] }, options: commonOptions });
  if (fuelEl)   new Chart(fuelEl,   { type: 'line', data: { labels, datasets: [{ data: fuelDaily,     ...chartStyle('#FDB813') }] }, options: commonOptions });
  if (tripsEl)  new Chart(tripsEl,  { type: 'line', data: { labels, datasets: [{ data: incidentDaily, ...chartStyle('#EF4444') }] }, options: commonOptions });
}

// ── 3. LEADERBOARD ───────────────────────────────────────────────────────
async function renderLeaderboard() {
  const [driversRes, alertsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('role', 'driver').eq('organization_id', ORG_ID),
    supabase.from('notifications').select('user_id, type').eq('type', 'emergency').eq('organization_id', ORG_ID)
  ]);

  const driverList = driversRes.data || [];
  const alertList  = alertsRes.data  || [];

  const stats = driverList.map(d => {
    const incidents = alertList.filter(a => a.user_id === d.id).length;
    const score     = Math.max(0, 100 - (incidents * 15));
    return { ...d, score, incidents, trend: incidents > 0 ? 'down' : 'up' };
  }).sort((a, b) => b.score - a.score);

  const desktopBody = document.getElementById('leaderboard-body');
  if (desktopBody) {
    desktopBody.innerHTML = stats.slice(0, 10).map((d, i) => `
      <tr>
        <td style="font-weight:800;">#${i + 1}</td>
        <td><div style="display:flex;align-items:center;gap:10px;">
          <div style="width:30px;height:30px;background:var(--bg);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;border:1px solid var(--border);">${d.full_name ? d.full_name[0].toUpperCase() : 'D'}</div>
          <span style="font-weight:700;">${d.full_name || 'Unknown Driver'}</span>
        </div></td>
        <td><span class="badge badge-navy-outline">${d.bus_id || 'N/A'}</span></td>
        <td><strong style="color:${d.score >= 80 ? '#22C55E' : '#FDB813'}">${d.score}%</strong></td>
        <td><i class="bi bi-caret-${d.trend === 'up' ? 'up-fill text-green' : 'down-fill text-red'}"></i></td>
        <td>${d.incidents}</td>
        <td style="text-align:right;"><button class="btn-table edit" onclick="window.viewDriverDetails('${d.id}')">VIEW</button></td>
      </tr>`).join('');
  }

  const mobileBody = document.getElementById('leaderboard-body-mobile');
  if (mobileBody) {
    mobileBody.innerHTML = stats.slice(0, 5).map((d, i) => `
      <div class="mobile-performance-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="display:flex;gap:10px;align-items:center;">
            <span style="font-weight:900;color:var(--navy);">#${i + 1}</span>
            <span style="font-weight:700;">${d.full_name || 'Unknown Driver'}</span>
          </div>
          <button class="btn btn-ghost btn-xs" style="font-weight:700;color:var(--navy);" onclick="window.viewDriverDetails('${d.id}')">Insights</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div style="background:var(--bg);padding:10px;border-radius:10px;"><small style="display:block;font-size:9px;color:var(--text-muted);">SCORE</small><strong>${d.score}%</strong></div>
          <div style="background:var(--bg);padding:10px;border-radius:10px;"><small style="display:block;font-size:9px;color:var(--text-muted);">BUS</small><strong>${d.bus_id || 'N/A'}</strong></div>
        </div>
      </div>`).join('');
  }
}

// ── 4. LISTENERS ─────────────────────────────────────────────────────────
function setupGlobalListeners() {
  const logoutBtn  = document.getElementById('signout-btn');
  if (logoutBtn) logoutBtn.onclick = () => signOut();

  const timeFilter = document.getElementById('time-filter');
  if (timeFilter) timeFilter.onchange = () => initAnalytics();
}

initAnalytics();