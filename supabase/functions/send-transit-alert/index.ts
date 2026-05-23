import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { record } = await req.json()
    
    if (!record) {
      return new Response(JSON.stringify({ error: "Missing required notification payload." }), { status: 400 })
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error("System Environment Error: RESEND_API_KEY variable is unassigned.")
    }

    // =================================================================
    // DIRECTORS EMAIL CONFIGURATION BLOCK
    // =================================================================
    const directorEmail = "director@bexlabs.com"; 
    // =================================================================

    // ─── ROUTE 1: DRIVER SOS EMERGENCY CRITICAL PATH ───────────────────
    if (record.type === 'emergency') {
      
      // Parse coordinates out of the standardized notification message payload string using regex
      const coordMatch = record.message.match(/Location:\s*([-\d.]+),\s*([-\d.]+)/);
      let googleMapsLink = "Not Available";
      let coordinateSpecs = "Not Provided";

      if (coordMatch && coordMatch[1] && coordMatch[2]) {
        const lat = coordMatch[1];
        const lng = coordMatch[2];
        coordinateSpecs = `${lat}, ${lng}`;
        // FIXED: Universal Cross-Platform Intent API for absolute mapping precision
        googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      }

      console.log(`[CRITICAL INCIDENT] Routing professional SOS panic alert directly to Director: ${directorEmail}`);

      // Industry-Standard Emergency Notification Format
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Bex-Labs Operations Center <emergency@bexlabstrack.com>',
          to: [directorEmail],
          subject: `⚠️ CRITICAL: Driver SOS Emergency Distress Protocol Activated`,
          text: `CRITICAL ALERT: Driver Emergency Distress Signal. Details: ${record.message}. Coordinates: ${coordinateSpecs}. Map Link: ${googleMapsLink}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 30px; border: 2px solid #dc2626; border-radius: 6px; max-width: 600px; background-color: #ffffff; color: #111827;">
              
              <div style="background-color: #dc2626; padding: 15px 20px; border-radius: 4px; margin-bottom: 25px;">
                <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                  ⚠️ High-Priority Incident Report
                </h2>
              </div>

              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
                <tr>
                  <td style="padding: 6px 0; color: #4b5563; font-weight: 600; width: 30%;">Protocol Event:</td>
                  <td style="padding: 6px 0; color: #dc2626; font-weight: 700;">DRIVER EMERGENCY DISTRESS (SOS)</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #4b5563; font-weight: 600;">Timestamp:</td>
                  <td style="padding: 6px 0; color: #1f2937;">${new Date().toISOString()}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #4b5563; font-weight: 600;">System Ref ID:</td>
                  <td style="padding: 6px 0; color: #1f2937; font-family: monospace;">${record.id || 'N/A'}</td>
                </tr>
              </table>

              <div style="background-color: #f9fafb; border-left: 4px solid #dc2626; padding: 15px; border-radius: 0 4px 4px 0; margin-bottom: 25px;">
                <p style="margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase; color: #4b5563; font-weight: 700; letter-spacing: 0.5px;">Telemetry Log Message</p>
                <p style="margin: 0; font-size: 15px; color: #111827; line-height: 1.5; font-weight: 500;">${record.message}</p>
              </div>

              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 6px; margin-bottom: 25px; text-align: center;">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #166534; font-weight: 600;"> Pinpoint GPS Coordinates Located</p>
                <p style="margin: 0 0 20px 0; font-family: monospace; font-size: 16px; color: #111827; font-weight: bold; background: #ffffff; display: inline-block; padding: 4px 10px; border-radius: 4px; border: 1px solid #e5e7eb;">
                  ${coordinateSpecs}
                </p>
                <br/>
                <a href="${googleMapsLink}" target="_blank" style="display: inline-block; background-color: #111827; color: #ffffff; padding: 12px 24px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                  Launch Google Maps Navigation
                </a>
              </div>

              <p style="font-size: 13px; color: #4b5563; line-height: 1.6; margin-bottom: 0; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                <strong>Required Action:</strong> Review this asset immediately from the Live Fleet Command console. Intercept tracking routes and deploy regional crisis responders if driver voice validation checks time out.
              </p>

            </div>
          `
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Resend Emergency Gateway Rejection: ${errorText}`)
      }

      return new Response(JSON.stringify({ success: true, target: 'director_emergency_notified' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // ─── ROUTE 2: MULTI-PARENT PERIMETER PROXIMITY BROADCAST ARRAY ─────
    const busIdMatch = record.message.match(/Transit Unit\s*([a-zA-Z0-9_-]+)/);
    
    if (busIdMatch && busIdMatch[1]) {
      const parsedBusId = busIdMatch[1];
      console.log(`[GEOFENCE LOG] Distributing transit alerts for Bus unit: ${parsedBusId}`);

      const { data: studentGroup, error: studentError } = await supabaseClient
        .from('students')
        .select('parent_id')
        .eq('bus_id', parsedBusId);

      if (studentError) throw studentError;

      if (studentGroup && studentGroup.length > 0) {
        const uniqueParentIds = Array.from(new Set(studentGroup.map(s => s.parent_id).filter(id => id !== null)));

        if (uniqueParentIds.length > 0) {
          const { data: activeParentEmails, error: profileError } = await supabaseClient
            .from('profiles')
            .select('email')
            .in('id', uniqueParentIds)
            .eq('email_enabled', true)
            .is('email', null === false);

          if (profileError) throw profileError;

          if (activeParentEmails && activeParentEmails.length > 0) {
            const recipientEmailArray = activeParentEmails.map(p => p.email);

            const response = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: 'School Bus Track Pro <alerts@bexlabstrack.com>',
                to: recipientEmailArray, 
                subject: record.title,
                text: record.message,
                html: `
                  <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px; max-width: 600px;">
                    <h2 style="color: #1e3a8a; margin-top: 0;">🚌 Fleet Tracking Notification</h2>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;" />
                    <p style="font-size: 16px; font-weight: bold; color: #333;">${record.title}</p>
                    <p style="font-size: 14px; color: #555; line-height: 1.5;">${record.message}</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                    <small style="color: #999;">Automated transit tracking notification system logged for Bex-Labs logistics layers.</small>
                  </div>
                `
              })
            })

            if (!response.ok) {
              const errorText = await response.text()
              throw new Error(`Resend Bulk Parent Delivery Rejection: ${errorText}`)
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error("Critical communications hub error trace:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})