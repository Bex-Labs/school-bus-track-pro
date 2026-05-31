// supabase/functions/send-invite/index.ts
// Sends a branded invite email with school code and signup link

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL     = 'iamtissvn@gmail.com'
const APP_NAME       = 'School Bus Track Pro'
const APP_URL        = Deno.env.get('APP_URL') || 'https://schoolbustrackpro.com'

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { email, full_name, role, school_name, school_code, invited_by } = await req.json()

    if (!email || !role) {
      return new Response(JSON.stringify({ error: 'email and role are required.' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const roleLabel = { school_manager: 'School Manager', driver: 'Driver', parent: 'Parent', super_admin: 'Platform Administrator' }[role] || role

    // Build signup URL with school code pre-filled
    const signupUrl = school_code
      ? `${APP_URL}/index.html?code=${school_code}&role=${role}`
      : `${APP_URL}/index.html?role=${role}`

    const schoolSection = school_code ? `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 4px 0;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Your School Code</p>
        <p style="margin:0;font-size:26px;font-weight:900;color:#0f172a;font-family:monospace;letter-spacing:3px;">${school_code}</p>
        <p style="margin:8px 0 0 0;font-size:12px;color:#94a3b8;">Enter this code when creating your account to join ${school_name || 'your school'}.</p>
      </div>` : ''

    const greeting = full_name ? `Hi ${full_name.split(' ')[0]},` : 'Hi there,'
    const inviterLine = invited_by ? `<strong>${invited_by}</strong> has invited you` : `You have been invited`

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
        <div style="background:#0f172a;padding:32px 40px;text-align:center;">
          <p style="margin:0 0 8px 0;font-size:11px;font-weight:800;color:#fdb813;text-transform:uppercase;letter-spacing:1px;">${APP_NAME}</p>
          <h1 style="margin:0;font-size:24px;font-weight:900;color:white;">You're invited!</h1>
        </div>
        <div style="padding:40px;">
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px 0;">${greeting}</p>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
            ${inviterLine} to join <strong>${school_name || APP_NAME}</strong> as a <strong>${roleLabel}</strong>.
            Click the button below to create your account.
          </p>
          ${schoolSection}
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#166534;">
              <strong>✓ Your school code is pre-filled</strong> in the signup link. Just click below and create your password.
            </p>
          </div>
          <a href="${signupUrl}" style="display:block;background:#fdb813;color:#0f172a;text-decoration:none;padding:16px;border-radius:10px;text-align:center;font-weight:800;font-size:15px;">
            Accept Invitation & Create Account →
          </a>
          <p style="margin:20px 0 0 0;font-size:13px;color:#94a3b8;text-align:center;">
            Or copy this link: <a href="${signupUrl}" style="color:#0f172a;font-weight:700;">${signupUrl}</a>
          </p>
        </div>
        <div style="padding:24px 40px;border-top:1px solid #f1f5f9;text-align:center;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">
            This invitation was sent by ${invited_by || 'the platform administrator'}.
            If you did not expect this, you can safely ignore it.
          </p>
        </div>
      </div>
    </body></html>`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL, to: email,
        subject: `You're invited to join ${school_name || APP_NAME}`,
        html
      })
    })

    const resendData = await resendRes.json()

    if (!resendRes.ok) {
      return new Response(JSON.stringify({ error: 'Email delivery failed', detail: resendData }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, message: `Invite sent to ${email}` }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})