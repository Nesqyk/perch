/**
 * src/ui/campusSelector.js
 *
 * Renders the primary campus selector dropdown.
 * Listens to MAP_READY and CAMPUSES_LOADED to populate and wire the UI.
 *
 * When the user selects a campus, dispatches CAMPUS_SELECTED to the store.
 *
 * Extra features:
 *  - Search input (visible when there are more than 5 campuses) that filters
 *    the <select> options in real-time and pre-fills the campus name for add.
 *  - "＋ Add your campus" option at the bottom of the dropdown. When selected,
 *    the <select> is replaced with an inline name input + Add / Cancel buttons.
 *    Submitting emits UI_CAMPUS_ADD_REQUESTED so features/campus.js can handle it.
 */

import { on, emit, EVENTS }      from '../core/events.js';
import { getState, dispatch }    from '../core/store.js';

/** Sentinel value for the "add campus" option. */
const ADD_SENTINEL = '__add_campus__';

/** Only show the search input above this campus count. */
const SEARCH_THRESHOLD = 5;

// ─── Initialise ──────────────────────────────────────────────────────────────

/**
 * Initializes the campus selector. Called from main.js or header.js.
 *
 * @param {HTMLElement} container
 * @returns {void}
 */
export function initCampusSelector(container) {
  if (!container) return;
  container.className = 'campus-selector-container';

  // ── Search input (hidden until CAMPUSES_LOADED resolves) ──────────────────
  const searchInput = document.createElement('input');
  searchInput.type        = 'text';
  searchInput.className   = 'input campus-selector__search';
  searchInput.placeholder = 'Search campuses…';
  searchInput.hidden      = true;
  searchInput.setAttribute('aria-label', 'Search campuses');
  container.appendChild(searchInput);

  // ── Select ────────────────────────────────────────────────────────────────
  const select = document.createElement('select');
  select.className = 'select campus-selector';
  select.id        = 'campus-selector';

  const loadingOpt = document.createElement('option');
  loadingOpt.textContent = 'Loading campuses...';
  loadingOpt.value       = '';
  loadingOpt.disabled    = true;
  loadingOpt.selected    = true;
  select.appendChild(loadingOpt);

  container.appendChild(select);

  // ── Inline add form (hidden by default) ──────────────────────────────────
  const addForm = _buildAddForm(container, select, searchInput);
  addForm.hidden = true;
  container.appendChild(addForm);

  // ── Wire events ───────────────────────────────────────────────────────────
  on(EVENTS.CAMPUSES_LOADED, () => _renderOptions(select, searchInput, ''));
  on(EVENTS.CAMPUS_SELECTED, () => _renderOptions(select, searchInput, searchInput.value));

  // Live search: filter options as the user types.
  searchInput.addEventListener('input', () => {
    _renderOptions(select, searchInput, searchInput.value);
  });

  select.addEventListener('change', (e) => {
    const value = e.target.value;
    if (!value) return;

    if (value === ADD_SENTINEL) {
      // Pre-fill the add form's input with whatever was typed in the search box.
      const nameInput = addForm.querySelector('.campus-selector__add-input');
      if (nameInput) nameInput.value = searchInput.value.trim();

      _showAddForm(select, searchInput, addForm);
      return;
    }

    dispatch('CAMPUS_SELECTED', { campusId: value });
    dispatch('SET_FILTERS', { nearBuilding: null });
  });

  // Render immediately if campuses are already in store (race-condition guard).
  const { campuses } = getState();
  if (campuses && campuses.length > 0) {
    _renderOptions(select, searchInput, '');
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────

/**
 * Populate the dropdown options, optionally filtering by a search query.
 *
 * @param {HTMLSelectElement} select
 * @param {HTMLInputElement}  searchInput
 * @param {string}            query
 */
function _renderOptions(select, searchInput, query) {
  const { campuses, selectedCampusId, viewMode } = getState();

  select.innerHTML = '';

  if (!campuses.length) {
    const emptyOpt = document.createElement('option');
    emptyOpt.textContent = 'No campuses available';
    emptyOpt.disabled    = true;
    select.appendChild(emptyOpt);
    _updateSearchVisibility(searchInput, campuses.length);
    return;
  }

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? campuses.filter((c) => c.name.toLowerCase().includes(needle))
    : campuses;

  filtered.forEach((campus) => {
    const opt       = document.createElement('option');
    opt.value       = campus.id;
    opt.textContent = _campusLabel(campus);
    if (campus.id === selectedCampusId) opt.selected = true;
    select.appendChild(opt);
  });

  // ── "＋ Add" option ───────────────────────────────────────────────────────
  const sep = document.createElement('option');
  sep.disabled    = true;
  sep.textContent = '─────────────';
  select.appendChild(sep);

  const addOpt       = document.createElement('option');
  addOpt.value       = ADD_SENTINEL;
  addOpt.textContent = needle
    ? `＋ Add "${query.trim()}" as a new campus`
    : '＋ Add your campus';
  select.appendChild(addOpt);

  // Disable in city mode.
  select.disabled = (viewMode === 'city');

  on(EVENTS.VIEW_MODE_CHANGED, (e) => {
    select.disabled = (e.detail.viewMode === 'city');
  });

  _updateSearchVisibility(searchInput, campuses.length);
}

/**
 * Show / hide the search input based on campus count.
 *
 * @param {HTMLInputElement} searchInput
 * @param {number}           count
 */
function _updateSearchVisibility(searchInput, count) {
  searchInput.hidden = count <= SEARCH_THRESHOLD;
}

// ─── Inline add form ─────────────────────────────────────────────────────────

/**
 * Build the inline "add campus" form element.
 * The form is hidden by default; _showAddForm / _hideAddForm toggle it.
 *
 * @param {HTMLElement}       container
 * @param {HTMLSelectElement} select
 * @param {HTMLInputElement}  searchInput
 * @returns {HTMLElement}
 */
function _buildAddForm(container, select, searchInput) {
  const wrap = document.createElement('div');
  wrap.className = 'campus-selector__add-form';

  const nameInput       = document.createElement('input');
  nameInput.type        = 'text';
  nameInput.className   = 'input campus-selector__add-input';
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

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = () => {
    const campusName = nameInput.value.trim();
    if (!campusName) {
      nameInput.focus();
      return;
    }
    emit(EVENTS.UI_CAMPUS_ADD_REQUESTED, { campusName });
    _hideAddForm(select, searchInput, wrap);
    nameInput.value = '';
  };

  addBtn.addEventListener('click', submit);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') {
      _hideAddForm(select, searchInput, wrap);
      nameInput.value = '';
    }
  });

  cancelBtn.addEventListener('click', () => {
    _hideAddForm(select, searchInput, wrap);
    nameInput.value = '';
  });

  return wrap;
}

/**
 * Switch to the inline add form view.
 *
 * @param {HTMLSelectElement} select
 * @param {HTMLInputElement}  searchInput
 * @param {HTMLElement}       addForm
 */
function _showAddForm(select, searchInput, addForm) {
  select.hidden      = true;
  searchInput.hidden = true;
  addForm.hidden     = false;

  const nameInput = addForm.querySelector('.campus-selector__add-input');
  nameInput?.focus();
}

/**
 * Restore the normal selector view after add / cancel.
 *
 * @param {HTMLSelectElement} select
 * @param {HTMLInputElement}  searchInput
 * @param {HTMLElement}       addForm
 */
function _hideAddForm(select, searchInput, addForm) {
  addForm.hidden  = false; // will be re-hidden
  addForm.hidden  = true;
  select.hidden   = false;

  const { campuses } = getState();
  _updateSearchVisibility(searchInput, campuses.length);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build the display label for a campus option.
 *
 * @param {object} campus
 * @returns {string}
 */
function _campusLabel(campus) {
  if (campus.bootstrap_status === 'pending') {
    return `${campus.name} (Importing…)`;
  }

  if (campus.bootstrap_status === 'needs_review') {
    return `${campus.name} (Needs review)`;
  }

  return campus.name;
}
