/**
 * USERS.JS — Admin User Management
 * Tenant model: organization_id scoped on all queries and mutations
 */
import { supabase, getUserProfile } from './config.js';
import { signOut } from './auth.js';

let allUsers       = [];
let filteredUsers  = [];
let isEditMode     = false;
let currentEditId  = null;
let activeRoleFilter = 'all';
let ORG_ID         = null;

async function init() {
  // ── 0. Resolve tenant ──────────────────────────────────────────────────
  const profile = await getUserProfile();
  if (!profile || !profile.organization_id) {
    console.error('Users: No organization_id on profile.');
    window.location.href = '../index.html';
    return;
  }
  ORG_ID = profile.organization_id;

  setupEventListeners();
  await loadUsers();
}

// ── 1. FETCH — scoped to org ───────────────────────────────────────────────
async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:60px;">
    <i class="bi bi-arrow-clockwise spin" style="font-size:2rem;color:var(--navy);"></i>
    <p style="margin-top:10px;font-weight:600;color:var(--text-secondary);">Loading...</p>
  </td></tr>`;

  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('organization_id', ORG_ID)             // ← scoped to tenant
      .order('full_name', { ascending: true });

    if (error) throw error;

    allUsers      = profiles || [];
    filteredUsers = [...allUsers];
    applyCurrentFilters();
    updateKPIs(allUsers);

  } catch (err) {
    console.error('Fetch Error:', err.message);
    showToast('Database sync failed', 'error');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--red);">
      <i class="bi bi-exclamation-triangle" style="font-size:2rem;"></i><br>
      ${err.message}
    </td></tr>`;
  }
}

// ── 2. RENDER ─────────────────────────────────────────────────────────────
function renderUserTable(data) {
  const tbody      = document.getElementById('users-tbody');
  const mobileList = document.getElementById('users-mobile-list');
  if (!tbody) return;

  if (!data || !data.length) {
    const empty = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No records found.</td></tr>';
    tbody.innerHTML = empty;
    if (mobileList) mobileList.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">No records found.</div>';
    return;
  }

  const roleMap = {
    school_manager: { label: 'MANAGER', cls: 'badge-red'    },
    driver:         { label: 'DRIVER',  cls: 'badge-navy'   },
    parent:         { label: 'PARENT',  cls: 'badge-yellow' },
    student:        { label: 'STUDENT', cls: 'badge-green'  }
  };

  tbody.innerHTML = data.map(u => {
    const roleData = roleMap[u.role] || { label: 'USER', cls: 'badge-gray' };
    const initials = u.full_name ? u.full_name.split(' ').map(n => n[0]).join('').toUpperCase() : '?';
    let displayBus = u.role === 'parent' ? '<span style="opacity:0.5">PARENT</span>' : (u.bus_id || '---');

    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="admin-avatar" style="width:30px;height:30px;font-size:12px;">${u.avatar_url ? `<img src="${u.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : initials.substring(0,2)}</div>
            <div>
              <div style="font-weight:700;">${u.full_name || 'Anonymous'}</div>
              <div style="font-size:11px;color:var(--text-muted);">ID: ${u.id.substring(0,8)}...</div>
            </div>
          </div>
        </td>
        <td><span class="badge ${roleData.cls}">${roleData.label}</span></td>
        <td>${u.email || '—'}</td>
        <td><code style="color:var(--navy);font-weight:700;">${displayBus}</code></td>
        <td><span class="badge badge-green-light"><span class="live-dot" style="background:var(--green)"></span> Active</span></td>
        <td style="text-align:right;">
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button class="btn-table edit"   onclick="window.openEditModal('${u.id}')"><i class="bi bi-pencil"></i></button>
            <button class="btn-table delete" onclick="window.deleteUser('${u.id}')"><i class="bi bi-trash"></i></button>
          </div>
        </td>
      </tr>`;
  }).join('');

  if (mobileList) {
    mobileList.innerHTML = data.map(u => {
      const roleData  = roleMap[u.role] || { label: 'USER', cls: 'badge-gray' };
      let displayBus  = u.role === 'parent' ? 'PARENT ACCOUNT' : (u.bus_id || '---');
      return `
        <div class="user-card-mobile">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="admin-avatar" style="width:35px;height:35px;">${(u.full_name || '?').charAt(0)}</div>
              <div>
                <div style="font-weight:800;font-size:14px;">${u.full_name || 'Anonymous'}</div>
                <div style="font-size:11px;color:var(--text-muted);">${u.email || '---'}</div>
              </div>
            </div>
            <span class="badge ${roleData.cls}" style="font-size:10px;">${roleData.label}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;background:var(--bg);padding:8px;border-radius:8px;">
            <span style="font-weight:700;color:var(--text-muted);">BUS / TYPE</span>
            <span style="font-family:monospace;font-weight:800;">${displayBus}</span>
          </div>
          <button class="btn btn-red btn-full btn-sm" style="margin-top:12px;height:35px;" onclick="window.deleteUser('${u.id}')">
            <i class="bi bi-trash"></i> Remove
          </button>
        </div>`;
    }).join('');
  }
}

// ── 3. CRUD ────────────────────────────────────────────────────────────────
window.openEditModal = (id) => {
  const user = allUsers.find(u => u.id === id);
  if (!user) return;

  isEditMode    = true;
  currentEditId = id;

  const title = document.getElementById('modal-title');
  const btn   = document.getElementById('btn-save-user');
  if (title) title.textContent = 'Edit User';
  if (btn)   btn.textContent   = 'Save Changes';

  const nameInp  = document.getElementById('new-user-name');
  const emailInp = document.getElementById('new-user-email');
  const roleInp  = document.getElementById('new-user-role');
  if (nameInp)  nameInp.value  = user.full_name || '';
  if (emailInp) emailInp.value = user.email     || '';
  if (roleInp)  roleInp.value  = user.role      || 'parent';

  const modal = document.getElementById('add-modal');
  if (modal) modal.style.display = 'flex';
};

async function handleSaveUser() {
  const name  = document.getElementById('new-user-name')?.value.trim();
  const email = document.getElementById('new-user-email')?.value.trim();
  const role  = document.getElementById('new-user-role')?.value;

  if (!name || !email) { showToast('Please fill all fields.', 'error'); return; }

  if (isEditMode && currentEditId) {
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name, email, role })
      .eq('id', currentEditId)
      .eq('organization_id', ORG_ID);            // ← safety: can't edit outside org

    if (!error) { showToast('User updated.', 'success'); closeModal(); loadUsers(); }
    else showToast('Update failed: ' + error.message, 'error');
  } else {
    const { error } = await supabase
      .from('profiles')
      .insert([{ full_name: name, email, role, organization_id: ORG_ID }]);

    if (!error) { showToast('User created.', 'success'); closeModal(); loadUsers(); }
    else showToast('Create failed: ' + error.message, 'error');
  }
}

window.deleteUser = async (id) => {
  if (!confirm('Permanently delete this user?')) return;
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', id)
    .eq('organization_id', ORG_ID);              // ← safety: can't delete outside org

  if (!error) { showToast('User deleted.', 'info'); loadUsers(); }
  else showToast('Delete failed: ' + error.message, 'error');
};

// ── 4. FILTERS ─────────────────────────────────────────────────────────────
function applyCurrentFilters() {
  const searchTerm = (document.getElementById('user-search')?.value || '').toLowerCase();
  filteredUsers = allUsers.filter(u => {
    const matchRole   = activeRoleFilter === 'all' || u.role === activeRoleFilter;
    const matchSearch = u.full_name?.toLowerCase().includes(searchTerm) ||
                        u.email?.toLowerCase().includes(searchTerm);
    return matchRole && matchSearch;
  });
  renderUserTable(filteredUsers);
}

function updateKPIs(users) {
  const set = (id, role) => { const el = document.getElementById(id); if (el) el.textContent = users.filter(u => u.role === role).length; };
  set('count-drivers',  'driver');
  set('count-parents',  'parent');
  set('count-students', 'student');
  const total = document.getElementById('count-total');
  if (total) total.textContent = users.length;
}

// ── 5. EVENT LISTENERS ──────────────────────────────────────────────────────
function setupEventListeners() {
  const safeAttach = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };

  const searchInp = document.getElementById('user-search');
  if (searchInp) searchInp.oninput = applyCurrentFilters;

  document.querySelectorAll('.chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeRoleFilter = chip.dataset.role;
      applyCurrentFilters();
    };
  });

  const modal = document.getElementById('add-modal');
  safeAttach('btn-open-modal', () => {
    isEditMode = false;
    const title = document.getElementById('modal-title');
    const btn   = document.getElementById('btn-save-user');
    const nameInp  = document.getElementById('new-user-name');
    const emailInp = document.getElementById('new-user-email');
    if (title)    title.textContent  = 'Register New User';
    if (btn)      btn.textContent    = 'Create';
    if (nameInp)  nameInp.value  = '';
    if (emailInp) emailInp.value = '';
    if (modal) modal.style.display = 'flex';
  });

  safeAttach('btn-cancel',    closeModal);
  safeAttach('btn-save-user', handleSaveUser);
  safeAttach('signout-btn-sidebar', () => signOut());
  safeAttach('signout-btn',         () => signOut());
}

function closeModal() {
  const modal = document.getElementById('add-modal');
  if (modal) modal.style.display = 'none';
}

function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type} active`;
  t.innerHTML = `<i class="bi bi-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> <span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.remove('active'); setTimeout(() => t.remove(), 500); }, 4000);
}

init();