/**
 * src/ui/submitSpotPanel.js
 *
 * Unified 3-step wizard for adding a new spot, room, or building.
 *
 * Step 1 — Type selector: Spot | Room | Building
 * Step 2 — Detail form: fields change based on the chosen type
 * Step 3 — Success confirmation
 *
 * The wizard opens via the submit-modal-overlay / submit-modal-content DOM
 * pair (shared with buildingPanel.js) and is triggered by a map click.
 *
 * In campus mode the wizard offers all three types.
 * In city mode only "Spot" is offered (off-campus / outdoor venues).
 */

import { on, emit, EVENTS }   from '../core/events.js';
import { getState, dispatch }  from '../core/store.js';
import {
  fetchBuildings,
  createBuilding,
  confirmBuilding,
  submitSpot,
  confirmSpotSubmission,
} from '../api/campuses.js';
import { fetchSpots }          from '../api/spots.js';
import { showToast }           from './toast.js';

const OVERLAY_ID = 'submit-modal-overlay';
const CONTENT_ID = 'submit-modal-content';

// ─── Init ────────────────────────────────────────────────────────────────────

/**
 * Wire the discovery event listener.
 *
 * @returns {void}
 */
export function initSubmitSpotPanel() {
  on(EVENTS.UI_SUBMIT_SPOT_REQUESTED, _onSubmitRequested);
}

// ─── Entry ───────────────────────────────────────────────────────────────────

/**
 * @param {CustomEvent<{ lat: number, lng: number }>} e
 * @returns {Promise<void>}
 */
async function _onSubmitRequested(e) {
  const { lat, lng } = e.detail;
  const { currentUser, viewMode } = getState();

  if (!currentUser) {
    emit(EVENTS.UI_LOGIN_REQUESTED, {});
    return;
  }

  const overlay = document.getElementById(OVERLAY_ID);
  const content = document.getElementById(CONTENT_ID);
  if (!overlay || !content) return;

  content.innerHTML = '';
  content.appendChild(_buildStep1(lat, lng, viewMode));

  overlay.hidden = false;
  overlay.addEventListener('click', _handleOverlayClick);
  document.addEventListener('keydown', _handleKeyDown);
}

function _closeModal() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;
  overlay.hidden = true;
  overlay.removeEventListener('click', _handleOverlayClick);
  document.removeEventListener('keydown', _handleKeyDown);
  emit(EVENTS.UI_PANEL_CLOSED, {});
}

function _handleOverlayClick(e) {
  if (e.target.id === OVERLAY_ID) _closeModal();
}

function _handleKeyDown(e) {
  if (e.key === 'Escape') _closeModal();
}

// ─── Step 1 — Type selector ───────────────────────────────────────────────────

/**
 * @param {number} lat
 * @param {number} lng
 * @param {'campus' | 'city'} viewMode
 * @returns {HTMLElement}
 */
function _buildStep1(lat, lng, viewMode) {
  const wrap = document.createElement('div');
  wrap.className = 'submit-spot-panel';

  const header = document.createElement('div');
  header.className = 'submit-spot-panel__header';
  header.innerHTML = /* html */`
    <div class="submit-spot-panel__pin-badge">📍</div>
    <div>
      <h2 class="submit-spot-panel__title">Add to the Map</h2>
      <p class="submit-spot-panel__coords">${lat.toFixed(5)}, ${lng.toFixed(5)}</p>
    </div>
  `;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'spot-card__close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', _closeModal);
  header.appendChild(closeBtn);
  wrap.appendChild(header);

  const desc = document.createElement('p');
  desc.className = 'submit-spot-panel__desc';
  desc.textContent = 'What are you adding?';
  wrap.appendChild(desc);

  const types = viewMode === 'campus'
    ? [
        { key: 'room',     emoji: '🚪', label: 'Room',     sub: 'A room or area inside a building' },
        { key: 'building', emoji: '🏢', label: 'Building', sub: 'A new campus building' },
        { key: 'spot',     emoji: '📍', label: 'Spot',     sub: 'An outdoor or off-campus venue' },
      ]
    : [
        { key: 'spot', emoji: '📍', label: 'Spot', sub: 'A public venue or hangout' },
      ];

  const grid = document.createElement('div');
  grid.className = 'wizard-type-grid';

  types.forEach(({ key, emoji, label, sub }) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'wizard-type-card';
    card.innerHTML = /* html */`
      <span class="wizard-type-card__emoji">${emoji}</span>
      <strong class="wizard-type-card__label">${label}</strong>
      <span class="wizard-type-card__sub">${sub}</span>
    `;
    card.addEventListener('click', async () => {
      const content = document.getElementById(CONTENT_ID);
      if (!content) return;
      content.innerHTML = '';

      if (key === 'spot') {
        const buildings = await fetchBuildings(getState().selectedCampusId);
        content.appendChild(_buildStep2Spot(lat, lng, buildings));
      } else if (key === 'room') {
        const buildings = await fetchBuildings(getState().selectedCampusId);
        content.appendChild(_buildStep2Room(lat, lng, buildings));
      } else if (key === 'building') {
        content.appendChild(_buildStep2Building(lat, lng));
      }
    });
    grid.appendChild(card);
  });

  wrap.appendChild(grid);
  return wrap;
}

// ─── Step 2 — Spot form ───────────────────────────────────────────────────────

/**
 * @param {number} lat
 * @param {number} lng
 * @param {object[]} buildings
 * @returns {HTMLElement}
 */
function _buildStep2Spot(lat, lng, buildings) {
  const wrap = document.createElement('div');
  wrap.className = 'submit-spot-panel';

  wrap.appendChild(_buildWizardHeader('📍', 'Suggest a Spot', lat, lng, () => {
    const content = document.getElementById(CONTENT_ID);
    if (content) { content.innerHTML = ''; content.appendChild(_buildStep1(lat, lng, getState().viewMode)); }
  }));

  const form = document.createElement('div');
  form.className = 'submit-spot-panel__form';

  const venueLabel = _label('submit-venue-name', 'Venue (required)');
  form.appendChild(venueLabel);
  const venueInput = _input('submit-venue-name', 'e.g. Common Ground Cafe', 60);
  venueInput.setAttribute('list', 'submit-building-list');
  form.appendChild(venueInput);

  const buildingList = document.createElement('datalist');
  buildingList.id = 'submit-building-list';
  buildingList.innerHTML = buildings.map((b) => `<option value="${_escapeHtml(b.name)}"></option>`).join('');
  form.appendChild(buildingList);

  const floorLabel = _label('submit-spot-floor', 'Area / level (optional)');
  form.appendChild(floorLabel);
  form.appendChild(_input('submit-spot-floor', 'e.g. 4F', 12));

  const nameLabel = _label('submit-spot-name', 'Table, corner, or spot name (required)');
  form.appendChild(nameLabel);
  const nameInput = _input('submit-spot-name', 'e.g. Window Bar Seats', 60);
  form.appendChild(nameInput);

  const suggestionsWrap = document.createElement('div');
  suggestionsWrap.id = 'submit-existing-spots';
  form.appendChild(suggestionsWrap);

  venueInput.addEventListener('input', () => _renderExistingSpots(venueInput, suggestionsWrap));

  form.appendChild(_label('submit-spot-desc', 'Notes (optional)'));
  const descInput = document.createElement('textarea');
  descInput.id = 'submit-spot-desc';
  descInput.className = 'input submit-spot-panel__textarea';
  descInput.placeholder = 'What makes this a good spot?';
  descInput.maxLength = 200;
  descInput.rows = 3;
  form.appendChild(descInput);

  wrap.appendChild(form);

  const actions = document.createElement('div');
  actions.className = 'submit-spot-panel__actions';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn btn-primary btn-full';
  submitBtn.textContent = 'Add to Review Queue';
  submitBtn.addEventListener('click', async () => {
    const venueName  = venueInput.value.trim();
    const spotName   = nameInput.value.trim();
    const floor      = /** @type {HTMLInputElement} */(form.querySelector('#submit-spot-floor'))?.value.trim() ?? '';
    const desc       = descInput.value.trim();

    if (!venueName) { venueInput.focus(); venueInput.classList.add('input--error'); return; }
    if (!spotName)  { nameInput.focus();  nameInput.classList.add('input--error'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    const { selectedCampusId } = getState();
    const { error } = await submitSpot({
      campusId: selectedCampusId,
      lat,
      lng,
      buildingName: venueName,
      floor,
      spotName,
      description: desc,
      discovererDisplayName: _discovererName(),
    });

    if (error) {
      showToast('Could not submit. Please try again.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add to Review Queue';
      return;
    }

    _showSuccess(`"${spotName}" queued for review. You'll be credited if approved.`);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-ghost btn-full';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', _closeModal);

  actions.appendChild(submitBtn);
  actions.appendChild(cancelBtn);
  wrap.appendChild(actions);

  return wrap;
}

// ─── Step 2 — Room form ───────────────────────────────────────────────────────

/**
 * @param {number} lat
 * @param {number} lng
 * @param {object[]} buildings
 * @returns {HTMLElement}
 */
function _buildStep2Room(lat, lng, buildings) {
  const wrap = document.createElement('div');
  wrap.className = 'submit-spot-panel';

  wrap.appendChild(_buildWizardHeader('🚪', 'Add a Room', lat, lng, () => {
    const content = document.getElementById(CONTENT_ID);
    if (content) { content.innerHTML = ''; content.appendChild(_buildStep1(lat, lng, getState().viewMode)); }
  }));

  const form = document.createElement('div');
  form.className = 'submit-spot-panel__form';

  form.appendChild(_label('room-building-select', 'Building (required)'));
  const buildingSelect = document.createElement('select');
  buildingSelect.id = 'room-building-select';
  buildingSelect.className = 'select';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Choose a building…';
  buildingSelect.appendChild(defaultOpt);
  buildings.forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name;
    buildingSelect.appendChild(opt);
  });
  form.appendChild(buildingSelect);

  form.appendChild(_label('room-name', 'Room name (required)'));
  const roomInput = _input('room-name', 'e.g. Room 404', 60);
  form.appendChild(roomInput);

  form.appendChild(_label('room-floor', 'Floor (optional)'));
  form.appendChild(_input('room-floor', 'e.g. 4F', 12));

  form.appendChild(_label('room-notes', 'Notes (optional)'));
  const notesInput = document.createElement('textarea');
  notesInput.id = 'room-notes';
  notesInput.className = 'input submit-spot-panel__textarea';
  notesInput.placeholder = 'Quiet after 3pm, strong WiFi…';
  notesInput.maxLength = 200;
  notesInput.rows = 3;
  form.appendChild(notesInput);

  wrap.appendChild(form);

  const actions = document.createElement('div');
  actions.className = 'submit-spot-panel__actions';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn btn-primary btn-full';
  submitBtn.textContent = 'Add Room for Peer Review';
  submitBtn.addEventListener('click', async () => {
    const buildingId   = buildingSelect.value;
    const roomName     = roomInput.value.trim();
    const floor        = /** @type {HTMLInputElement} */(form.querySelector('#room-floor'))?.value.trim() ?? '';
    const notes        = notesInput.value.trim();

    if (!buildingId) { buildingSelect.focus(); return; }
    if (!roomName)   { roomInput.focus(); roomInput.classList.add('input--error'); return; }

    const building = buildings.find((b) => b.id === buildingId);
    if (!building) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    const { data, error } = await submitSpot({
      campusId: building.campus_id,
      lat: Number(building.lat),
      lng: Number(building.lng),
      buildingName: building.name,
      floor,
      spotName: roomName,
      description: notes,
      discovererDisplayName: _discovererName(),
    });

    if (error || !data?.id) {
      showToast(error ?? 'Could not queue this room.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add Room for Peer Review';
      return;
    }

    await confirmSpotSubmission(data.id);
    await _refreshCampusCatalogue(building.campus_id);
    _showSuccess(`"${roomName}" added. One more confirmation will make it live.`);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-ghost btn-full';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', _closeModal);

  actions.appendChild(submitBtn);
  actions.appendChild(cancelBtn);
  wrap.appendChild(actions);

  return wrap;
}

// ─── Step 2 — Building form ───────────────────────────────────────────────────

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {HTMLElement}
 */
function _buildStep2Building(lat, lng) {
  const wrap = document.createElement('div');
  wrap.className = 'submit-spot-panel';

  wrap.appendChild(_buildWizardHeader('🏢', 'Add a Building', lat, lng, () => {
    const content = document.getElementById(CONTENT_ID);
    if (content) { content.innerHTML = ''; content.appendChild(_buildStep1(lat, lng, getState().viewMode)); }
  }));

  const desc = document.createElement('p');
  desc.className = 'submit-spot-panel__desc';
  desc.textContent = 'Drop a building marker. Once it exists, people can map rooms inside and peer-confirm what is real.';
  wrap.appendChild(desc);

  const form = document.createElement('div');
  form.className = 'submit-spot-panel__form';

  form.appendChild(_label('building-name-input', 'Building name (required)'));
  const nameInput = _input('building-name-input', 'e.g. IT Building', 80);
  form.appendChild(nameInput);

  wrap.appendChild(form);

  const actions = document.createElement('div');
  actions.className = 'submit-spot-panel__actions';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn btn-primary btn-full';
  submitBtn.textContent = 'Add Building';
  submitBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding…';

    const { selectedCampusId } = getState();
    const { data, error } = await createBuilding({ campusId: selectedCampusId, name, lat, lng });

    if (error || !data) {
      showToast(error ?? 'Could not create building.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add Building';
      return;
    }

    await confirmBuilding(data.id);
    await _refreshBuildings(selectedCampusId);
    _showSuccess(`"${name}" added. One more confirmation will verify it.`);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-ghost btn-full';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', _closeModal);

  actions.appendChild(submitBtn);
  actions.appendChild(cancelBtn);
  wrap.appendChild(actions);

  return wrap;
}

// ─── Step 3 — Success ────────────────────────────────────────────────────────

/**
 * Replace modal content with a success confirmation screen.
 *
 * @param {string} message
 * @returns {void}
 */
function _showSuccess(message) {
  const content = document.getElementById(CONTENT_ID);
  if (!content) return;

  const wrap = document.createElement('div');
  wrap.className = 'submit-spot-panel wizard-success';

  wrap.innerHTML = /* html */`
    <div class="wizard-success__icon">✅</div>
    <h2 class="wizard-success__title">Submitted!</h2>
    <p class="wizard-success__body">${_escapeHtml(message)}</p>
  `;

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'btn btn-primary btn-full';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', _closeModal);
  wrap.appendChild(doneBtn);

  content.innerHTML = '';
  content.appendChild(wrap);
}

// ─── Existing spots suggestion ────────────────────────────────────────────────

/**
 * @param {HTMLInputElement} venueInput
 * @param {HTMLElement} container
 * @returns {void}
 */
function _renderExistingSpots(venueInput, container) {
  const buildingName = venueInput.value.trim().toLowerCase();
  const { spots, selectedCampusId } = getState();

  if (!buildingName) { container.innerHTML = ''; return; }

  const matches = spots
    .filter((spot) =>
      spot.campus_id === selectedCampusId &&
      String(spot.building ?? '').trim().toLowerCase() === buildingName,
    )
    .slice(0, 6);

  if (!matches.length) { container.innerHTML = ''; return; }

  container.innerHTML = /* html */`
    <div class="submit-spot-panel__desc">
      Known here already: ${matches.map((spot) => `
        <button type="button" class="btn btn-ghost" data-existing-spot="${spot.id}">
          ${_escapeHtml(spot.name)}
        </button>
      `).join(' ')}
    </div>
  `;

  container.querySelectorAll('[data-existing-spot]').forEach((button) => {
    button.addEventListener('click', () => {
      dispatch('SELECT_SPOT', { spotId: button.dataset.existingSpot, navigate: true });
      showToast('Opened the existing room instead of creating a duplicate.', 'info');
      _closeModal();
    });
  });
}

// ─── Private helpers ─────────────────────────────────────────────────────────

/**
 * Build a wizard step header with title, coords, and a back button.
 *
 * @param {string} emoji
 * @param {string} title
 * @param {number} lat
 * @param {number} lng
 * @param {() => void} onBack
 * @returns {HTMLElement}
 */
function _buildWizardHeader(emoji, title, lat, lng, onBack) {
  const header = document.createElement('div');
  header.className = 'submit-spot-panel__header';
  header.innerHTML = /* html */`
    <div class="submit-spot-panel__pin-badge">${emoji}</div>
    <div>
      <h2 class="submit-spot-panel__title">${title}</h2>
      <p class="submit-spot-panel__coords">${lat.toFixed(5)}, ${lng.toFixed(5)}</p>
    </div>
  `;

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn btn-ghost btn-sm wizard-back-btn';
  backBtn.textContent = '← Back';
  backBtn.addEventListener('click', onBack);
  header.appendChild(backBtn);

  return header;
}

/**
 * Create a `<label>` element.
 *
 * @param {string} forId
 * @param {string} text
 * @returns {HTMLLabelElement}
 */
function _label(forId, text) {
  const el = document.createElement('label');
  el.className = 'filter-label';
  el.htmlFor = forId;
  el.textContent = text;
  return el;
}

/**
 * Create an `<input>` element.
 *
 * @param {string} id
 * @param {string} placeholder
 * @param {number} maxLength
 * @returns {HTMLInputElement}
 */
function _input(id, placeholder, maxLength) {
  const el = document.createElement('input');
  el.type = 'text';
  el.id = id;
  el.className = 'input';
  el.placeholder = placeholder;
  el.maxLength = maxLength;
  return el;
}

/**
 * Derive the discoverer display name from auth state.
 *
 * @returns {string}
 */
function _discovererName() {
  const { nickname, currentUser } = getState();
  return nickname
    || currentUser?.user_metadata?.full_name
    || currentUser?.email?.split('@')[0]
    || 'Perch member';
}

/**
 * @param {string} campusId
 * @returns {Promise<void>}
 */
async function _refreshBuildings(campusId) {
  const buildings = await fetchBuildings(campusId);
  dispatch('BUILDINGS_LOADED', { buildings });
}

/**
 * @param {string} campusId
 * @returns {Promise<void>}
 */
async function _refreshCampusCatalogue(campusId) {
  await _refreshBuildings(campusId);
  const { spots, confidence } = await fetchSpots();
  dispatch('SPOTS_LOADED', { spots, confidence });
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
