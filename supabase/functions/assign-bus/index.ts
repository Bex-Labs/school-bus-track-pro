/**
 * EDGE FUNCTION: assign-bus
 * Assigns a bus to a driver — runs with service role to bypass RLS
 * Called by manager when saving bus assignment
 *
 * Body: { bus_id, driver_id, org_id, old_driver_id? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── Service role client — bypasses RLS ──────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── Verify caller is authenticated and is a manager or super admin ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header.');

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) throw new Error('Not authenticated.');

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', user.id)
      .single();

    if (!callerProfile) throw new Error('Caller profile not found.');
    if (!['school_manager', 'super_admin'].includes(callerProfile.role)) {
      throw new Error('Not authorized. Only managers and admins can assign buses.');
    }

    // ── Parse body ───────────────────────────────────────────────────────
    const { bus_id, driver_id, org_id, old_driver_id } = await req.json();

    // For managers, enforce org scope
    if (callerProfile.role === 'school_manager') {
      if (org_id !== callerProfile.organization_id) {
        throw new Error('Cross-tenant assignment not allowed.');
      }
    }

    // ── Unassign old driver if different ─────────────────────────────────
    if (old_driver_id && old_driver_id !== driver_id) {
      await supabaseAdmin
        .from('profiles')
        .update({ bus_id: null })
        .eq('id', old_driver_id);
    }

    // ── Assign new driver ────────────────────────────────────────────────
    if (driver_id) {
      const { error: driverErr } = await supabaseAdmin
        .from('profiles')
        .update({ bus_id: bus_id })
        .eq('id', driver_id);

      if (driverErr) throw new Error('Failed to update driver profile: ' + driverErr.message);
    }

    // ── Update bus driver_id ─────────────────────────────────────────────
    const { error: busErr } = await supabaseAdmin
      .from('buses')
      .update({ driver_id: driver_id || null })
      .eq('id', bus_id)
      .eq('organization_id', org_id);

    if (busErr) throw new Error('Failed to update bus: ' + busErr.message);

    return new Response(
      JSON.stringify({ success: true, bus_id, driver_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});