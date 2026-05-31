// supabase/functions/send-transit-alert/index.ts
// DB trigger fires on notifications INSERT
// Route 1: type=emergency → SOS email to all school managers in org + all BEX super admins
// Route 2: type=info + PROXIMITY title → proximity email to parents with email_enabled

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY       = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL           = 'iamtissvn@gmail.com'
const APP_NAME             = 'School Bus Track Pro'

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { record } = await req.json()

    if (!record) {
      return new Response(JSON.stringify({ error: 'Missing notification record.' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // ── ROUTE 1: SOS EMERGENCY ────────────────────────────────────────────
    if (record.type === 'emergency') {
      console.log(`[SOS] Processing emergency alert ID: ${record.id}`)

      // 1a. Parse GPS coordinates from message
      const coordMatch = record.message?.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
      let lat: number | null = null
      let lng: number | null = null
      let coordStr = 'Not available'
      let mapsLink = '#'

      if (coordMatch) {
        lat      = parseFloat(coordMatch[1])
        lng      = parseFloat(coordMatch[2])
        coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
        mapsLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      }

      // 1b. Fetch driver profile + bus ID + org
      let driverName = 'Unknown Driver'
      let busId      = 'Unknown Bus'
      let orgId      = record.organization_id || null

      if (record.user_id) {
        const { data: dp } = await supabase
          .from('profiles')
          .select('full_name, bus_id, organization_id')
          .eq('id', record.user_id)
          .single()

        if (dp) {
          driverName = dp.full_name  || 'Unknown Driver'
          busId      = dp.bus_id     || 'Unknown Bus'
          orgId      = dp.organization_id || orgId
        }
      }

      // 1c. Fetch school name
      let schoolName = 'Unknown School'
      if (orgId) {
        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', orgId)
          .single()
        if (org) schoolName = org.name
      }

      // 1d. Collect recipients: all school_managers in this org
      const recipients: string[] = []

      if (orgId) {
        const { data: managers } = await supabase
          .from('profiles')
          .select('email')
          .eq('role', 'school_manager')
          .eq('organization_id', orgId)
          .not('email', 'is', null)

        managers?.forEach(m => { if (m.email) recipients.push(m.email) })
      }

      // 1e. Collect recipients: all BEX super admins
      const { data: superAdmins } = await supabase
        .from('profiles')
        .select('email')
        .eq('role', 'super_admin')
        .not('email', 'is', null)

      superAdmins?.forEach(a => {
        if (a.email && !recipients.includes(a.email)) recipients.push(a.email)
      })

      if (recipients.length === 0) {
        console.warn('[SOS] No recipients found.')
        return new Response(JSON.stringify({ success: true, message: 'No recipients to notify.' }), {
          status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      console.log(`[SOS] Sending to ${recipients.length} recipient(s): ${recipients.join(', ')}`)

      const timestamp = new Date().toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long',
        day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
      })

      // 1f. Build email HTML
      const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1);">

    <div style="background:#dc2626;padding:28px 32px;">
      <p style="margin:0 0 6px 0;font-size:11px;font-weight:800;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1.5px;">Emergency Alert — ${APP_NAME}</p>
      <h1 style="margin:0;font-size:22px;font-weight:900;color:white;">🚨 Driver SOS Signal Activated</h1>
      <p style="margin:8px 0 0 0;font-size:13px;color:rgba(255,255,255,0.8);">${schoolName}</p>
    </div>

    <div style="background:#fef2f2;border-bottom:2px solid #fca5a5;padding:16px 32px;display:flex;align-items:center;gap:12px;">
      <div>
        <p style="margin:0;font-size:14px;font-weight:800;color:#991b1b;">⚠️ IMMEDIATE ACTION REQUIRED</p>
        <p style="margin:4px 0 0 0;font-size:12px;color:#b91c1c;">A driver has activated the emergency SOS signal. Respond immediately.</p>
      </div>
    </div>

    <div style="padding:28px 32px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;border-radius:8px;overflow:hidden;">
        <tr style="background:#f8fafc;">
          <td style="padding:12px 16px;font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;width:35%;">Driver</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#0f172a;">${driverName}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Bus ID</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#0f172a;font-family:monospace;">${busId}</td>
        </tr>
        <tr style="background:#f8fafc;">
          <td style="padding:12px 16px;font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">School</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#0f172a;">${schoolName}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Timestamp</td>
          <td style="padding:12px 16px;font-size:13px;color:#0f172a;">${timestamp}</td>
        </tr>
        <tr style="background:#f8fafc;">
          <td style="padding:12px 16px;font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Alert Message</td>
          <td style="padding:12px 16px;font-size:13px;color:#0f172a;line-height:1.5;">${record.message || 'No message provided'}</td>
        </tr>
      </table>

      ${lat !== null ? `
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
        <p style="margin:0 0 6px 0;font-size:11px;font-weight:800;color:#166534;text-transform:uppercase;letter-spacing:1px;">📍 GPS Coordinates</p>
        <p style="margin:0 0 16px 0;font-size:20px;font-weight:900;color:#0f172a;font-family:monospace;letter-spacing:2px;">${coordStr}</p>
        <a href="${mapsLink}" target="_blank"
           style="display:inline-block;background:#0f172a;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:800;font-size:14px;">
          🗺️ Open in Google Maps
        </a>
      </div>` : `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;margin-bottom:24px;text-align:center;">
        <p style="margin:0;font-size:13px;color:#92400e;font-weight:700;">⚠️ GPS coordinates were not available at time of alert.</p>
      </div>`}

      <div style="text-align:center;margin-bottom:8px;">
        <a href="https://bexlabstrack.com/admin/crisis-center.html"
           style="display:inline-block;background:#dc2626;color:white;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:800;font-size:15px;">
          🚨 Open Crisis Center
        </a>
      </div>
    </div>

    <div style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">
        Automated emergency alert from <strong>${APP_NAME}</strong>.<br>
        Alert Reference: <code style="background:#e2e8f0;padding:1px 6px;border-radius:3px;">${record.id || 'N/A'}</code>
      </p>
    </div>

  </div>
</body>
</html>`

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:    FROM_EMAIL,
          to:      recipients,
          subject: `🚨 SOS ALERT — ${driverName} · Bus ${busId} · ${schoolName}`,
          html,
        })
      })

      if (!resendRes.ok) {
        const errText = await resendRes.text()
        throw new Error(`Resend SOS delivery failed: ${errText}`)
      }

      console.log(`[SOS] Dispatched to ${recipients.length} recipient(s).`)

      return new Response(JSON.stringify({
        success:    true,
        recipients: recipients.length,
        driver:     driverName,
        bus:        busId,
        school:     schoolName,
      }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // ── ROUTE 2: PROXIMITY ALERT → parents with email_enabled ─────────────
    if (record.type === 'info' && record.title?.includes('PROXIMITY')) {
      console.log(`[PROXIMITY] Processing geofence alert ID: ${record.id}`)

      const busMatch = record.message?.match(/Bus\s+([a-zA-Z0-9_-]+)/i)
      if (!busMatch) {
        return new Response(JSON.stringify({ success: true, message: 'No bus ID in message.' }), {
          status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const parsedBusId = busMatch[1]

      const { data: students } = await supabase
        .from('students')
        .select('parent_id')
        .eq('bus_id', parsedBusId)

      if (!students?.length) {
        return new Response(JSON.stringify({ success: true, message: 'No students on this bus.' }), {
          status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const parentIds = [...new Set(students.map(s => s.parent_id).filter(Boolean))]

      const { data: parents } = await supabase
        .from('profiles')
        .select('email')
        .in('id', parentIds)
        .eq('email_enabled', true)
        .not('email', 'is', null)  // Fixed: was .is('email', null === false)

      if (!parents?.length) {
        return new Response(JSON.stringify({ success: true, message: 'No parents with email_enabled.' }), {
          status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const parentEmails = parents.map(p => p.email)

      const proximityHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
    <div style="background:#0f172a;padding:28px 32px;">
      <p style="margin:0 0 6px 0;font-size:11px;font-weight:800;color:#fdb813;text-transform:uppercase;letter-spacing:1.5px;">${APP_NAME}</p>
      <h1 style="margin:0;font-size:20px;font-weight:900;color:white;">🚌 Bus Approaching Your Area</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 20px 0;">${record.message}</p>
      <p style="font-size:12px;color:#94a3b8;margin:0;">Automated proximity notification from ${APP_NAME}.</p>
    </div>
  </div>
</body>
</html>`

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:    FROM_EMAIL,
          to:      parentEmails,
          subject: record.title || "🚌 Your child's bus is nearby",
          html:    proximityHtml,
        })
      })

      if (!resendRes.ok) {
        const errText = await resendRes.text()
        throw new Error(`Resend proximity delivery failed: ${errText}`)
      }

      return new Response(JSON.stringify({ success: true, parents_notified: parentEmails.length }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // ── All other types — no email needed ──────────────────────────────────
    return new Response(JSON.stringify({ success: true, message: 'No email route matched.' }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[send-transit-alert] Fatal error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})