/**
 * CONFIG.JS — Supabase Client Initialization
 * Standardized on: organizations table, organization_id on profiles
 */

const SUPABASE_URL = 'https://bxhzckjmyhachqotgulg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4aHpja2pteWhhY2hxb3RndWxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NzIyNjIsImV4cCI6MjA5NTE0ODI2Mn0.XAt0fl2waJPYWAjr4v_5Iz3pLxH175oU3vyEAsbVawg';

if (!window.supabase) {
  console.error('Supabase CDN failed to load. Check your internet connection.');
}

export const supabase = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ─── Get current authenticated user ───────────────────────────────────────
export async function getCurrentUser() {
  if (!supabase) return null;
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return null;
    return user;
  } catch {
    return null;
  }
}

// ─── Get role from profiles table, fall back to user_metadata ─────────────
export async function getUserRole() {
  const user = await getCurrentUser();
  if (!user || !supabase) return null;

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (error || !profile) {
      return user.user_metadata?.role || null;
    }
    return profile.role;
  } catch {
    return user.user_metadata?.role || null;
  }
}

// ─── Get full profile including organization_id ────────────────────────────
export async function getUserProfile() {
  const user = await getCurrentUser();
  if (!user || !supabase) return null;

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, organization_id, email, avatar_url')
      .eq('id', user.id)
      .single();

    if (error) return null;
    return profile;
  } catch {
    return null;
  }
}