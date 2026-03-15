/**
 * src/ui/submitSpotPanel.js
 *
 * Renders a lightweight inline form (inside the bottom sheet / sidebar panel)
 * that lets a user confirm and submit a map-click marker as a pending spot.
 *
 * Flow:
 *   1. User clicks on the Leaflet map → mapInit.js emits UI_SUBMIT_SPOT_REQUESTED
 *      with { lat, lng }.
 *   2. This module intercepts the event and builds a form inside the submit modal.
 *   3. On submit, calls api/campuses.submitSpot() → inserts into spot_submissions
 *      with status 'pending'.
 *   4. A toast confirms submission. Modal closes.
 */

import { on, emit, EVENTS }     from '../core/events.js';
import { getState }              from '../core/store.js';
import { submitSpot }            from '../api/campuses.js';
import { getSessionId }          from '../utils/session.js';
import { showToast }             from './toast.js';

// ─── Initialise ──────────────────────────────────────────────────────────────

/**
 * Wire the submit-spot event listener.
 * Called once from main.js.
 */
export function initSubmitSpotPanel() {
  on(EVENTS.UI_SUBMIT_SPOT_REQUESTED, _onSubmitRequested);
}

// ─── Handler ─────────────────────────────────────────────────────────────────

const OVERLAY_ID = 'submit-modal-overlay';
const CONTENT_ID = 'submit-modal-content';

/**
 * @param {CustomEvent<{ lat: number, lng: number }>} e
 */
async function _onSubmitRequested(e) {
  const { lat, lng } = e.detail;

  const overlay = document.getElementById(OVERLAY_ID);
  const content = document.getElementById(CONTENT_ID);
  if (!overlay || !content) return;

  content.innerHTML = '';
  content.appendChild(_buildSubmitForm(lat, lng));

  overlay.hidden = false;

  // Wait a tick then focus the name input
  setTimeout(() => {
    const input = content.querySelector('#submit-spot-name');
    if (input) input.focus();
  }, 50);

  // Trap focus / close on escape or bg click
  overlay.addEventListener('click', _handleOverlayClick);
  document.addEventListener('keydown', _handleKeyDown);
}

function _closeModal() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;
  overlay.hidden = true;
  overlay.removeEventListener('click', _handleOverlayClick);
  document.removeEventListener('keydown', _handleKeyDown);

  // Inform the map that the panel/modal was closed
  emit(EVENTS.UI_PANEL_CLOSED, {});
}

function _handleOverlayClick(e) {
  if (e.target.id === OVERLAY_ID) _closeModal();
}

function _handleKeyDown(e) {
  if (e.key === 'Escape') _closeModal();
}

// ─── Form ────────────────────────────────────────────────────────────────────

/**
 * Build the submit-spot confirmation form.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {HTMLElement}
 */
function _buildSubmitForm(lat, lng) {
  const wrap      = document.createElement('div');
  wrap.className  = 'submit-spot-panel';

  // Header
  const header     = document.createElement('div');
  header.className = 'submit-spot-panel__header';
  header.innerHTML = /* html */`
    <div class="submit-spot-panel__pin-badge">📍</div>
    <div>
      <h2 class="submit-spot-panel__title">Suggest a Spot</h2>
      <p class="submit-spot-panel__coords">${lat.toFixed(5)}, ${lng.toFixed(5)}</p>
    </div>
  `;
  wrap.appendChild(header);

  // Description
  const desc     = document.createElement('p');
  desc.className = 'submit-spot-panel__desc';
  desc.textContent = 'Know a good study spot here? Submit it for review and help the community!';
  wrap.appendChild(desc);

  // Form fields
  const form      = document.createElement('div');
  form.className  = 'submit-spot-panel__form';

  const nameLabel       = document.createElement('label');
  nameLabel.className   = 'filter-label';
  nameLabel.htmlFor     = 'submit-spot-name';
  nameLabel.textContent = 'Spot name (required)';
  form.appendChild(nameLabel);

  const nameInput     = document.createElement('input');
  nameInput.type      = 'text';
  nameInput.id        = 'submit-spot-name';
  nameInput.className = 'input';
  nameInput.placeholder = 'e.g. Library 2nd Floor Corner';
  nameInput.maxLength = 60;
  form.appendChild(nameInput);

  const descLabel       = document.createElement('label');
  descLabel.className   = 'filter-label';
  descLabel.htmlFor     = 'submit-spot-desc';
  descLabel.textContent = 'Description (optional)';
  form.appendChild(descLabel);

  const descInput       = document.createElement('textarea');
  descInput.id          = 'submit-spot-desc';
  descInput.className   = 'input submit-spot-panel__textarea';
  descInput.placeholder = 'Any details about this spot...';
  descInput.maxLength   = 200;
  descInput.rows        = 3;
  form.appendChild(descInput);

  wrap.appendChild(form);

  // Actions
  const btnRow      = document.createElement('div');
  btnRow.className  = 'submit-spot-panel__actions';

  const submitBtn       = document.createElement('button');
  submitBtn.type        = 'button';
  submitBtn.className   = 'btn btn-primary btn-full';
  submitBtn.id          = 'submit-spot-confirm';
  submitBtn.textContent = 'Submit Suggestion';
  submitBtn.addEventListener('click', () => _handleSubmit(lat, lng, nameInput, descInput, submitBtn));

  const cancelBtn       = document.createElement('button');
  cancelBtn.type        = 'button';
  cancelBtn.className   = 'btn btn-ghost btn-full';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', _closeModal);

  btnRow.appendChild(submitBtn);
  btnRow.appendChild(cancelBtn);
  wrap.appendChild(btnRow);

  return wrap;
}

// ─── Submit handler ──────────────────────────────────────────────────────────

/**
 * @param {number}            lat
 * @param {number}            lng
 * @param {HTMLInputElement}  nameInput
 * @param {HTMLTextAreaElement} descInput
 * @param {HTMLButtonElement} submitBtn
 */
async function _handleSubmit(lat, lng, nameInput, descInput, submitBtn) {
  const spotName    = nameInput.value.trim();
  const description = descInput.value.trim();

  if (!spotName) {
    nameInput.focus();
    nameInput.classList.add('input--error');
    return;
  }

  const { selectedCampusId } = getState();
  const sessionId = getSessionId();

  submitBtn.disabled   = true;
  submitBtn.textContent = 'Submitting...';

  const { error } = await submitSpot({
    campusId:    selectedCampusId,
    lat,
    lng,
    spotName,
    description,
    sessionId,
  });

  if (error) {
    showToast('Could not submit. Please try again.', 'error');
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Submit Suggestion';
    return;
  }

  showToast('Thanks! Your spot suggestion is under review 🎉', 'success');
  _closeModal();
}
