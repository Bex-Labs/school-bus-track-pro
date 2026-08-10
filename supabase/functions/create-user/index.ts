/**
 * EDGE FUNCTION: create-user
 * Creates a new user account with credentials and sends welcome email
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

const ROLE_TABS: Record<string, string> = {
  school_manager: 'Manager',
  driver:         'Driver',
  bus_attendant:  'Attendant',
  parent:         'Parent',
}

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Verify caller is authenticated manager or super_admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header.')

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user: caller }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !caller) throw new Error('Not authenticated.')

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role, organization_id, full_name')
      .eq('id', caller.id).single()

    if (!callerProfile || !['school_manager', 'super_admin'].includes(callerProfile.role)) {
      throw new Error('Not authorized.')
    }

    const { email, full_name, role, organization_id, school_name, school_code, phone, job_title } = await req.json()

    if (!email)           throw new Error('Email is required.')
    if (!full_name)       throw new Error('Full name is required.')
    if (!role)            throw new Error('Role is required.')
    if (!organization_id) throw new Error('Organization ID is required.')

    const allowedRoles = ['school_manager', 'driver', 'bus_attendant', 'parent']
    if (!allowedRoles.includes(role)) throw new Error(`Invalid role: ${role}`)

    // For managers, enforce org scope
    if (callerProfile.role === 'school_manager' && organization_id !== callerProfile.organization_id) {
      throw new Error('Cross-org user creation not allowed.')
    }

    const password   = generatePassword()
    const roleLabel  = ROLE_LABELS[role] || role
    const roleIcon   = ROLE_ICONS[role]  || '👤'
    const roleTab    = ROLE_TABS[role]   || role
    const schoolName = school_name || 'your school'
    const schoolCode = school_code || ''

    // Create auth user
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role, organization_id }
    })
    if (createErr || !newUser.user) throw new Error('Failed to create user: ' + (createErr?.message || 'Unknown'))

    // Create profile
    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
      id:              newUser.user.id,
      full_name,
      email,
      role,
      organization_id,
      phone:           phone || null,
      job_title:       job_title || null,
      is_verified:     true,
      account_status:  'active'
    }, { onConflict: 'id' })
    if (profileErr) console.warn('Profile upsert warning:', profileErr.message)

    // Send welcome email with credentials via Brevo
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">

    <div style="background:#0F172A;padding:32px 40px;text-align:center;">
      <p style="margin:0 0 8px 0;font-size:11px;font-weight:800;color:#fdb813;text-transform:uppercase;letter-spacing:1px;">School Bus Track Pro</p>
      <div style="font-size:48px;margin-bottom:8px;">${roleIcon}</div>
      <h1 style="margin:0;font-size:22px;font-weight:900;color:white;">Welcome to ${schoolName}!</h1>
    </div>

    <div style="padding:40px;">
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 24px;">
        Hi <strong>${full_name}</strong>,<br><br>
        Your account has been created on School Bus Track Pro for <strong>${schoolName}</strong>. Below are your login credentials.
      </p>

      <div style="background:#0F172A;border-radius:12px;padding:24px;margin-bottom:24px;text-align:center;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#fdb813;text-transform:uppercase;letter-spacing:1px;">Your Role</p>
        <p style="margin:0 0 20px;font-size:18px;font-weight:900;color:white;">${roleIcon} ${roleLabel}</p>

        <div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:16px;margin-bottom:12px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;">Email</p>
          <p style="margin:0;font-size:15px;font-weight:800;color:white;font-family:monospace;">${email}</p>
        </div>
        <div style="background:rgba(253,184,19,0.15);border:1px solid rgba(253,184,19,0.3);border-radius:10px;padding:16px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#fdb813;text-transform:uppercase;">Temporary Password</p>
          <p style="margin:0;font-size:20px;font-weight:900;color:white;font-family:monospace;letter-spacing:2px;">${password}</p>
        </div>
      </div>

      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:#92400e;font-weight:700;">
          ⚠️ Please change your password after your first login for security.
        </p>
      </div>

      <a href="${APP_URL}" style="display:block;background:#fdb813;color:#0f172a;text-decoration:none;padding:16px;border-radius:10px;text-align:center;font-weight:900;font-size:15px;margin-bottom:20px;">
        ${roleIcon} Login to School Bus Track Pro →
      </a>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:#166534;font-weight:600;">
          <strong>How to log in:</strong><br>
          1. Go to the login page<br>
          2. Select the <strong>${roleTab}</strong> tab<br>
          3. Enter your email and temporary password above<br>
          4. Change your password from your profile settings
        </p>
      </div>

      ${schoolCode ? `<p style="font-size:12px;color:#94a3b8;text-align:center;margin:0 0 8px;">School Code: <strong style="color:#0f172a;font-family:monospace;">${schoolCode}</strong></p>` : ''}

      <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0;">
        If you have any issues, contact your school manager or Bex Labs support.
      </p>
    </div>

    <div style="background:#f8fafc;padding:16px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">School Bus Track Pro — Powered by Bex Labs</p>
    </div>
  </div>
</body>
</html>`

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email, name: full_name }],
        subject: `${roleIcon} Your School Bus Track Pro credentials — ${schoolName}`,
        htmlContent: html
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      console.warn('Brevo warning:', errText)
    }

    return new Response(
      JSON.stringify({ success: true, user_id: newUser.user.id, message: `Account created for ${email}` }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})