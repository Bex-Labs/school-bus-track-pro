/**
 * USERS.JS — Production Admin User Management
 * Fully functional with Supabase, Defensive DOM checks, and UI state management.
 */
import { supabase } from './config.js';
import { signOut } from './auth.js';

// Global State
let allUsers = [];
let filteredUsers = [];
let isEditMode = false;
let currentEditId = null;
let activeRoleFilter = 'all';

/**
 * --- 1. CORE INITIALIZATION ---
 * Ensures session exists and triggers initial data pull
 */
async function init() {
    console.log("Admin Console: Initializing Secure Session...");
    
    try {
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        
        if (authError || !session) {
            console.error("Auth Failure:", authError);
            window.location.href = '../login.html';
            return;
        }

        // Setup UI Listeners with Null Guards
        setupEventListeners();
        
        // Initial Fetch
        await loadUsers();
        
    } catch (err) {
        console.error("Initialization Crash:", err);
        // Using a safe console log if showToast isn't ready
        console.warn("System initialization failed. Check Supabase Config.");
    }
}

/**
 * --- 2. DATA ORCHESTRATION ---
 * Handles the heavy lifting of fetching from Supabase
 */
async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return; // Guard: Exit if not on the users page

    const loader = `<tr><td colspan="6" style="text-align:center; padding:60px;">
                        <div class="spinner-container">
                            <i class="bi bi-arrow-clockwise spin" style="font-size: 2rem; color: var(--navy);"></i>
                            <p style="margin-top:10px; font-weight:600; color:var(--text-secondary);">Syncing Live Records...</p>
                        </div>
                    </td></tr>`;
    
    tbody.innerHTML = loader;

    try {
        // FETCH: Note the select('*') ensures we get all profile data
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        allUsers = profiles || [];
        filteredUsers = [...allUsers]; // Reset filter state
        
        applyCurrentFilters();
        updateKPIs(allUsers);

    } catch (error) {
        console.error("Fetch Error:", error.message);
        showToast("Database Sync Failed", "error");
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--red);">
                            <i class="bi bi-exclamation-triangle" style="font-size:2rem;"></i><br>
                            Check if 'profiles' table exists in Supabase.
                          </td></tr>`;
    }
}

/**
 * --- 3. UI RENDERING ENGINE ---
 */
function renderUserTable(data) {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted);">
                            No user records found matching your criteria.
                          </td></tr>`;
        return;
    }

    const roleMap = {
        admin: { label: 'ADMIN', class: 'badge-red' },
        driver: { label: 'DRIVER', class: 'badge-navy' },
        parent: { label: 'PARENT', class: 'badge-yellow' },
        student: { label: 'STUDENT', class: 'badge-green' }
    };

    tbody.innerHTML = data.map(user => {
        const roleData = roleMap[user.role] || { label: 'USER', class: 'badge-gray' };
        const initials = user.full_name ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase() : '?';

        return `
            <tr>
                <td>
                    <div class="td-user">
                        <div class="td-avatar">
                            ${user.avatar_url ? `<img src="${user.avatar_url}" alt="Avatar">` : initials.substring(0, 2)}
                        </div>
                        <div class="td-info">
                            <div class="td-name">${user.full_name || 'Anonymous'}</div>
                            <div class="td-sub">ID: ${user.id.substring(0, 8)}...</div>
                        </div>
                    </div>
                </td>
                <td><span class="badge ${roleData.class}">${roleData.label}</span></td>
                <td><div class="td-email">${user.email || '—'}</div></td>
                <td>
                    <div class="td-bus-info">
                        ${user.bus_id ? `<i class="bi bi-bus-front text-navy"></i> <strong>${user.bus_id}</strong>` : `<span class="text-muted">Unassigned</span>`}
                    </div>
                </td>
                <td><span class="badge badge-green-light"><span class="dot-green"></span> Active</span></td>
                <td>
                    <div class="td-actions">
                        <button class="btn-table edit" onclick="openEditModal('${user.id}')"><i class="bi bi-pencil"></i></button>
                        <button class="btn-table delete" onclick="deleteUser('${user.id}')"><i class="bi bi-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    const countEl = document.getElementById('user-count-display');
    if (countEl) countEl.textContent = `Showing ${data.length} of ${allUsers.length} records`;
}

/**
 * --- 4. EVENT HANDLERS (Defensive Guards) ---
 */
function setupEventListeners() {
    const safeAttach = (id, event, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, fn);
    };

    // Search Input
    safeAttach('user-search', 'input', applyCurrentFilters);

    // Role Chips
    document.querySelectorAll('.chip').forEach(chip => {
        chip.onclick = () => {
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            activeRoleFilter = chip.dataset.role;
            applyCurrentFilters();
        };
    });

    // Modal Control
    const modal = document.getElementById('add-modal');
    safeAttach('btn-open-modal', 'click', () => {
        isEditMode = false;
        resetModalForm();
        if(modal) modal.style.display = 'flex';
    });

    safeAttach('btn-close-modal', 'click', () => { if(modal) modal.style.display = 'none'; });
    safeAttach('btn-cancel', 'click', () => { if(modal) modal.style.display = 'none'; });

    // Save Action
    safeAttach('btn-save-user', 'click', handleSaveUser);

    // Sidebar
    safeAttach('signout-btn', 'click', () => { if(confirm("Logout?")) signOut(); });
}

/**
 * --- 5. CRUD OPERATIONS ---
 */
window.openEditModal = (id) => {
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    isEditMode = true;
    currentEditId = id;
    
    const title = document.getElementById('modal-title');
    const btn = document.getElementById('btn-save-user');
    
    if (title) title.textContent = "Modify User Record";
    if (btn) btn.textContent = "Save Changes";
    
    const nameInp = document.getElementById('new-user-name');
    const emailInp = document.getElementById('new-user-email');
    const roleInp = document.getElementById('new-user-role');

    if (nameInp) nameInp.value = user.full_name || '';
    if (emailInp) emailInp.value = user.email || '';
    if (roleInp) roleInp.value = user.role || 'parent';
    
    const modal = document.getElementById('add-modal');
    if (modal) modal.style.display = 'flex';
};

/**
 * --- 6. UTILITIES ---
 */
function applyCurrentFilters() {
    const searchEl = document.getElementById('user-search');
    const searchTerm = searchEl ? searchEl.value.toLowerCase() : "";
    
    filteredUsers = allUsers.filter(user => {
        const matchesRole = activeRoleFilter === 'all' || user.role === activeRoleFilter;
        const matchesSearch = (user.full_name?.toLowerCase().includes(searchTerm)) || 
                              (user.email?.toLowerCase().includes(searchTerm));
        return matchesRole && matchesSearch;
    });

    renderUserTable(filteredUsers);
}

function updateKPIs(data) {
    const sets = {
        'count-drivers': 'driver',
        'count-parents': 'parent',
        'count-students': 'student'
    };

    for (const [id, role] of Object.entries(sets)) {
        const el = document.getElementById(id);
        if (el) el.textContent = data.filter(u => u.role === role).length;
    }
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const icons = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle' };
    
    toast.className = `toast ${type} active`;
    toast.innerHTML = `<i class="bi bi-${icons[type] || 'info-circle'}"></i> <span>${msg}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('active');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

function resetModalForm() {
    const title = document.getElementById('modal-title');
    const btn = document.getElementById('btn-save-user');
    if (title) title.textContent = "Register New Account";
    if (btn) btn.textContent = "Create User";
    
    const nameInp = document.getElementById('new-user-name');
    const emailInp = document.getElementById('new-user-email');
    if (nameInp) nameInp.value = '';
    if (emailInp) emailInp.value = '';
}

// Global scope assignments for inline HTML
window.deleteUser = async (id) => {
    if (confirm("Permanently delete this user profile?")) {
        try {
            const { error } = await supabase.from('profiles').delete().eq('id', id);
            if (error) throw error;
            showToast("Record successfully deleted.", "info");
            await loadUsers();
        } catch (err) {
            showToast("Delete failed: " + err.message, "error");
        }
    }
};

// Start Application
init();