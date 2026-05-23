/**
 * UI-FEATURES.JS — Universal UI Utilities
 * Password toggles, dark mode, theme switcher, pull-to-refresh, etc.
 */

// ─── Dark Mode ─────────────────────────────────────────────
export function initDarkMode() {
  const stored = localStorage.getItem('sbtp_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = stored ? stored === 'dark' : prefersDark;

  if (isDark) document.documentElement.setAttribute('data-theme', 'dark');

  const toggle = document.getElementById('dark-mode-toggle');
  if (toggle) {
    toggle.checked = isDark;
    toggle.addEventListener('change', () => {
      const dark = toggle.checked;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      localStorage.setItem('sbtp_theme', dark ? 'dark' : 'light');
    });
  }
}

// ─── Password Eye Toggles ──────────────────────────────────
export function initPasswordToggles() {
  document.querySelectorAll('.eye-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault(); // Prevent accidental form submit
      const wrap = btn.closest('.input-wrap');
      const input = wrap?.querySelector('input');
      if (!input) return;
      
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      
      // Update icon
      const icon = btn.querySelector('i') || btn;
      icon.className = isHidden ? 'bi bi-eye-slash' : 'bi bi-eye';
    });
  });
}

// ─── Enhanced Toast System ─────────────────────────────────
export function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const icons = {
    success: 'bi-check-circle-fill',
    error: 'bi-exclamation-triangle-fill',
    info: 'bi-info-circle-fill',
    warning: 'bi-exclamation-circle-fill'
  };

  toast.className = `toast ${type} active`;
  toast.innerHTML = `
    <i class="bi ${icons[type] || icons.info}"></i>
    <div class="toast-content">${message}</div>
  `;
  
  container.appendChild(toast);

  // Auto-remove logic
  setTimeout(() => {
    toast.classList.remove('active');
    toast.style.transform = 'translateX(100%)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// ─── Active Nav Link Highlighter ──────────────────────────
export function highlightActiveNav() {
  const currentPath = window.location.pathname;
  const currentPage = currentPath.split('/').pop() || 'index.html';
  
  document.querySelectorAll('.bottom-nav a, .nav-link, .sidebar-nav a').forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    
    const linkPage = href.split('/').pop();
    if (linkPage === currentPage) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

// ─── Ripple Effect on Buttons ─────────────────────────────
export function initRipple() {
  const rippleTargets = '.btn, .btn-full, .btn-table, .sheet-action, .chip';
  
  document.addEventListener('mousedown', function(e) {
    const btn = e.target.closest(rippleTargets);
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    ripple.style.cssText = `
      position: absolute;
      top: ${y}px;
      left: ${x}px;
      width: ${size}px;
      height: ${size}px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      pointer-events: none;
      transform: scale(0);
      animation: rippleAnim 0.6s linear;
    `;

    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);

    setTimeout(() => ripple.remove(), 600);
  });

  if (!document.getElementById('ripple-style')) {
    const style = document.createElement('style');
    style.id = 'ripple-style';
    style.textContent = `
      @keyframes rippleAnim {
        to { transform: scale(4); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

// ─── Page Load and Transitions ────────────────────────────
export function initPageTransitions() {
  // Reveal page
  document.body.classList.add('page-loaded');

  document.querySelectorAll('a[href]:not([target="_blank"]):not([href^="#"])').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (!href || href.includes('javascript:void(0)') || e.metaKey || e.ctrlKey) return;

      e.preventDefault();
      document.body.classList.remove('page-loaded');
      document.body.style.opacity = '0';
      
      setTimeout(() => {
        window.location.href = href;
      }, 200);
    });
  });
}

// ─── Format Helpers ────────────────────────────────────────
export const fmt = {
  time(date) {
    if (!date) return '--:--';
    return new Date(date).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  },
  date(date) {
    if (!date) return '---';
    return new Date(date).toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  },
  relative(date) {
    if (!date) return '';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
};

// ─── Auto-init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  initPasswordToggles();
  highlightActiveNav();
  initRipple();
  initPageTransitions();
});