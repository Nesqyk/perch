/**
 * src/ui/campusSelector.js
 *
 * Renders the campus picker as a single trigger button that opens a
 * searchable popover overlay. Scales to hundreds of campuses without
 * visual clutter — the current campus is always shown in one line,
 * the full list is only surfaced on demand.
 *
 * Overlay behaviour:
 *   • Desktop  — absolutely-positioned dropdown below the trigger.
 *   • Mobile   — same, but constrained so it doesn't overflow the sheet.
 *   • Closes on: item select, Escape, or click outside the container.
 *   • In city mode the trigger is muted and the overlay cannot open.
 *
 * Preserved from the original implementation:
 *   • Haversine nearest-campus detection (_haversine, _isNearest).
 *   • GPS prompt / denied message.
 *   • Inline "Add campus" flow (now a list-row at the bottom of the overlay).
 *   • CAMPUSES_LOADED / CAMPUS_SELECTED / SPOTS_LOADED event re-render hooks.
 *
 * @module campusSelector
 */

import { Navigation, Plus, Check, ChevronDown } from 'lucide';

import { on, emit, EVENTS }  from '../core/events.js';
import { getState, dispatch } from '../core/store.js';
import { iconSvg }            from './icons.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Earth radius used for haversine distance (metres). */
const EARTH_RADIUS_M = 6371e3;

// ─── Initialise ───────────────────────────────────────────────────────────────

/**
 * Initialises the campus selector inside `container`.
 * Replaces the container's content with the trigger button and overlay.
 *
 * @param {HTMLElement} container
 * @returns {void}
 */
export function initCampusSelector(container) {
  if (!container) return;
  container.className = 'campus-selector-container';

  let _isOpen         = false;
  let _searchQuery    = '';
  let _locationDenied = false;
  let _showAddForm    = false;

  // ── Trigger button ────────────────────────────────────────────────────────
  const trigger = document.createElement('button');
  trigger.type      = 'button';
  trigger.className = 'campus-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  container.appendChild(trigger);

  // ── Overlay ───────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'campus-overlay';
  overlay.hidden    = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Select campus');
  container.appendChild(overlay);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderTrigger = () => {
    const { campuses, selectedCampusId, viewMode, userLocation } = getState();
    const selected = campuses.find(c => c.id === selectedCampusId);
    const isCity   = viewMode === 'city';

    trigger.className = `campus-trigger${isCity ? ' campus-trigger--disabled' : ''}`;
    trigger.setAttribute('aria-expanded', String(_isOpen));
    trigger.disabled = isCity;

    const isNearest = selected && !!userLocation && _isNearest(selected, userLocation);

    trigger.innerHTML = /* html */`
      <span class="campus-trigger__label">
        ${selected
          ? `<span class="campus-trigger__name">${_escHtml(selected.name)}</span>${isNearest ? '<span class="campus-trigger__near-dot" title="Nearest campus"></span>' : ''}`
          : `<span class="campus-trigger__placeholder">Select campus</span>`
        }
      </span>
      <span class="campus-trigger__chevron">${iconSvg(ChevronDown, 14)}</span>
    `;
  };

  const renderOverlay = () => {
    overlay.innerHTML = '';

    const { userLocation } = getState();

    // ── GPS prompt ──────────────────────────────────────────────────────────
    if (!userLocation) {
      const gpsRow = document.createElement('div');
      gpsRow.className = 'campus-overlay__gps';

      if (_locationDenied) {
        const msg       = document.createElement('span');
        msg.className   = 'campus-overlay__gps-denied';
        msg.textContent = 'Location blocked — select manually.';
        gpsRow.appendChild(msg);
      } else {
        const gpsBtn       = document.createElement('button');
        gpsBtn.type        = 'button';
        gpsBtn.className   = 'campus-overlay__gps-btn';
        gpsBtn.innerHTML   = `${iconSvg(Navigation, 12)} Use my location`;
        gpsBtn.addEventListener('click', () => {
          if (!('geolocation' in navigator)) { _locationDenied = true; renderOverlay(); return; }
          navigator.geolocation.getCurrentPosition(
            (pos) => dispatch('SET_USER_LOCATION', { lat: pos.coords.latitude, lng: pos.coords.longitude }),
            ()    => { _locationDenied = true; renderOverlay(); },
          );
        });
        gpsRow.appendChild(gpsBtn);
      }
      overlay.appendChild(gpsRow);
    }

    // ── Search input ────────────────────────────────────────────────────────
    const searchWrap = document.createElement('div');
    searchWrap.className = 'campus-overlay__search-wrap';

    const searchInput       = document.createElement('input');
    searchInput.type        = 'search';
    searchInput.className   = 'campus-overlay__search';
    searchInput.placeholder = 'Search universities…';
    searchInput.value       = _searchQuery;
    searchInput.setAttribute('aria-label', 'Search campuses');
    searchInput.addEventListener('input', () => {
      _searchQuery = searchInput.value;
      _showAddForm = false;
      renderList();
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    searchWrap.appendChild(searchInput);
    overlay.appendChild(searchWrap);

    // ── List ────────────────────────────────────────────────────────────────
    const list = document.createElement('div');
    list.className = 'campus-overlay__list';
    list.setAttribute('role', 'listbox');
    overlay.appendChild(list);

    // ── Add form (initially hidden) ─────────────────────────────────────────
    const addFormWrap = document.createElement('div');
    addFormWrap.className = 'campus-overlay__add-form';
    addFormWrap.hidden    = !_showAddForm;
    overlay.appendChild(addFormWrap);

    if (_showAddForm) {
      _renderAddForm(addFormWrap, searchInput, list, close);
    }

    const renderList = () => {
      list.innerHTML = '';

      const { campuses, selectedCampusId, userLocation: loc } = getState();
      const needle = _searchQuery.trim().toLowerCase();

      const _unordered = needle
        ? campuses.filter(c =>
            c.name.toLowerCase().includes(needle) ||
            (c.city && c.city.toLowerCase().includes(needle)))
        : campuses.slice();

      const filtered = loc
        ? _unordered.slice().sort((a, b) => _haversine(loc, a) - _haversine(loc, b))
        : _unordered;

      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className   = 'campus-overlay__empty';
        empty.textContent = needle ? `No results for "${needle}"` : 'No campuses yet.';
        list.appendChild(empty);
      }

      for (const campus of filtered) {
        const isSelected = campus.id === selectedCampusId;
        const isNearest  = !!loc && _isNearest(campus, loc);

        const row       = document.createElement('button');
        row.type        = 'button';
        row.className   = `campus-overlay__row${isSelected ? ' campus-overlay__row--selected' : ''}`;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(isSelected));

        row.innerHTML = /* html */`
          <span class="campus-overlay__row-body">
            <span class="campus-overlay__row-name">${_escHtml(campus.name)}</span>
            ${campus.city ? `<span class="campus-overlay__row-city">${_escHtml(campus.city)}</span>` : ''}
          </span>
          <span class="campus-overlay__row-end">
            ${isNearest ? '<span class="campus-overlay__near-dot" title="Nearest campus"></span>' : ''}
            ${isSelected ? `<span class="campus-overlay__check">${iconSvg(Check, 14)}</span>` : ''}
          </span>
        `;

        row.addEventListener('click', () => {
          dispatch('CAMPUS_SELECTED', { campusId: campus.id });
          dispatch('SET_FILTERS', { nearBuilding: null });
          close();
        });

        list.appendChild(row);
      }

      // ── "Add campus" row ─────────────────────────────────────────────────
      const addRow       = document.createElement('button');
      addRow.type        = 'button';
      addRow.className   = 'campus-overlay__add-row';
      addRow.innerHTML   = `${iconSvg(Plus, 13)} Add campus`;
      addRow.addEventListener('click', () => {
        _showAddForm = true;
        addFormWrap.hidden = false;
        addFormWrap.innerHTML = '';
        _renderAddForm(addFormWrap, searchInput, list, close);
        list.hidden = true;
        addRow.hidden = true;
        const inp = addFormWrap.querySelector('.campus-overlay__add-input');
        if (inp) { inp.value = _searchQuery.trim(); inp.focus(); }
      });
      list.appendChild(addRow);
    };

    renderList();

    // Focus the search input after paint
    requestAnimationFrame(() => searchInput.focus());
  };

  const open = () => {
    _isOpen = true;
    _showAddForm = false;
    overlay.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    renderOverlay();
  };

  const close = () => {
    _isOpen      = false;
    _searchQuery = '';
    _showAddForm = false;
    overlay.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    renderTrigger();
  };

  // ── Trigger click ─────────────────────────────────────────────────────────
  trigger.addEventListener('click', () => {
    const { viewMode } = getState();
    if (viewMode === 'city') return;
    if (_isOpen) close(); else open();
  });

  // ── Click outside ─────────────────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    if (_isOpen && !container.contains(/** @type {Node} */(e.target))) {
      close();
    }
  });

  // ── Keyboard close ────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (_isOpen && e.key === 'Escape') close();
  });

  // ── Store event listeners ─────────────────────────────────────────────────
  on(EVENTS.CAMPUSES_LOADED,   () => { renderTrigger(); if (_isOpen) renderOverlay(); });
  on(EVENTS.CAMPUS_SELECTED,   () => { renderTrigger(); if (_isOpen) renderOverlay(); });
  on(EVENTS.SPOTS_LOADED,      () => { renderTrigger(); if (_isOpen) renderOverlay(); });
  on(EVENTS.FILTERS_CHANGED,   () => { renderTrigger(); });
  on(EVENTS.LOCATION_SET,      () => { renderTrigger(); if (_isOpen) renderOverlay(); });
  on(EVENTS.VIEW_MODE_CHANGED, () => { close(); renderTrigger(); });

  // ── Initial render ────────────────────────────────────────────────────────
  renderTrigger();
}

// ─── Add campus form ──────────────────────────────────────────────────────────

/**
 * Render the inline add-campus form into `wrap`.
 *
 * @param {HTMLElement}      wrap
 * @param {HTMLInputElement} searchInput
 * @param {HTMLElement}      list
 * @param {Function}         close
 * @returns {void}
 */
function _renderAddForm(wrap, searchInput, list, close) {
  const nameInput       = document.createElement('input');
  nameInput.type        = 'text';
  nameInput.className   = 'campus-overlay__add-input input';
  nameInput.placeholder = 'University name';
  nameInput.maxLength   = 120;
  nameInput.setAttribute('aria-label', 'New campus name');

  const btnRow       = document.createElement('div');
  btnRow.className   = 'campus-overlay__add-actions';

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
    wrap.hidden   = true;
    list.hidden   = false;
    /** @type {HTMLElement|null} */ (list.querySelector('.campus-overlay__add-row')) && (
      /** @type {HTMLElement} */ (list.querySelector('.campus-overlay__add-row')).hidden = false
    );
  };

  const submit = () => {
    const campusName = nameInput.value.trim();
    if (!campusName) { nameInput.focus(); return; }
    emit(EVENTS.UI_CAMPUS_ADD_REQUESTED, { campusName });
    close();
  };

  addBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', hide);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  submit();
    if (e.key === 'Escape') hide();
  });

  requestAnimationFrame(() => nameInput.focus());
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

/**
 * Escape a string for safe insertion into innerHTML.
 *
 * @param {string} value
 * @returns {string}
 */
function _escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
