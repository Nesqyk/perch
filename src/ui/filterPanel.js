/**
 * src/ui/filterPanel.js
 *
 * Renders and manages the filter form: group size chips, needs chips,
 * and the "Near building" dropdown.
 *
 * This module owns the rendering of the filter UI inside #panel-content.
 * It emits EVENTS.UI_FILTER_SUBMITTED when the user taps "Find My Spot"
 * and listens for EVENTS.FILTERS_CHANGED to keep the UI in sync if filters
 * are programmatically updated (e.g. restored from URL params).
 */

import { on, emit, EVENTS }   from '../core/events.js';
import { getState, dispatch }  from '../core/store.js';
import { GROUP_SIZE_CONFIG }   from '../utils/capacity.js';

// ─── Initialise ──────────────────────────────────────────────────────────────

export function initFilterPanel() {
  on(EVENTS.FILTERS_CHANGED, _syncFromState);
  on(EVENTS.SPOTS_LOADED,    _populateBuildingDropdown);
}

// ─── Render ──────────────────────────────────────────────────────────────────

/**
 * Render the complete filter form into a given container element.
 * Called by sidebar.js and bottomSheet.js — they each pass their own container.
 *
 * @param {HTMLElement} container
 */
export function renderFilterPanel(container) {
  container.innerHTML = '';
  container.appendChild(_buildFilterForm());
}

function _buildFilterForm() {
  const form       = document.createElement('div');
  form.className   = 'filter-form';

  form.appendChild(_buildSectionHeader('How many?'));
  form.appendChild(_buildGroupSizeChips());

  form.appendChild(_buildSectionHeader('I need:'));
  form.appendChild(_buildNeedsChips());

  form.appendChild(_buildSectionHeader('Near:'));
  form.appendChild(_buildBuildingDropdown());

  form.appendChild(_buildFindButton());
  form.appendChild(_buildSuggestButton());

  return form;
}

function _buildSectionHeader(text) {
  const h        = document.createElement('p');
  h.className    = 'filter-label';
  h.textContent  = text;
  return h;
}

function _buildGroupSizeChips() {
  const row      = document.createElement('div');
  row.className  = 'chip-row';
  row.id         = 'chips-group-size';

  const { filters } = getState();

  Object.values(GROUP_SIZE_CONFIG).forEach(({ key, label }) => {
    const chip        = document.createElement('button');
    chip.type         = 'button';
    chip.className    = `chip ${filters.groupSize === key ? 'chip-active' : ''}`;
    chip.dataset.key  = key;
    chip.textContent  = label;
    chip.setAttribute('aria-pressed', String(filters.groupSize === key));

    chip.addEventListener('click', () => {
      const isActive = chip.classList.contains('chip-active');
      dispatch('SET_FILTERS', { groupSize: isActive ? null : key });
    });

    row.appendChild(chip);
  });

  return row;
}

function _buildNeedsChips() {
  const row      = document.createElement('div');
  row.className  = 'chip-row';
  row.id         = 'chips-needs';

  const needs = [
    { key: 'outlet', icon: '⚡', label: 'Outlet' },
    { key: 'wifi',   icon: '📶', label: 'WiFi'   },
    { key: 'quiet',  icon: '🔇', label: 'Quiet'  },
    { key: 'food',   icon: '🍔', label: 'Food'   },
  ];

  const { filters } = getState();

  needs.forEach(({ key, icon, label }) => {
    const chip        = document.createElement('button');
    chip.type         = 'button';
    chip.className    = `chip chip-icon ${filters.needs.includes(key) ? 'chip-active' : ''}`;
    chip.dataset.key  = key;
    chip.setAttribute('aria-label', label);
    chip.setAttribute('aria-pressed', String(filters.needs.includes(key)));
    chip.textContent  = icon;

    chip.addEventListener('click', () => {
      const current = getState().filters.needs;
      const next    = current.includes(key)
        ? current.filter(n => n !== key)
        : [...current, key];
      dispatch('SET_FILTERS', { needs: next });
    });

    row.appendChild(chip);
  });

  return row;
}

function _buildBuildingDropdown() {
  const select       = document.createElement('select');
  select.className   = 'select';
  select.id          = 'filter-building';

  const defaultOpt       = document.createElement('option');
  defaultOpt.value       = '';
  defaultOpt.textContent = 'Anywhere on campus';
  select.appendChild(defaultOpt);

  // Options populated by _populateBuildingDropdown() once spots are loaded.

  select.addEventListener('change', () => {
    dispatch('SET_FILTERS', { nearBuilding: select.value || null });
  });

  return select;
}

function _buildFindButton() {
  const btn       = document.createElement('button');
  btn.type        = 'button';
  btn.className   = 'btn btn-primary btn-full';
  btn.id          = 'btn-find';
  btn.textContent = 'Find My Spot';

  btn.addEventListener('click', () => {
    emit(EVENTS.UI_FILTER_SUBMITTED, { filters: getState().filters });
  });

  return btn;
}

function _buildSuggestButton() {
  const btn       = document.createElement('button');
  btn.type        = 'button';
  btn.className   = 'btn btn-ghost btn-full';
  btn.id          = 'btn-suggest';
  btn.textContent = '+ Suggest a Spot';

  btn.addEventListener('click', () => {
    emit(EVENTS.UI_SUGGEST_OPENED, {});
  });

  return btn;
}

// ─── Sync helpers ─────────────────────────────────────────────────────────────

/**
 * Re-render chip active states when filters change via dispatch.
 * Keeps the chips in sync when URL params pre-fill filters on load.
 */
function _syncFromState() {
  const { filters } = getState();

  // Group size chips.
  document.querySelectorAll('#chips-group-size .chip').forEach(chip => {
    const active = chip.dataset.key === filters.groupSize;
    chip.classList.toggle('chip-active', active);
    chip.setAttribute('aria-pressed', String(active));
  });

  // Needs chips.
  document.querySelectorAll('#chips-needs .chip').forEach(chip => {
    const active = filters.needs.includes(chip.dataset.key);
    chip.classList.toggle('chip-active', active);
    chip.setAttribute('aria-pressed', String(active));
  });

  // Building dropdown.
  const sel = document.getElementById('filter-building');
  if (sel) sel.value = filters.nearBuilding ?? '';
}

/**
 * Populate the building dropdown with unique building names from loaded spots.
 */
function _populateBuildingDropdown() {
  const sel = document.getElementById('filter-building');
  if (!sel) return;

  const { spots } = getState();
  const buildings = [...new Set(
    spots
      .filter(s => s.on_campus && s.building)
      .map(s => s.building)
  )].sort();

  // Remove all options except the first (default).
  while (sel.options.length > 1) sel.remove(1);

  buildings.forEach(building => {
    const opt       = document.createElement('option');
    opt.value       = building;
    opt.textContent = building;
    sel.appendChild(opt);
  });
}
