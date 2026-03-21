/**
 * src/ui/filterPanel.js
 *
 * Renders and manages the filter form: view mode toggle, campus selector,
 * a collapsible "Filters" accordion (group size chips, amenity chips,
 * near-building dropdown), the "Find My Spot" CTA, and the compact
 * inline Create / Join a Group section.
 *
 * This module owns the rendering of the filter UI inside #panel-content.
 * It emits EVENTS.UI_FILTER_SUBMITTED when the user taps "Find My Spot".
 * It listens for EVENTS.FILTERS_CHANGED / VIEW_MODE_CHANGED to keep
 * the UI in sync if filters are updated programmatically.
 */

import { on, emit, EVENTS }      from '../core/events.js';
import { getState, dispatch }    from '../core/store.js';
import { GROUP_SIZE_CONFIG }     from '../utils/capacity.js';
import { LogOut, Copy, Link,
         ChevronDown, Search }   from 'lucide';
import { openModal }             from './modal.js';
import { showToast }             from './toast.js';
import { iconSvg }               from './icons.js';
import { leaveGroup,
         buildGroupJoinUrl }     from '../features/groups.js';
import { initCampusSelector }    from './campusSelector.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const _GROUP_SIZE_LABELS = {
  solo:   'Just Me',
  small:  '2–5',
  medium: '6–15',
  large:  '15+',
};

const _GROUP_SWATCHES = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f97316', // orange
  '#a855f7', // purple
];

/** @type {string} Currently selected colour in the create form. */
let _selectedColor = _GROUP_SWATCHES[0];

/** @type {'create' | 'join'} Which sub-form is active. */
let _groupSubForm = 'create';

const _AMENITY_CHIPS = [
  { key: 'quiet',  icon: '🔇', label: 'Quiet'   },
  { key: 'outlet', icon: '⚡', label: 'Outlets'  },
  { key: 'wifi',   icon: '📶', label: 'WiFi'     },
  { key: 'food',   icon: '🍔', label: 'Food'     },
];

// ─── Initialise ──────────────────────────────────────────────────────────────

/**
 * Wire up event listeners. Call once from main.js at boot.
 *
 * @returns {void}
 */
export function initFilterPanel() {
  on(EVENTS.FILTERS_CHANGED,  _syncFromState);
  on(EVENTS.VIEW_MODE_CHANGED, _syncFromState);
  on(EVENTS.SPOTS_LOADED,     _populateBuildingDropdown);
  on(EVENTS.BUILDINGS_LOADED, _populateBuildingDropdown);
}

// ─── Render ──────────────────────────────────────────────────────────────────

/**
 * Render the complete filter form into a given container element.
 * Called by sidebar.js and bottomSheet.js.
 *
 * @param {HTMLElement} container
 * @returns {void}
 */
export function renderFilterPanel(container) {
  container.innerHTML = '';
  container.appendChild(_buildFilterForm());
}

function _buildFilterForm() {
  const form     = document.createElement('div');
  form.className = 'filter-form';

  form.appendChild(_buildPanelBrand());
  form.appendChild(_buildContextRow());
  form.appendChild(_buildFindButton());
  form.appendChild(_buildFilterAccordion());
  form.appendChild(_buildGroupAccordion());

  setTimeout(_syncFromState, 0);
  return form;
}

// ─── Brand ───────────────────────────────────────────────────────────────────

function _buildPanelBrand() {
  const brand     = document.createElement('div');
  brand.className = 'panel-brand';
  brand.innerHTML = /* html */`
    <img class="panel-brand__logo" src="/logo.svg" alt="Perch logo" width="36" height="36" />
    <div class="panel-brand__copy">
      <span class="panel-brand__name">Perch</span>
    </div>
  `;
  return brand;
}

// ─── Context row (view-mode + campus selector) ────────────────────────────────

/**
 * Combined row: Campus/City toggle on the left, campus selector chips on the right.
 * The campus selector column is hidden in City mode (handled by _syncFromState
 * via the existing campusSelector visibility logic).
 *
 * @returns {HTMLElement}
 */
function _buildContextRow() {
  const row     = document.createElement('div');
  row.className = 'filter-context-row';

  const toggleWrap     = document.createElement('div');
  toggleWrap.className = 'filter-context-row__toggle';
  toggleWrap.appendChild(_buildViewModeToggle());

  const campusWrap     = document.createElement('div');
  campusWrap.className = 'filter-context-row__campus';
  campusWrap.appendChild(_buildCampusSelectorBox());

  row.appendChild(toggleWrap);
  row.appendChild(campusWrap);
  return row;
}

// ─── View mode toggle ─────────────────────────────────────────────────────────

function _buildViewModeToggle() {
  const row     = document.createElement('div');
  row.className = 'chip-row view-mode-toggle';
  row.id        = 'toggle-view-mode';

  const { viewMode } = getState();

  [{ key: 'campus', label: 'Campus' }, { key: 'city', label: 'City' }].forEach(({ key, label }) => {
    const chip       = document.createElement('button');
    chip.type        = 'button';
    chip.className   = `chip ${viewMode === key ? 'chip-active' : ''}`;
    chip.dataset.key = key;
    chip.textContent = label;
    chip.setAttribute('aria-pressed', String(viewMode === key));
    chip.addEventListener('click', () => dispatch('SET_VIEW_MODE', key));
    row.appendChild(chip);
  });

  return row;
}

// ─── Campus selector ─────────────────────────────────────────────────────────

function _buildCampusSelectorBox() {
  const container = document.createElement('div');
  initCampusSelector(container);
  return container;
}

// ─── Filters accordion ───────────────────────────────────────────────────────

function _buildFilterAccordion() {
  const details     = document.createElement('details');
  details.className = 'filter-accordion';
  details.open      = false; // collapsed by default — badge shows active count

  // ── Summary row ────────────────────────────────────────────────────────────
  const summary     = document.createElement('summary');
  summary.className = 'filter-accordion__summary';

  const summaryLeft     = document.createElement('span');
  summaryLeft.className = 'filter-accordion__summary-left';

  const summaryLabel     = document.createElement('span');
  summaryLabel.className = 'filter-accordion__title';
  summaryLabel.textContent = 'Filters';

  const badge     = document.createElement('span');
  badge.className = 'filter-accordion__badge';
  badge.id        = 'filter-accordion-badge';
  badge.hidden    = true;

  summaryLeft.appendChild(summaryLabel);
  summaryLeft.appendChild(badge);

  const chevron     = document.createElement('span');
  chevron.className = 'filter-accordion__chevron';
  chevron.innerHTML = iconSvg(ChevronDown, 16);

  summary.appendChild(summaryLeft);
  summary.appendChild(chevron);
  details.appendChild(summary);

  // ── Body ───────────────────────────────────────────────────────────────────
  const body     = document.createElement('div');
  body.className = 'filter-accordion__body';

  // Group size
  const sizeLabel     = document.createElement('p');
  sizeLabel.className = 'filter-accordion__label';
  sizeLabel.textContent = 'Group Size';
  body.appendChild(sizeLabel);
  body.appendChild(_buildGroupSizeChips());

  // Amenities
  const amenLabel     = document.createElement('p');
  amenLabel.className = 'filter-accordion__label';
  amenLabel.textContent = 'Amenities';
  body.appendChild(amenLabel);
  body.appendChild(_buildAmenityChips());

  // Near building (campus-mode only)
  const nearRow     = document.createElement('div');
  nearRow.id        = 'filter-near-row';
  const nearLabel     = document.createElement('p');
  nearLabel.className = 'filter-accordion__label';
  nearLabel.textContent = 'Near';
  nearRow.appendChild(nearLabel);
  nearRow.appendChild(_buildBuildingDropdown());
  body.appendChild(nearRow);

  details.appendChild(body);
  return details;
}

// ─── Group size chips ─────────────────────────────────────────────────────────

function _buildGroupSizeChips() {
  const row     = document.createElement('div');
  row.className = 'chip-row';
  row.id        = 'chips-group-size';

  const { filters } = getState();

  Object.values(GROUP_SIZE_CONFIG).forEach(({ key }) => {
    const chip       = document.createElement('button');
    chip.type        = 'button';
    chip.className   = `chip ${filters.groupSize === key ? 'chip-active' : ''}`;
    chip.dataset.key = key;
    chip.textContent = _GROUP_SIZE_LABELS[key] ?? key;
    chip.setAttribute('aria-pressed', String(filters.groupSize === key));
    chip.addEventListener('click', () => {
      dispatch('SET_FILTERS', { groupSize: chip.classList.contains('chip-active') ? null : key });
    });
    row.appendChild(chip);
  });

  return row;
}

// ─── Amenity chips ────────────────────────────────────────────────────────────

function _buildAmenityChips() {
  const grid     = document.createElement('div');
  grid.className = 'amenity-chip-grid';
  grid.id        = 'chips-needs';

  const { filters } = getState();

  _AMENITY_CHIPS.forEach(({ key, icon, label }) => {
    const chip       = document.createElement('button');
    chip.type        = 'button';
    chip.className   = `amenity-chip ${filters.needs.includes(key) ? 'amenity-chip--active' : ''}`;
    chip.dataset.key = key;
    chip.setAttribute('aria-label', label);
    chip.setAttribute('aria-pressed', String(filters.needs.includes(key)));
    chip.innerHTML   = /* html */`<span class="amenity-chip__icon">${icon}</span><span class="amenity-chip__label">${label}</span>`;
    chip.addEventListener('click', () => {
      const current = getState().filters.needs;
      dispatch('SET_FILTERS', {
        needs: current.includes(key) ? current.filter(n => n !== key) : [...current, key],
      });
    });
    grid.appendChild(chip);
  });

  return grid;
}

// ─── Near building dropdown ───────────────────────────────────────────────────

function _buildBuildingDropdown() {
  const select     = document.createElement('select');
  select.className = 'select';
  select.id        = 'filter-building';

  const defaultOpt       = document.createElement('option');
  defaultOpt.value       = '';
  defaultOpt.textContent = 'Any building';
  select.appendChild(defaultOpt);

  select.addEventListener('change', () => {
    dispatch('SET_FILTERS', { nearBuilding: select.value || null });
  });

  return select;
}

// ─── Find button ─────────────────────────────────────────────────────────────

function _buildFindButton() {
  const btn     = document.createElement('button');
  btn.type      = 'button';
  btn.className = 'btn btn-primary btn-full';
  btn.id        = 'btn-find';
  btn.innerHTML = /* html */`${iconSvg(Search, 16)} Find My Spot`;
  btn.addEventListener('click', () => {
    emit(EVENTS.UI_FILTER_SUBMITTED, { filters: getState().filters });
  });
  return btn;
}

// ─── Group accordion ──────────────────────────────────────────────────────────

/**
 * Wraps the group create/join section (or the members view when already in a
 * group) inside a collapsible accordion so it doesn't crowd the primary flow.
 * When the user is already in a group the accordion opens automatically.
 *
 * @returns {HTMLElement}
 */
function _buildGroupAccordion() {
  const { group } = getState();

  // If already in a group, render the members section directly — no accordion.
  if (group) {
    return _buildGroupSection();
  }

  const details     = document.createElement('details');
  details.className = 'filter-accordion group-accordion';
  details.open      = false;

  // ── Summary row ──────────────────────────────────────────────────────────
  const summary     = document.createElement('summary');
  summary.className = 'filter-accordion__summary';

  const summaryLeft     = document.createElement('span');
  summaryLeft.className = 'filter-accordion__summary-left';

  const summaryLabel     = document.createElement('span');
  summaryLabel.className = 'filter-accordion__title';
  summaryLabel.textContent = 'Study with a group';

  summaryLeft.appendChild(summaryLabel);

  const chevron     = document.createElement('span');
  chevron.className = 'filter-accordion__chevron';
  chevron.innerHTML = iconSvg(ChevronDown, 16);

  summary.appendChild(summaryLeft);
  summary.appendChild(chevron);
  details.appendChild(summary);

  // ── Body ─────────────────────────────────────────────────────────────────
  const body     = document.createElement('div');
  body.className = 'filter-accordion__body';
  body.appendChild(_buildGroupSection());
  details.appendChild(body);

  return details;
}

// ─── Group section ────────────────────────────────────────────────────────────

/**
 * Returns the group members section when in a group, or the compact
 * create / join form otherwise.
 *
 * @returns {HTMLElement}
 */
function _buildGroupSection() {
  const { group, groupMember, groupPins, groupPinJoins, myGroupPinId, spots, groupMembers } = getState();
  if (group) {
    return _buildGroupMembersSection(group, groupMember, groupMembers, groupPins, groupPinJoins, myGroupPinId, spots);
  }

  const section     = document.createElement('div');
  section.className = 'spot-card__group-section';

  if (_groupSubForm === 'join') {
    section.appendChild(_buildJoinForm(section));
  } else {
    section.appendChild(_buildCreateForm(section));
  }

  return section;
}

/**
 * Compact create-group sub-form.
 *
 * @param {HTMLElement} section
 * @returns {HTMLElement}
 */
function _buildCreateForm(section) {
  const form     = document.createElement('div');
  form.className = 'spot-card__group-form';

  const { campuses, selectedCampusId, viewMode } = getState();

  const nameInput       = document.createElement('input');
  nameInput.type        = 'text';
  nameInput.id          = 'fp-group-name';
  nameInput.className   = 'input';
  nameInput.maxLength   = 40;
  nameInput.placeholder = 'Group name';
  form.appendChild(nameInput);

  let campusInput = null;
  if (viewMode === 'campus') {
    const selectedCampus = campuses.find((c) => c.id === selectedCampusId) ?? null;
    campusInput             = document.createElement('input');
    campusInput.type        = 'text';
    campusInput.id          = 'fp-campus-name';
    campusInput.className   = 'input';
    campusInput.placeholder = 'Campus / turf name';
    campusInput.maxLength   = 80;
    campusInput.value       = selectedCampus?.name ?? '';
    form.appendChild(campusInput);
  }

  // Color swatches (no label — visual affordance is sufficient)
  const swatches     = document.createElement('div');
  swatches.className = 'spot-card__color-swatches';
  _GROUP_SWATCHES.forEach((hex) => {
    const sw        = document.createElement('button');
    sw.type         = 'button';
    sw.className    = `color-swatch${_selectedColor === hex ? ' color-swatch--active' : ''}`;
    sw.style.background = hex;
    sw.setAttribute('aria-label', `Color ${hex}`);
    sw.dataset.color = hex;
    sw.addEventListener('click', () => {
      _selectedColor = hex;
      swatches.querySelectorAll('.color-swatch').forEach((s) => {
        s.classList.toggle('color-swatch--active', s.dataset.color === hex);
      });
    });
    swatches.appendChild(sw);
  });
  form.appendChild(swatches);

  const btnRow     = document.createElement('div');
  btnRow.className = 'spot-card__group-btn-row';

  const createBtn       = document.createElement('button');
  createBtn.type        = 'button';
  createBtn.className   = 'btn btn-primary btn-sm';
  createBtn.textContent = 'Create group';
  createBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const campusName = campusInput?.value.trim() ?? '';
    if (viewMode === 'campus' && !campusName) { campusInput?.focus(); return; }
    emit(EVENTS.UI_GROUP_CREATE, { name, displayName: name, color: _selectedColor, context: viewMode, campusName });
  });

  const joinLink     = document.createElement('button');
  joinLink.type      = 'button';
  joinLink.className = 'btn btn-ghost btn-sm';
  joinLink.textContent = 'Join one instead';
  joinLink.addEventListener('click', () => {
    _groupSubForm = 'join';
    form.replaceWith(_buildJoinForm(section));
  });

  btnRow.appendChild(createBtn);
  btnRow.appendChild(joinLink);
  form.appendChild(btnRow);

  return form;
}

/**
 * Compact join-group sub-form.
 *
 * @param {HTMLElement} section
 * @returns {HTMLElement}
 */
function _buildJoinForm(section) {
  const form     = document.createElement('div');
  form.className = 'spot-card__group-form';

  const codeInput       = document.createElement('input');
  codeInput.type        = 'text';
  codeInput.id          = 'fp-group-code';
  codeInput.className   = 'input';
  codeInput.placeholder = 'Group code (e.g. AB12)';
  codeInput.maxLength   = 4;
  form.appendChild(codeInput);

  const nameInput       = document.createElement('input');
  nameInput.type        = 'text';
  nameInput.id          = 'fp-join-display-name';
  nameInput.className   = 'input';
  nameInput.placeholder = 'Your display name';
  nameInput.maxLength   = 30;
  form.appendChild(nameInput);

  const btnRow     = document.createElement('div');
  btnRow.className = 'spot-card__group-btn-row';

  const joinBtn       = document.createElement('button');
  joinBtn.type        = 'button';
  joinBtn.className   = 'btn btn-primary btn-sm';
  joinBtn.textContent = 'Join group';
  joinBtn.addEventListener('click', () => {
    const code = codeInput.value.trim();
    const displayName = nameInput.value.trim();
    if (!code || !displayName) { codeInput.focus(); return; }
    emit(EVENTS.UI_GROUP_JOIN, { code, displayName });
  });

  const backBtn       = document.createElement('button');
  backBtn.type        = 'button';
  backBtn.className   = 'btn btn-ghost btn-sm';
  backBtn.textContent = 'Back';
  backBtn.addEventListener('click', () => {
    _groupSubForm = 'create';
    form.replaceWith(_buildCreateForm(section));
  });

  btnRow.appendChild(joinBtn);
  btnRow.appendChild(backBtn);
  form.appendChild(btnRow);

  return form;
}

// ─── Sync helpers ─────────────────────────────────────────────────────────────

/**
 * Re-sync all chip active states and filter-dependent visibility
 * whenever filters or view mode change.
 *
 * @returns {void}
 */
function _syncFromState() {
  const { filters, viewMode } = getState();

  // View mode toggle
  document.querySelectorAll('#toggle-view-mode .chip').forEach((chip) => {
    const active = chip.dataset.key === viewMode;
    chip.classList.toggle('chip-active', active);
    chip.setAttribute('aria-pressed', String(active));
  });

  // Group size chips
  document.querySelectorAll('#chips-group-size .chip').forEach((chip) => {
    const active = chip.dataset.key === filters.groupSize;
    chip.classList.toggle('chip-active', active);
    chip.setAttribute('aria-pressed', String(active));
  });

  // Amenity chips
  document.querySelectorAll('#chips-needs .amenity-chip').forEach((chip) => {
    const active = filters.needs.includes(chip.dataset.key);
    chip.classList.toggle('amenity-chip--active', active);
    chip.setAttribute('aria-pressed', String(active));
  });

  // Near row visibility (campus mode only)
  const nearRow = document.getElementById('filter-near-row');
  const sel     = document.getElementById('filter-building');
  if (nearRow && sel) {
    const isCampus = viewMode === 'campus';
    nearRow.style.display = isCampus ? '' : 'none';
    if (!isCampus && filters.nearBuilding) {
      dispatch('SET_FILTERS', { nearBuilding: null });
    } else {
      sel.value = filters.nearBuilding ?? '';
    }
  }

  // Accordion badge — count of active filters
  const badge = document.getElementById('filter-accordion-badge');
  if (badge) {
    const count = (filters.groupSize ? 1 : 0) + filters.needs.length + (filters.nearBuilding ? 1 : 0);
    badge.textContent = `${count} active`;
    badge.hidden = count === 0;
  }
}

/**
 * Populate the near-building dropdown from the loaded buildings list.
 *
 * @returns {void}
 */
function _populateBuildingDropdown() {
  const sel = document.getElementById('filter-building');
  if (!sel) return;

  const { buildings } = getState();
  const options = [...new Set(
    (buildings ?? []).map((b) => b.name).filter(Boolean),
  )].sort();

  while (sel.options.length > 1) sel.remove(1);

  options.forEach((name) => {
    const opt       = document.createElement('option');
    opt.value       = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

// ─── Group members section ────────────────────────────────────────────────────

/**
 * Replaces the create/join form when the user is already in a group.
 *
 * @param {object}      group
 * @param {object|null} groupMember
 * @param {object[]}    groupMembers
 * @param {object}      groupPins
 * @param {object}      groupPinJoins
 * @param {string|null} myGroupPinId
 * @param {object[]}    spots
 * @returns {HTMLElement}
 */
function _buildGroupMembersSection(group, groupMember, groupMembers, groupPins, groupPinJoins, myGroupPinId, spots) {
  const section     = document.createElement('div');
  section.className = 'spot-card__group-members-section';

  // ── Header: dot + name + leave ───────────────────────────────────────────
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

  // ── Member count ─────────────────────────────────────────────────────────
  const memberCount = groupMembers.length || 1;
  const count     = document.createElement('p');
  count.className = 'spot-card__gm-count';
  count.textContent = `${memberCount} Member${memberCount !== 1 ? 's' : ''}`;
  section.appendChild(count);

  // ── Member table ─────────────────────────────────────────────────────────
  const table     = document.createElement('div');
  table.className = 'spot-card__gm-table';

  if (groupMembers.length > 0) {
    groupMembers.forEach((mem) => {
      const isMine   = mem.session_id === _mySessionId();
      const initials = _toInitials(mem.display_name ?? '?');

      const livePins = Object.values(groupPins).filter(
        (p) => p.session_id === mem.session_id && p.pin_type === 'live' && !p.ended_at,
      );
      const spotName = livePins.length
        ? (spots.find((s) => s.id === livePins[0].spot_id)?.name ?? 'En Route')
        : 'Browsing';

      const row     = document.createElement('div');
      row.className = `spot-card__gm-row${isMine ? ' spot-card__gm-row--mine' : ''}`;

      const avatar     = document.createElement('span');
      avatar.className = 'spot-card__gm-avatar';
      avatar.style.background = group.color ?? 'var(--color-brand)';
      avatar.textContent = initials;
      row.appendChild(avatar);

      const info     = document.createElement('div');
      info.className = 'spot-card__gm-info';

      const displayName     = document.createElement('span');
      displayName.className = 'spot-card__gm-display-name';
      displayName.textContent = mem.display_name + (isMine ? ' (you)' : '');
      info.appendChild(displayName);

      const loc     = document.createElement('span');
      loc.className = 'spot-card__gm-location';
      loc.textContent = spotName;
      info.appendChild(loc);

      row.appendChild(info);

      const pts     = document.createElement('span');
      pts.className = 'spot-card__gm-pts';
      pts.textContent = `${mem.scout_points ?? 0}pt`;
      row.appendChild(pts);

      table.appendChild(row);
    });
  } else {
    const placeholder     = document.createElement('p');
    placeholder.className = 'spot-card__gm-empty';
    placeholder.textContent = 'Loading members…';
    table.appendChild(placeholder);
  }

  section.appendChild(table);

  // ── Code + share row ─────────────────────────────────────────────────────
  const codeRow     = document.createElement('div');
  codeRow.className = 'spot-card__gm-code-row';

  const codeText     = document.createElement('span');
  codeText.className = 'spot-card__gm-code-text';
  codeText.innerHTML = `Code: <strong>${group.code}</strong>`;
  codeRow.appendChild(codeText);

  const copyLinkBtn     = document.createElement('button');
  copyLinkBtn.type      = 'button';
  copyLinkBtn.className = 'spot-card__gm-copy';
  copyLinkBtn.setAttribute('aria-label', 'Copy invite link');
  copyLinkBtn.innerHTML = iconSvg(Link, 16);
  copyLinkBtn.addEventListener('click', async () => {
    const url = buildGroupJoinUrl(group.code);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Invite link copied! Share it with your group.', 'success');
    } catch {
      showToast(`Share this code: ${group.code}`, 'success');
    }
  });
  codeRow.appendChild(copyLinkBtn);

  const codeCopyBtn     = document.createElement('button');
  codeCopyBtn.type      = 'button';
  codeCopyBtn.className = 'spot-card__gm-copy';
  codeCopyBtn.setAttribute('aria-label', 'Copy group code');
  codeCopyBtn.innerHTML = iconSvg(Copy, 16);
  codeCopyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(group.code);
      showToast(`Code ${group.code} copied!`, 'success');
    } catch {
      showToast(`Share this code: ${group.code}`, 'success');
    }
  });
  codeRow.appendChild(codeCopyBtn);

  section.appendChild(codeRow);
  return section;
}

// ─── Private helpers ─────────────────────────────────────────────────────────

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
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Read the session id from localStorage.
 *
 * @returns {string | null}
 */
function _mySessionId() {
  try { return localStorage.getItem('perch_session_id'); }
  catch { return null; }
}
