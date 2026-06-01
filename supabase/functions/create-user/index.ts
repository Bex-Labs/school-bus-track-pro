// supabase/functions/create-user/index.ts
// Creates a new auth user, writes profile, sends welcome email via Brevo

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BREVO_API_KEY      = Deno.env.get('BREVO_API_KEY')!
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL         = 'iamtissvn@gmail.com'
const FROM_NAME          = 'School Bus Track Pro'
const APP_NAME           = 'School Bus Track Pro'
const APP_URL            = Deno.env.get('APP_URL') || 'https://bustrack-alpha.vercel.app'

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { email, full_name, role, organization_id, school_name, school_code, phone } = await req.json()

    if (!email || !role || !organization_id) {
      return new Response(JSON.stringify({ error: 'email, role, and organization_id are required.' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Generate temp password
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase() + '!'

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true
    })

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const userId = authData.user.id

    // Write profile
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      email,
      full_name,
      role,
      organization_id,
      phone: phone || null,
      account_status: 'pending',
      is_verified: false
    })

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const roleLabel = {
      school_manager: 'School Manager',
      driver: 'Driver',
      parent: 'Parent',
      super_admin: 'Platform Administrator'
    }[role] || role

    const loginUrl = `${APP_URL}/index.html?mode=login&role=${role}&email=${encodeURIComponent(email)}`

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
        <div style="background:#0f172a;padding:32px 40px;text-align:center;">
          <p style="margin:0 0 8px 0;font-size:11px;font-weight:800;color:#fdb813;text-transform:uppercase;letter-spacing:1px;">${APP_NAME}</p>
          <h1 style="margin:0;font-size:24px;font-weight:900;color:white;">Welcome aboard!</h1>
        </div>
        <div style="padding:40px;">
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px 0;">Hi ${full_name ? full_name.split(' ')[0] : 'there'},</p>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
            Your account has been created on <strong>${school_name || APP_NAME}</strong> as a <strong>${roleLabel}</strong>.
          </p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:20px 0;">
            <p style="margin:0 0 12px 0;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Your Login Details</p>
            <p style="margin:0 0 6px 0;font-size:14px;color:#475569;"><strong>Email:</strong> ${email}</p>
            <p style="margin:0 0 6px 0;font-size:14px;color:#475569;"><strong>Temporary Password:</strong> <span style="font-family:monospace;font-size:16px;font-weight:900;color:#0f172a;">${tempPassword}</span></p>
            ${school_code ? `<p style="margin:6px 0 0 0;font-size:14px;color:#475569;"><strong>School Code:</strong> <span style="font-family:monospace;font-size:16px;font-weight:900;color:#0f172a;">${school_code}</span></p>` : ''}
          </div>
          <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#92400e;">
              <strong>⚠ Please change your password</strong> after your first login for security.
            </p>
          </div>
          <a href="${loginUrl}" style="display:block;background:#fdb813;color:#0f172a;text-decoration:none;padding:16px;border-radius:10px;text-align:center;font-weight:800;font-size:15px;">
            Login to Your Account →
          </a>
        </div>
        <div style="padding:24px 40px;border-top:1px solid #f1f5f9;text-align:center;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">
            If you did not expect this email, please contact your administrator.
          </p>
        </div>
      </div>
    </body></html>`

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email }],
        subject: `Your ${APP_NAME} account is ready`,
        htmlContent: html
      })
    })

    const brevoData = await brevoRes.json()

    if (!brevoRes.ok) {
      // User was created but email failed — still return success with warning
      return new Response(JSON.stringify({
        success: true,
        warning: 'User created but email delivery failed',
        detail: brevoData,
        userId
      }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, message: `Account created and welcome email sent to ${email}`, userId }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})