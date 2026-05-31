// supabase/functions/send-transit-alert/index.ts
// Route 1: SOS (type=emergency) → emails all school_managers in org + all super_admins globally
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

    // Support both direct call and DB webhook (record is in payload.record)
    const notification = payload.record || payload

    const { type, title, message, user_id, bus_id, organization_id } = notification

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ── ROUTE 1: SOS EMERGENCY ──────────────────────────────────────────────
    if (type === 'emergency') {
      // Get driver info
      const { data: driver } = await supabase
        .from('profiles')
        .select('full_name, bus_id, organization_id')
        .eq('id', user_id)
        .single()

      const orgId    = organization_id || driver?.organization_id
      const busId    = bus_id || driver?.bus_id
      const driverName = driver?.full_name || 'Unknown Driver'

      // Get school name
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single()
      const schoolName = org?.name || 'Unknown School'

      // Parse coordinates from message if present
      const coordMatch = message?.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
      const mapsLink = coordMatch
        ? `https://www.google.com/maps?q=${coordMatch[1]},${coordMatch[2]}`
        : null

      // Get all school_managers in this org
      const { data: managers } = await supabase
        .from('profiles')
        .select('email')
        .eq('role', 'school_manager')
        .eq('organization_id', orgId)
        .not('email', 'is', null)

      // Get all super_admins globally
      const { data: superAdmins } = await supabase
        .from('profiles')
        .select('email')
        .eq('role', 'super_admin')
        .not('email', 'is', null)

      const recipients = [
        ...(managers || []).map(m => m.email),
        ...(superAdmins || []).map(a => a.email)
      ].filter(Boolean)

      if (recipients.length === 0) {
        return new Response(JSON.stringify({ success: true, message: 'No recipients found' }), {
          status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
      <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
          <div style="background:#dc2626;padding:32px 40px;text-align:center;">
            <p style="margin:0 0 8px 0;font-size:11px;font-weight:800;color:#fecaca;text-transform:uppercase;letter-spacing:1px;">${APP_NAME} — EMERGENCY</p>
            <h1 style="margin:0;font-size:24px;font-weight:900;color:white;">🚨 SOS Alert</h1>
          </div>
          <div style="padding:40px;">
            <p style="color:#dc2626;font-size:16px;font-weight:700;margin:0 0 20px 0;">An SOS has been triggered — immediate attention required.</p>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin-bottom:20px;">
              <p style="margin:0 0 8px 0;font-size:13px;color:#991b1b;"><strong>Driver:</strong> ${driverName}</p>
              <p style="margin:0 0 8px 0;font-size:13px;color:#991b1b;"><strong>Bus:</strong> ${busId || 'N/A'}</p>
              <p style="margin:0 0 8px 0;font-size:13px;color:#991b1b;"><strong>School:</strong> ${schoolName}</p>
              <p style="margin:0;font-size:13px;color:#991b1b;"><strong>Message:</strong> ${message || 'SOS triggered'}</p>
            </div>
            ${mapsLink ? `<a href="${mapsLink}" style="display:block;background:#dc2626;color:white;text-decoration:none;padding:14px;border-radius:10px;text-align:center;font-weight:800;font-size:14px;margin-bottom:16px;">📍 View Location on Google Maps →</a>` : ''}
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">This is an automated emergency alert from ${APP_NAME}.</p>
          </div>
        </div>
      </body></html>`

      await sendBrevoEmail(recipients, `🚨 SOS Alert — ${driverName} | Bus ${busId || 'N/A'} | ${schoolName}`, html)

      return new Response(JSON.stringify({ success: true, message: `SOS alert sent to ${recipients.length} recipients` }), {
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