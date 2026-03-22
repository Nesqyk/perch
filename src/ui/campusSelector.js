/**
 * src/ui/campusSelector.js
 *
 * Renders the campus picker as a single trigger button that opens a
 * full modal dialog with a searchable list of campuses. Using a modal
 * gives more vertical room for long campus lists and avoids the
 * complexity of positioning a fixed popover relative to the trigger.
 *
 * Trigger renders the selected campus name (or placeholder) with a
 * chevron. In city mode the trigger is muted and cannot be clicked.
 *
 * Modal contents:
 *   • Optional GPS "Use my location" row (hidden once location is known).
 *   • Search input that filters the list in real time.
 *   • Scrollable listbox of campuses, sorted by proximity when location
 *     is available, alphabetical otherwise.
 *   • "Add campus" inline form at the bottom.
 *
 * Preserved from the original implementation:
 *   • Haversine nearest-campus detection (_haversine, _isNearest).
 *   • GPS prompt / denied message.
 *   • Inline "Add campus" flow.
 *   • CAMPUSES_LOADED / CAMPUS_SELECTED / SPOTS_LOADED event re-render hooks.
 *
 * @module campusSelector
 */

import { Navigation, Plus, Check, ChevronRight, X } from 'lucide';

import { on, emit, EVENTS }              from '../core/events.js';
import { getState, dispatch }            from '../core/store.js';
import { iconSvg }                       from './icons.js';
import { openModalWithElement, closeModal } from './modal.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Earth radius used for haversine distance (metres). */
const EARTH_RADIUS_M = 6371e3;

// ─── Initialise ───────────────────────────────────────────────────────────────

/**
 * Initialises the campus selector inside `container`.
 * Replaces the container's content with the trigger button.
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
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  container.appendChild(trigger);

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
          : `<span class="campus-trigger__placeholder">Select campus…</span>`
        }
      </span>
      <span class="campus-trigger__chevron">${iconSvg(ChevronRight, 14)}</span>
    `;
  };

  const buildModalContent = () => {
    const wrap = document.createElement('div');
    wrap.className = 'campus-modal';

    // ── Header: title + X close button ───────────────────────────────────
    const header     = document.createElement('div');
    header.className = 'campus-modal__header';

    const title     = document.createElement('span');
    title.className = 'campus-modal__title';
    title.textContent = 'Choose campus';
    header.appendChild(title);

    const closeBtn     = document.createElement('button');
    closeBtn.type      = 'button';
    closeBtn.className = 'campus-modal__close';
    closeBtn.setAttribute('aria-label', 'Close campus picker');
    closeBtn.innerHTML = iconSvg(X, 16);
    closeBtn.addEventListener('click', close);
    header.appendChild(closeBtn);

    wrap.appendChild(header);

    // ── Search input ──────────────────────────────────────────────────────
    const searchWrap = document.createElement('div');
    searchWrap.className = 'campus-modal__search-wrap';

    const searchInput       = document.createElement('input');
    searchInput.type        = 'search';
    searchInput.className   = 'campus-modal__search';
    searchInput.placeholder = 'Search universities…';
    searchInput.value       = _searchQuery;
    searchInput.setAttribute('aria-label', 'Search campuses');
    searchInput.addEventListener('input', () => {
      _searchQuery = searchInput.value;
      _showAddForm = false;
      renderList();
    });
    searchWrap.appendChild(searchInput);
    wrap.appendChild(searchWrap);

    // ── GPS prompt (below search — optional sugar) ────────────────────────
    const { userLocation } = getState();
    if (!userLocation) {
      const gpsRow = document.createElement('div');
      gpsRow.className = 'campus-modal__gps';

      if (_locationDenied) {
        const msg       = document.createElement('span');
        msg.className   = 'campus-modal__gps-denied';
        msg.textContent = 'Location blocked — select manually.';
        gpsRow.appendChild(msg);
      } else {
        const gpsBtn       = document.createElement('button');
        gpsBtn.type        = 'button';
        gpsBtn.className   = 'campus-modal__gps-btn';
        gpsBtn.innerHTML   = `${iconSvg(Navigation, 12)} Use my location`;
        gpsBtn.addEventListener('click', () => {
          if (!('geolocation' in navigator)) { _locationDenied = true; refreshList(); return; }
          navigator.geolocation.getCurrentPosition(
            (pos) => dispatch('SET_USER_LOCATION', { lat: pos.coords.latitude, lng: pos.coords.longitude }),
            ()    => { _locationDenied = true; refreshList(); },
          );
        });
        gpsRow.appendChild(gpsBtn);
      }
      wrap.appendChild(gpsRow);
    }

    // ── List ──────────────────────────────────────────────────────────────
    const list = document.createElement('div');
    list.className = 'campus-modal__list';
    list.setAttribute('role', 'listbox');
    wrap.appendChild(list);

    // ── Add form (initially hidden) ───────────────────────────────────────
    const addFormWrap = document.createElement('div');
    addFormWrap.className = 'campus-modal__add-form';
    addFormWrap.hidden    = !_showAddForm;
    wrap.appendChild(addFormWrap);

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
        empty.className   = 'campus-modal__empty';
        empty.textContent = needle ? `No results for "${needle}"` : 'No campuses yet.';
        list.appendChild(empty);
      }

      for (const campus of filtered) {
        const isSelected = campus.id === selectedCampusId;
        const isNearest  = !!loc && _isNearest(campus, loc);

        const row       = document.createElement('button');
        row.type        = 'button';
        row.className   = `campus-modal__row${isSelected ? ' campus-modal__row--selected' : ''}`;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(isSelected));

        row.innerHTML = /* html */`
          <span class="campus-modal__row-body">
            <span class="campus-modal__row-name">${_escHtml(campus.name)}</span>
            ${campus.city ? `<span class="campus-modal__row-city">${_escHtml(campus.city)}</span>` : ''}
          </span>
          <span class="campus-modal__row-end">
            ${isNearest ? '<span class="campus-modal__near-dot" title="Nearest campus"></span>' : ''}
            ${isSelected ? `<span class="campus-modal__check">${iconSvg(Check, 14)}</span>` : ''}
          </span>
        `;

        row.addEventListener('click', () => {
          dispatch('CAMPUS_SELECTED', { campusId: campus.id });
          dispatch('SET_FILTERS', { nearBuilding: null });
          close();
        });

        list.appendChild(row);
      }

      // ── "Add campus" row ───────────────────────────────────────────────
      const addRow       = document.createElement('button');
      addRow.type        = 'button';
      addRow.className   = 'campus-modal__add-row';
      addRow.innerHTML   = `${iconSvg(Plus, 13)} Add campus`;
      addRow.addEventListener('click', () => {
        _showAddForm = true;
        addFormWrap.hidden = false;
        addFormWrap.innerHTML = '';
        _renderAddForm(addFormWrap, searchInput, list, close);
        list.hidden = true;
        addRow.hidden = true;
        const inp = addFormWrap.querySelector('.campus-modal__add-input');
        if (inp) { /** @type {HTMLInputElement} */ (inp).value = _searchQuery.trim(); inp.focus(); }
      });
      list.appendChild(addRow);
    };

    // Expose so GPS refresh can re-render
    /** @type {() => void} */
    wrap._renderList = renderList;

    renderList();

    requestAnimationFrame(() => searchInput.focus());

    return wrap;
  };

  // Re-render the list inside an already-open modal (e.g. after GPS resolves)
  const refreshList = () => {
    const existing = document.querySelector('.campus-modal');
    if (!existing) return;
    const newContent = buildModalContent();
    existing.replaceWith(newContent);
  };

  const open = () => {
    _isOpen      = true;
    _showAddForm = false;
    trigger.setAttribute('aria-expanded', 'true');
    openModalWithElement(buildModalContent(), {
      boxClass: 'modal-box--campus',
      onClose:  close,
    });
  };

  const close = () => {
    if (!_isOpen) return;
    _isOpen      = false;
    _searchQuery = '';
    _showAddForm = false;
    trigger.setAttribute('aria-expanded', 'false');
    closeModal();
    renderTrigger();
  };

  // ── Trigger click ─────────────────────────────────────────────────────────
  trigger.addEventListener('click', () => {
    const { viewMode } = getState();
    if (viewMode === 'city') return;
    if (_isOpen) close(); else open();
  });

  // ── Store event listeners ─────────────────────────────────────────────────
  on(EVENTS.CAMPUSES_LOADED,   () => { renderTrigger(); if (_isOpen) refreshList(); });
  on(EVENTS.CAMPUS_SELECTED,   () => { renderTrigger(); if (_isOpen) refreshList(); });
  on(EVENTS.SPOTS_LOADED,      () => { renderTrigger(); if (_isOpen) refreshList(); });
  on(EVENTS.FILTERS_CHANGED,   () => { renderTrigger(); });
  on(EVENTS.LOCATION_SET,      () => { renderTrigger(); if (_isOpen) refreshList(); });
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
  nameInput.className   = 'campus-modal__add-input input';
  nameInput.placeholder = 'University name';
  nameInput.maxLength   = 120;
  nameInput.setAttribute('aria-label', 'New campus name');

  const btnRow       = document.createElement('div');
  btnRow.className   = 'campus-modal__add-actions';

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
    const addRow = /** @type {HTMLElement|null} */ (list.querySelector('.campus-modal__add-row'));
    if (addRow) addRow.hidden = false;
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
