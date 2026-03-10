/**
 * src/admin.js
 *
 * Admin panel entry point — loaded by admin.html.
 *
 * Responsibilities:
 *  - Simple password gate (hashed against an env var, no Supabase auth for MVP)
 *  - Tab switching (Submissions | Spots | Schedule)
 *  - Submissions tab: list pending spot-suggestion submissions, approve/reject
 *  - Spots tab: list all spots with edit (modal) + deactivate actions
 *  - Schedule tab: CSV upload for schedule_entries + raw table view
 *
 * All Supabase calls use the same supabaseClient singleton as the student app.
 * The admin key is NOT embedded here — service-role operations go through
 * Supabase Edge Functions. The anon client is sufficient for reads; writes are
 * protected by RLS policies that check a custom `is_admin` claim (set via
 * the password-gate session token in Phase 2). For Phase 1 scaffold, the
 * password gate uses a plain env-var comparison for simplicity.
 */

import './styles/main.css';
import './styles/admin.css';

import { supabase }  from './api/supabaseClient.js';
import { showToast } from './ui/toast.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Env var injected by Vite. Must match exactly to pass the gate. */
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD ?? '';

/** sessionStorage key — keeps the admin logged in for the browser session. */
const SESSION_KEY = 'perch_admin_authed';

// ─── DOM refs ────────────────────────────────────────────────────────────────

const $gate      = document.getElementById('admin-gate');
const $app       = document.getElementById('admin-app');
const $pwInput   = document.getElementById('admin-password');
const $loginBtn  = document.getElementById('admin-login-btn');
const $loginErr  = document.getElementById('admin-login-error');
const $logoutBtn = document.getElementById('admin-logout');
const $badge     = document.getElementById('submissions-badge');

// ─── Auth gate ───────────────────────────────────────────────────────────────

function showGate()   { $gate.hidden = false; $app.hidden = true;  }
function showApp()    { $gate.hidden = true;  $app.hidden = false; }

function checkPassword() {
  const entered = $pwInput.value.trim();
  if (!ADMIN_PASSWORD) {
    // Env var not set — block access with a clear message in dev
    $loginErr.textContent = 'VITE_ADMIN_PASSWORD is not set in .env';
    $loginErr.hidden = false;
    return;
  }

  if (entered === ADMIN_PASSWORD) {
    sessionStorage.setItem(SESSION_KEY, '1');
    $loginErr.hidden = true;
    $pwInput.value = '';
    onAuthSuccess();
  } else {
    $loginErr.hidden = false;
    $pwInput.select();
  }
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  showGate();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function boot() {
  // Persist login for the browser session
  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    onAuthSuccess();
  } else {
    showGate();
  }

  // Password gate events
  $loginBtn.addEventListener('click', checkPassword);
  $pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkPassword(); });
  $logoutBtn.addEventListener('click', logout);
}

async function onAuthSuccess() {
  showApp();
  initTabs();
  await Promise.all([
    loadSubmissions(),
    loadSpots(),
  ]);
}

// ─── Tab switching ───────────────────────────────────────────────────────────

const TABS = ['submissions', 'spots', 'schedule'];

function initTabs() {
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      activateTab(target);
      if (target === 'schedule') loadSchedule();
    });
  });
}

function activateTab(name) {
  TABS.forEach(tab => {
    const btn   = document.querySelector(`.admin-tab[data-tab="${tab}"]`);
    const panel = document.getElementById(`tab-${tab}`);
    const active = tab === name;

    btn?.classList.toggle('active', active);
    btn?.setAttribute('aria-selected', String(active));
    if (panel) panel.hidden = !active;
  });
}

// ─── Submissions tab ─────────────────────────────────────────────────────────

async function loadSubmissions() {
  const panel = document.getElementById('tab-submissions');
  panel.innerHTML = '<p class="admin-empty__subtitle">Loading…</p>';

  const { data: rows, error } = await supabase
    .from('spot_submissions')
    .select('id, spot_name, description, submitted_by, created_at, status')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    panel.innerHTML = `<p class="admin-empty__subtitle" style="color:var(--color-full)">Error: ${error.message}</p>`;
    return;
  }

  // Update badge count
  if ($badge) $badge.textContent = String(rows?.length ?? 0);

  if (!rows || rows.length === 0) {
    panel.innerHTML = _emptyState('No pending submissions', 'All caught up! New suggestions will appear here.');
    return;
  }

  panel.innerHTML = rows.map(row => _submissionCard(row)).join('');

  // Wire approve / reject buttons
  panel.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { id, action } = btn.dataset;
      handleSubmissionAction(id, action, btn.closest('.submission-card'));
    });
  });
}

function _submissionCard(row) {
  const date = new Date(row.created_at).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  return /* html */ `
    <div class="submission-card" id="sub-${row.id}">
      <div class="submission-card__header">
        <div>
          <div class="submission-card__spot-name">${_esc(row.spot_name)}</div>
          <div class="submission-card__meta">Submitted ${date}</div>
        </div>
        <span class="pill pill--pending">Pending</span>
      </div>
      <p class="submission-card__description">${_esc(row.description ?? '—')}</p>
      <div class="submission-card__actions">
        <button class="btn btn-primary" data-action="approve" data-id="${row.id}">Approve</button>
        <button class="btn btn-danger"  data-action="reject"  data-id="${row.id}">Reject</button>
      </div>
    </div>
  `;
}

async function handleSubmissionAction(id, action, cardEl) {
  const status = action === 'approve' ? 'approved' : 'rejected';

  const { error } = await supabase
    .from('spot_submissions')
    .update({ status })
    .eq('id', id);

  if (error) {
    showToast(`Failed to ${action} submission: ${error.message}`, 'error');
    return;
  }

  showToast(`Submission ${status}.`, action === 'approve' ? 'success' : 'info');

  // Animate card out
  cardEl.style.transition = 'opacity 0.3s ease, height 0.3s ease';
  cardEl.style.overflow    = 'hidden';
  cardEl.style.opacity     = '0';
  cardEl.style.height      = cardEl.offsetHeight + 'px';
  setTimeout(() => { cardEl.style.height = '0'; cardEl.style.marginBottom = '0'; }, 50);
  setTimeout(() => cardEl.remove(), 350);

  // Decrement badge
  const current = parseInt($badge?.textContent ?? '0', 10);
  if ($badge) $badge.textContent = String(Math.max(0, current - 1));
}

// ─── Spots tab ───────────────────────────────────────────────────────────────

let _spots = [];

async function loadSpots() {
  const panel = document.getElementById('tab-spots');
  panel.innerHTML = '<p class="admin-empty__subtitle">Loading…</p>';

  const { data: rows, error } = await supabase
    .from('spots')
    .select('id, name, type, on_campus, building, rough_capacity, is_active')
    .order('name');

  if (error) {
    panel.innerHTML = `<p class="admin-empty__subtitle" style="color:var(--color-full)">Error: ${error.message}</p>`;
    return;
  }

  _spots = rows ?? [];

  if (_spots.length === 0) {
    panel.innerHTML = _emptyState('No spots yet', 'Add spots via the form below.');
    return;
  }

  panel.innerHTML = /* html */ `
    <div class="admin-section-header">
      <div>
        <div class="admin-section-title">All Spots</div>
        <div class="admin-section-subtitle">${_spots.length} total</div>
      </div>
      <button class="btn btn-primary" id="add-spot-btn">+ Add Spot</button>
    </div>
    <div class="admin-table-wrapper">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Location</th>
            <th>Capacity</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="spots-tbody">
          ${_spots.map(s => _spotRow(s)).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('add-spot-btn')?.addEventListener('click', () => openSpotModal(null));

  panel.querySelectorAll('[data-spot-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { spotId, spotAction } = btn.dataset;
      if (spotAction === 'edit')       openSpotModal(spotId);
      if (spotAction === 'deactivate') deactivateSpot(spotId);
      if (spotAction === 'activate')   activateSpot(spotId);
    });
  });
}

function _spotRow(s) {
  const location = s.on_campus ? (s.building ?? 'On-campus') : 'Off-campus';
  const activeClass = s.is_active ? 'pill--free' : 'pill--full';
  const activeLabel = s.is_active ? 'Active' : 'Inactive';
  const toggleAction  = s.is_active ? 'deactivate' : 'activate';
  const toggleLabel   = s.is_active ? 'Deactivate' : 'Activate';
  const toggleClass   = s.is_active ? 'btn-danger' : 'btn-secondary';

  return /* html */ `
    <tr id="spot-row-${s.id}">
      <td class="cell-truncate"><strong>${_esc(s.name)}</strong></td>
      <td>${_esc(s.type ?? '—')}</td>
      <td>${_esc(location)}</td>
      <td>${s.rough_capacity ?? '—'}</td>
      <td><span class="pill ${activeClass}">${activeLabel}</span></td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost" data-spot-action="edit" data-spot-id="${s.id}">Edit</button>
          <button class="btn ${toggleClass}" data-spot-action="${toggleAction}" data-spot-id="${s.id}">${toggleLabel}</button>
        </div>
      </td>
    </tr>
  `;
}

async function deactivateSpot(id) {
  const { error } = await supabase.from('spots').update({ is_active: false }).eq('id', id);
  if (error) { showToast('Failed to deactivate: ' + error.message, 'error'); return; }
  showToast('Spot deactivated.', 'info');
  await loadSpots();
}

async function activateSpot(id) {
  const { error } = await supabase.from('spots').update({ is_active: true }).eq('id', id);
  if (error) { showToast('Failed to activate: ' + error.message, 'error'); return; }
  showToast('Spot activated.', 'success');
  await loadSpots();
}

// ─── Spot modal (Add / Edit) ─────────────────────────────────────────────────

function openSpotModal(spotId) {
  const spot = spotId ? _spots.find(s => s.id === spotId) : null;
  const title = spot ? 'Edit Spot' : 'Add New Spot';

  const body = /* html */ `
    <form id="spot-form" class="admin-spot-form" autocomplete="off">
      <div class="admin-form-row">
        <div class="admin-form-group">
          <label class="admin-form-label" for="sf-name">Name *</label>
          <input id="sf-name" class="input" type="text" required value="${_esc(spot?.name ?? '')}" placeholder="e.g. USJ-R Library 2F" />
        </div>
        <div class="admin-form-group">
          <label class="admin-form-label" for="sf-type">Type</label>
          <input id="sf-type" class="input" type="text" value="${_esc(spot?.type ?? '')}" placeholder="e.g. Library, Corridor" />
        </div>
      </div>
      <div class="admin-form-row">
        <div class="admin-form-group">
          <label class="admin-form-label" for="sf-building">Building</label>
          <input id="sf-building" class="input" type="text" value="${_esc(spot?.building ?? '')}" placeholder="Main Building" />
        </div>
        <div class="admin-form-group">
          <label class="admin-form-label" for="sf-capacity">Rough Capacity</label>
          <input id="sf-capacity" class="input" type="number" min="1" value="${spot?.rough_capacity ?? ''}" placeholder="30" />
        </div>
      </div>
      <div class="admin-form-group">
        <label class="admin-form-label">
          <input type="checkbox" id="sf-oncampus" ${spot?.on_campus ? 'checked' : ''} />
          On-campus
        </label>
      </div>
      <p id="spot-form-error" style="color:var(--color-full);font-size:0.8125rem;display:none"></p>
    </form>
  `;

  // Reuse the existing modal from the student app if modal.js is available;
  // otherwise build a lightweight inline modal for the admin context.
  _showAdminModal({ title, body, confirmLabel: spot ? 'Save Changes' : 'Add Spot', onConfirm: () => saveSpot(spot?.id) });
}

function _showAdminModal({ title, body, confirmLabel, onConfirm }) {
  // Remove any existing modal
  document.getElementById('admin-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'admin-modal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:200;
    display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.4);padding:var(--space-4);
  `;
  modal.innerHTML = /* html */ `
    <div style="
      background:var(--color-surface);
      border-radius:var(--radius-xl);
      box-shadow:var(--shadow-lg);
      padding:var(--space-6);
      width:100%;max-width:480px;
    ">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:var(--space-5)">${_esc(title)}</h2>
      <div id="admin-modal-body">${body}</div>
      <div style="display:flex;gap:var(--space-2);justify-content:flex-end;margin-top:var(--space-5)">
        <button class="btn btn-ghost" id="admin-modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="admin-modal-confirm">${_esc(confirmLabel)}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('#admin-modal-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#admin-modal-confirm').addEventListener('click', onConfirm);
  modal.querySelector('input')?.focus();
}

async function saveSpot(existingId) {
  const name      = document.getElementById('sf-name')?.value.trim();
  const type      = document.getElementById('sf-type')?.value.trim();
  const building  = document.getElementById('sf-building')?.value.trim();
  const capacity  = parseInt(document.getElementById('sf-capacity')?.value ?? '', 10);
  const onCampus  = document.getElementById('sf-oncampus')?.checked ?? false;
  const errEl     = document.getElementById('spot-form-error');

  if (!name) {
    errEl.textContent = 'Name is required.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';

  const payload = {
    name,
    type:           type || null,
    building:       building || null,
    rough_capacity: isNaN(capacity) ? null : capacity,
    on_campus:      onCampus,
  };

  let error;
  if (existingId) {
    ({ error } = await supabase.from('spots').update(payload).eq('id', existingId));
  } else {
    ({ error } = await supabase.from('spots').insert({ ...payload, is_active: true }));
  }

  if (error) {
    errEl.textContent = 'Save failed: ' + error.message;
    errEl.style.display = 'block';
    return;
  }

  document.getElementById('admin-modal')?.remove();
  showToast(existingId ? 'Spot updated.' : 'Spot added.', 'success');
  await loadSpots();
}

// ─── Schedule tab ─────────────────────────────────────────────────────────────

async function loadSchedule() {
  const panel = document.getElementById('tab-schedule');

  panel.innerHTML = /* html */ `
    <div class="admin-section-header">
      <div>
        <div class="admin-section-title">Schedule Entries</div>
        <div class="admin-section-subtitle">Upload a CSV to replace all entries for a spot</div>
      </div>
    </div>

    <div style="
      background:var(--color-surface);
      border:1px solid var(--color-border);
      border-radius:var(--radius-lg);
      padding:var(--space-5);
      margin-bottom:var(--space-5);
    ">
      <p style="font-size:0.875rem;color:var(--color-text-secondary);margin-bottom:var(--space-3)">
        Expected CSV columns: <code>spot_id, subject_code, section, day_of_week (0=Sun), start_time (HH:MM), end_time (HH:MM)</code>
      </p>
      <div style="display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap">
        <input type="file" id="schedule-csv" accept=".csv" class="input" style="max-width:300px" />
        <button class="btn btn-primary" id="schedule-upload-btn">Upload</button>
        <span id="schedule-upload-status" style="font-size:0.8125rem;color:var(--color-text-muted)"></span>
      </div>
    </div>

    <div id="schedule-preview"></div>
  `;

  document.getElementById('schedule-upload-btn').addEventListener('click', uploadScheduleCsv);
  await renderSchedulePreview();
}

async function renderSchedulePreview() {
  const container = document.getElementById('schedule-preview');
  if (!container) return;

  const { data: rows, error } = await supabase
    .from('schedule_entries')
    .select('id, spot_id, subject_code, section, day_of_week, start_time, end_time')
    .order('day_of_week')
    .order('start_time')
    .limit(200);

  if (error || !rows?.length) {
    container.innerHTML = _emptyState('No schedule entries', 'Upload a CSV to add schedule data.');
    return;
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  container.innerHTML = /* html */ `
    <div class="admin-table-wrapper">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Time</th>
            <th>Subject</th>
            <th>Section</th>
            <th>Spot ID</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => /* html */ `
            <tr>
              <td>${days[r.day_of_week] ?? r.day_of_week}</td>
              <td>${r.start_time} – ${r.end_time}</td>
              <td>${_esc(r.subject_code ?? '—')}</td>
              <td>${_esc(r.section ?? '—')}</td>
              <td class="cell-truncate" style="font-family:monospace;font-size:0.75rem">${_esc(r.spot_id)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function uploadScheduleCsv() {
  const fileInput  = document.getElementById('schedule-csv');
  const statusEl   = document.getElementById('schedule-upload-status');
  const file       = fileInput?.files?.[0];

  if (!file) {
    statusEl.textContent = 'Select a CSV file first.';
    return;
  }

  statusEl.textContent = 'Parsing…';

  try {
    const text = await file.text();
    const rows = _parseCsv(text);

    if (!rows.length) {
      statusEl.textContent = 'CSV is empty or invalid.';
      return;
    }

    statusEl.textContent = `Uploading ${rows.length} entries…`;

    // Upsert in one shot (Supabase truncates + reinserts if using RPC; here
    // we delete-then-insert for simplicity. Requires adequate RLS permissions.)
    const spotIds = [...new Set(rows.map(r => r.spot_id))];

    // Delete existing entries for these spots
    await supabase
      .from('schedule_entries')
      .delete()
      .in('spot_id', spotIds);

    const { error } = await supabase.from('schedule_entries').insert(rows);

    if (error) throw error;

    statusEl.textContent = `Done! ${rows.length} entries uploaded.`;
    showToast('Schedule uploaded successfully.', 'success');
    fileInput.value = '';
    await renderSchedulePreview();
  } catch (err) {
    statusEl.textContent = 'Upload failed: ' + err.message;
    showToast('Upload failed: ' + err.message, 'error');
  }
}

/**
 * Minimal CSV parser (no quoted fields with commas — sufficient for schedule data).
 * @param {string} text
 * @returns {object[]}
 */
function _parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',').map(v => v.trim());
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? null; });

    // Coerce day_of_week to integer
    if (obj.day_of_week != null) obj.day_of_week = parseInt(obj.day_of_week, 10);

    return obj;
  });
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Basic HTML escaping to prevent XSS from DB content rendered as innerHTML. */
function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _emptyState(title, subtitle) {
  return /* html */ `
    <div class="admin-empty">
      <div class="admin-empty__icon">📭</div>
      <div class="admin-empty__title">${_esc(title)}</div>
      <div class="admin-empty__subtitle">${_esc(subtitle)}</div>
    </div>
  `;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

boot();
