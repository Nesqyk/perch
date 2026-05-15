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
  desc.textContent = 'Name the squad and claim its campus turf. We will bootstrap the map shell for you.';
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
    <div class="form-field" id="group-campus-field">
      <label class="form-label" for="group-campus-name">Campus turf</label>
      <input class="input" id="group-campus-name" name="campusName"
             type="text" placeholder="e.g. Cebu Technological University" maxlength="80" />
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="group-create-cancel">Cancel</button>
      <button type="submit" class="btn btn-primary">Create group</button>
    </div>
  `;

  form.addEventListener('submit', _handleSubmit);
  form.querySelector('#group-create-cancel').addEventListener('click', _close);
  form.querySelector('#group-context').addEventListener('change', _syncCampusField);

  const campusInput = form.querySelector('#group-campus-name');
  if (campusInput) {
    campusInput.value = _defaultCampusName();
  }

  _syncCampusField({ currentTarget: form.querySelector('#group-context') });

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
  const campusName  = form.elements['campusName'].value.trim();

  if (!name || !displayName) return;

  if (context === 'campus' && !campusName) {
    const input = form.querySelector('#group-campus-name');
    input?.classList.add('input--error');
    input?.setAttribute('aria-invalid', 'true');

    let msg = form.querySelector('.form-error-msg');
    if (!msg) {
      msg = document.createElement('p');
      msg.className = 'form-error-msg';
      msg.id = 'group-campus-error';
      input?.parentElement?.appendChild(msg);
      input?.setAttribute('aria-describedby', 'group-campus-error');
    }
    msg.textContent = 'Campus name is required for campus groups.';

    // Clear the error state as soon as the user starts typing.
    input?.addEventListener('input', () => {
      input.classList.remove('input--error');
      input.removeAttribute('aria-invalid');
      if (msg) msg.textContent = '';
    }, { once: true });

    return;
  }

  _close();
  emit(EVENTS.UI_GROUP_CREATE, { name, displayName, context, campusName });
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

function _syncCampusField(e) {
  const context = e.currentTarget?.value ?? 'campus';
  const field = document.getElementById('group-campus-field');
  const input = document.getElementById('group-campus-name');
  if (!field || !input) return;

  const isCampus = context === 'campus';
  field.hidden = !isCampus;
  input.required = isCampus;
}

function _defaultCampusName() {
  const { campuses, selectedCampusId } = getState();
  return campuses.find((campus) => campus.id === selectedCampusId)?.name ?? '';
}
