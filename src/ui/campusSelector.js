/**
 * src/ui/campusSelector.js
 *
 * Renders the campus picker as a horizontally-scrollable row of cards.
 * Replaces the old <select> dropdown with a richer widget that shows:
 *   • Spot count, live claim count, and live unique claimant count per campus
 *   • A mini occupancy bar (live claims / total spots)
 *   • Import-status badges for campuses that are still Importing or Needs Review
 *   • A "Near you" pill on the closest campus when user location is available
 *
 * GPS detection:
 *   1. If userLocation is already in the store, the nearest campus is sorted
 *      first and gets a "Near you" badge.
 *   2. If no location is known, a subtle prompt button is shown above the row.
 *      Clicking it calls navigator.geolocation.getCurrentPosition and dispatches
 *      SET_USER_LOCATION on success.
 *   3. If the user denies location, the prompt is replaced with a static note.
 *
 * City-mode: all cards are rendered in a disabled/muted state when
 * viewMode === 'city', matching the old <select disabled> behaviour.
 *
 * The "＋ Add your campus" action lives as the last card in the row. When the
 * search input is active and contains a query, the card label updates to
 * "＋ Add «query» as a new campus". Clicking it opens an inline add form that
 * emits UI_CAMPUS_ADD_REQUESTED (handled by features/campus.js).
 *
 * @module campusSelector
 */

import { Users, Bookmark, Plus, Navigation } from 'lucide';

import { on, emit, EVENTS }   from '../core/events.js';
import { getState, dispatch }  from '../core/store.js';
import { campusStats }         from '../state/spotState.js';
import { iconSvg }             from './icons.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Show search input when there are more campuses than this. */
const SEARCH_THRESHOLD = 5;

/** Earth radius used for haversine distance (metres). */
const EARTH_RADIUS_M = 6371e3;

// ─── Initialise ───────────────────────────────────────────────────────────────

/**
 * Initialises the campus selector card row.
 * Replaces the content of `container` with the card-based picker.
 *
 * @param {HTMLElement} container
 * @returns {void}
 */
export function initCampusSelector(container) {
  if (!container) return;
  container.className = 'campus-selector-container';

  // Module-level state for the inline add-form query.
  let _searchQuery = '';
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

  // ── Card row ──────────────────────────────────────────────────────────────
  const cardRow = document.createElement('div');
  cardRow.className = 'campus-card-row';
  container.appendChild(cardRow);

  // ── Inline add form (hidden by default) ──────────────────────────────────
  const addForm = _buildAddForm(cardRow, searchInput);
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
    _renderCards(cardRow, _searchQuery, addForm, searchInput);
  };

  // ── Event listeners ───────────────────────────────────────────────────────

  on(EVENTS.CAMPUSES_LOADED,  render);
  on(EVENTS.CAMPUS_SELECTED,  render);
  on(EVENTS.SPOTS_LOADED,     render);
  on(EVENTS.FILTERS_CHANGED,  render);
  on(EVENTS.LOCATION_SET,     render);
  on(EVENTS.VIEW_MODE_CHANGED, render);

  searchInput.addEventListener('input', () => {
    _searchQuery = searchInput.value;
    render();
  });

  // ── Initial render (campuses may already be in store) ─────────────────────
  render();
}

// ─── Location prompt ──────────────────────────────────────────────────────────

/**
 * Render the GPS prompt / denied message into `el`.
 * Clears and rebuilds on every call so it stays in sync with state.
 *
 * @param {HTMLElement} el
 * @param {boolean}     denied      - true after the user has blocked geolocation
 * @param {Function}    onDenied    - callback({ denied: true }) when permission is blocked
 */
function _renderLocationPrompt(el, denied, onDenied) {
  el.innerHTML = '';

  const { userLocation } = getState();

  // Location already known — no prompt needed.
  if (userLocation) return;

  if (denied) {
    const msg = document.createElement('p');
    msg.className   = 'campus-location-denied';
    msg.textContent = 'Location blocked — scroll to find your campus.';
    el.appendChild(msg);
    return;
  }

  const btn = document.createElement('button');
  btn.type      = 'button';
  btn.className = 'campus-location-prompt';
  btn.innerHTML = `${iconSvg(Navigation, 14)} Find my campus automatically`;

  btn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      onDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        dispatch('SET_USER_LOCATION', { lat: pos.coords.latitude, lng: pos.coords.longitude });
        // render() is triggered by the LOCATION_SET event listener.
      },
      () => onDenied(true),
    );
  });

  el.appendChild(btn);
}

// ─── Card row renderer ────────────────────────────────────────────────────────

/**
 * Rebuild the card row from current store state.
 *
 * @param {HTMLElement}      cardRow
 * @param {string}           query       - live search query
 * @param {HTMLElement}      addForm     - the inline add form element
 * @param {HTMLInputElement} searchInput
 */
function _renderCards(cardRow, query, addForm, searchInput) {
  cardRow.innerHTML = '';

  const { campuses, selectedCampusId, spots, claims, viewMode, userLocation } = getState();

  if (!campuses.length) {
    const msg = document.createElement('div');
    msg.className   = 'campus-card-row--loading';
    msg.textContent = 'Loading campuses…';
    cardRow.appendChild(msg);
    return;
  }

  const stats   = campusStats(campuses, spots, claims);
  const needle  = query.trim().toLowerCase();
  const isCity  = viewMode === 'city';

  // Filter by search query.
  const filtered = needle
    ? campuses.filter(c => c.name.toLowerCase().includes(needle) ||
                           (c.city && c.city.toLowerCase().includes(needle)))
    : campuses.slice();

  // Sort: nearest campus first when location is known.
  if (userLocation) {
    filtered.sort((a, b) =>
      _haversine(userLocation, a) - _haversine(userLocation, b)
    );
  }

  for (const campus of filtered) {
    const card = _buildCampusCard(campus, stats.get(campus.id), selectedCampusId, isCity, userLocation);
    cardRow.appendChild(card);
  }

  // "Add campus" card — always last.
  const addCard = _buildAddCard(query, addForm, searchInput, cardRow);
  if (isCity) addCard.classList.add('campus-card--disabled');
  cardRow.appendChild(addCard);
}

// ─── Campus card ──────────────────────────────────────────────────────────────

/**
 * Build a single campus card element.
 *
 * @param {object}  campus
 * @param {{ spotCount: number, liveClaimCount: number, liveClaimantCount: number }} stat
 * @param {string|null} selectedCampusId
 * @param {boolean}     isCity
 * @param {{lat:number,lng:number}|null} userLocation
 * @returns {HTMLButtonElement}
 */
function _buildCampusCard(campus, stat, selectedCampusId, isCity, userLocation) {
  const isSelected = campus.id === selectedCampusId;
  const isNearest  = !!userLocation && _isNearest(campus, userLocation);

  const card = document.createElement('button');
  card.type      = 'button';
  card.className = 'campus-card';
  card.setAttribute('aria-pressed', String(isSelected));
  card.dataset.campusId = campus.id;

  if (isSelected) card.classList.add('campus-card--selected');
  if (isCity)     card.classList.add('campus-card--disabled');

  const s = stat ?? { spotCount: 0, liveClaimCount: 0, liveClaimantCount: 0 };

  // Occupancy fraction (clamped 0–1), only meaningful when there are spots.
  const occupancyFraction = s.spotCount > 0
    ? Math.min(1, s.liveClaimCount / s.spotCount)
    : 0;
  const occupancyPct = Math.round(occupancyFraction * 100);

  card.innerHTML = /* html */`
    ${isNearest
      ? `<span class="campus-card__near-badge">${iconSvg(Navigation, 10)} Near you</span>`
      : ''}
    ${_statusBadgeHtml(campus)}
    <span class="campus-card__name">${_escHtml(campus.name)}</span>
    ${campus.city
      ? `<span class="campus-card__city">${_escHtml(campus.city)}</span>`
      : ''}
    <div class="campus-card__stats">
      <span class="campus-card__stat">
        ${iconSvg(Bookmark, 12)}
        ${s.spotCount} ${s.spotCount === 1 ? 'spot' : 'spots'}
      </span>
      <span class="campus-card__stat">
        ${iconSvg(Users, 12)}
        ${s.liveClaimantCount} active now
      </span>
      ${s.spotCount > 0 ? /* html */`
        <div class="campus-card__occupancy" title="${occupancyPct}% occupied">
          <div class="campus-card__occupancy-bar" style="width:${occupancyPct}%"></div>
        </div>
      ` : ''}
    </div>
  `;

  card.addEventListener('click', () => {
    if (isCity) return;
    dispatch('CAMPUS_SELECTED',  { campusId: campus.id });
    dispatch('SET_FILTERS',      { nearBuilding: null });
  });

  return card;
}

// ─── "Add campus" card ────────────────────────────────────────────────────────

/**
 * Build the "＋ Add your campus" card that opens the inline add form.
 *
 * @param {string}           query
 * @param {HTMLElement}      addForm
 * @param {HTMLInputElement} searchInput
 * @param {HTMLElement}      cardRow
 * @returns {HTMLButtonElement}
 */
function _buildAddCard(query, addForm, searchInput, cardRow) {
  const needle = query.trim();
  const label  = needle
    ? `Add "${needle}" as a new campus`
    : 'Add your campus';

  const card = document.createElement('button');
  card.type      = 'button';
  card.className = 'campus-card campus-card--add';
  card.innerHTML = /* html */`
    ${iconSvg(Plus, 16)}
    <span class="campus-card__add-label">${_escHtml(label)}</span>
  `;

  card.addEventListener('click', () => {
    const nameInput = addForm.querySelector('.campus-selector__add-input');
    if (nameInput) nameInput.value = needle;
    cardRow.hidden = true;
    searchInput.hidden = true;
    addForm.hidden = false;
    nameInput?.focus();
  });

  return card;
}

// ─── Inline add form ─────────────────────────────────────────────────────────

/**
 * Build the inline "add campus" form.
 *
 * @param {HTMLElement}      cardRow
 * @param {HTMLInputElement} searchInput
 * @returns {HTMLElement}
 */
function _buildAddForm(cardRow, searchInput) {
  const wrap = document.createElement('div');
  wrap.className = 'campus-selector__add-form';

  const nameInput       = document.createElement('input');
  nameInput.type        = 'text';
  nameInput.className   = 'campus-selector__add-input';
  nameInput.placeholder = 'Campus name';
  nameInput.maxLength   = 120;
  nameInput.setAttribute('aria-label', 'New campus name');

  const btnRow = document.createElement('div');
  btnRow.className = 'campus-selector__add-actions';

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
    cardRow.hidden     = false;
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
 * Used to add the "Near you" badge to only the closest card.
 *
 * @param {object}              campus
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

/**
 * Build the import-status badge HTML for a campus card.
 * Returns an empty string for campuses with `bootstrap_status === 'ready'`.
 *
 * @param {object} campus
 * @returns {string}
 */
function _statusBadgeHtml(campus) {
  if (campus.bootstrap_status === 'pending') {
    return `<span class="campus-card__status-badge campus-card__status-badge--pending">Importing…</span>`;
  }
  if (campus.bootstrap_status === 'needs_review') {
    return `<span class="campus-card__status-badge campus-card__status-badge--needs-review">Needs review</span>`;
  }
  return '';
}

/**
 * Minimal HTML-escape for user-supplied strings rendered inside innerHTML.
 *
 * @param {string} str
 * @returns {string}
 */
function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
