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
import { reverseGeocode } from '../utils/nominatim.js';
import {
  fetchBuildings,
  createBuilding,
  confirmBuilding,
} from '../api/campuses.js';
import { fetchAreas, findOrCreateArea } from '../api/areas.js';
import {
  attachSpotImage,
  createCommunitySpot,
  fetchSpots,
  uploadSpotImage,
} from '../api/spots.js';
import { createImageUploadField } from './imageUploadField.js';
import { showToast }           from './toast.js';

const OVERLAY_ID = 'submit-modal-overlay';
const CONTENT_ID = 'submit-modal-content';

/** @type {{
 *   lat: number | null,
 *   lng: number | null,
 *   prefillArea: { sitio: string, barangay: string, cityMunicipality: string } | null,
 *   displayLabel: string,
 *   loading: boolean,
 *   error: string | null,
 *   requestId: number,
 * }} */
let _clickLocationContext = {
  lat: null,
  lng: null,
  prefillArea: null,
  displayLabel: '',
  loading: false,
  error: null,
  requestId: 0,
};

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

  _primeClickLocationContext(lat, lng);
  content.innerHTML = '';
  content.appendChild(_buildStep1(lat, lng, viewMode));

  overlay.hidden = false;
  overlay.addEventListener('click', _handleOverlayClick);
  document.addEventListener('keydown', _handleKeyDown);
  void _hydrateClickLocationContext(lat, lng, _clickLocationContext.requestId);
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

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {void}
 */
function _primeClickLocationContext(lat, lng) {
  _clickLocationContext = {
    lat,
    lng,
    prefillArea: null,
    displayLabel: '',
    loading: true,
    error: null,
    requestId: _clickLocationContext.requestId + 1,
  };
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {number} requestId
 * @returns {Promise<void>}
 */
async function _hydrateClickLocationContext(lat, lng, requestId) {
  const prefill = await reverseGeocode(lat, lng);
  if (_clickLocationContext.requestId !== requestId) return;

  _clickLocationContext = {
    ..._clickLocationContext,
    prefillArea: prefill
      ? {
          sitio: prefill.sitio ?? '',
          barangay: prefill.barangay ?? '',
          cityMunicipality: prefill.cityMunicipality ?? '',
        }
      : null,
    displayLabel: prefill?.displayLabel ?? '',
    loading: false,
    error: prefill ? null : 'Location details unavailable',
  };

  _applyClickLocationPrefillToOpenForm();
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

  wrap.appendChild(_buildWizardHeader('📍', 'Suggest a Spot', () => {
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

  form.appendChild(_buildAreaFields('submit-spot', lat, lng, _clickLocationContext));

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

  const imageField = createImageUploadField({ idPrefix: 'submit-spot' });
  form.appendChild(imageField.element);

  wrap.appendChild(form);

  const actions = document.createElement('div');
  actions.className = 'submit-spot-panel__actions';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn btn-primary btn-full';
  submitBtn.textContent = 'Add Spot';
  submitBtn.addEventListener('click', async () => {
    const venueName  = venueInput.value.trim();
    const spotName   = nameInput.value.trim();
    const floor      = /** @type {HTMLInputElement} */(form.querySelector('#submit-spot-floor'))?.value.trim() ?? '';
    const desc       = descInput.value.trim();
    const areaInput  = _readAreaFields(form, 'submit-spot', lat, lng);

    if (!venueName) { venueInput.focus(); venueInput.classList.add('input--error'); return; }
    if (!spotName)  { nameInput.focus();  nameInput.classList.add('input--error'); return; }
    if (areaInput.error) {
      showToast(areaInput.error, 'error');
      areaInput.focus?.();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';

    let areaId = null;
    if (areaInput.area) {
      const areaResult = await findOrCreateArea(areaInput.area);
      if (areaResult.error) {
        showToast(areaResult.error, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Spot';
        return;
      }
      areaId = areaResult.area?.id ?? null;
      void _refreshAreas();
    }

    const { selectedCampusId } = getState();
    const { spot, error } = await _publishSpotWithOptionalImage({
      campusId: selectedCampusId,
      areaId,
      lat,
      lng,
      buildingName: venueName,
      floor,
      spotName,
      description: desc,
      imageFile: imageField.getFile(),
      onCampus: getState().viewMode === 'campus',
    });

    if (error || !spot) {
      showToast(error ?? 'Could not add this spot. Please try again.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add Spot';
      return;
    }

    _showSuccess(`"${spotName}" is live on the map.`);
  });

  actions.appendChild(submitBtn);
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

  wrap.appendChild(_buildWizardHeader('🚪', 'Add a Room', () => {
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

  form.appendChild(_buildAreaFields('submit-room', lat, lng, _clickLocationContext));

  form.appendChild(_label('room-notes', 'Notes (optional)'));
  const notesInput = document.createElement('textarea');
  notesInput.id = 'room-notes';
  notesInput.className = 'input submit-spot-panel__textarea';
  notesInput.placeholder = 'Quiet after 3pm, strong WiFi…';
  notesInput.maxLength = 200;
  notesInput.rows = 3;
  form.appendChild(notesInput);

  const imageField = createImageUploadField({ idPrefix: 'submit-room' });
  form.appendChild(imageField.element);

  wrap.appendChild(form);

  const actions = document.createElement('div');
  actions.className = 'submit-spot-panel__actions';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn btn-primary btn-full';
  submitBtn.textContent = 'Add Room';
  submitBtn.addEventListener('click', async () => {
    const buildingId   = buildingSelect.value;
    const roomName     = roomInput.value.trim();
    const floor        = /** @type {HTMLInputElement} */(form.querySelector('#room-floor'))?.value.trim() ?? '';
    const notes        = notesInput.value.trim();
    const areaInput    = _readAreaFields(form, 'submit-room', lat, lng);

    if (!buildingId) { buildingSelect.focus(); return; }
    if (!roomName)   { roomInput.focus(); roomInput.classList.add('input--error'); return; }
    if (areaInput.error) {
      showToast(areaInput.error, 'error');
      areaInput.focus?.();
      return;
    }

    const building = buildings.find((b) => b.id === buildingId);
    if (!building) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';

    let areaId = null;
    if (areaInput.area) {
      const areaResult = await findOrCreateArea(areaInput.area);
      if (areaResult.error) {
        showToast(areaResult.error, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Room';
        return;
      }
      areaId = areaResult.area?.id ?? null;
      void _refreshAreas();
    }

    const { spot, error } = await _publishSpotWithOptionalImage({
      campusId: building.campus_id,
      areaId,
      lat: Number(building.lat),
      lng: Number(building.lng),
      buildingName: building.name,
      floor,
      spotName: roomName,
      description: notes,
      imageFile: imageField.getFile(),
      onCampus: true,
    });

    if (error || !spot) {
      showToast(error ?? 'Could not add this room.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add Room';
      return;
    }

    _showSuccess(`"${roomName}" is live on the map.`);
  });

  actions.appendChild(submitBtn);
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

  wrap.appendChild(_buildWizardHeader('🏢', 'Add a Building', () => {
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

  actions.appendChild(submitBtn);
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
    <p class="wizard-success__body">Thanks for helping the community.</p>
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
 * Build a wizard step header with title, emoji, and a back button.
 *
 * @param {string} emoji
 * @param {string} title
 * @param {() => void} onBack
 * @returns {HTMLElement}
 */
function _buildWizardHeader(emoji, title, onBack) {
  const header = document.createElement('div');
  header.className = 'submit-spot-panel__header';
  header.innerHTML = /* html */`
    <div class="submit-spot-panel__pin-badge">${emoji}</div>
    <div>
      <h2 class="submit-spot-panel__title">${title}</h2>
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
 * Build the basic area fields shared by spot and room submissions.
 *
 * @param {string} idPrefix
 * @param {number} lat
 * @param {number} lng
 * @param {{
 *   prefillArea: { sitio: string, barangay: string, cityMunicipality: string } | null,
 *   displayLabel: string,
 *   loading: boolean,
 * } | null} clickLocation
 * @returns {HTMLElement}
 */
function _buildAreaFields(idPrefix, lat, lng, clickLocation = null) {
  const wrap = document.createElement('div');
  wrap.className = 'submit-spot-panel__area-fields';
  wrap.dataset.prefix = idPrefix;
  const { campuses, selectedCampusId } = getState();
  const campus = campuses.find(item => item.id === selectedCampusId);
  const prefillArea = clickLocation?.prefillArea ?? null;
  const helperText = clickLocation?.loading
    ? 'Looking up map location…'
    : prefillArea
      ? 'Filled from map location.'
      : 'Supports multiple sitios, barangays, and cities.';

  wrap.innerHTML = /* html */`
    <div class="submit-spot-panel__area-head">
      <strong>Area</strong>
      <span class="submit-spot-panel__area-hint">${helperText}</span>
    </div>
  `;

  const sitioLabel = _label(`${idPrefix}-sitio`, 'Sitio / purok (optional)');
  wrap.appendChild(sitioLabel);
  const sitioInput = _input(`${idPrefix}-sitio`, 'e.g. Sitio San Jose', 80);
  _setAreaInputValue(sitioInput, prefillArea?.sitio ?? '');
  _wireAreaInputTracking(sitioInput);
  wrap.appendChild(sitioInput);

  const barangayLabel = _label(`${idPrefix}-barangay`, 'Barangay (required)');
  wrap.appendChild(barangayLabel);
  const barangayInput = _input(`${idPrefix}-barangay`, 'e.g. Sambag II', 80);
  _setAreaInputValue(barangayInput, prefillArea?.barangay ?? '');
  _wireAreaInputTracking(barangayInput);
  wrap.appendChild(barangayInput);

  const cityLabel = _label(`${idPrefix}-city`, 'City / municipality (required)');
  wrap.appendChild(cityLabel);
  const cityInput = _input(`${idPrefix}-city`, 'e.g. Cebu City', 80);
  _setAreaInputValue(cityInput, prefillArea?.cityMunicipality ?? campus?.city ?? 'Cebu City');
  _wireAreaInputTracking(cityInput);
  wrap.appendChild(cityInput);

  const coord = document.createElement('p');
  coord.className = 'submit-spot-panel__area-coords';
  coord.textContent = `Coordinates: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
  wrap.appendChild(coord);

  return wrap;
}

/**
 * Update the open spot/room form with reverse-geocoded area defaults if the
 * wizard is currently showing those fields.
 *
 * @returns {void}
 */
function _applyClickLocationPrefillToOpenForm() {
  ['submit-spot', 'submit-room'].forEach((idPrefix) => {
    const areaWrap = document.querySelector(`.submit-spot-panel__area-fields[data-prefix="${idPrefix}"]`);
    if (!areaWrap) return;

    const hint = areaWrap.querySelector('.submit-spot-panel__area-hint');
    if (hint) {
      hint.textContent = _clickLocationContext.prefillArea
        ? 'Filled from map location.'
        : 'Supports multiple sitios, barangays, and cities.';
    }

    _setAreaInputValue(
      /** @type {HTMLInputElement | null} */ (areaWrap.querySelector(`#${idPrefix}-sitio`)),
      _clickLocationContext.prefillArea?.sitio ?? '',
    );
    _setAreaInputValue(
      /** @type {HTMLInputElement | null} */ (areaWrap.querySelector(`#${idPrefix}-barangay`)),
      _clickLocationContext.prefillArea?.barangay ?? '',
    );
    _setAreaInputValue(
      /** @type {HTMLInputElement | null} */ (areaWrap.querySelector(`#${idPrefix}-city`)),
      _clickLocationContext.prefillArea?.cityMunicipality ?? '',
    );
  });
}

/**
 * @param {HTMLInputElement | null} input
 * @returns {void}
 */
function _wireAreaInputTracking(input) {
  if (!input) return;
  input.addEventListener('input', () => {
    input.dataset.prefill = 'false';
  });
}

/**
 * @param {HTMLInputElement | null} input
 * @param {string} value
 * @returns {void}
 */
function _setAreaInputValue(input, value) {
  if (!input || !value) return;
  const currentValue = input.value.trim();
  const canOverwrite = !currentValue || input.dataset.prefill === 'true';
  if (!canOverwrite) return;
  input.value = value;
  input.dataset.prefill = 'true';
}

/**
 * Read and validate area fields from a submit form.
 *
 * @param {HTMLElement} form
 * @param {string} idPrefix
 * @param {number} lat
 * @param {number} lng
 * @returns {{ area: object | null, error: string | null, focus?: () => void }}
 */
function _readAreaFields(form, idPrefix, lat, lng) {
  const sitioInput = form.querySelector(`#${idPrefix}-sitio`);
  const barangayInput = form.querySelector(`#${idPrefix}-barangay`);
  const cityInput = form.querySelector(`#${idPrefix}-city`);
  const sitio = sitioInput?.value?.trim() ?? '';
  const barangay = barangayInput?.value?.trim() ?? '';
  const cityMunicipality = cityInput?.value?.trim() ?? '';

  if (!barangay) {
    barangayInput?.classList.add('input--error');
    return { area: null, error: 'Barangay is required.', focus: () => barangayInput?.focus() };
  }
  if (!cityMunicipality) {
    cityInput?.classList.add('input--error');
    return { area: null, error: 'City or municipality is required.', focus: () => cityInput?.focus() };
  }

  return {
    area: { sitio, barangay, cityMunicipality, lat, lng },
    error: null,
  };
}

/**
 * Create a live spot, optionally upload and attach its image, then refresh map data.
 *
 * @param {{
 *   campusId: string | null,
 *   areaId?: string | null,
 *   lat: number,
 *   lng: number,
 *   buildingName: string,
 *   floor: string,
 *   spotName: string,
 *   description: string,
 *   imageFile: File | null,
 *   onCampus: boolean,
 * }} params
 * @returns {Promise<{ spot: object | null, error: string | null }>}
 */
async function _publishSpotWithOptionalImage(params) {
  const { spot, error } = await createCommunitySpot(params);
  if (error || !spot) return { spot: null, error };

  if (params.imageFile) {
    const uploaded = await uploadSpotImage({ spotId: spot.id, file: params.imageFile });
    if (uploaded.error) {
      showToast('Spot added, but the photo could not upload. You can add it from the detail page.', 'error');
    } else {
      const attached = await attachSpotImage({ spotId: spot.id, imagePath: uploaded.path });
      if (attached.error) {
        showToast('Spot added, but the photo could not attach. You can add it from the detail page.', 'error');
      }
    }
  }

  const { selectedCampusId } = getState();
  await _refreshCampusCatalogue(selectedCampusId || params.campusId);
  dispatch('SELECT_SPOT', { spotId: spot.id, navigate: true });
  return { spot, error: null };
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

async function _refreshAreas() {
  const areas = await fetchAreas();
  dispatch('AREAS_LOADED', { areas });
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
