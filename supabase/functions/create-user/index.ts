// supabase/functions/create-user/index.ts
// Creates a user account with temp password and sends welcome email via Resend

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY       = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL           = 'iamtissvn@gmail.com'
const APP_NAME             = 'School Bus Track Pro'
const APP_URL              = Deno.env.get('APP_URL') || 'https://schoolbustrackpro.com'

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { email, full_name, role, organization_id, school_name, school_code } = await req.json()

    if (!email || !full_name || !role) {
      return new Response(JSON.stringify({ error: 'email, full_name and role are required.' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // 1. Generate temp password
    const tempPassword = 'SBTP-' + Math.random().toString(36).slice(2, 8).toUpperCase() + Math.floor(1000 + Math.random() * 9000)

    // 2. Create auth user via service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name, role, organization_id: organization_id || null }
    })

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // 3. Write profile
    await supabase.from('profiles').upsert({
      id: authData.user.id, full_name, email, role,
      organization_id: organization_id || null,
      is_verified: true, account_status: 'active'
    })

    // 4. Send email
    const roleLabel = { school_manager: 'School Manager', driver: 'Driver', parent: 'Parent', super_admin: 'Platform Administrator' }[role] || role

    const schoolSection = school_code ? `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 4px 0;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Your School Code</p>
        <p style="margin:0;font-size:26px;font-weight:900;color:#0f172a;font-family:monospace;letter-spacing:3px;">${school_code}</p>
        <p style="margin:8px 0 0 0;font-size:12px;color:#94a3b8;">Share this with drivers and parents so they can join your school workspace.</p>
      </div>` : ''

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
        <div style="background:#0f172a;padding:32px 40px;text-align:center;">
          <p style="margin:0 0 8px 0;font-size:11px;font-weight:800;color:#fdb813;text-transform:uppercase;letter-spacing:1px;">${APP_NAME}</p>
          <h1 style="margin:0;font-size:24px;font-weight:900;color:white;">Welcome, ${full_name.split(' ')[0]}!</h1>
        </div>
        <div style="padding:40px;">
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
            Your <strong>${roleLabel}</strong> account has been created${school_name ? ` for <strong>${school_name}</strong>` : ''}.
          </p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:20px;">
            <p style="margin:0 0 4px 0;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Email</p>
            <p style="margin:0 0 16px 0;font-size:15px;font-weight:700;color:#0f172a;">${email}</p>
            <p style="margin:0 0 4px 0;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Temporary Password</p>
            <p style="margin:0;font-size:22px;font-weight:900;color:#0f172a;font-family:monospace;letter-spacing:2px;">${tempPassword}</p>
          </div>
          ${schoolSection}
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#92400e;"><strong>⚠️ Important:</strong> Log in and change your password immediately.</p>
          </div>
          <a href="${APP_URL}" style="display:block;background:#fdb813;color:#0f172a;text-decoration:none;padding:16px;border-radius:10px;text-align:center;font-weight:800;font-size:15px;">
            Log In to Your Portal →
          </a>
        </div>
        <div style="padding:24px 40px;border-top:1px solid #f1f5f9;text-align:center;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">If you did not expect this email, you can safely ignore it.</p>
        </div>
      </div>
    </body></html>`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: email, subject: `Your ${APP_NAME} account is ready`, html })
    })

    return new Response(JSON.stringify({
      success: true, user_id: authData.user.id, email_sent: resendRes.ok,
      message: `Account created. ${resendRes.ok ? 'Welcome email sent.' : 'Email failed — account still created.'}`
    }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})