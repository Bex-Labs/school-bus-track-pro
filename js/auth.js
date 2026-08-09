/**
 * AUTH.JS — Authentication & Role-Based Multi-Tenant Routing
 * Roles: super_admin | school_manager | driver | bus_attendant | parent
 */

import { supabase, getUserRole } from './config.js';

const ROLE_REDIRECTS = {
  super_admin:    '/admin/bex-dashboard.html',
  school_manager: '/manager/fleet.html',
  driver:         '/driver/dashboard.html',
  bus_attendant:  '/attendant/dashboard.html',
  parent:         '/parent/map.html',
};

const ROLE_NAMES = {
  driver:         'Driver',
  parent:         'Parent',
  school_manager: 'School Manager',
  bus_attendant:  'Bus Attendant',
  super_admin:    'Bex Admin'
};

function rootPath(path) {
  const depth = window.location.pathname.split('/').length - 2;
  const prefix = depth > 0 ? '../'.repeat(depth) : './';
  return prefix + path.replace(/^\//, '');
}

function slugify(name) {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function resolveActiveTenant() {
  window.activeTenantId = null;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return;
  const isHostingPlatform = (
    host.endsWith('.vercel.app') || host.endsWith('.netlify.app') ||
    host.endsWith('.pages.dev')  || host.endsWith('.github.io') ||
    host.endsWith('.onrender.com') || host.endsWith('.railway.app') || host.endsWith('.fly.dev')
  );
  if (isHostingPlatform) return;
  const parts = host.split('.');
  if (parts.length <= 2 || ['www', 'admin', 'app'].includes(parts[0])) return;
  const subToken = parts[0].toLowerCase().trim();
  const { data: org, error } = await supabase.from('organizations').select('id, name').eq('subdomain', subToken).single();
  if (!error && org) {
    window.activeTenantId = org.id;
    const brandHeader = document.getElementById('login-school-title');
    if (brandHeader) brandHeader.innerHTML = `${org.name} <span>Command Engine</span>`;
    const subText = document.getElementById('visual-dynamic-subtext');
    if (subText) subText.textContent = `Exclusive logistics terminal for ${org.name}. Powered by School Bus Track Pro.`;
  } else if (subToken) {
    showToast('Invalid or unrecognised school domain.', 'error');
  }
}

if (supabase) {
  await resolveActiveTenant();

  supabase.auth.onAuthStateChange((event, session) => {
    const authPages = ['index.html', 'forgot-password.html', 'reset-password.html', ''];
    const currentPage = window.location.pathname.split('/').pop();
    const isAuthPage = authPages.includes(currentPage);

    if (
      window.location.hash.includes('access_token=') ||
      window.location.pathname.includes('confirm.html')
    ) return;

    if (event === 'SIGNED_IN' && session && isAuthPage) redirectByRole();
    if (event === 'SIGNED_OUT') {
      const onProtectedPage = !['index.html', 'forgot-password.html', 'reset-password.html', 'confirm.html']
        .some(p => window.location.pathname.includes(p));
      if (onProtectedPage) window.location.href = rootPath('index.html');
    }
    if (event === 'PASSWORD_RECOVERY') window.location.href = rootPath('reset-password.html');
  });
}

async function redirectByRole() {
  const role = await getUserRole();
  if (!role) { showToast('Could not determine account role. Please contact support.', 'error'); return; }
  const path = ROLE_REDIRECTS[role] || ROLE_REDIRECTS.parent;
  const targetFolder = path.split('/')[1];
  if (window.location.pathname.includes(`/${targetFolder}/`)) return;
  window.location.href = rootPath(path);
}

// ─── LOGIN ────────────────────────────────────────────────────────────────
const loginForm = document.getElementById('login-form');
if (loginForm && supabase) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btn      = document.getElementById('login-btn');

    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Signing in...';

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      showToast(error.message || 'Login failed. Please try again.', 'error');
      btn.disabled = false;
      btn.innerHTML = 'Login <i class="bi bi-arrow-right-short" style="font-size:22px;"></i>';
      return;
    }

    // ── Fetch actual DB role ──────────────────────────────────────────
    const { data: profileData } = await supabase
      .from('profiles').select('role, organization_id').eq('id', data.user.id).single();

    const actualRole   = profileData?.role || null;
    const selectedRole = window.selectedRole || 'parent';

    // ── Strict role tab enforcement ───────────────────────────────────
    if (actualRole && actualRole !== selectedRole) {
      await supabase.auth.signOut();
      const actualName = ROLE_NAMES[actualRole] || actualRole;
      showToast(`This account is registered as "${actualName}". Please select the ${actualName} tab and try again.`, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Login <i class="bi bi-arrow-right-short" style="font-size:22px;"></i>';
      return;
    }

    // ── Tenant isolation check ────────────────────────────────────────
    if (window.activeTenantId) {
      const { data: profile } = await supabase
        .from('profiles').select('organization_id, role').eq('id', data.user.id).single();
      if (profile && profile.role !== 'super_admin') {
        if (profile.organization_id !== window.activeTenantId) {
          await supabase.auth.signOut();
          showToast('Access denied: Your account does not belong to this school.', 'error');
          btn.disabled = false;
          btn.innerHTML = 'Login <i class="bi bi-arrow-right-short" style="font-size:22px;"></i>';
          return;
        }
      }
    }

    if (document.getElementById('remember')?.checked) localStorage.setItem('sbtp_remember', email);
    await redirectByRole();
  });

  const remembered = localStorage.getItem('sbtp_remember');
  if (remembered) {
    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.value = remembered;
    const rememberBox = document.getElementById('remember');
    if (rememberBox) rememberBox.checked = true;
  }
}

// ─── SIGN UP ──────────────────────────────────────────────────────────────
const signupForm = document.getElementById('signup-form');
if (signupForm && supabase) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const name     = document.getElementById('signup-name').value.trim();
    const role     = window.selectedRole || 'parent';
    const btn      = document.getElementById('signup-btn');

    if (role === 'super_admin') { showToast('Super admin accounts cannot be self-registered.', 'error'); return; }

    let targetOrgId = null;

    if (role === 'school_manager') {
      const schoolNameInput = document.getElementById('signup-school-name');
      const schoolName = schoolNameInput ? schoolNameInput.value.trim() : '';
      if (!schoolName) { showToast('Please enter your school name.', 'error'); return; }
      const subdomain = slugify(schoolName);
      const { data: existing } = await supabase.from('organizations').select('id').eq('subdomain', subdomain).single();
      if (existing) { showToast('A school with that name already exists. Try a more specific name.', 'error'); return; }
      const { data: newOrg, error: orgError } = await supabase
        .from('organizations').insert({ name: schoolName, subdomain, account_status: 'active' }).select('id').single();
      if (orgError || !newOrg) { showToast('Failed to create school. Please try again.', 'error'); return; }
      targetOrgId = newOrg.id;
    } else {
      targetOrgId = window.activeTenantId;
      if (!targetOrgId) {
        const codeInput = document.getElementById('signup-tenant-code');
        const code = codeInput ? codeInput.value.toLowerCase().trim().replace(/\s+/g, '-') : '';
        if (!code) { showToast('Please enter your School ID / Code.', 'error'); return; }
        const { data: org, error: orgError } = await supabase.from('organizations').select('id').eq('subdomain', code).single();
        if (orgError || !org) { showToast('School not found. Check the code and try again.', 'error'); return; }
        targetOrgId = org.id;
      }
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Creating profile...';

    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: window.location.origin + '/confirm.html',
        data: { full_name: name, role, organization_id: targetOrgId }
      }
    });

    if (error) {
      showToast(error.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Create Profile <i class="bi bi-check-circle" style="margin-left:8px;"></i>';
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id, full_name: name, role, organization_id: targetOrgId, email,
      }, { onConflict: 'id' });
      if (profileError) console.warn('Profile upsert deferred.', profileError.message);

      if (role === 'school_manager' && targetOrgId) {
        const subdomain = slugify(document.getElementById('signup-school-name').value.trim());
        showToast(`School created! Share this code with your staff: ${subdomain}`, 'success', 8000);
      } else {
        showToast('Registration complete. Check your inbox to verify your email.', 'success');
      }
      if (typeof toggleAuthMode === 'function') toggleAuthMode('login');
    }

    btn.disabled = false;
    btn.innerHTML = 'Create Profile <i class="bi bi-check-circle" style="margin-left:8px;"></i>';
  });
}

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────
const forgotForm = document.getElementById('forgot-form');
if (forgotForm && supabase) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const btn   = document.getElementById('send-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Sending...';
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const BASE_URL = isLocalhost ? 'http://localhost:3000' : 'https://bustrack-alpha.vercel.app';
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${BASE_URL}/reset-password.html` });
    if (error) {
      showToast(error.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-send-fill"></i> Send Recovery Link';
      return;
    }
    document.getElementById('step-request').style.display = 'none';
    document.getElementById('step-sent').style.display    = 'block';
    document.getElementById('sent-to').textContent = email;
  });
}

// ─── RESET PASSWORD ───────────────────────────────────────────────────────
const resetForm = document.getElementById('reset-form');
if (resetForm && supabase) {
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw  = document.getElementById('new-password').value;
    const cpw = document.getElementById('confirm-password').value;
    const btn = document.getElementById('reset-btn');
    if (pw !== cpw)    { showToast('Passwords do not match.', 'error'); return; }
    if (pw.length < 8) { showToast('Password must be at least 8 characters.', 'error'); return; }
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Updating...';
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      showToast(error.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-shield-check"></i> Update Password';
      return;
    }
    await supabase.auth.signOut();
    document.getElementById('step-reset').style.display = 'none';
    document.getElementById('step-done').style.display  = 'block';
  });
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  window.location.href = rootPath('index.html');
}

export async function requireAuth() {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) window.location.href = rootPath('index.html');
  return session;
}

function showToast(msg, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}