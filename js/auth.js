/**
 * AUTH.JS — Authentication & Role-Based SaaS Tenancy Routing
 * Handles: Subdomain resolving, Email/Password login, Sign Up, Google OAuth, Password Reset, Session management
 */

import { supabase, getUserRole } from './config.js';

// ─── Role → Page Redirect Map ─────────────────────────────
const ROLE_REDIRECTS = {
  driver: '/driver/dashboard.html',
  parent: '/parent/map.html',
  admin:  '/admin/fleet.html',
};

// ─── Resolve path relative to root ────────────────────────
function rootPath(path) {
  const depth = window.location.pathname.split('/').length - 2;
  const prefix = depth > 0 ? '../'.repeat(depth) : './';
  return prefix + path.replace(/^\//, '');
}

// ─── 0. SAAS SUBDOMAIN RESOLVER (FIXED DEV BYPASS) ─────────────────
async function resolveActiveTenant() {
  window.activeTenantId = null;
  const host = window.location.hostname;
  
  // A. LOCAL DEVELOPMENT BYPASS: Exit silently on loopback testing targets
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
    console.log("🛠️ Local environment verified. Subdomain checks bypassed safely.");
    return;
  }

  const parts = host.split('.');

  // B. MASTER PORTAL ROADMAP BYPASS: Exit if browsing the global platform landing indexes
  if (parts.length <= 2 || parts[0] === 'www' || parts[0] === 'admin' || parts[0] === 'app') {
    console.log("🌐 Central Gateway Platform active. Multi-tenant routing decoupled.");
    return;
  }

  // C. STRATIFIED MULTI-TENANT EVALUATION Matrix
  const subToken = parts[0].toLowerCase();
  
  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('subdomain', subToken)
    .eq('account_status', 'active')
    .single();

  if (!error && org) {
    window.activeTenantId = org.id;
    
    // Dynamic white-label UI injection
    const brandHeader = document.getElementById('login-school-title');
    if (brandHeader) brandHeader.innerHTML = `${org.name} <span>Command Engine</span>`;
    
    const subText = document.getElementById('visual-dynamic-subtext');
    if (subText) subText.textContent = `Exclusive logistics terminal for ${org.name}. Powered by School Bus Track Pro SaaS.`;
    
    console.log(`SaaS Context Locked: ${org.name} [${org.id}]`);
  } else {
    showToast('Invalid or suspended school domain configuration.', 'error');
  }
}

// ─── Auth State Listener ───────────────────────────────────
if (supabase) {
  // Execute resolving immediately before processing state changes
  await resolveActiveTenant();

  supabase.auth.onAuthStateChange((event, session) => {
    const isAuthPage = ['/', '/index.html', '/forgot-password.html', '/reset-password.html']
      .some(p => window.location.pathname.endsWith(p.replace('/', '')));

    // CRITICAL PROTECTION FOR CONFIRMATION FLOW:
    // If we detect an incoming access token hash parameter or a password recovery, do NOT run auto-redirect loop.
    // This allows confirm.html or reset-password.html to process the verification handshake completely.
    if (window.location.hash.includes('access_token=') || window.location.pathname.includes('confirm.html')) {
       return;
    }

    if (event === 'SIGNED_IN' && session && isAuthPage) {
      redirectByRole(session.user);
    }

    if (event === 'SIGNED_OUT') {
      const onProtectedPage = !window.location.pathname.includes('index.html') &&
        !window.location.pathname.includes('forgot-password') &&
        !window.location.pathname.includes('reset-password') &&
        !window.location.pathname.includes('confirm.html');
      if (onProtectedPage) {
        window.location.href = rootPath('index.html');
      }
    }

    if (event === 'PASSWORD_RECOVERY') {
      window.location.href = rootPath('reset-password.html');
    }
  });
}

// ─── Redirect by Role ──────────────────────────────────────
async function redirectByRole(user) {
  const role = user.user_metadata?.role || await getUserRole();
  const path = ROLE_REDIRECTS[role] || ROLE_REDIRECTS.parent;
  
  const targetFolder = path.split('/')[1]; 
  if (window.location.pathname.includes(`/${targetFolder}/`)) return;

  window.location.href = rootPath(path);
}

// ─── Email / Password Login ────────────────────────────────
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
      btn.innerHTML = 'Login <i class="bi bi-arrow-right-short" style="font-size: 22px;"></i>';
      return;
    }

    // Double check that the logged user belongs to the current subdomain tenant (if on a subdomain)
    if (window.activeTenantId) {
       const { data: profile } = await supabase
         .from('profiles')
         .select('organization_id')
         .eq('id', data.user.id)
         .single();

       if (profile && profile.organization_id !== window.activeTenantId) {
          await supabase.auth.signOut();
          showToast('Access Denied: Your account is not mapped to this school workspace.', 'error');
          btn.disabled = false;
          btn.innerHTML = 'Login <i class="bi bi-arrow-right-short" style="font-size: 22px;"></i>';
          return;
       }
    }

    if (document.getElementById('remember')?.checked) {
      localStorage.setItem('sbtp_remember', email);
    }

    redirectByRole(data.user);
  });

  const remembered = localStorage.getItem('sbtp_remember');
  if (remembered) {
    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.value = remembered;
    const rememberBox = document.getElementById('remember');
    if (rememberBox) rememberBox.checked = true;
  }
}

// ─── Email / Password Sign Up (Tenant Injection Added) ─────
const signupForm = document.getElementById('signup-form');
if (signupForm && supabase) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const name = document.getElementById('signup-name').value.trim();
    const btn = document.getElementById('signup-btn');
    
    let targetOrganizationId = window.activeTenantId;

    // If registration is happening on the root landing page, determine tenant by explicit input code
    if (!targetOrganizationId) {
       const codeInput = document.getElementById('signup-tenant-code').value.trim().toLowerCase();
       if (!codeInput) {
          showToast('Please specify a valid Organization Code.', 'error');
          return;
       }

       const { data: targetOrg, error: orgError } = await supabase
         .from('organizations')
         .select('id')
         .eq('subdomain', codeInput)
         .single();

       if (orgError || !targetOrg) {
          showToast('Organization validation failed: Check code structure.', 'error');
          return;
       }
       targetOrganizationId = targetOrg.id;
    }

    const role = typeof selectedRole !== 'undefined' ? selectedRole : 'parent';

    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Creating account...';

    // Sign up with standard authentication metadata mapping + SET EMAIL REDIRECT TO CONFIRM.HTML
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + rootPath('confirm.html'),
        data: {
          full_name: name,
          role: role,
          organization_id: targetOrganizationId
        }
      }
    });

    if (error) {
      showToast(error.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Create Profile <i class="bi bi-check-circle" style="margin-left: 8px;"></i>';
      return;
    }

    if (data.user) {
      // Direct Database Sync confirmation backup to catch profiles table hooks
      await supabase.from('profiles').update({ organization_id: targetOrganizationId }).eq('id', data.user.id);

      showToast('Registration successful! Please verify your email via the authentication link dispatched.', 'success');
      if (typeof toggleAuthMode === 'function') toggleAuthMode('login');
    }
    
    btn.disabled = false;
    btn.innerHTML = 'Create Profile <i class="bi bi-check-circle" style="margin-left: 8px;"></i>';
  });
}

// ─── Google OAuth (Tenant Aware Metadata) ──────────────────
const googleBtn = document.getElementById('google-btn');
if (googleBtn && supabase) {
  googleBtn.addEventListener('click', async () => {
    const role = typeof selectedRole !== 'undefined' ? selectedRole : 'parent';
    const targetOrganizationId = window.activeTenantId || null;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + rootPath('confirm.html'), // Redirect social signups to confirm.html to finalize onboarding metrics
        data: {
          role: role,
          organization_id: targetOrganizationId
        },
        queryParams: { 
          access_type: 'offline', 
          prompt: 'consent' 
        }
      }
    });
    if (error) showToast(error.message, 'error');
  });
}

// ─── Forgot Password ───────────────────────────────────────
const forgotForm = document.getElementById('forgot-form');
if (forgotForm && supabase) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const btn   = document.getElementById('send-btn');

    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Sending...';

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + rootPath('reset-password.html')
    });

    if (error) {
      showToast(error.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-send-fill"></i> Send Recovery Link';
      return;
    }

    document.getElementById('step-request').style.display = 'none';
    document.getElementById('step-sent').style.display = 'block';
    document.getElementById('sent-to').textContent = email;
  });
}

// ─── Reset Password ────────────────────────────────────────
const resetForm = document.getElementById('reset-form');
if (resetForm && supabase) {
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw  = document.getElementById('new-password').value;
    const cpw = document.getElementById('confirm-password').value;
    const btn = document.getElementById('reset-btn');

    if (pw !== cpw) { showToast('Passwords do not match', 'error'); return; }
    if (pw.length < 8) { showToast('Password must be at least 8 characters', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Updating...';

    const { error } = await supabase.auth.updateUser({ password: pw });

    if (error) {
      showToast(error.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-shield-check"></i> Update Password';
      return;
    }

    document.getElementById('step-reset').style.display = 'none';
    document.getElementById('step-done').style.display = 'block';
  });
}

// ─── Sign Out Helper ───────────────────────────────────────
export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  window.location.href = rootPath('index.html');
}

// ─── Session Guard (call on protected pages) ───────────────
export async function requireAuth() {
  if (!supabase) return; 
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = rootPath('index.html');
  }
  return session;
}

// ─── Toast Helper ──────────────────────────────────────────
function showToast(msg, type = 'info') {
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
  setTimeout(() => toast.remove(), 4000);
}