// src/main.js — IndraDatabase Application (Vite + Firebase Modular SDK)
import '../style.css';
import emailjs from '@emailjs/browser';
import { auth, db } from './firebase.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  setDoc, getDoc, query, orderBy, serverTimestamp,
  arrayUnion, arrayRemove, getDocsFromServer, where,
} from 'firebase/firestore';

// ============================================================
// CONSTANTS & STATE
// ============================================================
const ADMIN_CODE = 'Indramani$1*';
const PAGE_SIZE = 10;

// Initialize EmailJS once at startup
const _ejsPublicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
if (_ejsPublicKey) emailjs.init({ publicKey: _ejsPublicKey });


let currentUser = null;
let currentUserRole = null;
let currentUserName = null;
let currentPage = 'dashboard';
let editingStudentId = null;
let deletingStudentId = null;
let studentsCache = [];
let currentView = 'table';
let searchQuery = '';
let filterCourse = '';
let filterStatus = '';
let currentPageNum = 1;

// Groups state
let groupsCache = [];
let currentGroupId = null;
let addMembersGrpId = null;
let mailGroupId = null;

// Access Request state
let accessRequestsCache = [];

// ============================================================
// AUTH — TAB SWITCHING
// ============================================================
function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('login-form').classList.toggle('hidden', !isLogin);
  document.getElementById('register-form').classList.toggle('hidden', isLogin);
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-register').classList.toggle('active', !isLogin);
  clearErrors();
}

function clearErrors() {
  document.querySelectorAll('.error-msg').forEach(el => {
    el.classList.add('hidden'); el.textContent = '';
  });
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ============================================================
// AUTH — LOGIN
// ============================================================
async function handleLogin(e) {
  e.preventDefault();
  clearErrors();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  setBtnLoading(btn, true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showError('login-error', getAuthError(err.code));
    setBtnLoading(btn, false);
  }
}

// ============================================================
// AUTH — REGISTER
// ============================================================
async function handleRegister(e) {
  e.preventDefault();
  clearErrors();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const adminCode = document.getElementById('reg-admincode').value.trim();
  const isAdmin = adminCode === ADMIN_CODE;
  const btn = document.getElementById('register-btn');
  if (!name) { showError('register-error', 'Please enter your full name.'); return; }
  setBtnLoading(btn, true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', cred.user.uid), {
      name, email,
      role: isAdmin ? 'admin' : 'user',
      createdAt: serverTimestamp(),
    });
    showToast(isAdmin ? '🎉 Admin account created!' : '✅ Account created! Welcome.', 'success');
  } catch (err) {
    showError('register-error', getAuthError(err.code));
    setBtnLoading(btn, false);
  }
}

// ============================================================
// AUTH — LOGOUT
// ============================================================
async function handleLogout() {
  await signOut(auth);
  currentUser = currentUserRole = currentUserName = null;
  studentsCache = []; groupsCache = []; accessRequestsCache = [];
  showAuthSection();
  showToast('👋 Logged out successfully.', 'info');
}

// ============================================================
// AUTH STATE OBSERVER
// ============================================================
function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('fade-out');
  setTimeout(() => splash.remove(), 320);
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        currentUserRole = snap.data().role;
        currentUserName = snap.data().name;

        // Fetch access requests if not admin/core_member
        if (currentUserRole === 'user' || currentUserRole === 'member') {
          const reqSnap = await getDocs(query(collection(db, 'accessRequests'), where('requesterUid', '==', user.uid)));
          accessRequestsCache = reqSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        showApp(currentUserName, currentUserRole);
        hideSplash();
        navigateTo('dashboard');
      } else {
        await signOut(auth);
        showAuthSection();
        hideSplash();
        showToast('Profile not found. Please register again.', 'error');
      }
    } catch (err) {
      console.error('Profile load error:', err);
      hideSplash();
      showToast('Error loading profile.', 'error');
    }
  } else {
    showAuthSection();
    hideSplash();
  }
});

function getAuthError(code) {
  const map = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/invalid-credential': 'Invalid email or password.',
  };
  return map[code] || 'An error occurred. Please try again.';
}

function setBtnLoading(btn, loading) {
  if (!btn) return;
  const span = btn.querySelector('span');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = loading;
  if (span) span.style.opacity = loading ? '0.5' : '1';
  if (loader) loader.classList.toggle('hidden', !loading);
}

// ============================================================
// SHOW / HIDE SECTIONS
// ============================================================
function showAuthSection() {
  document.getElementById('auth-section').classList.remove('hidden');
  document.getElementById('app-section').classList.add('hidden');
  document.getElementById('login-form')?.reset();
  document.getElementById('register-form')?.reset();
  switchTab('login');
}

function showApp(name, role) {
  document.getElementById('auth-section').classList.add('hidden');
  document.getElementById('app-section').classList.remove('hidden');
  const badge = document.getElementById('role-badge');
  badge.textContent = role === 'admin' ? '👑 Admin' : '👤 User';
  badge.className = `role-badge ${role}`;
  document.getElementById('sidebar-user').innerHTML = `
    <div class="user-avatar">${getInitials(name)}</div>
    <div class="user-details">
      <div class="user-name">${escHtml(name || 'User')}</div>
      <div class="user-role">${role === 'admin' ? 'Administrator' : 'Regular User'}</div>
    </div>
  `;
  buildSidebarNav(role);
}

// ============================================================
// SIDEBAR NAV
// ============================================================
function buildSidebarNav(role) {
  const adminOnlyItems = role === 'admin' ? `
    <div class="nav-item" id="nav-groups" onclick="navigateTo('groups')">
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>
      Groups &amp; Mail
    </div>
    <div class="nav-section-title">Admin Actions</div>
    <div class="nav-item" id="nav-add" onclick="openAddStudentModal()">
      <svg viewBox="0 0 24 24"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
      Add Student
    </div>
    <div class="nav-item" id="nav-admin-control" onclick="navigateTo('admin-control')">
      <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
      Admin Control
    </div>
    <div class="nav-item" id="nav-user-requests" onclick="navigateTo('user-requests')">
      <svg viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/></svg>
      User Requests
    </div>
  ` : '';

  document.getElementById('sidebar-nav').innerHTML = `
    <div class="nav-section-title">Overview</div>
    <div class="nav-item active" id="nav-dashboard" onclick="navigateTo('dashboard')">
      <svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
      Dashboard
    </div>
    <div class="nav-section-title">Students</div>
    <div class="nav-item" id="nav-students" onclick="navigateTo('students')">
      <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
      All Students
    </div>
    ${adminOnlyItems}
  `;
}

// ============================================================
// NAVIGATION
// ============================================================
function navigateTo(page) {
  currentPage = page;
  currentPageNum = 1;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`nav-${page}`)?.classList.add('active');

  const titles = { dashboard: 'Dashboard', students: 'All Students', groups: 'Groups & Mail' };
  document.getElementById('page-title').textContent = titles[page] || 'IndraDatabase';
  document.getElementById('page-content').innerHTML =
    '<div class="loading-overlay"><div class="spinner"></div></div>';

  if (page === 'dashboard') renderDashboard();
  else if (page === 'students') renderStudentsPage();
  else if (page === 'groups') renderGroupsPage();
  else if (page === 'admin-control') renderAdminControlPage();
  else if (page === 'user-requests') renderUserRequestsPage();

  closeSidebarMobile();
}

// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard() {
  try {
    const students = await fetchAllStudents();
    studentsCache = students;
    const total = students.length;
    const active = students.filter(s => s.status === 'Active').length;
    const alumni = students.filter(s => s.status === 'Alumni').length;
    const courses = new Set(students.map(s => s.course).filter(Boolean)).size;
    const recent = [...students]
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      .slice(0, 5);
    const addBtn = currentUserRole === 'admin'
      ? `<button class="btn-small primary" onclick="openAddStudentModal()">+ Add Student</button>` : '';

    const isAdvanced = currentUserRole === 'admin' || currentUserRole === 'core_member';
    
    // Helper to generate mini badges for requested fields
    const getAccessBadgesHTML = (studentId) => {
      const reqs = accessRequestsCache.filter(r => r.targetStudentId === studentId);
      if (reqs.length === 0) return '<span style="color:var(--text-muted);font-size:11px;">—</span>';
      
      const badgesHTML = reqs.map(r => {
        let icon = '';
        if (r.requestedField === 'phone') icon = '📞';
        if (r.requestedField === 'email') icon = '✉️';
        if (r.requestedField === 'address') icon = '🏠';
        return `<span class="status-badge ${r.status}" style="font-size:10px; padding:2px 4px;" title="${r.requestedField}: ${r.status}">${icon}</span>`;
      }).join(' ');
      return `<div style="display:flex;gap:4px;flex-wrap:wrap;">${badgesHTML}</div>`;
    };

    document.getElementById('page-content').innerHTML = `
      <div class="dashboard-header">
        <h2>Welcome back, ${escHtml(currentUserName || 'User')}! 👋</h2>
        <p>Here's an overview of your student management system.</p>
      </div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon violet"><svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div>
          <div class="stat-info"><div class="stat-value">${total}</div><div class="stat-label">Total Students</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></div>
          <div class="stat-info"><div class="stat-value">${active}</div><div class="stat-label">Active Students</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon cyan"><svg viewBox="0 0 24 24"><path d="M12 3L1 9l4 2.18V15c0 2.43 3.61 5 7 5s7-2.57 7-5v-3.82L22 9 12 3zm6 8.99L12 15 6 12V9l6-3.27L18 9v2.99z"/></svg></div>
          <div class="stat-info"><div class="stat-value">${courses}</div><div class="stat-label">Departments</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon pink"><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg></div>
          <div class="stat-info"><div class="stat-value">${alumni}</div><div class="stat-label">Alumni</div></div>
        </div>
      </div>
      <div class="section-header">
        <h3>Recently Added Students</h3>
        <div style="display:flex;gap:8px">${addBtn}<button class="btn-small" onclick="navigateTo('students')">View All →</button></div>
      </div>
      <div class="table-wrapper">
        ${recent.length === 0 ? emptyStateHTML('No students yet', 'Start by adding your first student.') : `
          <table>
            <thead><tr>
              <th>Student</th><th>Course</th><th>Status</th>
              ${isAdvanced ? '<th>Semester</th><th>GPA</th>' : '<th>Access</th>'}
            </tr></thead>
            <tbody>
              ${recent.map(s => {
                const advCells = isAdvanced ? `<td>${escHtml(s.semester || '—')}</td><td>${s.gpa != null ? s.gpa + '/10' : '—'}</td>` : '';
                const accCell = !isAdvanced ? `<td>${getAccessBadgesHTML(s.id)}</td>` : '';
                const hasAccess = (currentUserRole === 'user' || currentUserRole === 'member') && accessRequestsCache.some(r => r.targetStudentId === s.id && r.status === 'approved');
                const lockIcon = hasAccess ? `<span style="font-size:12px; margin-left:6px;" title="Access Approved">🔓</span>` : '';
                
                return `
                  <tr onclick="openViewModal('${s.id}')" style="cursor:pointer;">
                    <td><div class="student-cell">
                      <div class="student-avatar" style="background:${getAvatarColor(s.fullName)}">${getInitials(s.fullName)}</div>
                      <div><div class="student-name">${escHtml(s.fullName)}${lockIcon}</div><div class="student-id">${escHtml(s.studentId || '')}</div></div>
                    </div></td>
                    <td>${escHtml(s.course || '—')}</td>
                    <td><span class="status-badge ${statusClass(s.status)}">${escHtml(s.status || 'Active')}</span></td>
                    ${advCells}
                    ${accCell}
                  </tr>`;
              }).join('')}
            </tbody>
          </table>`}
      </div>`;
  } catch (err) {
    console.error('Dashboard error:', err);
    document.getElementById('page-content').innerHTML =
      `<div class="empty-state"><p style="color:var(--error)">Error loading dashboard.</p></div>`;
  }
}

// ============================================================
// STUDENTS PAGE
// ============================================================
async function renderStudentsPage() {
  document.getElementById('page-content').innerHTML = `
    <div class="page-header">
      <h2>All Students</h2>
      <div class="page-header-actions">
        <div class="view-toggle">
          <button onclick="setView('table')" id="view-table" class="${currentView === 'table' ? 'active' : ''}" title="Table view">
            <svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
          </button>
          <button onclick="setView('grid')" id="view-grid" class="${currentView === 'grid' ? 'active' : ''}" title="Grid view">
            <svg viewBox="0 0 24 24"><path d="M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-4h4v4zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-4h4v4z"/></svg>
          </button>
        </div>
        ${currentUserRole === 'admin'
      ? `<button class="btn-small primary" onclick="openAddStudentModal()">+ Add Student</button>` : ''}
      </div>
    </div>
    <div class="search-bar">
      <div class="search-input-wrapper">
        <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <input type="text" id="search-input" placeholder="Search by name, ID, email, course…"
               oninput="handleSearch(this.value)" value="${escHtml(searchQuery)}" />
      </div>
      <select class="filter-select" onchange="handleFilterCourse(this.value)">
        <option value="">All Courses</option>${courseOptions(filterCourse)}
      </select>
      <select class="filter-select" onchange="handleFilterStatus(this.value)">
        <option value="">All Status</option>${statusOptions(filterStatus)}
      </select>
    </div>
    <div id="students-list"><div class="loading-overlay"><div class="spinner"></div></div></div>
  `;
  await loadAndRenderStudents();
}

async function loadAndRenderStudents() {
  try {
    studentsCache = await fetchAllStudents();
    renderStudentsList();
  } catch (err) {
    console.error('Students load error:', err);
    document.getElementById('students-list').innerHTML =
      `<div class="empty-state"><p style="color:var(--error)">Error loading students.</p></div>`;
  }
}

function renderStudentsList() {
  let filtered = studentsCache;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(s =>
      s.fullName?.toLowerCase().includes(q) || s.studentId?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) || s.course?.toLowerCase().includes(q));
  }
  if (filterCourse) filtered = filtered.filter(s => s.course === filterCourse);
  if (filterStatus) filtered = filtered.filter(s => s.status === filterStatus);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPageNum > totalPages) currentPageNum = 1;
  const start = (currentPageNum - 1) * PAGE_SIZE;
  const paginated = filtered.slice(start, start + PAGE_SIZE);
  const listEl = document.getElementById('students-list');
  if (!listEl) return;

  if (!filtered.length) {
    listEl.innerHTML = `<div class="table-wrapper">${emptyStateHTML('No students found', 'Try adjusting your search or filters.')}</div>`;
    return;
  }

  const paginationHtml = `
    <div class="pagination">
      <span>Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total} students</span>
      <div class="pagination-btns">
        <button onclick="changePage(${currentPageNum - 1})" ${currentPageNum <= 1 ? 'disabled' : ''}>← Prev</button>
        <button onclick="changePage(${currentPageNum + 1})" ${currentPageNum >= totalPages ? 'disabled' : ''}>Next →</button>
      </div>
    </div>`;

  if (currentView === 'table') {
    // Admins and Core Members see extra columns. Members see only basic ones.
    const isAdvanced = currentUserRole === 'admin' || currentUserRole === 'core_member';
    const isAdmin = currentUserRole === 'admin';
    
    // Helper to generate mini badges for requested fields for normal members
    const getAccessBadgesHTML = (studentId) => {
      const reqs = accessRequestsCache.filter(r => r.targetStudentId === studentId);
      if (reqs.length === 0) return '<span style="color:var(--text-muted);font-size:11px;">—</span>';
      
      const badgesHTML = reqs.map(r => {
        let icon = '';
        if (r.requestedField === 'phone') icon = '📞';
        if (r.requestedField === 'email') icon = '✉️';
        if (r.requestedField === 'address') icon = '🏠';
        return `<span class="status-badge ${r.status}" style="font-size:10px; padding:2px 4px;" title="${r.requestedField}: ${r.status}">${icon}</span>`;
      }).join(' ');
      return `<div style="display:flex;gap:4px;flex-wrap:wrap;">${badgesHTML}</div>`;
    };

    const adminCols = isAdmin ? '<th>Actions</th>' : '';
    const advancedCols = isAdvanced ? `<th>Semester</th><th>GPA</th><th>Phone</th>${adminCols}` : '<th>Access</th>';

    const rows = paginated.map(s => {
      const adminCells = isAdmin ? `
        <td><div class="table-actions">
          <button class="btn-icon edit"   onclick="event.stopPropagation();openEditModal('${s.id}')"   title="Edit"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
          <button class="btn-icon delete" onclick="event.stopPropagation();openDeleteModal('${s.id}','${escAttr(s.fullName)}')" title="Delete"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
        </div></td>` : '';
        
      const advancedCells = isAdvanced ? `
        <td>${escHtml(s.semester || '—')}</td>
        <td>${s.gpa != null ? s.gpa + '/10' : '—'}</td>
        <td>${currentUserRole === 'core_member' ? escHtml(s.phone || '—') : escHtml(s.phone || '—')}</td>
        ${adminCells}
      ` : `<td>${getAccessBadgesHTML(s.id)}</td>`;

      // Check if user has approved access for this student
      const hasAccess = (currentUserRole === 'user' || currentUserRole === 'member') && 
        accessRequestsCache.some(r => r.targetStudentId === s.id && r.status === 'approved');
      const accessBadge = hasAccess ? `<span style="font-size:12px; margin-left:6px;" title="Access Approved">🔓</span>` : '';

      // Both Admins and Core Members can click rows to view the modal
      const rowClick = isAdvanced ? `onclick="openViewModal('${s.id}')"` : '';
      return `
        <tr ${rowClick} style="${isAdvanced ? 'cursor:pointer' : ''}">
          <td><div class="student-cell">
            <div class="student-avatar" style="background:${getAvatarColor(s.fullName)}">${getInitials(s.fullName)}</div>
            <div><div class="student-name">${escHtml(s.fullName)}${accessBadge}</div><div class="student-id">${escHtml(s.studentId || '')}</div></div>
          </div></td>
          <td>${escHtml(s.email || '—')}</td>
          <td>${escHtml(s.course || '—')}</td>
          <td><span class="status-badge ${statusClass(s.status)}">${escHtml(s.status || 'Active')}</span></td>
          ${advancedCells}
        </tr>`;
    }).join('');
    listEl.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Student</th><th>Email</th><th>Course</th><th>Status</th>${advancedCols}</tr></thead>
          <tbody>${rows}</tbody>
        </table>${paginationHtml}
      </div>`;
  } else {
    const cards = paginated.map(s => {
      const adminActions = currentUserRole === 'admin' ? `
        <div class="card-actions">
          <button class="btn-icon edit"   onclick="event.stopPropagation();openEditModal('${s.id}')"   title="Edit"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
          <button class="btn-icon delete" onclick="event.stopPropagation();openDeleteModal('${s.id}','${escAttr(s.fullName)}')" title="Delete"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
        </div>` : '';
      const hasAccess = (currentUserRole === 'user' || currentUserRole === 'member') && 
        accessRequestsCache.some(r => r.targetStudentId === s.id && r.status === 'approved');
      const accessBadge = hasAccess ? `<span style="font-size:12px; margin-left:6px;" title="Access Approved">🔓</span>` : '';

      return `
        <div class="student-card" ${isAdvanced ? `onclick="openViewModal('${s.id}')"` : ''}>
          <div class="student-card-header">
            <div class="student-card-avatar" style="background:${getAvatarColor(s.fullName)}">${getInitials(s.fullName)}</div>
            <div class="student-card-info"><h4>${escHtml(s.fullName)}${accessBadge}</h4><p>${escHtml(s.email || '')}</p></div>
          </div>
          <div class="student-card-detail">
            <div class="student-card-row"><span>Course</span><span>${escHtml(s.course || '—')}</span></div>
            <div class="student-card-row"><span>Status</span><span class="status-badge ${statusClass(s.status)}">${escHtml(s.status || 'Active')}</span></div>
            ${isAdvanced ? `
            <div class="student-card-row"><span>Semester</span><span>${escHtml(s.semester || '—')}</span></div>
            <div class="student-card-row"><span>GPA</span><span>${s.gpa != null ? s.gpa + '/10' : '—'}</span></div>
            ` : `
            <div class="student-card-row"><span>Access</span><span>${getAccessBadgesHTML(s.id)}</span></div>
            `}
          </div>
          <div class="student-card-footer">
            ${adminActions}
          </div>
        </div>`;
    }).join('');
    listEl.innerHTML = `<div class="students-grid">${cards}</div>${paginationHtml}`;
  }
}

function setView(view) {
  currentView = view;
  document.getElementById('view-table')?.classList.toggle('active', view === 'table');
  document.getElementById('view-grid')?.classList.toggle('active', view === 'grid');
  renderStudentsList();
}
function handleSearch(val) { searchQuery = val; currentPageNum = 1; renderStudentsList(); }
function handleFilterCourse(val) { filterCourse = val; currentPageNum = 1; renderStudentsList(); }
function handleFilterStatus(val) { filterStatus = val; currentPageNum = 1; renderStudentsList(); }
function changePage(page) {
  currentPageNum = page;
  renderStudentsList();
  document.getElementById('students-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================
// FIRESTORE — STUDENTS CRUD
// ============================================================
async function fetchAllStudents() {
  const q = query(collection(db, 'students'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function generateStudentId(existing) {
  const year = new Date().getFullYear();
  const maxNum = existing.reduce((max, s) => {
    const m = s.studentId?.match(/STU-\d{4}-(\d+)/);
    return m ? Math.max(max, parseInt(m[1])) : max;
  }, 0);
  return `STU-${year}-${String(maxNum + 1).padStart(3, '0')}`;
}

async function handleStudentSubmit(e) {
  e.preventDefault();
  clearErrors();
  const data = {
    fullName: document.getElementById('s-name').value.trim(),
    email: document.getElementById('s-email').value.trim(),
    phone: document.getElementById('s-phone').value.trim(),
    dob: document.getElementById('s-dob').value,
    gender: document.getElementById('s-gender').value,
    course: document.getElementById('s-course').value,
    semester: document.getElementById('s-semester').value,
    gpa: parseFloat(document.getElementById('s-gpa').value) || null,
    enrollmentDate: document.getElementById('s-enrollment').value,
    status: document.getElementById('s-status').value || 'Active',
    address: document.getElementById('s-address').value.trim(),
  };
  if (!data.fullName || !data.email || !data.course) {
    showError('student-form-error', 'Name, Email and Course are required.');
    return;
  }
  const btn = document.getElementById('student-submit-btn');
  const label = document.getElementById('student-submit-label');
  const loader = document.getElementById('student-submit-loader');
  btn.disabled = true; label.style.opacity = '0.5'; loader.classList.remove('hidden');
  try {
    if (editingStudentId) {
      await updateDoc(doc(db, 'students', editingStudentId), {
        ...data, updatedAt: serverTimestamp(), updatedBy: currentUser.uid,
      });
      showToast('✅ Student updated successfully!', 'success');
    } else {
      const all = await fetchAllStudents();
      await addDoc(collection(db, 'students'), {
        ...data, studentId: generateStudentId(all),
        createdAt: serverTimestamp(), createdBy: currentUser.uid,
      });
      showToast('🎉 Student added successfully!', 'success');
    }
    closeStudentModal();
    if (currentPage === 'dashboard') renderDashboard();
    else if (currentPage === 'students') { studentsCache = await fetchAllStudents(); renderStudentsList(); }
    else if (currentPage === 'group-detail' && currentGroupId) openGroupDetail(currentGroupId);
  } catch (err) {
    console.error('Save error:', err);
    showError('student-form-error', 'Error saving student. Please try again.');
    btn.disabled = false; label.style.opacity = '1'; loader.classList.add('hidden');
  }
}

async function confirmDelete() {
  if (!deletingStudentId) return;
  const btn = document.getElementById('confirm-delete-btn');
  btn.disabled = true; btn.textContent = 'Deleting…';
  try {
    // 1. Remove from every group that contains this student
    if (!groupsCache.length) await fetchAllGroups();
    const groupUpdates = groupsCache
      .filter(g => (g.studentIds || []).includes(deletingStudentId))
      .map(g => updateDoc(doc(db, 'groups', g.id), { studentIds: arrayRemove(deletingStudentId) }));
    if (groupUpdates.length) await Promise.all(groupUpdates);

    // 2. Delete the student document
    await deleteDoc(doc(db, 'students', deletingStudentId));
    showToast('🗑️ Student removed.', 'info');
    closeDeleteModal();
    studentsCache = await fetchAllStudents();
    // Refresh local groupsCache counts too
    groupsCache.forEach(g => {
      g.studentIds = (g.studentIds || []).filter(id => id !== deletingStudentId);
    });
    if (currentPage === 'dashboard') renderDashboard();
    else renderStudentsList();
  } catch (err) {
    showToast('Error deleting student.', 'error');
    btn.disabled = false; btn.textContent = '🗑️ Delete Student';
  }
}

// ============================================================
// BODY SCROLL LOCK — prevents background shift when modal open
// ============================================================
function lockBodyScroll() {
  document.documentElement.style.overflow = 'hidden';
  document.documentElement.style.position = 'relative';
}
function unlockBodyScroll() {
  document.documentElement.style.overflow = '';
  document.documentElement.style.position = '';
}

// ============================================================
// MODALS — Add / Edit Student
// ============================================================
function openAddStudentModal() {
  editingStudentId = null;
  document.getElementById('modal-title').textContent = 'Add New Student';
  document.getElementById('student-submit-label').textContent = 'Save Student';
  document.getElementById('student-form').reset();
  clearErrors();
  document.getElementById('student-modal-overlay').classList.remove('hidden');
  lockBodyScroll();
}

function openEditModal(studentId) {
  const s = studentsCache.find(x => x.id === studentId);
  if (!s) { showToast('Student data not found.', 'error'); return; }
  editingStudentId = studentId;
  document.getElementById('modal-title').textContent = 'Edit Student';
  document.getElementById('student-submit-label').textContent = 'Update Student';
  document.getElementById('s-name').value = s.fullName || '';
  document.getElementById('s-email').value = s.email || '';
  document.getElementById('s-phone').value = s.phone || '';
  document.getElementById('s-dob').value = s.dob || '';
  document.getElementById('s-gender').value = s.gender || '';
  document.getElementById('s-course').value = s.course || '';
  document.getElementById('s-semester').value = s.semester || '';
  document.getElementById('s-gpa').value = s.gpa ?? '';
  document.getElementById('s-enrollment').value = s.enrollmentDate || '';
  document.getElementById('s-status').value = s.status || 'Active';
  document.getElementById('s-address').value = s.address || '';
  clearErrors();
  document.getElementById('student-modal-overlay').classList.remove('hidden');
  lockBodyScroll();
}

function closeStudentModal() {
  document.getElementById('student-modal-overlay').classList.add('hidden');
  unlockBodyScroll();
  editingStudentId = null;
  document.getElementById('student-form').reset();
  const btn = document.getElementById('student-submit-btn');
  const label = document.getElementById('student-submit-label');
  const loader = document.getElementById('student-submit-loader');
  if (btn) btn.disabled = false;
  if (label) label.style.opacity = '1';
  if (loader) loader.classList.add('hidden');
  clearErrors();
}

// ============================================================
// MODALS — View Student
// ============================================================
function openViewModal(studentId) {
  const s = studentsCache.find(x => x.id === studentId);
  if (s) { renderViewModal(s); return; }
  getDoc(doc(db, 'students', studentId))
    .then(d => {
      if (d.exists()) { const st = { id: d.id, ...d.data() }; studentsCache.push(st); renderViewModal(st); }
      else showToast('Student not found.', 'error');
    }).catch(() => showToast('Error loading student.', 'error'));
}

function renderViewModal(s) {
  let adminActions = '';
  if (currentUserRole === 'admin') {
    if (currentPage === 'group-detail' && currentGroupId) {
      // Inside a group — only allow removing from group, NOT global delete
      adminActions = `
        <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">
          <button class="btn-secondary" onclick="closeViewModal();openEditModal('${s.id}')">✏️ Edit Student</button>
          <button class="btn-danger"    onclick="closeViewModal();removeFromGroup('${currentGroupId}','${s.id}')">➖ Remove from Group</button>
        </div>`;
    } else {
      adminActions = `
        <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">
          <button class="btn-secondary" onclick="closeViewModal();openEditModal('${s.id}')">✏️ Edit Student</button>
          <button class="btn-danger"    onclick="closeViewModal();openDeleteModal('${s.id}','${escAttr(s.fullName)}')">🗑️ Delete Student</button>
        </div>`;
    }
  }
  // Handle Field Visibility based on Role and Requests
  const getFieldAccessHTML = (fieldName, fieldValue, labelText, maskText) => {
    let fieldHTML = `<div class="profile-detail-item"><label>${labelText}</label><span>${escHtml(fieldValue || 'Not provided')}</span></div>`;
    
    if (currentUserRole === 'user' || currentUserRole === 'member') {
      const existingReq = accessRequestsCache.find(r => r.targetStudentId === s.id && r.requestedField === fieldName);
      
      if (!fieldValue) {
        fieldHTML = `<div class="profile-detail-item"><label>${labelText}</label><span>Not provided</span></div>`;
      } else if (existingReq) {
        if (existingReq.status === 'approved') {
          fieldHTML = `<div class="profile-detail-item"><label>${labelText}</label><span class="locked-data" style="border-color:rgba(16,185,129,0.3);color:var(--text-primary);">🔓 ${escHtml(fieldValue)}</span></div>`;
        } else if (existingReq.status === 'pending') {
          fieldHTML = `<div class="profile-detail-item"><label>${labelText}</label><span>${maskText} <span class="status-badge pending" style="margin-left:6px;font-size:11px;">Pending...</span></span></div>`;
        } else { // Rejected
          fieldHTML = `
            <div class="profile-detail-item"><label>${labelText}</label>
            <span style="display:flex;align-items:center;gap:10px;">
              <span>${maskText} <span class="status-badge rejected" style="margin-left:6px;font-size:11px;">Rejected</span></span>
              <button id="req-${fieldName}-btn" class="btn-small" onclick="requestFieldAccess('${s.id}', '${escAttr(s.fullName)}', '${fieldName}')" style="padding: 3px 8px; font-size: 11px;">Re-Request</button>
            </span></div>`;
        }
      } else {
        // No request exists, show Request button
        fieldHTML = `
          <div class="profile-detail-item"><label>${labelText}</label>
          <span style="display:flex;align-items:center;gap:10px;">
            ${maskText} 
            <button id="req-${fieldName}-btn" class="btn-small" onclick="requestFieldAccess('${s.id}', '${escAttr(s.fullName)}', '${fieldName}')">Request Access</button>
          </span></div>`;
      }
    }
    return fieldHTML;
  };

  const phoneHTML = getFieldAccessHTML('phone', s.phone, 'Phone', s.phone ? s.phone.substring(0, 3) + '********' : '');
  const emailHTML = getFieldAccessHTML('email', s.email, 'Email', s.email ? s.email.substring(0, 3) + '***@***.com' : '');
  const addressHTML = getFieldAccessHTML('address', s.address, 'Address', '[Protected Address]');

  const isMember = currentUserRole === 'user' || currentUserRole === 'member';

  const detailsHTML = isMember ? `
    <div class="profile-details-grid">
      ${emailHTML}
      ${phoneHTML}
      ${addressHTML}
      <div class="profile-detail-item"><label>Course / Department</label><span>${escHtml(s.course || 'Not provided')}</span></div>
      <div class="profile-detail-item"><label>Status</label><span>${escHtml(s.status || 'Active')}</span></div>
    </div>` : `
    <div class="profile-details-grid">
      ${emailHTML}
      ${phoneHTML}
      <div class="profile-detail-item"><label>Date of Birth</label><span>${s.dob ? formatDate(s.dob) : 'Not provided'}</span></div>
      <div class="profile-detail-item"><label>Gender</label><span>${escHtml(s.gender || 'Not provided')}</span></div>
      <div class="profile-detail-item"><label>Course / Department</label><span>${escHtml(s.course || 'Not provided')}</span></div>
      <div class="profile-detail-item"><label>Semester</label><span>${escHtml(s.semester || 'Not provided')}</span></div>
      <div class="profile-detail-item"><label>GPA</label><span>${s.gpa != null ? s.gpa + ' / 10' : 'Not provided'}</span></div>
      <div class="profile-detail-item"><label>Enrollment Date</label><span>${s.enrollmentDate ? formatDate(s.enrollmentDate) : 'Not provided'}</span></div>
      <div class="profile-detail-item"><label>Status</label><span>${escHtml(s.status || 'Active')}</span></div>
      ${addressHTML}
    </div>${adminActions}`;

  document.getElementById('view-modal-body').innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar" style="background:${getAvatarColor(s.fullName)}">${getInitials(s.fullName)}</div>
      <div class="profile-title">
        <h3>${escHtml(s.fullName)}</h3><p>${escHtml(s.email || '')}</p>
        <span class="profile-id">${escHtml(s.studentId || '')}</span>
      </div>
      <div class="profile-badge-wrap"><span class="status-badge ${statusClass(s.status)}">${escHtml(s.status || 'Active')}</span></div>
    </div>
    ${detailsHTML}`;
  document.getElementById('view-modal-overlay').classList.remove('hidden');
  lockBodyScroll();
}

function closeViewModal() {
  document.getElementById('view-modal-overlay').classList.add('hidden');
  unlockBodyScroll();
}

// ============================================================
// MODALS — Delete Confirm
// ============================================================
function openDeleteModal(studentId, studentName) {
  deletingStudentId = studentId;
  document.getElementById('delete-student-name').textContent = studentName;
  const btn = document.getElementById('confirm-delete-btn');
  btn.disabled = false; btn.textContent = '🗑️ Delete Student';
  document.getElementById('delete-modal-overlay').classList.remove('hidden');
  lockBodyScroll();
}

function closeDeleteModal() {
  document.getElementById('delete-modal-overlay').classList.add('hidden');
  deletingStudentId = null;
  unlockBodyScroll();
}

['student-modal-overlay', 'view-modal-overlay', 'delete-modal-overlay', 'group-modal-overlay', 'add-members-modal-overlay', 'mail-modal-overlay'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', e => {
    if (e.target.id !== id) return;
    if (id === 'student-modal-overlay') closeStudentModal();
    if (id === 'view-modal-overlay') closeViewModal();
    if (id === 'delete-modal-overlay') closeDeleteModal();
    if (id === 'group-modal-overlay') closeGroupModal();
    if (id === 'add-members-modal-overlay') closeAddMembersModal();
    if (id === 'mail-modal-overlay') closeMailModal();
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeStudentModal(); closeViewModal(); closeDeleteModal();
    closeGroupModal(); closeAddMembersModal(); closeMailModal();
  }
});

// ============================================================
// SIDEBAR — mobile
// ============================================================
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebarMobile() {
  if (window.innerWidth <= 900) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
  }
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '📢'}</span> ${escHtml(message)}`;
  toast.addEventListener('click', () => toast.remove());
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 350);
  }, 4200);
}

// ============================================================
// TEMPLATE HELPERS
// ============================================================
function emptyStateHTML(title, subtitle) {
  return `<div class="empty-state">
    <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
    <h3>${escHtml(title)}</h3><p>${escHtml(subtitle)}</p>
  </div>`;
}

function courseOptions(selected) {
  return ['Computer Science', 'Information Technology', 'Electronics', 'Mechanical Engineering',
    'Civil Engineering', 'Business Administration', 'Mathematics', 'Physics', 'Chemistry', 'Biology']
    .map(c => `<option value="${c}" ${selected === c ? 'selected' : ''}>${c}</option>`).join('');
}

function statusOptions(selected) {
  return ['Active', 'Inactive', 'Alumni', 'Suspended']
    .map(s => `<option value="${s}" ${selected === s ? 'selected' : ''}>${s}</option>`).join('');
}

// ============================================================
// UTILITY HELPERS
// ============================================================
const AVATAR_COLORS = [
  'linear-gradient(135deg,#7c3aed,#4f46e5)', 'linear-gradient(135deg,#ec4899,#db2777)',
  'linear-gradient(135deg,#06b6d4,#0ea5e9)', 'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#f59e0b,#d97706)', 'linear-gradient(135deg,#ef4444,#dc2626)',
  'linear-gradient(135deg,#8b5cf6,#6d28d9)', 'linear-gradient(135deg,#14b8a6,#0d9488)',
];
function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let h = 0; for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}
function statusClass(status) { return (status || 'active').toLowerCase(); }
function escHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escAttr(str) {
  if (str == null) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ============================================================
// GROUPS — FIRESTORE CRUD
// ============================================================
async function fetchAllGroups() {
  const q = query(collection(db, 'groups'), orderBy('createdAt', 'desc'));
  // Always read from server so add/remove updates are reflected immediately
  const snap = await getDocsFromServer(q);
  groupsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return groupsCache;
}

function colorToGradient(hex) {
  const map = {
    '#7c3aed': 'linear-gradient(135deg,#7c3aed,#4f46e5)',
    '#ec4899': 'linear-gradient(135deg,#ec4899,#db2777)',
    '#06b6d4': 'linear-gradient(135deg,#06b6d4,#0ea5e9)',
    '#10b981': 'linear-gradient(135deg,#10b981,#059669)',
    '#f59e0b': 'linear-gradient(135deg,#f59e0b,#d97706)',
    '#ef4444': 'linear-gradient(135deg,#ef4444,#dc2626)',
  };
  return map[hex] || `linear-gradient(135deg,${hex},${hex})`;
}

// ============================================================
// GROUPS PAGE
// ============================================================
// In renderGroupsPage, also fetch students so counts are accurate
async function renderGroupsPage() {
  try {
    const [groups] = await Promise.all([
      fetchAllGroups(),
      studentsCache.length ? Promise.resolve() : fetchAllStudents().then(s => { studentsCache = s; }),
    ]);
    const existingIds = new Set(studentsCache.map(s => s.id));

    document.getElementById('page-content').innerHTML = `
      <div class="page-header">
        <h2>Groups &amp; Categories</h2>
        <div class="page-header-actions">
          <button class="btn-small primary" onclick="openCreateGroupModal()">+ Create Group</button>
        </div>
      </div>
      ${groups.length === 0
        ? `<div class="empty-state">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>
            <h3>No Groups Yet</h3>
            <p>Create your first group to start organizing students and sending bulk emails.</p>
            <button class="btn-small primary" onclick="openCreateGroupModal()" style="margin-top:16px">+ Create Group</button>
          </div>`
        : `<div class="groups-grid">${groups.map(g => groupCardHTML(g, existingIds)).join('')}</div>`}
    `;
  } catch (err) {
    console.error(err);
    document.getElementById('page-content').innerHTML =
      `<div class="empty-state"><p style="color:var(--error)">Error loading groups.</p></div>`;
  }
}

function groupCardHTML(g, existingIds) {
  // Only count student IDs that still exist in the database
  const validIds = existingIds
    ? (g.studentIds || []).filter(id => existingIds.has(id))
    : (g.studentIds || []);
  const count = validIds.length;
  return `
    <div class="group-card" onclick="openGroupDetail('${g.id}')">
      <div class="group-card-header">
        <div class="group-icon" style="background:${g.color || 'linear-gradient(135deg,#7c3aed,#4f46e5)'}">
          ${escHtml(g.emoji || '👥')}
        </div>
        <div>
          <div class="group-name">${escHtml(g.name)}</div>
          <div class="group-desc">${escHtml(g.description || 'No description')}</div>
        </div>
      </div>
      <div class="group-meta">
        <svg width="14" height="14" viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
        <span>${count} student${count !== 1 ? 's' : ''}</span>
      </div>
      <div class="group-card-actions">
        <button class="btn-small" onclick="event.stopPropagation();openGroupDetail('${g.id}')">👁️ View</button>
        <button class="btn-small primary" onclick="event.stopPropagation();openMailModal('${g.id}')" ${count === 0 ? 'disabled' : ''}>📧 Mail All</button>
        <button class="btn-icon delete" onclick="event.stopPropagation();deleteGroup('${g.id}','${escAttr(g.name)}')" title="Delete group">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    </div>`;
}

// ============================================================
// CREATE GROUP MODAL
// ============================================================
function openCreateGroupModal() {
  document.getElementById('group-modal-title').textContent = 'Create Group';
  document.getElementById('group-form').reset();
  // reset color selection to first
  const firstColor = document.querySelector('input[name="grp-color"]');
  if (firstColor) firstColor.checked = true;
  document.getElementById('group-modal-overlay').classList.remove('hidden');
}

function closeGroupModal() {
  document.getElementById('group-modal-overlay').classList.add('hidden');
  document.getElementById('group-form').reset();
}

async function handleGroupSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('grp-name').value.trim();
  const description = document.getElementById('grp-desc').value.trim();
  const emoji = document.getElementById('grp-emoji').value.trim() || '👥';
  const colorHex = document.querySelector('input[name="grp-color"]:checked')?.value || '#7c3aed';
  if (!name) return;

  const btn = document.getElementById('group-submit-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await addDoc(collection(db, 'groups'), {
      name, description, emoji,
      color: colorToGradient(colorHex),
      studentIds: [],
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid,
    });
    closeGroupModal();
    showToast('✅ Group created!', 'success');
    renderGroupsPage();
  } catch (err) {
    console.error(err);
    showToast('Error creating group.', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Create Group';
  }
}

async function deleteGroup(groupId, groupName) {
  if (!confirm(`Delete group "${groupName}"? Students won't be deleted.`)) return;
  try {
    await deleteDoc(doc(db, 'groups', groupId));
    groupsCache = groupsCache.filter(g => g.id !== groupId);
    showToast('🗑️ Group deleted.', 'info');
    renderGroupsPage();
  } catch (err) { showToast('Error deleting group.', 'error'); }
}

// ============================================================
// GROUP DETAIL PAGE
// ============================================================
async function openGroupDetail(groupId) {
  currentGroupId = groupId;
  currentPage = 'group-detail';
  document.getElementById('page-title').textContent = 'Group Detail';
  document.getElementById('page-content').innerHTML =
    '<div class="loading-overlay"><div class="spinner"></div></div>';

  try {
    const gSnap = await getDoc(doc(db, 'groups', groupId));
    if (!gSnap.exists()) { showToast('Group not found.', 'error'); return; }
    const group = { id: gSnap.id, ...gSnap.data() };
    const studentIds = group.studentIds || [];

    // Sync groups cache
    const idx = groupsCache.findIndex(g => g.id === groupId);
    if (idx >= 0) groupsCache[idx] = group; else groupsCache.push(group);

    // Always refresh so newly added students appear immediately
    studentsCache = await fetchAllStudents();
    const groupStudents = studentsCache.filter(s => studentIds.includes(s.id));

    document.getElementById('page-title').textContent = group.name;
    document.getElementById('page-content').innerHTML = `
      <div class="page-header">
        <div style="display:flex;align-items:center;gap:12px">
          <button class="btn-icon" onclick="navigateTo('groups')" title="Back to Groups">
            <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <div class="group-icon-sm" style="background:${group.color || 'linear-gradient(135deg,#7c3aed,#4f46e5)'}">
            ${escHtml(group.emoji || '👥')}
          </div>
          <div>
            <h2 style="margin:0">${escHtml(group.name)}</h2>
            <p style="margin:0;font-size:.85rem;color:var(--text-muted)">${escHtml(group.description || '')}</p>
          </div>
        </div>
        <div class="page-header-actions">
          <button class="btn-small" onclick="openAddMembersModal('${group.id}')">+ Add Students</button>
          <button class="btn-small primary" onclick="openMailModal('${group.id}')"
            ${groupStudents.length === 0 ? 'disabled title="No students in group"' : ''}>
            📧 Mail All
          </button>
        </div>
      </div>
      <div class="section-header"><h3>Members (${groupStudents.length})</h3></div>
      <div class="table-wrapper">
        ${groupStudents.length === 0
        ? emptyStateHTML('No students yet', 'Click "+ Add Students" to add members to this group.')
        : `<table>
              <thead><tr><th>Student</th><th>Email</th><th>Course</th><th>Status</th><th>Remove</th></tr></thead>
              <tbody>
                ${groupStudents.map(s => `
                  <tr onclick="openViewModal('${s.id}')">
                    <td><div class="student-cell">
                      <div class="student-avatar" style="background:${getAvatarColor(s.fullName)}">${getInitials(s.fullName)}</div>
                      <div><div class="student-name">${escHtml(s.fullName)}</div><div class="student-id">${escHtml(s.studentId || '')}</div></div>
                    </div></td>
                    <td>${escHtml(s.email || '—')}</td>
                    <td>${escHtml(s.course || '—')}</td>
                    <td><span class="status-badge ${statusClass(s.status)}">${escHtml(s.status || 'Active')}</span></td>
                    <td>
                      <button class="btn-icon delete" onclick="event.stopPropagation();removeFromGroup('${group.id}','${s.id}')" title="Remove from group">
                        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                      </button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>`}
      </div>`;
  } catch (err) {
    console.error(err);
    showToast('Error loading group.', 'error');
  }
}

// ============================================================
// ADD MEMBERS MODAL
// ============================================================
function openAddMembersModal(groupId) {
  addMembersGrpId = groupId;
  const group = groupsCache.find(g => g.id === groupId);
  const alreadyIn = new Set(group?.studentIds || []);
  const populate = () => {
    const available = studentsCache.filter(s => !alreadyIn.has(s.id));
    document.getElementById('add-members-list').innerHTML = available.length === 0
      ? `<p style="color:var(--text-muted);text-align:center;padding:24px">All students are already in this group.</p>`
      : available.map(s => `
          <label class="member-check-item">
            <input type="checkbox" name="member-check" value="${s.id}" />
            <div class="student-avatar sm" style="background:${getAvatarColor(s.fullName)}">${getInitials(s.fullName)}</div>
            <div>
              <div class="student-name">${escHtml(s.fullName)}</div>
              <div class="student-id">${escHtml(s.email || s.course || '')}</div>
            </div>
          </label>`).join('');
    document.getElementById('add-members-modal-overlay').classList.remove('hidden');
  };
  if (!studentsCache.length) fetchAllStudents().then(s => { studentsCache = s; populate(); });
  else populate();
}

function closeAddMembersModal() {
  document.getElementById('add-members-modal-overlay').classList.add('hidden');
  addMembersGrpId = null;
}

function filterMembersList(q) {
  document.querySelectorAll('.member-check-item').forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}

async function handleAddMembers() {
  const checked = [...document.querySelectorAll('input[name="member-check"]:checked')];
  if (!checked.length) { showToast('Select at least one student.', 'info'); return; }
  const ids = checked.map(cb => cb.value);
  const btn = document.getElementById('add-members-btn');
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    await updateDoc(doc(db, 'groups', addMembersGrpId), { studentIds: arrayUnion(...ids) });
    const g = groupsCache.find(g => g.id === addMembersGrpId);
    if (g) g.studentIds = [...new Set([...(g.studentIds || []), ...ids])];
    const savedGrpId = addMembersGrpId;   // save BEFORE close nullifies it
    showToast(`✅ ${ids.length} student${ids.length > 1 ? 's' : ''} added!`, 'success');
    closeAddMembersModal();
    openGroupDetail(savedGrpId);
  } catch (err) {
    showToast('Error adding students.', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Add Selected';
  }
}

async function removeFromGroup(groupId, studentId) {
  try {
    await updateDoc(doc(db, 'groups', groupId), { studentIds: arrayRemove(studentId) });
    const g = groupsCache.find(g => g.id === groupId);
    if (g) g.studentIds = (g.studentIds || []).filter(id => id !== studentId);
    showToast('Student removed from group.', 'info');
    openGroupDetail(groupId);
  } catch (err) { showToast('Error removing student.', 'error'); }
}

// ============================================================
// MAIL MODAL — EmailJS
// ============================================================
function openMailModal(groupId) {
  mailGroupId = groupId;
  const group = groupsCache.find(g => g.id === groupId);
  if (!group) { showToast('Group not found.', 'error'); return; }
  const studentIds = group.studentIds || [];
  const groupStudents = studentsCache.filter(s => studentIds.includes(s.id));
  const withEmail = groupStudents.filter(s => s.email);

  document.getElementById('mail-group-name').textContent = group.name;
  document.getElementById('mail-recipient-count').textContent =
    `${withEmail.length} recipient${withEmail.length !== 1 ? 's' : ''} with email`;
  document.getElementById('mail-recipients').innerHTML = withEmail.length === 0
    ? `<span style="color:var(--text-muted)">No students with email addresses in this group.</span>`
    : withEmail.map(s => `<span class="recipient-chip">${escHtml(s.fullName)}</span>`).join('');
  document.getElementById('mail-form').reset();
  document.getElementById('mail-progress').classList.add('hidden');
  document.getElementById('mail-progress-bar').style.width = '0%';
  document.getElementById('mail-send-btn').disabled = false;
  document.getElementById('mail-send-btn').textContent = '📧 Send Emails';
  document.getElementById('mail-modal-overlay').classList.remove('hidden');
}

function closeMailModal() {
  document.getElementById('mail-modal-overlay').classList.add('hidden');
  mailGroupId = null;
}

async function handleSendMail(e) {
  e.preventDefault();
  const subject = document.getElementById('mail-subject').value.trim();
  const message = document.getElementById('mail-message').value.trim();
  const group = groupsCache.find(g => g.id === mailGroupId);
  if (!group) return;

  const groupStudents = studentsCache.filter(s => (group.studentIds || []).includes(s.id));
  const withEmail = groupStudents.filter(s => s.email);
  if (!withEmail.length) { showToast('No students with email addresses.', 'error'); return; }

  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey ||
    serviceId === 'your_service_id') {
    showToast('⚠️ EmailJS not configured yet. Check .env file.', 'error');
    return;
  }

  const btn = document.getElementById('mail-send-btn');
  const progressEl = document.getElementById('mail-progress');
  const progressBar = document.getElementById('mail-progress-bar');
  const progressText = document.getElementById('mail-progress-text');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  progressEl.classList.remove('hidden');

  let sent = 0, failed = 0;
  for (const student of withEmail) {
    try {
      await emailjs.send(serviceId, templateId, {
        to_email: student.email,
        to_name: student.fullName,
        subject,
        message: message.replace(/\{\{name\}\}/gi, student.fullName),
        from_name: 'IndraDatabase',
      });
      sent++;
    } catch (err) {
      console.error(`Failed: ${student.email}`, err);
      failed++;
    }
    const pct = Math.round(((sent + failed) / withEmail.length) * 100);
    progressBar.style.width = pct + '%';
    progressText.textContent = `Sent ${sent + failed} of ${withEmail.length}…`;
    await new Promise(r => setTimeout(r, 250));
  }

  btn.disabled = false;
  btn.textContent = '📧 Send Emails';
  if (failed === 0) {
    showToast(`✅ ${sent} email${sent > 1 ? 's' : ''} sent!`, 'success');
    closeMailModal();
  } else {
    progressText.textContent = `Done: ${sent} sent, ${failed} failed. Check console.`;
    showToast(`⚠️ ${sent} sent, ${failed} failed.`, 'info');
  }
}

// ============================================================
// ADMIN CONTROL PAGE
// ============================================================
async function renderAdminControlPage() {
  document.getElementById('page-content').innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    const snap = await getDocs(collection(db, 'users'));
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Convert old 'user' role to 'member' for display
    const rows = users.map(u => {
      const displayRole = u.role === 'admin' ? 'admin' : (u.role === 'core_member' ? 'core_member' : 'member');
      const isMe = u.id === currentUser.uid;
      const selectHtml = isMe ? `<span class="status-badge approved">Admin (You)</span>` : `
        <select class="admin-role-select" onchange="updateUserRole('${u.id}', this.value)">
          <option value="user" ${displayRole === 'member' ? 'selected' : ''}>Member</option>
          <option value="core_member" ${displayRole === 'core_member' ? 'selected' : ''}>Core Member</option>
          <option value="admin" ${displayRole === 'admin' ? 'selected' : ''}>Admin</option>
        </select>`;

      return `
        <tr>
          <td><div class="student-cell">
            <div class="student-avatar sm" style="background:${getAvatarColor(u.name)}">${getInitials(u.name)}</div>
            <div style="font-weight:500;">${escHtml(u.name || 'Unknown')}</div>
          </div></td>
          <td>${escHtml(u.email)}</td>
          <td>${selectHtml}</td>
        </tr>`;
    }).join('');

    document.getElementById('page-content').innerHTML = `
      <div class="page-header"><h2>Admin Control — Manage Roles</h2></div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>User</th><th>Email</th><th>Role Access</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch (err) {
    console.error('Error fetching users:', err);
    document.getElementById('page-content').innerHTML = `<div class="empty-state"><p style="color:var(--error)">Failed to load users.</p></div>`;
  }
}

async function updateUserRole(uid, newRole) {
  try {
    await updateDoc(doc(db, 'users', uid), { role: newRole });
    showToast('Role updated successfully.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to update role.', 'error');
  }
}

// ============================================================
// USER REQUESTS PAGE (Field Access Visibility)
// ============================================================
async function renderUserRequestsPage() {
  document.getElementById('page-content').innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    const q = query(collection(db, 'accessRequests'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const requests = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.status !== 'rejected');

    if (requests.length === 0) {
      document.getElementById('page-content').innerHTML = `
        <div class="page-header"><h2>User Requests</h2></div>
        <div class="empty-state"><h3>No Requests</h3><p>There are no pending or approved field access requests.</p></div>`;
      return;
    }

    // Group by Target Student and then by Requester
    const grouped = {};
    requests.forEach(r => {
      const key = `${r.targetStudentId}_${r.requesterUid}`;
      if (!grouped[key]) {
        grouped[key] = {
          targetName: r.targetStudentName,
          requesterName: r.requesterName,
          reqs: []
        };
      }
      grouped[key].reqs.push(r);
    });

    const rowsHTML = Object.values(grouped).map(group => {
      const fieldRows = group.reqs.map(r => {
        let actions = '';
        if (r.status === 'pending') {
          actions = `
            <button class="btn-small primary" onclick="updateAccessRequestStatus('${r.id}', 'approved')" style="padding:4px 8px;font-size:12px;">Approve</button>
            <button class="btn-small" onclick="updateAccessRequestStatus('${r.id}', 'rejected')" style="padding:4px 8px;font-size:12px;background:rgba(239,68,68,0.2);color:#f87171;">Reject</button>`;
        } else if (r.status === 'approved') {
          actions = `<button class="btn-small" onclick="updateAccessRequestStatus('${r.id}', 'revoked')" style="padding:4px 8px;font-size:12px;opacity:0.7;">Revoke</button>`;
        }

        return `
          <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom: 1px dotted rgba(255,255,255,0.1);">
            <div style="flex:1;">
              <span style="font-weight:600; text-transform:capitalize;">${r.requestedField}</span>
              <span class="status-badge ${r.status}" style="margin-left:8px;">${r.status}</span>
            </div>
            <div style="display:flex;gap:6px;">${actions}</div>
          </div>
        `;
      }).join('');

      return `
        <div class="student-card" style="margin-bottom:16px;">
          <div class="student-card-header" style="border-bottom: 1px solid var(--glass-border); padding-bottom: 12px; margin-bottom: 12px;">
            <div class="student-card-info">
              <h4 style="color:var(--text-secondary); font-size:13px; font-weight:normal; margin-bottom:4px;">Requested By: <span style="color:var(--text-primary);font-weight:600;">${escHtml(group.requesterName)}</span></h4>
              <h4 style="color:var(--text-secondary); font-size:13px; font-weight:normal;">Target Student: <span style="color:var(--text-primary);font-weight:600;">${escHtml(group.targetName)}</span></h4>
            </div>
          </div>
          <div>
            ${fieldRows}
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('page-content').innerHTML = `
      <div class="page-header"><h2>User Requests — Access Controls</h2></div>
      <div class="groups-grid">
        ${rowsHTML}
      </div>`;
  } catch (err) {
    console.error('Error fetching requests:', err);
    document.getElementById('page-content').innerHTML = `<div class="empty-state"><p style="color:var(--error)">Failed to load requests.</p></div>`;
  }
}

async function updateAccessRequestStatus(reqId, newStatus) {
  try {
    if (newStatus === 'revoked') {
      await deleteDoc(doc(db, 'accessRequests', reqId));
      showToast('Access revoked and request deleted.', 'info');
    } else {
      await updateDoc(doc(db, 'accessRequests', reqId), { status: newStatus });
      showToast(`Request marked as ${newStatus}.`, 'success');
    }
    renderUserRequestsPage();
  } catch (err) {
    console.error(err);
    showToast('Failed to update request.', 'error');
  }
}

async function requestFieldAccess(studentId, studentName, fieldName) {
  try {
    const btn = document.getElementById(`req-${fieldName}-btn`);
    if (btn) btn.disabled = true;
    
    // Check if there is an existing rejected request
    const existingIndex = accessRequestsCache.findIndex(r => r.targetStudentId === studentId && r.requestedField === fieldName && r.requesterUid === currentUser.uid);
    
    if (existingIndex > -1) {
      const existingDocId = accessRequestsCache[existingIndex].id;
      await updateDoc(doc(db, 'accessRequests', existingDocId), { status: 'pending', createdAt: serverTimestamp() });
      accessRequestsCache[existingIndex].status = 'pending';
    } else {
      const newReq = {
        requesterUid: currentUser.uid,
        requesterName: currentUserName,
        targetStudentId: studentId,
        targetStudentName: studentName,
        requestedField: fieldName,
        status: 'pending',
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, 'accessRequests'), newReq);
      accessRequestsCache.push({ id: docRef.id, ...newReq });
    }
    
    showToast(`${fieldName} access requested.`, 'success');
    closeViewModal();
  } catch (err) {
    console.error('Request failed:', err);
    showToast('Failed to submit request.', 'error');
  }
}

// ============================================================
// EXPOSE TO GLOBAL SCOPE
// ============================================================
Object.assign(window, {
  // Auth
  switchTab, handleLogin, handleRegister, handleLogout,
  // Navigation
  navigateTo, toggleSidebar,
  // Students list
  setView, handleSearch, handleFilterCourse, handleFilterStatus, changePage,
  // Student modals
  openAddStudentModal, openEditModal, closeStudentModal, handleStudentSubmit,
  openViewModal, closeViewModal,
  openDeleteModal, closeDeleteModal, confirmDelete,
  // Groups
  openCreateGroupModal, closeGroupModal, handleGroupSubmit, deleteGroup,
  openGroupDetail,
  openAddMembersModal, closeAddMembersModal, filterMembersList, handleAddMembers,
  removeFromGroup,
  // Mail
  openMailModal, closeMailModal, handleSendMail,
  // Admin & RBAC
  updateUserRole, updateAccessRequestStatus, requestFieldAccess,
});
