/**
 * src/ui/filterPanel.js
 *
 * Renders and manages the filter form: group size chips, amenity chips,
 * the "Near building" dropdown, the "Find My Spot" button, and the
 * inline "Create a Group" / "Join a Group" section.
 *
 * This module owns the rendering of the filter UI inside #panel-content.
 * It emits EVENTS.UI_FILTER_SUBMITTED when the user taps "Find My Spot",
 * EVENTS.UI_GROUP_CREATE when the user submits the create form, and
 * EVENTS.UI_GROUP_JOIN when the user submits the join form.
 * It listens for EVENTS.FILTERS_CHANGED to keep the UI in sync if filters
 * are programmatically updated (e.g. restored from URL params).
 */

import { on, emit, EVENTS }   from '../core/events.js';
import { getState, dispatch }  from '../core/store.js';
import { GROUP_SIZE_CONFIG }   from '../utils/capacity.js';

// ─── Chip display labels (shorter than GROUP_SIZE_CONFIG labels) ──────────────

const _GROUP_SIZE_LABELS = {
  solo:   'Just Me',
  small:  '2-5',
  medium: '6-15',
  large:  '15+',
};

// ─── Amenity chip definitions ─────────────────────────────────────────────────

const _AMENITY_CHIPS = [
  { key: 'quiet',  icon: '🔇', label: 'Quiet'   },
  { key: 'outlet', icon: '⚡', label: 'Outlets'  },
  { key: 'wifi',   icon: '📶', label: 'WiFi'     },
  { key: 'food',   icon: '🍔', label: 'Food'     },
];

// ─── Group colour swatches (matches mockup: blue, red, green, orange, purple) ─

const _GROUP_SWATCHES = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f97316', // orange
  '#a855f7', // purple
];

// ─── Module state ─────────────────────────────────────────────────────────────

/** @type {string} Currently selected colour swatch in the create form. */
let _selectedColor = _GROUP_SWATCHES[0];

/** @type {'create' | 'join' | null} Which sub-form is expanded. */
let _groupSubForm = 'create';

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
  const form      = document.createElement('div');
  form.className  = 'filter-form';

  form.appendChild(_buildSectionHeader('Group Size'));
  form.appendChild(_buildGroupSizeChips());

  form.appendChild(_buildSectionHeader('Amenities:'));
  form.appendChild(_buildAmenityChips());

  form.appendChild(_buildSectionHeader('Near:'));
  form.appendChild(_buildBuildingDropdown());

  form.appendChild(_buildFindButton());

  form.appendChild(_buildGroupCreateSection());

  return form;
}

function _buildSectionHeader(text) {
  const h       = document.createElement('p');
  h.className   = 'filter-label';
  h.textContent = text;
  return h;
}

function _buildGroupSizeChips() {
  const row     = document.createElement('div');
  row.className = 'chip-row';
  row.id        = 'chips-group-size';

  const { filters } = getState();

  Object.values(GROUP_SIZE_CONFIG).forEach(({ key }) => {
    const chip        = document.createElement('button');
    chip.type         = 'button';
    chip.className    = `chip ${filters.groupSize === key ? 'chip-active' : ''}`;
    chip.dataset.key  = key;
    chip.textContent  = _GROUP_SIZE_LABELS[key] ?? key;
    chip.setAttribute('aria-pressed', String(filters.groupSize === key));

    chip.addEventListener('click', () => {
      const isActive = chip.classList.contains('chip-active');
      dispatch('SET_FILTERS', { groupSize: isActive ? null : key });
    });

    row.appendChild(chip);
  });

  return row;
}

function _buildAmenityChips() {
  const grid      = document.createElement('div');
  grid.className  = 'amenity-chip-grid';
  grid.id         = 'chips-needs';

  const { filters } = getState();

  _AMENITY_CHIPS.forEach(({ key, icon, label }) => {
    const chip        = document.createElement('button');
    chip.type         = 'button';
    chip.className    = `amenity-chip ${filters.needs.includes(key) ? 'amenity-chip--active' : ''}`;
    chip.dataset.key  = key;
    chip.setAttribute('aria-label', label);
    chip.setAttribute('aria-pressed', String(filters.needs.includes(key)));
    chip.innerHTML    = /* html */`<span class="amenity-chip__icon">${icon}</span><span class="amenity-chip__label">${label}</span>`;

    chip.addEventListener('click', () => {
      const current = getState().filters.needs;
      const next    = current.includes(key)
        ? current.filter(n => n !== key)
        : [...current, key];
      dispatch('SET_FILTERS', { needs: next });
    });

    grid.appendChild(chip);
  });

  return grid;
}

function _buildBuildingDropdown() {
  const select     = document.createElement('select');
  select.className = 'select';
  select.id        = 'filter-building';

  const defaultOpt       = document.createElement('option');
  defaultOpt.value       = '';
  defaultOpt.textContent = 'Main Building';
  select.appendChild(defaultOpt);

  // Options populated by _populateBuildingDropdown() once spots are loaded.

  select.addEventListener('change', () => {
    dispatch('SET_FILTERS', { nearBuilding: select.value || null });
  });

  return select;
}

function _buildFindButton() {
  const btn     = document.createElement('button');
  btn.type      = 'button';
  btn.className = 'btn btn-primary btn-full';
  btn.id        = 'btn-find';
  btn.innerHTML = /* html */`<span class="btn-find-icon">🔍</span> Find My Spot`;

  btn.addEventListener('click', () => {
    emit(EVENTS.UI_FILTER_SUBMITTED, { filters: getState().filters });
  });

  return btn;
}

// ─── Inline group create / join section ──────────────────────────────────────

function _buildGroupCreateSection() {
  const section     = document.createElement('div');
  section.className = 'group-create-section';
  section.id        = 'group-create-section';

  const heading     = document.createElement('p');
  heading.className = 'group-create-heading';
  heading.textContent = 'Create a Group';
  section.appendChild(heading);

  // Show create form by default, or join form if toggled.
  if (_groupSubForm === 'join') {
    section.appendChild(_buildJoinForm(section));
  } else {
    section.appendChild(_buildCreateForm(section));
  }

  return section;
}

function _buildCreateForm(section) {
  const form      = document.createElement('div');
  form.className  = 'group-create-form';

  // Group Name input
  const nameLabel     = document.createElement('label');
  nameLabel.className = 'group-create-label';
  nameLabel.textContent = 'Group Name:';
  nameLabel.htmlFor   = 'input-group-name';
  form.appendChild(nameLabel);

  const nameInput     = document.createElement('input');
  nameInput.type      = 'text';
  nameInput.id        = 'input-group-name';
  nameInput.className = 'input';
  nameInput.placeholder = '';
  nameInput.maxLength = 40;
  form.appendChild(nameInput);

  // Color swatches
  const colorLabel     = document.createElement('label');
  colorLabel.className = 'group-create-label';
  colorLabel.textContent = 'Color:';
  form.appendChild(colorLabel);

  const swatches     = document.createElement('div');
  swatches.className = 'group-color-swatches';

  _GROUP_SWATCHES.forEach(hex => {
    const swatch        = document.createElement('button');
    swatch.type         = 'button';
    swatch.className    = `color-swatch ${_selectedColor === hex ? 'color-swatch--active' : ''}`;
    swatch.style.background = hex;
    swatch.setAttribute('aria-label', `Color ${hex}`);
    swatch.dataset.color = hex;

    swatch.addEventListener('click', () => {
      _selectedColor = hex;
      swatches.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.toggle('color-swatch--active', s.dataset.color === hex);
      });
    });

    swatches.appendChild(swatch);
  });

  form.appendChild(swatches);

  // Buttons
  const btnRow      = document.createElement('div');
  btnRow.className  = 'group-create-btn-row';

  const createBtn     = document.createElement('button');
  createBtn.type      = 'button';
  createBtn.className = 'btn btn-primary';
  createBtn.textContent = 'Create';

  createBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    emit(EVENTS.UI_GROUP_CREATE, {
      name,
      displayName: name,
      context: 'campus',
    });
  });

  const cancelBtn     = document.createElement('button');
  cancelBtn.type      = 'button';
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = 'Cancel';

  cancelBtn.addEventListener('click', () => {
    nameInput.value = '';
  });

  btnRow.appendChild(createBtn);
  btnRow.appendChild(cancelBtn);
  form.appendChild(btnRow);

  // "Already have a group to join?" link
  const joinLink     = document.createElement('p');
  joinLink.className = 'group-join-link';
  joinLink.innerHTML = /* html */`Already have group to <a href="#" id="link-show-join">join?</a>`;

  joinLink.querySelector('#link-show-join').addEventListener('click', (e) => {
    e.preventDefault();
    _groupSubForm = 'join';
    const parent = section.querySelector('.group-create-form');
    const heading = section.querySelector('.group-create-heading');
    heading.textContent = 'Join a Group';
    parent.replaceWith(_buildJoinForm(section));
  });

  form.appendChild(joinLink);

  return form;
}

function _buildJoinForm(section) {
  const form      = document.createElement('div');
  form.className  = 'group-create-form';

  const codeLabel     = document.createElement('label');
  codeLabel.className = 'group-create-label';
  codeLabel.textContent = 'Group Code:';
  codeLabel.htmlFor   = 'input-group-code';
  form.appendChild(codeLabel);

  const codeInput     = document.createElement('input');
  codeInput.type      = 'text';
  codeInput.id        = 'input-group-code';
  codeInput.className = 'input';
  codeInput.placeholder = 'e.g. AB12';
  codeInput.maxLength = 4;
  form.appendChild(codeInput);

  const nameLabel     = document.createElement('label');
  nameLabel.className = 'group-create-label';
  nameLabel.textContent = 'Your Name:';
  nameLabel.htmlFor   = 'input-join-display-name';
  form.appendChild(nameLabel);

  const nameInput     = document.createElement('input');
  nameInput.type      = 'text';
  nameInput.id        = 'input-join-display-name';
  nameInput.className = 'input';
  nameInput.maxLength = 30;
  form.appendChild(nameInput);

  const btnRow      = document.createElement('div');
  btnRow.className  = 'group-create-btn-row';

  const joinBtn     = document.createElement('button');
  joinBtn.type      = 'button';
  joinBtn.className = 'btn btn-primary';
  joinBtn.textContent = 'Join';

  joinBtn.addEventListener('click', () => {
    const code        = codeInput.value.trim();
    const displayName = nameInput.value.trim();
    if (!code || !displayName) { codeInput.focus(); return; }
    emit(EVENTS.UI_GROUP_JOIN, { code, displayName });
  });

  const backBtn     = document.createElement('button');
  backBtn.type      = 'button';
  backBtn.className = 'btn btn-ghost';
  backBtn.textContent = 'Back';

  backBtn.addEventListener('click', () => {
    _groupSubForm = 'create';
    const parent = section.querySelector('.group-create-form');
    const heading = section.querySelector('.group-create-heading');
    heading.textContent = 'Create a Group';
    parent.replaceWith(_buildCreateForm(section));
  });

  btnRow.appendChild(joinBtn);
  btnRow.appendChild(backBtn);
  form.appendChild(btnRow);

  return form;
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

  // Amenity chips.
  document.querySelectorAll('#chips-needs .amenity-chip').forEach(chip => {
    const active = filters.needs.includes(chip.dataset.key);
    chip.classList.toggle('amenity-chip--active', active);
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
