/**
 * src/ui/campusSelector.js
 *
 * Renders the campus picker as a wrapping chip row — the same visual pattern
 * as the Campus/City view-mode toggle immediately above it.
 *
 * Features:
 *   • One chip per campus; selected chip uses the shared `.chip-active` state.
 *   • A subtle GPS prompt is shown when no user location is known; clicking it
 *     calls geolocation and dispatches SET_USER_LOCATION. The nearest campus
 *     chip gets a "Near you" marker appended to its label.
 *   • All chips are disabled (pointer-events off, opacity reduced) in city mode.
 *   • A compact "＋ Add campus" link appears after the chips. Clicking it
 *     reveals an inline name input and confirm/cancel buttons.
 *   • A search input appears when there are more than SEARCH_THRESHOLD campuses.
 *
 * @module campusSelector
 */

import { Navigation, Plus } from 'lucide';

import { on, emit, EVENTS }  from '../core/events.js';
import { getState, dispatch } from '../core/store.js';
import { iconSvg }            from './icons.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Show search input when there are more campuses than this. */
const SEARCH_THRESHOLD = 5;

/** Earth radius used for haversine distance (metres). */
const EARTH_RADIUS_M = 6371e3;

// ─── Initialise ───────────────────────────────────────────────────────────────

/**
 * Initialises the campus selector chip row.
 * Replaces the content of `container` with the chip-based picker.
 *
 * @param {HTMLElement} container
 * @returns {void}
 */
export function initCampusSelector(container) {
  if (!container) return;
  container.className = 'campus-selector-container';

  let _searchQuery    = '';
  let _locationDenied = false;

  // ── Location prompt ───────────────────────────────────────────────────────
  const locationEl = document.createElement('div');
  container.appendChild(locationEl);

  // ── Search input (hidden until campus count exceeds threshold) ────────────
  const searchInput = document.createElement('input');
  searchInput.type        = 'search';
  searchInput.className   = 'campus-search';
  searchInput.placeholder = 'Search campuses…';
  searchInput.hidden      = true;
  searchInput.setAttribute('aria-label', 'Search campuses');
  container.appendChild(searchInput);

  // ── Chip row ──────────────────────────────────────────────────────────────
  const chipRow = document.createElement('div');
  chipRow.className = 'chip-row campus-chip-row';
  container.appendChild(chipRow);

  // ── "Add campus" link ─────────────────────────────────────────────────────
  const addLink = document.createElement('button');
  addLink.type      = 'button';
  addLink.className = 'campus-add-link';
  addLink.innerHTML = `${iconSvg(Plus, 12)} Add campus`;
  container.appendChild(addLink);

  // ── Inline add form (hidden by default) ──────────────────────────────────
  const addForm = _buildAddForm(chipRow, addLink, searchInput);
  addForm.hidden = true;
  container.appendChild(addForm);

  // ── Render helpers ────────────────────────────────────────────────────────

  const render = () => {
    _renderLocationPrompt(locationEl, _locationDenied, (denied) => {
      _locationDenied = denied;
      render();
    });
    const { campuses } = getState();
    searchInput.hidden = campuses.length <= SEARCH_THRESHOLD;
    _renderChips(chipRow, _searchQuery);
  };

  // ── Event listeners ───────────────────────────────────────────────────────

  on(EVENTS.CAMPUSES_LOADED,   render);
  on(EVENTS.CAMPUS_SELECTED,   render);
  on(EVENTS.SPOTS_LOADED,      render);
  on(EVENTS.FILTERS_CHANGED,   render);
  on(EVENTS.LOCATION_SET,      render);
  on(EVENTS.VIEW_MODE_CHANGED, render);

  searchInput.addEventListener('input', () => {
    _searchQuery = searchInput.value;
    render();
  });

  addLink.addEventListener('click', () => {
    chipRow.hidden    = true;
    addLink.hidden    = true;
    addForm.hidden    = false;
    const nameInput   = addForm.querySelector('.campus-selector__add-input');
    if (nameInput) { nameInput.value = _searchQuery.trim(); nameInput.focus(); }
  });

  // ── Initial render ────────────────────────────────────────────────────────
  render();
}

// ─── Location prompt ──────────────────────────────────────────────────────────

/**
 * Render the GPS prompt / denied message into `el`.
 *
 * @param {HTMLElement} el
 * @param {boolean}     denied
 * @param {Function}    onDenied
 * @returns {void}
 */
function _renderLocationPrompt(el, denied, onDenied) {
  el.innerHTML = '';

  const { userLocation } = getState();
  if (userLocation) return;

  if (denied) {
    const msg       = document.createElement('p');
    msg.className   = 'campus-location-denied';
    msg.textContent = 'Location blocked — select your campus below.';
    el.appendChild(msg);
    return;
  }

  const btn       = document.createElement('button');
  btn.type        = 'button';
  btn.className   = 'campus-location-prompt';
  btn.innerHTML   = `${iconSvg(Navigation, 12)} Use my location`;

  btn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) { onDenied(true); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => dispatch('SET_USER_LOCATION', { lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()    => onDenied(true),
    );
  });

  el.appendChild(btn);
}

// ─── Chip row renderer ────────────────────────────────────────────────────────

/**
 * Rebuild the chip row from current store state.
 *
 * @param {HTMLElement} chipRow
 * @param {string}      query   - live search query
 * @returns {void}
 */
function _renderChips(chipRow, query) {
  chipRow.innerHTML = '';

  const { campuses, selectedCampusId, viewMode, userLocation } = getState();

  if (!campuses.length) {
    const msg       = document.createElement('span');
    msg.className   = 'campus-chips-loading';
    msg.textContent = 'Loading campuses…';
    chipRow.appendChild(msg);
    return;
  }

  const needle  = query.trim().toLowerCase();
  const isCity  = viewMode === 'city';

  const filtered = needle
    ? campuses.filter(c =>
        c.name.toLowerCase().includes(needle) ||
        (c.city && c.city.toLowerCase().includes(needle)))
    : campuses.slice();

  if (userLocation) {
    filtered.sort((a, b) => _haversine(userLocation, a) - _haversine(userLocation, b));
  }

  for (const campus of filtered) {
    const isSelected = campus.id === selectedCampusId;
    const isNearest  = !!userLocation && _isNearest(campus, userLocation);

    const chip       = document.createElement('button');
    chip.type        = 'button';
    chip.className   = `chip ${isSelected ? 'chip-active' : ''}`;
    chip.setAttribute('aria-pressed', String(isSelected));
    chip.dataset.campusId = campus.id;

    if (isCity) chip.classList.add('campus-chip--disabled');

    chip.textContent = campus.name;

    if (isNearest) {
      const dot       = document.createElement('span');
      dot.className   = 'campus-chip__near-dot';
      dot.title       = 'Nearest campus';
      chip.appendChild(dot);
    }

    chip.addEventListener('click', () => {
      if (isCity) return;
      dispatch('CAMPUS_SELECTED', { campusId: campus.id });
      dispatch('SET_FILTERS',     { nearBuilding: null });
    });

    chipRow.appendChild(chip);
  }
}

// ─── Inline add form ──────────────────────────────────────────────────────────

/**
 * Build the inline "add campus" form.
 *
 * @param {HTMLElement}      chipRow
 * @param {HTMLElement}      addLink
 * @param {HTMLInputElement} searchInput
 * @returns {HTMLElement}
 */
function _buildAddForm(chipRow, addLink, searchInput) {
  const wrap       = document.createElement('div');
  wrap.className   = 'campus-selector__add-form';

  const nameInput       = document.createElement('input');
  nameInput.type        = 'text';
  nameInput.className   = 'campus-selector__add-input';
  nameInput.placeholder = 'Campus name';
  nameInput.maxLength   = 120;
  nameInput.setAttribute('aria-label', 'New campus name');

  const btnRow       = document.createElement('div');
  btnRow.className   = 'campus-selector__add-actions';

  const addBtn       = document.createElement('button');
  addBtn.type        = 'button';
  addBtn.className   = 'btn btn-primary btn-sm';
  addBtn.textContent = 'Add';

  const cancelBtn       = document.createElement('button');
  cancelBtn.type        = 'button';
  cancelBtn.className   = 'btn btn-ghost btn-sm';
  cancelBtn.textContent = 'Cancel';

  btnRow.appendChild(addBtn);
  btnRow.appendChild(cancelBtn);
  wrap.appendChild(nameInput);
  wrap.appendChild(btnRow);

  const hide = () => {
    wrap.hidden        = true;
    chipRow.hidden     = false;
    addLink.hidden     = false;
    const { campuses } = getState();
    searchInput.hidden = campuses.length <= SEARCH_THRESHOLD;
    nameInput.value    = '';
  };

  const submit = () => {
    const campusName = nameInput.value.trim();
    if (!campusName) { nameInput.focus(); return; }
    emit(EVENTS.UI_CAMPUS_ADD_REQUESTED, { campusName });
    hide();
  };

  addBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', hide);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  submit();
    if (e.key === 'Escape') hide();
  });

  return wrap;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Haversine great-circle distance between a user location and a campus centre.
 * Returns distance in metres.
 *
 * @param {{lat:number,lng:number}} userLocation
 * @param {{lat:number,lng:number}} campus
 * @returns {number}
 */
function _haversine(userLocation, campus) {
  if (!userLocation || campus.lat == null || campus.lng == null) return Infinity;

  const R  = EARTH_RADIUS_M;
  const φ1 = userLocation.lat * Math.PI / 180;
  const φ2 = campus.lat       * Math.PI / 180;
  const Δφ = (campus.lat - userLocation.lat) * Math.PI / 180;
  const Δλ = (campus.lng - userLocation.lng) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns true if `campus` is the nearest campus to `userLocation`.
 *
 * @param {object}                  campus
 * @param {{lat:number,lng:number}} userLocation
 * @returns {boolean}
 */
function _isNearest(campus, userLocation) {
  const { campuses } = getState();
  if (!campuses.length) return false;
  const nearest = campuses.reduce((best, c) =>
    _haversine(userLocation, c) < _haversine(userLocation, best) ? c : best
  );
  return nearest.id === campus.id;
}
