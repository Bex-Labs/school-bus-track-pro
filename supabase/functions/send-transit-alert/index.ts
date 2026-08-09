// supabase/functions/send-transit-alert/index.ts
// Route 1: SOS (type=emergency) → emails managers + security/medical dept + parents' emergency contacts
//   sos_type=standard → security dept + parents emergency contacts
//   sos_type=health   → medical dept + parents emergency contacts
// Route 2: Proximity (type=info + PROXIMITY title) → emails parents with email_enabled on that bus

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BREVO_API_KEY        = Deno.env.get('BREVO_API_KEY')!
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL           = 'iamtissvn@gmail.com'
const FROM_NAME            = 'School Bus Track Pro'
const APP_NAME             = 'School Bus Track Pro'

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendBrevoEmail(to: string[], subject: string, html: string) {
  if (!to || to.length === 0) return
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: to.map(email => ({ email })),
      subject,
      htmlContent: html
    })
  })
  return res
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const payload = await req.json()

    // Support both direct call and DB webhook
    const notification = payload.record || payload
    const { type, title, message, user_id, bus_id, organization_id, sos_type } = notification

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ── ROUTE 1: SOS EMERGENCY ──────────────────────────────────────────────
    if (type === 'emergency') {
      const isHealth = sos_type === 'health'
      const icon     = isHealth ? '🚑' : '🚨'
      const label    = isHealth ? 'HEALTH EMERGENCY' : 'ROAD EMERGENCY'
      const color    = isHealth ? '#7c3aed' : '#dc2626'
      const lightBg  = isHealth ? '#f5f3ff' : '#fef2f2'
      const lightBdr = isHealth ? '#ddd6fe' : '#fecaca'
      const lightTxt = isHealth ? '#4c1d95' : '#991b1b'

      // ── Get driver info ──────────────────────────────────────────────────
      const { data: driver } = await supabase
        .from('profiles')
        .select('full_name, bus_id, organization_id')
        .eq('id', user_id)
        .single()

      const orgId      = organization_id || driver?.organization_id
      const busId      = bus_id || driver?.bus_id
      const driverName = driver?.full_name || 'Unknown Driver'

      // ── Get org details + emergency contacts ─────────────────────────────
      const { data: org } = await supabase
        .from('organizations')
        .select('name, security_email, medical_email')
        .eq('id', orgId)
        .single()

      const schoolName = org?.name || 'Unknown School'
      const deptEmail  = isHealth ? org?.medical_email : org?.security_email
      const deptLabel  = isHealth ? 'Medical Department' : 'Security Department'

      // ── Parse GPS coordinates from message ───────────────────────────────
      const coordMatch = message?.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
      const lat        = coordMatch ? coordMatch[1] : null
      const lng        = coordMatch ? coordMatch[2] : null
      const mapsLink   = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null

      // ── Get school managers ──────────────────────────────────────────────
      const { data: managers } = await supabase
        .from('profiles')
        .select('email')
        .eq('role', 'school_manager')
        .eq('organization_id', orgId)
        .not('email', 'is', null)

      // ── Get parents' emergency contact emails for students on this bus ───
      const { data: students } = await supabase
        .from('students')
        .select('emergency_contact_email, emergency_contact_name, full_name')
        .eq('bus_id', busId)
        .eq('organization_id', orgId)
        .not('emergency_contact_email', 'is', null)

      const parentEmergencyEmails = (students || [])
        .map(s => s.emergency_contact_email)
        .filter(Boolean)

      // ── Build recipient list ─────────────────────────────────────────────
      const recipients = [
        ...(managers || []).map(m => m.email),
        ...(deptEmail ? [deptEmail] : []),
        ...parentEmergencyEmails
      ].filter(Boolean) as string[]

      // Deduplicate
      const uniqueRecipients = [...new Set(recipients)]

      if (uniqueRecipients.length === 0) {
        return new Response(JSON.stringify({ success: true, message: 'No recipients configured' }), {
          status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      // ── Students on bus list for email ───────────────────────────────────
      const studentListHTML = students && students.length > 0
        ? `<div style="margin-bottom:20px;">
            <p style="font-size:12px;font-weight:800;color:${lightTxt};text-transform:uppercase;margin:0 0 8px 0;">Students on Bus ${busId}:</p>
            ${students.map(s => `<p style="margin:0 0 4px 0;font-size:13px;color:#374151;">• ${s.full_name}</p>`).join('')}
           </div>`
        : ''

      // ── Email HTML ───────────────────────────────────────────────────────
      const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">

    <div style="background:${color};padding:32px 40px;text-align:center;">
      <p style="margin:0 0 8px 0;font-size:11px;font-weight:800;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px;">${APP_NAME} — ${label}</p>
      <div style="font-size:48px;margin-bottom:8px;">${icon}</div>
      <h1 style="margin:0;font-size:24px;font-weight:900;color:white;">${label}</h1>
    </div>

    <div style="padding:40px;">
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:16px;margin-bottom:24px;text-align:center;">
        <p style="font-size:16px;font-weight:800;color:#991b1b;margin:0;">IMMEDIATE ACTION REQUIRED</p>
      </div>

      <div style="background:${lightBg};border:1px solid ${lightBdr};border-radius:12px;padding:20px;margin-bottom:20px;">
        <p style="margin:0 0 8px 0;font-size:13px;color:${lightTxt};"><strong>Driver:</strong> ${driverName}</p>
        <p style="margin:0 0 8px 0;font-size:13px;color:${lightTxt};"><strong>Bus:</strong> ${busId || 'N/A'}</p>
        <p style="margin:0 0 8px 0;font-size:13px;color:${lightTxt};"><strong>School:</strong> ${schoolName}</p>
        <p style="margin:0 0 8px 0;font-size:13px;color:${lightTxt};"><strong>Alert Type:</strong> ${label}</p>
        ${lat && lng ? `<p style="margin:0;font-size:13px;color:${lightTxt};"><strong>GPS:</strong> ${lat}, ${lng}</p>` : ''}
      </div>

      ${studentListHTML}

      ${mapsLink ? `<a href="${mapsLink}" style="display:block;background:${color};color:white;text-decoration:none;padding:14px;border-radius:10px;text-align:center;font-weight:800;font-size:14px;margin-bottom:20px;">📍 View Location on Google Maps →</a>` : ''}

      <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
        This is an automated emergency alert from ${APP_NAME}.<br>
        Please respond immediately and contact the school.
      </p>
    </div>
  </div>
</body>
</html>`

      await sendBrevoEmail(
        uniqueRecipients,
        `${icon} ${label} — ${driverName} | Bus ${busId || 'N/A'} | ${schoolName}`,
        html
      )

      return new Response(JSON.stringify({
        success: true,
        message: `${label} alert sent to ${uniqueRecipients.length} recipients`,
        recipients: uniqueRecipients.length,
        dept_email: deptEmail || 'not configured',
        emergency_contacts: parentEmergencyEmails.length
      }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // ── ROUTE 2: PROXIMITY ALERT ────────────────────────────────────────────
    if (type === 'info' && title?.toUpperCase().includes('PROXIMITY')) {
      const resolvedBusId = bus_id

      if (!resolvedBusId) {
        return new Response(JSON.stringify({ error: 'bus_id required for proximity alerts' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      // Get parents on this bus with email enabled
      const { data: parents } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('role', 'parent')
        .eq('bus_id', resolvedBusId)
        .eq('email_enabled', true)
        .not('email', 'is', null)

      if (!parents || parents.length === 0) {
        return new Response(JSON.stringify({ success: true, message: 'No parents with email enabled on this bus' }), {
          status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
      <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
          <div style="background:#0f172a;padding:32px 40px;text-align:center;">
            <p style="margin:0 0 8px 0;font-size:11px;font-weight:800;color:#fdb813;text-transform:uppercase;letter-spacing:1px;">${APP_NAME}</p>
            <h1 style="margin:0;font-size:24px;font-weight:900;color:white;">🚌 Bus Proximity Alert</h1>
          </div>
          <div style="padding:40px;">
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px 0;">
              The school bus <strong>(Bus ${resolvedBusId})</strong> is approaching your location.
            </p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin-bottom:20px;">
              <p style="margin:0;font-size:14px;color:#166534;">${message || 'Your bus is nearby. Please be ready.'}</p>
            </div>
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">This is an automated alert from ${APP_NAME}.</p>
          </div>
        </div>
      </body></html>`

      const emailList = parents.map(p => p.email)
      await sendBrevoEmail(emailList, `🚌 Bus ${resolvedBusId} is nearby — Be ready!`, html)

      return new Response(JSON.stringify({ success: true, message: `Proximity alert sent to ${emailList.length} parents` }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, message: 'No action taken for this notification type' }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})