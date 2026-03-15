/**
 * src/ui/filterPanel.js
 *
 * Renders and manages the filter form: group size chips, amenity chips,
 * the "Near building" dropdown, "Find My Spot" button, and the inline
 * Create / Join a Group section (always visible when no spot is selected).
 *
 * This module owns the rendering of the filter UI inside #panel-content.
 * It emits EVENTS.UI_FILTER_SUBMITTED when the user taps "Find My Spot".
 * It listens for EVENTS.FILTERS_CHANGED to keep the UI in sync if filters
 * are programmatically updated (e.g. restored from URL params).
 *
 * The same group form also appears at the bottom of spotCard.js when a spot
 * is selected — both instances are independent.
 */

import { on, emit, EVENTS }   from '../core/events.js';
import { getState, dispatch }  from '../core/store.js';
import { GROUP_SIZE_CONFIG }   from '../utils/capacity.js';
import { Users, LogOut, ThumbsUp, Copy } from 'lucide';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { iconSvg }   from './icons.js';
import { GROUP_PIN_EVENTS } from '../features/groupPins.js';
import { leaveGroup } from '../features/groups.js';

const _GROUP_SIZE_LABELS = {
  solo:   'Just Me',
  small:  '2-5',
  medium: '6-15',
  large:  '15+',
};

// ─── Group colour swatches ────────────────────────────────────────────────────

const _GROUP_SWATCHES = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f97316', // orange
  '#a855f7', // purple
];

/** @type {string} Currently selected colour in the filter panel create form. */
let _selectedColor = _GROUP_SWATCHES[0];

/** @type {'create' | 'join'} Which sub-form is active in the filter panel. */
let _groupSubForm = 'create';

// ─── Amenity chip definitions ─────────────────────────────────────────────────

const _AMENITY_CHIPS = [
  { key: 'quiet',  icon: '🔇', label: 'Quiet'   },
  { key: 'outlet', icon: '⚡', label: 'Outlets'  },
  { key: 'wifi',   icon: '📶', label: 'WiFi'     },
  { key: 'food',   icon: '🍔', label: 'Food'     },
];

// ─── Initialise ──────────────────────────────────────────────────────────────

export function initFilterPanel() {
  on(EVENTS.FILTERS_CHANGED, _syncFromState);
  on(EVENTS.VIEW_MODE_CHANGED, _syncFromState);
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

  form.appendChild(_buildViewModeToggle());

  form.appendChild(_buildSectionHeader('Group Size'));
  form.appendChild(_buildGroupSizeChips());

  form.appendChild(_buildSectionHeader('Amenities:'));
  form.appendChild(_buildAmenityChips());

  const nearHeader = _buildSectionHeader('Near:');
  nearHeader.id = 'filter-near-header';
  form.appendChild(nearHeader);
  form.appendChild(_buildBuildingDropdown());

  form.appendChild(_buildFindButton());

  form.appendChild(_buildGroupSection());

  // Set initial display of conditionally visible elements
  setTimeout(_syncFromState, 0);

  return form;
}

function _buildViewModeToggle() {
  const row     = document.createElement('div');
  row.className = 'chip-row view-mode-toggle';
  row.id        = 'toggle-view-mode';
  row.style.marginBottom = 'var(--space-6)';

  const modes = [
    { key: 'campus', label: 'Campus' },
    { key: 'city',   label: 'City' }
  ];

  const { viewMode } = getState();

  modes.forEach(({ key, label }) => {
    const chip        = document.createElement('button');
    chip.type         = 'button';
    chip.className    = `chip ${viewMode === key ? 'chip-active' : ''}`;
    chip.dataset.key  = key;
    chip.textContent  = label;
    chip.setAttribute('aria-pressed', String(viewMode === key));

    chip.addEventListener('click', () => {
      dispatch('SET_VIEW_MODE', key);
    });

    row.appendChild(chip);
  });

  return row;
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

/**
 * Container for the create/join group form shown in the filter panel.
 * Hidden when the user is already in a group (future design TBD).
 *
 * @returns {HTMLElement}
 */
function _buildGroupSection() {
  const { group, groupMember, groupPins, groupPinJoins, myGroupPinId, spots } = getState();
  if (group) {
    return _buildGroupMembersSection(group, groupMember, groupPins, groupPinJoins, myGroupPinId, spots);
  }

  const section     = document.createElement('div');
  section.className = 'spot-card__group-section';

  const heading       = document.createElement('p');
  heading.className   = 'spot-card__group-heading';
  heading.textContent = _groupSubForm === 'join' ? 'Join a Group' : 'Create a Group';
  section.appendChild(heading);

  if (_groupSubForm === 'join') {
    section.appendChild(_buildJoinForm(section, heading));
  } else {
    section.appendChild(_buildCreateForm(section, heading));
  }

  return section;
}

/**
 * Create-group sub-form for the filter panel.
 *
 * @param {HTMLElement} section
 * @param {HTMLElement} heading
 * @returns {HTMLElement}
 */
function _buildCreateForm(section, heading) {
  const form      = document.createElement('div');
  form.className  = 'spot-card__group-form';

  const nameLabel       = document.createElement('label');
  nameLabel.className   = 'spot-card__group-label';
  nameLabel.textContent = 'Group Name:';
  nameLabel.htmlFor     = 'fp-group-name';
  form.appendChild(nameLabel);

  const nameInput     = document.createElement('input');
  nameInput.type      = 'text';
  nameInput.id        = 'fp-group-name';
  nameInput.className = 'input';
  nameInput.maxLength = 40;
  form.appendChild(nameInput);

  const colorLabel       = document.createElement('label');
  colorLabel.className   = 'spot-card__group-label';
  colorLabel.textContent = 'Color:';
  form.appendChild(colorLabel);

  const swatches     = document.createElement('div');
  swatches.className = 'spot-card__color-swatches';

  _GROUP_SWATCHES.forEach(hex => {
    const sw        = document.createElement('button');
    sw.type         = 'button';
    sw.className    = `color-swatch${_selectedColor === hex ? ' color-swatch--active' : ''}`;
    sw.style.background = hex;
    sw.setAttribute('aria-label', `Color ${hex}`);
    sw.dataset.color = hex;
    sw.addEventListener('click', () => {
      _selectedColor = hex;
      swatches.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.toggle('color-swatch--active', s.dataset.color === hex);
      });
    });
    swatches.appendChild(sw);
  });

  form.appendChild(swatches);

  const btnRow      = document.createElement('div');
  btnRow.className  = 'spot-card__group-btn-row';

  const createBtn       = document.createElement('button');
  createBtn.type        = 'button';
  createBtn.className   = 'btn btn-primary';
  createBtn.textContent = 'Create';
  createBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    emit(EVENTS.UI_GROUP_CREATE, { name, displayName: name, color: _selectedColor, context: 'campus' });
  });

  const cancelBtn       = document.createElement('button');
  cancelBtn.type        = 'button';
  cancelBtn.className   = 'btn btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => { nameInput.value = ''; });

  btnRow.appendChild(createBtn);
  btnRow.appendChild(cancelBtn);
  form.appendChild(btnRow);

  const joinLink     = document.createElement('p');
  joinLink.className = 'spot-card__group-join-link';
  joinLink.innerHTML = /* html */`Already have a group to <a href="#" id="fp-link-join">join?</a>`;
  joinLink.querySelector('#fp-link-join').addEventListener('click', (e) => {
    e.preventDefault();
    _groupSubForm = 'join';
    heading.textContent = 'Join a Group';
    form.replaceWith(_buildJoinForm(section, heading));
  });

  form.appendChild(joinLink);
  return form;
}

/**
 * Join-group sub-form for the filter panel.
 *
 * @param {HTMLElement} section
 * @param {HTMLElement} heading
 * @returns {HTMLElement}
 */
function _buildJoinForm(section, heading) {
  const form      = document.createElement('div');
  form.className  = 'spot-card__group-form';

  const codeLabel       = document.createElement('label');
  codeLabel.className   = 'spot-card__group-label';
  codeLabel.textContent = 'Group Code:';
  codeLabel.htmlFor     = 'fp-group-code';
  form.appendChild(codeLabel);

  const codeInput     = document.createElement('input');
  codeInput.type      = 'text';
  codeInput.id        = 'fp-group-code';
  codeInput.className = 'input';
  codeInput.placeholder = 'e.g. AB12';
  codeInput.maxLength = 4;
  form.appendChild(codeInput);

  const nameLabel       = document.createElement('label');
  nameLabel.className   = 'spot-card__group-label';
  nameLabel.textContent = 'Your Name:';
  nameLabel.htmlFor     = 'fp-join-display-name';
  form.appendChild(nameLabel);

  const nameInput     = document.createElement('input');
  nameInput.type      = 'text';
  nameInput.id        = 'fp-join-display-name';
  nameInput.className = 'input';
  nameInput.maxLength = 30;
  form.appendChild(nameInput);

  const btnRow      = document.createElement('div');
  btnRow.className  = 'spot-card__group-btn-row';

  const joinBtn       = document.createElement('button');
  joinBtn.type        = 'button';
  joinBtn.className   = 'btn btn-primary';
  joinBtn.textContent = 'Join';
  joinBtn.addEventListener('click', () => {
    const code        = codeInput.value.trim();
    const displayName = nameInput.value.trim();
    if (!code || !displayName) { codeInput.focus(); return; }
    emit(EVENTS.UI_GROUP_JOIN, { code, displayName });
  });

  const backBtn       = document.createElement('button');
  backBtn.type        = 'button';
  backBtn.className   = 'btn btn-ghost';
  backBtn.textContent = 'Back';
  backBtn.addEventListener('click', () => {
    _groupSubForm = 'create';
    heading.textContent = 'Create a Group';
    form.replaceWith(_buildCreateForm(section, heading));
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
  const { filters, viewMode } = getState();

  // View mode toggle
  document.querySelectorAll('#toggle-view-mode .chip').forEach(chip => {
    const active = chip.dataset.key === viewMode;
    chip.classList.toggle('chip-active', active);
    chip.setAttribute('aria-pressed', String(active));
  });

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

  // Building dropdown visibility & value.
  const nearHeader = document.getElementById('filter-near-header');
  const sel = document.getElementById('filter-building');
  
  if (nearHeader && sel) {
    const isCampus = viewMode === 'campus';
    nearHeader.style.display = isCampus ? 'block' : 'none';
    sel.style.display        = isCampus ? 'block' : 'none';
    if (!isCampus && filters.nearBuilding) {
       // Clear the building filter automatically if switching to City view
       dispatch('SET_FILTERS', { nearBuilding: null });
    } else {
       sel.value = filters.nearBuilding ?? '';
    }
  }
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

// ─── Group member section (when already in a group) ──────────────────────────

/**
 * Replaces the Create/Join form when the user is already in a group.
 * Renders: group header, scrollable member rows, invite code.
 *
 * @param {object}      group
 * @param {object|null} groupMember
 * @param {object}      groupPins     - Record<pinId, GroupPin>
 * @param {object}      groupPinJoins - Record<pinId, GroupPinJoin[]>
 * @param {string|null} myGroupPinId
 * @param {object[]}    spots
 * @returns {HTMLElement}
 */
function _buildGroupMembersSection(group, groupMember, groupPins, groupPinJoins, myGroupPinId, spots) {
  const section     = document.createElement('div');
  section.className = 'spot-card__group-members-section';

  // ── Header row: colored dot + name + leave button ────────────────────────
  const header     = document.createElement('div');
  header.className = 'spot-card__gm-header';

  const nameRow     = document.createElement('div');
  nameRow.className = 'spot-card__gm-name-row';

  const dot     = document.createElement('span');
  dot.className = 'spot-card__gm-dot';
  dot.style.background = group.color ?? 'var(--color-brand)';
  nameRow.appendChild(dot);

  const name     = document.createElement('span');
  name.className = 'spot-card__gm-name';
  name.textContent = group.name;
  nameRow.appendChild(name);

  header.appendChild(nameRow);

  const leaveBtn     = document.createElement('button');
  leaveBtn.type      = 'button';
  leaveBtn.className = 'spot-card__gm-leave';
  leaveBtn.setAttribute('aria-label', 'Leave group');
  leaveBtn.innerHTML = iconSvg(LogOut, 18);
  leaveBtn.addEventListener('click', () => {
    openModal({
      title:   'Leave group?',
      body:    `You will be removed from "${group.name}". Your pins will remain.`,
      confirm: { label: 'Leave', onConfirm: () => leaveGroup() },
      cancel:  { label: 'Stay' },
    });
  });
  header.appendChild(leaveBtn);

  section.appendChild(header);

  // ── Member count ──────────────────────────────────────────────────────────
  const livePins = Object.values(groupPins).filter(p => p.pin_type === 'live' && !p.ended_at);

  const count     = document.createElement('p');
  count.className = 'spot-card__gm-count';
  count.textContent = `${livePins.length || 1} Member${(livePins.length || 1) !== 1 ? 's' : ''}`;
  section.appendChild(count);

  // ── Members table (scrollable) ────────────────────────────────────────────
  if (livePins.length > 0) {
    const table     = document.createElement('div');
    table.className = 'spot-card__gm-table';

    livePins.sort((a, b) => new Date(b.pinned_at) - new Date(a.pinned_at)).forEach(pin => {
      const isMine   = pin.id === myGroupPinId;
      const joins    = (groupPinJoins[pin.id] ?? []).filter(j => j.status === 'heading');
      const spotName = pin.spot_id
        ? (spots.find(s => s.id === pin.spot_id)?.name ?? 'Unknown')
        : 'En Route';

      const initials = _toInitials(pin.display_name ?? groupMember?.displayName ?? '?');

      const row     = document.createElement('div');
      row.className = `spot-card__gm-row${isMine ? ' spot-card__gm-row--mine' : ''}`;

      // Avatar
      const avatar     = document.createElement('span');
      avatar.className = 'spot-card__gm-avatar';
      avatar.style.background = group.color ?? 'var(--color-brand)';
      avatar.textContent = initials;
      row.appendChild(avatar);

      // Location
      const loc     = document.createElement('span');
      loc.className = 'spot-card__gm-location';
      loc.textContent = spotName;
      row.appendChild(loc);

      // Join count
      const joinCount     = document.createElement('span');
      joinCount.className = 'spot-card__gm-joins';
      joinCount.innerHTML = `${iconSvg(Users, 14)} ${joins.length}`;
      row.appendChild(joinCount);

      // Thumbs-up (heading join)
      const alreadyJoined = (groupPinJoins[pin.id] ?? []).some(
        j => j.status === 'heading' && j.session_id === _mySessionId(),
      );
      const thumbBtn     = document.createElement('button');
      thumbBtn.type      = 'button';
      thumbBtn.className = `spot-card__gm-thumb${alreadyJoined ? ' spot-card__gm-thumb--active' : ''}`;
      thumbBtn.setAttribute('aria-label', 'Heading there');
      thumbBtn.innerHTML = iconSvg(ThumbsUp, 16);
      if (!isMine) {
        thumbBtn.addEventListener('click', () => {
          emit(GROUP_PIN_EVENTS.JOIN_REQUESTED, { pinId: pin.id, status: 'heading' });
        });
      } else {
        thumbBtn.disabled = true;
        thumbBtn.setAttribute('aria-label', 'Your pin');
      }
      row.appendChild(thumbBtn);

      table.appendChild(row);
    });

    section.appendChild(table);
  } else if (groupMember) {
    // No live pins yet — show a placeholder row for this member
    const placeholder     = document.createElement('p');
    placeholder.className = 'spot-card__gm-empty';
    placeholder.textContent = 'No members heading anywhere yet. Drop a pin!';
    section.appendChild(placeholder);
  }

  // ── Code + copy row ──────────────────────────────────────────────────────
  const codeRow     = document.createElement('div');
  codeRow.className = 'spot-card__gm-code-row';

  const codeText     = document.createElement('span');
  codeText.className = 'spot-card__gm-code-text';
  codeText.innerHTML = `Code: <strong>${group.code}</strong>`;
  codeRow.appendChild(codeText);

  const copyBtn     = document.createElement('button');
  copyBtn.type      = 'button';
  copyBtn.className = 'spot-card__gm-copy';
  copyBtn.setAttribute('aria-label', 'Copy invite code');
  copyBtn.innerHTML = iconSvg(Copy, 16);
  copyBtn.addEventListener('click', async () => {
    const url = `${window.location.origin}${window.location.pathname}?group=${group.code}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Invite link copied! Share it with your group.', 'success');
    } catch {
      showToast(`Share this code: ${group.code}`, 'success');
    }
  });
  codeRow.appendChild(copyBtn);

  section.appendChild(codeRow);
  return section;
}

/**
 * Derive 1–2 letter initials from a display name.
 *
 * @param {string} name
 * @returns {string}
 */
function _toInitials(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Read the session id from localStorage (avoids circular import via store.js).
 *
 * @returns {string | null}
 */
function _mySessionId() {
  try { return localStorage.getItem('perch_session_id'); }
  catch { return null; }
}
