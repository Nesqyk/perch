/**
 * src/ui/groupJoinModal.js
 *
 * Renders the "Join a group" form inside the generic modal overlay.
 * On submit, emits UI_GROUP_JOIN for features/groups.js to handle.
 *
 * Also handles the ?join=CODE deep link — auto-fills the code field
 * if the URL contains a join code on page load.
 */

import { emit, EVENTS } from '../core/events.js';
import { getState }     from '../core/store.js';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Open the join-group modal, optionally pre-filling the code.
 *
 * @param {{ prefillCode?: string }} [opts]
 */
export function openGroupJoinModal({ prefillCode = '' } = {}) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!overlay || !content) return;

  content.innerHTML = '';
  content.appendChild(_buildForm(prefillCode));
  overlay.hidden = false;

  overlay.addEventListener('click', _handleOverlayClick);
  document.addEventListener('keydown', _handleEsc);

  requestAnimationFrame(() => {
    const codeInput = content.querySelector('#join-code');
    if (codeInput) {
      codeInput.focus();
      if (prefillCode) codeInput.select();
    }
  });
}

// ─── Form builder ─────────────────────────────────────────────────────────────

function _buildForm(prefillCode) {
  const wrap = document.createElement('div');

  const title = document.createElement('h2');
  title.className   = 'modal-title';
  title.textContent = 'Join a group';
  wrap.appendChild(title);

  const desc = document.createElement('p');
  desc.className   = 'modal-body';
  desc.textContent = 'Enter the 4-letter code shared by your squad.';
  wrap.appendChild(desc);

  const form = document.createElement('form');
  form.className  = 'group-form';
  form.id         = 'group-join-form';
  form.noValidate = true;

  const { nickname } = getState();

  form.innerHTML = /* html */`
    <div class="form-field">
      <label class="form-label" for="join-code">Group code</label>
      <input class="input group-code-input" id="join-code" name="code"
             type="text" placeholder="e.g. K7F2" maxlength="4"
             autocomplete="off" autocapitalize="characters"
             value="${_escHtml(prefillCode)}" required />
    </div>
    <div class="form-field">
      <label class="form-label" for="join-display-name">Your name</label>
      <input class="input" id="join-display-name" name="displayName"
             type="text" placeholder="e.g. Tyta" maxlength="24" 
             value="${nickname ?? ''}" required />
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="group-join-cancel">Cancel</button>
      <button type="submit" class="btn btn-primary">Join group</button>
    </div>
  `;

  form.addEventListener('submit', _handleSubmit);
  form.querySelector('#group-join-cancel').addEventListener('click', _close);

  // Auto-uppercase code field.
  form.querySelector('#join-code').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  wrap.appendChild(form);
  return wrap;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function _handleSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const code        = form.elements['code'].value.trim().toUpperCase();
  const displayName = form.elements['displayName'].value.trim();

  if (!code || code.length !== 4 || !displayName) return;

  _close();
  emit(EVENTS.UI_GROUP_JOIN, { code, displayName });
}

function _handleOverlayClick(e) {
  if (e.target.id === 'modal-overlay') _close();
}

function _handleEsc(e) {
  if (e.key === 'Escape') _close();
}

function _close() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.hidden = true;
  overlay?.removeEventListener('click', _handleOverlayClick);
  document.removeEventListener('keydown', _handleEsc);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _escHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
