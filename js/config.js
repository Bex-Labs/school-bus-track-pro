/**
 * CONFIG.JS — Supabase Client Initialization
 */

const SUPABASE_URL = 'https://bxhzckjmyhachqotgulg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4aHpja2pteWhhY2hxb3RndWxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NzIyNjIsImV4cCI6MjA5NTE0ODI2Mn0.XAt0fl2waJPYWAjr4v_5Iz3pLxH175oU3vyEAsbVawg';

// Check if window.supabase exists (loaded from CDN in HTML)
if (!window.supabase) {
    console.error("Supabase CDN failed to load. Check your internet connection.");
}

export const supabase = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Helper: get current user
export async function getCurrentUser() {
  if (!supabase) return null;
  try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) return null;
      return user;
  } catch (e) {
      return null;
  }
}

// Helper: get user role from metadata
export async function getUserRole() {
  const user = await getCurrentUser();
  return user?.user_metadata?.role || null;
}