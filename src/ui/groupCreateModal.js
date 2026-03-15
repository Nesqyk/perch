/**
 * src/ui/groupCreateModal.js
 *
 * Renders the "Create a group" form inside the generic modal overlay.
 * On submit, emits UI_GROUP_CREATE for features/groups.js to handle.
 *
 * Displayed when the user clicks the "New Group" button in the header.
 */

import { emit, EVENTS } from '../core/events.js';
import { getState }     from '../core/store.js';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Open the create-group modal.
 */
export function openGroupCreateModal() {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!overlay || !content) return;

  content.innerHTML = '';
  content.appendChild(_buildForm());
  overlay.hidden = false;

  // Overlay click → close, Esc → close.
  overlay.addEventListener('click', _handleOverlayClick);
  document.addEventListener('keydown', _handleEsc);

  // Focus first input.
  requestAnimationFrame(() => {
    content.querySelector('#group-name')?.focus();
  });
}

// ─── Form builder ─────────────────────────────────────────────────────────────

function _buildForm() {
  const wrap = document.createElement('div');

  const title = document.createElement('h2');
  title.className   = 'modal-title';
  title.textContent = 'Create a group';
  wrap.appendChild(title);

  const desc = document.createElement('p');
  desc.className   = 'modal-body';
  desc.textContent = 'Give your squad a name. Share the 4-letter code after.';
  wrap.appendChild(desc);

  const form = document.createElement('form');
  form.className  = 'group-form';
  form.id         = 'group-create-form';
  form.noValidate = true;

  const { nickname } = getState();

  form.innerHTML = /* html */`
    <div class="form-field">
      <label class="form-label" for="group-name">Group name</label>
      <input class="input" id="group-name" name="name"
             type="text" placeholder="e.g. CS451 Squad" maxlength="40" required />
    </div>
    <div class="form-field">
      <label class="form-label" for="group-display-name">Your name</label>
      <input class="input" id="group-display-name" name="displayName"
             type="text" placeholder="e.g. Tyta" maxlength="24" 
             value="${nickname ?? ''}" required />
    </div>
    <div class="form-field">
      <label class="form-label" for="group-context">Context</label>
      <select class="select" id="group-context" name="context">
        <option value="campus" selected>Campus</option>
        <option value="city">City</option>
      </select>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="group-create-cancel">Cancel</button>
      <button type="submit" class="btn btn-primary">Create group</button>
    </div>
  `;

  form.addEventListener('submit', _handleSubmit);
  form.querySelector('#group-create-cancel').addEventListener('click', _close);

  wrap.appendChild(form);
  return wrap;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function _handleSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const name        = form.elements['name'].value.trim();
  const displayName = form.elements['displayName'].value.trim();
  const context     = form.elements['context'].value;

  if (!name || !displayName) return;

  _close();
  emit(EVENTS.UI_GROUP_CREATE, { name, displayName, context });
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
