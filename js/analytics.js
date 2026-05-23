/**
 * ANALYTICS.JS — High-Density Performance Engine
 * Optimized: Linked dynamically to Driver Telemetry Inspector overlays
 */
import { supabase } from './config.js';
import { signOut } from './auth.js';

async function initAnalytics() {
    console.log("Analytics Engine: Booting System...");
    
    const loader = document.getElementById('leaderboard-body');
    if (loader) loader.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:50px;"><i class="bi bi-arrow-clockwise spin" style="font-size:2rem; color:var(--navy);"></i></td></tr>';

    try {
        await updateKPICards();
        await renderCharts();
        await renderLeaderboard();
        setupGlobalListeners();
    } catch (error) {
        console.error("Analytics Error:", error);
    }
}

// --- 1. KPI CORE LOGIC ---
async function updateKPICards() {
    const [tripsRes, incidentRes, delayRes, fuelRes] = await Promise.all([
        supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('title', '✅ DAILY INSPECTION PASSED'),
        supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('type', 'emergency'),
        supabase.from('notifications').select('*', { count: 'exact', head: true }).ilike('message', '%delayed%'),
        supabase.from('inspections').select('odometer_reading').order('created_at', { ascending: true })
    ]);

    const tripCount = tripsRes.count || 0;
    const incidentCount = incidentRes.count || 0;
    const delayCount = delayRes.count || 0;
    const odometerData = fuelRes.data || [];

    const onTimeRate = tripCount > 0 ? Math.round(((tripCount - delayCount) / tripCount) * 100) : 100;
    const safetyScore = Math.max(0, 100 - (incidentCount * 12));

    let fuelBurned = 0;
    if (odometerData.length > 1) {
        const distance = odometerData[odometerData.length - 1].odometer_reading - odometerData[0].odometer_reading;
        fuelBurned = (distance / 8.5).toFixed(1); 
    }

    const kpiMap = {
        'on-time-kpi': `${onTimeRate}%`,
        'fuel-kpi': `${fuelBurned}L`,
        'trip-count-kpi': tripCount.toLocaleString(),
        'safety-kpi': `${safetyScore}%`,
        'incident-kpi': incidentCount
    };

    Object.keys(kpiMap).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = kpiMap[id];
    });
}

// --- 2. TEMPORAL CHARTS (LINE CHARTS ONLY) ---
async function renderCharts() {
    const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
    }).reverse();

    const [tripLogs, incidentLogs, fuelLogs] = await Promise.all([
        supabase.from('notifications').select('created_at').eq('title', '✅ DAILY INSPECTION PASSED'),
        supabase.from('notifications').select('created_at').eq('type', 'emergency'),
        supabase.from('inspections').select('created_at, odometer_reading')
    ]);

    const labels = last7Days.map(d => new Date(d).toLocaleDateString('en-US', { weekday: 'short' }));
    
    const tripDaily = last7Days.map(date => tripLogs.data?.filter(t => t.created_at.startsWith(date)).length || 0);
    const incidentDaily = last7Days.map(date => incidentLogs.data?.filter(i => i.created_at.startsWith(date)).length || 0);
    const fuelDaily = last7Days.map(date => {
        const dayData = fuelLogs.data?.filter(f => f.created_at.startsWith(date)) || [];
        if (dayData.length < 2) return 0;
        const dist = Math.max(...dayData.map(d => d.odometer_reading)) - Math.min(...dayData.map(d => d.odometer_reading));
        return (dist / 8.5).toFixed(1);
    });

    const chartStyle = (color) => ({
        borderColor: color,
        backgroundColor: color + '1A', // 10% Opacity
        fill: true,
        tension: 0.4,
        borderWidth: 3,
        pointRadius: 4
    });

    const commonOptions = { 
        responsive: true, maintainAspectRatio: false, 
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }
    };

    new Chart(document.getElementById('ontime-chart'), { type: 'line', data: { labels, datasets: [{ data: tripDaily, ...chartStyle('#22C55E') }] }, options: commonOptions });
    new Chart(document.getElementById('fuel-trend-chart'), { type: 'line', data: { labels, datasets: [{ data: fuelDaily, ...chartStyle('#FDB813') }] }, options: commonOptions });
    new Chart(document.getElementById('trips-chart'), { type: 'line', data: { labels, datasets: [{ data: incidentDaily, ...chartStyle('#EF4444') }] }, options: commonOptions });
}

// --- 3. DUAL-VIEW LEADERBOARD & VIEW FIX ---
async function renderLeaderboard() {
    const [driversRes, alertsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'driver'),
        supabase.from('notifications').select('user_id, type')
    ]);

    const drivers = driversRes.data || [];
    const alerts = alertsRes.data || [];
    
    const stats = drivers.map(d => {
        const incidents = alerts.filter(a => a.user_id === d.id && a.type === 'emergency').length;
        const score = Math.max(0, 100 - (incidents * 15));
        return { ...d, score, incidents, trend: incidents > 0 ? 'down' : 'up' };
    }).sort((a, b) => b.score - a.score);

    // Desktop View
    // FIXED: Maps inline action triggers explicitly to window.viewDriverDetails
    document.getElementById('leaderboard-body').innerHTML = stats.slice(0, 10).map((d, i) => `
        <tr>
            <td style="font-weight:800;">#${i + 1}</td>
            <td><div style="display:flex; align-items:center; gap:10px;">
                <div class="td-avatar" style="width:30px; height:30px; background:var(--bg); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:800; border: 1px solid var(--border);">${d.full_name ? d.full_name[0].toUpperCase() : 'D'}</div>
                <span style="font-weight:700;">${d.full_name || 'Unknown Driver'}</span>
            </div></td>
            <td><span class="badge badge-navy-outline">${d.bus_id || 'N/A'}</span></td>
            <td><strong style="color:${d.score >= 80 ? '#22C55E' : '#FDB813'}">${d.score}%</strong></td>
            <td><i class="bi bi-caret-${d.trend === 'up' ? 'up-fill text-green' : 'down-fill text-red'}"></i></td>
            <td>${d.incidents}</td>
            <td style="text-align:right;"><button class="btn-table edit" onclick="window.viewDriverDetails('${d.id}')">VIEW</button></td>
        </tr>`).join('');

    // Mobile View
    // FIXED: Maps mobile insight action triggers explicitly to window.viewDriverDetails
    document.getElementById('leaderboard-body-mobile').innerHTML = stats.slice(0, 5).map((d, i) => `
        <div class="mobile-performance-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div style="display:flex; gap:10px; align-items:center;">
                    <span style="font-weight:900; color:var(--navy);">#${i+1}</span>
                    <span style="font-weight:700;">${d.full_name || 'Unknown Driver'}</span>
                </div>
                <button class="btn btn-ghost btn-xs" style="font-weight:700; color:var(--navy);" onclick="window.viewDriverDetails('${d.id}')">Insights</button>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div style="background:var(--bg); padding:10px; border-radius:10px;"><small style="display:block; font-size:9px; color:var(--text-muted);">SCORE</small><strong>${d.score}%</strong></div>
                <div style="background:var(--bg); padding:10px; border-radius:10px;"><small style="display:block; font-size:9px; color:var(--text-muted);">BUS</small><strong>${d.bus_id || 'N/A'}</strong></div>
            </div>
        </div>`).join('');
}

function setupGlobalListeners() {
    const logoutBtn = document.getElementById('signout-btn');
    if (logoutBtn) logoutBtn.onclick = () => signOut();
    
    const timeFilter = document.getElementById('time-filter');
    if (timeFilter) timeFilter.onchange = () => initAnalytics();
}

function showToast(m, t='info') {
    const c = document.getElementById('toast-container');
    const d = document.createElement('div');
    d.className = `toast ${t} active`;
    d.innerHTML = `<span>${m}</span>`;
    if(c) {
        c.appendChild(d);
        setTimeout(() => d.remove(), 4000);
    }
}

// Boot Engine
initAnalytics();