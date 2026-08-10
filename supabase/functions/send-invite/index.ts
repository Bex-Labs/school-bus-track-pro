/**
 * EDGE FUNCTION: send-invite
 * Sends an invite email to a new user with a signup link
 * Roles: school_manager | driver | bus_attendant | parent
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BREVO_API_KEY  = Deno.env.get('BREVO_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL     = 'iamtissvn@gmail.com'
const FROM_NAME      = 'School Bus Track Pro'
const APP_URL        = 'https://bustrack-alpha.vercel.app'

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ROLE_LABELS: Record<string, string> = {
  school_manager: 'School Manager',
  driver:         'Driver',
  bus_attendant:  'Bus Attendant',
  parent:         'Parent',
}

const ROLE_ICONS: Record<string, string> = {
  school_manager: '🏫',
  driver:         '🚌',
  bus_attendant:  '🪪',
  parent:         '👨‍👧',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Verify caller is authenticated manager or super_admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header.')

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) throw new Error('Not authenticated.')

    const { data: callerProfile } = await supabase
      .from('profiles').select('role, organization_id, full_name')
      .eq('id', user.id).single()

    if (!callerProfile || !['school_manager', 'super_admin'].includes(callerProfile.role)) {
      throw new Error('Not authorized.')
    }

    const { email, full_name, role, school_name, school_code, invited_by } = await req.json()

    if (!email) throw new Error('Email is required.')
    if (!role)  throw new Error('Role is required.')

    // Block invalid roles
    const allowedRoles = ['school_manager', 'driver', 'bus_attendant', 'parent']
    if (!allowedRoles.includes(role)) throw new Error(`Invalid role: ${role}`)

    const roleLabel = ROLE_LABELS[role] || role
    const roleIcon  = ROLE_ICONS[role]  || '👤'
    const invitedBy = invited_by || callerProfile.full_name || 'School Manager'
    const schoolName = school_name || 'your school'
    const schoolCode = school_code || ''

    // Build signup link
    const signupUrl = `${APP_URL}/index.html?mode=signup&role=${role}&code=${schoolCode}&email=${encodeURIComponent(email)}`

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">

    <div style="background:#0F172A;padding:32px 40px;text-align:center;">
      <p style="margin:0 0 8px 0;font-size:11px;font-weight:800;color:#fdb813;text-transform:uppercase;letter-spacing:1px;">School Bus Track Pro</p>
      <div style="font-size:48px;margin-bottom:8px;">${roleIcon}</div>
      <h1 style="margin:0;font-size:22px;font-weight:900;color:white;">You've Been Invited!</h1>
    </div>

    <div style="padding:40px;">
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px;">
        Hi${full_name ? ` <strong>${full_name}</strong>` : ''},<br><br>
        <strong>${invitedBy}</strong> has invited you to join <strong>${schoolName}</strong> on School Bus Track Pro as a <strong>${roleLabel}</strong>.
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px 0;font-size:13px;font-weight:700;color:#6b7280;width:120px;">School</td>
            <td style="padding:10px 0;font-size:14px;font-weight:800;color:#0f172a;">${schoolName}</td>
          </tr>
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px 0;font-size:13px;font-weight:700;color:#6b7280;">Your Role</td>
            <td style="padding:10px 0;font-size:14px;font-weight:800;color:#0f172a;">${roleIcon} ${roleLabel}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;font-size:13px;font-weight:700;color:#6b7280;">School Code</td>
            <td style="padding:10px 0;font-size:14px;font-weight:800;color:#0f172a;font-family:monospace;">${schoolCode || 'N/A'}</td>
          </tr>
        </table>
      </div>

      <a href="${signupUrl}" style="display:block;background:#fdb813;color:#0f172a;text-decoration:none;padding:16px;border-radius:10px;text-align:center;font-weight:900;font-size:15px;margin-bottom:20px;">
        ${roleIcon} Accept Invitation & Create Account →
      </a>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:#166534;font-weight:600;">
          <strong>Next steps after signing up:</strong><br>
          1. Click the button above to create your account<br>
          2. Verify your email address<br>
          3. Log in using the <strong>${roleLabel}</strong> tab on the login page
        </p>
      </div>

      <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0;">
        If you weren't expecting this invite, you can safely ignore this email.<br>
        This invite was sent by ${invitedBy} at ${schoolName}.
      </p>
    </div>

    <div style="background:#f8fafc;padding:16px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">School Bus Track Pro — Powered by Bex Labs</p>
    </div>
  </div>
</body>
</html>`

    // Send via Brevo
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email, name: full_name || email }],
        subject: `${roleIcon} You've been invited to join ${schoolName} on School Bus Track Pro`,
        htmlContent: html
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Brevo error: ${errText}`)
    }

    return new Response(
      JSON.stringify({ success: true, message: `Invite sent to ${email}` }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})