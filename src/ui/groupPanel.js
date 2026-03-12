/**
 * src/ui/groupPanel.js
 *
 * Renders the group view inside the panel (sidebar on desktop, bottom sheet on mobile).
 *
 * Shows:
 *   - Group name + code + copy-invite button
 *   - Member list with scout points
 *   - Active live pins (with transit join counts + Vibe Confirm button)
 *   - Saved pins list
 *   - "Drop a pin here" button when a spot is selected
 *   - "Leave group" button
 *
 * This module renders only. It emits events and lets features/* handle async.
 */

import { emit, on, EVENTS }           from '../core/events.js';
import { getState }                    from '../core/store.js';
import { buildGroupJoinUrl, leaveGroup } from '../features/groups.js';
import { GROUP_PIN_EVENTS }            from '../features/groupPins.js';
import { showToast }                   from './toast.js';
import { openModal }                   from './modal.js';
import { renderVibeConfirm }           from './vibeConfirm.js';

// ─── Initialise ───────────────────────────────────────────────────────────────

/**
 * Wire listeners so the group panel re-renders on relevant store events.
 * Call once from main.js after boot.
 */
export function initGroupPanel() {
  on(EVENTS.GROUP_JOINED,           _onGroupStateChanged);
  on(EVENTS.GROUP_LEFT,             _onGroupLeft);
  on(EVENTS.GROUP_PINS_UPDATED,     _onGroupStateChanged);
  on(EVENTS.GROUP_PIN_JOINS_UPDATED,_onGroupStateChanged);
  on(EVENTS.SPOT_SELECTED,          _onGroupStateChanged);
  on(EVENTS.SPOT_DESELECTED,        _onGroupStateChanged);
}

// ─── Render ───────────────────────────────────────────────────────────────────

/**
 * Render the group panel into the given container element.
 *
 * @param {HTMLElement} container
 */
export function renderGroupPanel(container) {
  const { group, groupMember, groupPins, groupPinJoins, spots, selectedSpotId } = getState();
  if (!group) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';

  // ── Group header ──────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'group-panel-header';
  header.style.cssText = `border-left: 4px solid ${group.color};`;

  header.innerHTML = /* html */`
    <div class="group-panel-identity">
      <span class="group-panel-name">${_escHtml(group.name)}</span>
      <span class="group-panel-code">Code: <strong>${group.code}</strong></span>
    </div>
    <div class="group-panel-actions-top">
      <button class="btn btn-ghost" id="btn-group-invite">Share invite</button>
      <button class="btn btn-ghost btn-danger-ghost" id="btn-group-leave">Leave</button>
    </div>
  `;

  header.querySelector('#btn-group-invite').addEventListener('click', () => _handleShareInvite(group.code));
  header.querySelector('#btn-group-leave').addEventListener('click', () => _handleLeave(group.name));
  container.appendChild(header);

  // ── Drop-pin CTA (only when a spot is selected) ───────────────────────────
  if (selectedSpotId) {
    const spot = spots.find(s => s.id === selectedSpotId);
    const myGroupPinId = getState().myGroupPinId;
    const myActiveLive = myGroupPinId
      ? Object.values(groupPins).find(p => p.id === myGroupPinId && !p.ended_at)
      : null;

    const ctaWrap = document.createElement('div');
    ctaWrap.className = 'group-pin-cta';

    if (myActiveLive) {
      // Show "end pin" option
      const endBtn = document.createElement('button');
      endBtn.type      = 'button';
      endBtn.className = 'btn btn-danger btn-full';
      endBtn.textContent = 'End my pin';
      endBtn.addEventListener('click', () => {
        emit(GROUP_PIN_EVENTS.END_REQUESTED, { pinId: myActiveLive.id });
      });
      ctaWrap.appendChild(endBtn);
    } else if (spot) {
      const dropBtn = document.createElement('button');
      dropBtn.type      = 'button';
      dropBtn.className = 'btn btn-primary btn-full';
      dropBtn.textContent = `Perch Here — ${_escHtml(spot.name)}`;
      dropBtn.addEventListener('click', () => {
        emit(GROUP_PIN_EVENTS.DROP_REQUESTED, { spotId: selectedSpotId });
      });
      ctaWrap.appendChild(dropBtn);
    }

    container.appendChild(ctaWrap);
  }

  // ── Live pins ─────────────────────────────────────────────────────────────
  const livePins = Object.values(groupPins)
    .filter(p => p.pin_type === 'live' && !p.ended_at)
    .sort((a, b) => new Date(b.pinned_at) - new Date(a.pinned_at));

  if (livePins.length) {
    const section = document.createElement('div');
    section.className = 'group-panel-section';

    const secTitle = document.createElement('p');
    secTitle.className   = 'panel-section-title';
    secTitle.textContent = 'Live pins';
    section.appendChild(secTitle);

    livePins.forEach(pin => {
      const spot  = spots.find(s => s.id === pin.spot_id);
      const joins = (groupPinJoins[pin.id] ?? []).filter(j => j.status !== 'left');
      section.appendChild(_buildLivePinCard(pin, spot, joins));
    });

    container.appendChild(section);
  }

  // ── Saved pins ────────────────────────────────────────────────────────────
  const savedPins = Object.values(groupPins)
    .filter(p => p.pin_type === 'saved')
    .sort((a, b) => new Date(b.pinned_at) - new Date(a.pinned_at));

  if (savedPins.length) {
    const section = document.createElement('div');
    section.className = 'group-panel-section';

    const secTitle = document.createElement('p');
    secTitle.className   = 'panel-section-title';
    secTitle.textContent = 'Saved spots';
    section.appendChild(secTitle);

    savedPins.forEach(pin => {
      const spot = spots.find(s => s.id === pin.spot_id);
      section.appendChild(_buildSavedPinCard(pin, spot));
    });

    container.appendChild(section);
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!livePins.length && !savedPins.length) {
    const empty = document.createElement('p');
    empty.className   = 'group-panel-empty';
    empty.textContent = 'No pins yet. Select a spot on the map and drop a pin!';
    container.appendChild(empty);
  }

  // ── Scout points ──────────────────────────────────────────────────────────
  if (groupMember && groupMember.scoutPoints > 0) {
    const scout = document.createElement('p');
    scout.className   = 'group-scout-badge';
    scout.textContent = `You have ${groupMember.scoutPoints} scout point${groupMember.scoutPoints !== 1 ? 's' : ''}`;
    container.appendChild(scout);
  }
}

// ─── Card builders ────────────────────────────────────────────────────────────

function _buildLivePinCard(pin, spot, joins) {
  const { myGroupPinId } = getState();
  const isOwner = pin.id === myGroupPinId;

  const card = document.createElement('div');
  card.className = 'group-pin-card group-pin-card--live';

  const dotCount = joins.filter(j => j.status === 'heading').length;
  const atCount  = joins.filter(j => j.status === 'arrived').length;

  card.innerHTML = /* html */`
    <div class="group-pin-card-top">
      <span class="group-pin-spot-name">${spot ? _escHtml(spot.name) : 'Unknown spot'}</span>
      ${pin.vibe ? `<span class="group-pin-vibe">${_escHtml(pin.vibe)}</span>` : ''}
    </div>
    ${pin.note ? `<p class="group-pin-note">${_escHtml(pin.note)}</p>` : ''}
    <div class="group-pin-transit">
      ${dotCount  ? `<span class="transit-dot transit-dot--heading">${dotCount} heading</span>` : ''}
      ${atCount   ? `<span class="transit-dot transit-dot--arrived">${atCount} here</span>` : ''}
    </div>
  `;

  const actions = document.createElement('div');
  actions.className = 'group-pin-card-actions';

  if (!isOwner) {
    const headBtn = document.createElement('button');
    headBtn.type      = 'button';
    headBtn.className = 'btn btn-ghost';
    headBtn.textContent = "I'm heading there";
    headBtn.addEventListener('click', () => {
      emit(GROUP_PIN_EVENTS.JOIN_REQUESTED, { pinId: pin.id, status: 'heading' });
    });
    actions.appendChild(headBtn);
  }

  // Vibe Confirm (available to all members)
  const vibeBtn = document.createElement('button');
  vibeBtn.type      = 'button';
  vibeBtn.className = 'btn btn-ghost';
  vibeBtn.textContent = 'Vibe?';
  vibeBtn.addEventListener('click', () => {
    renderVibeConfirm(pin.id, vibeBtn);
  });
  actions.appendChild(vibeBtn);

  card.appendChild(actions);
  return card;
}

function _buildSavedPinCard(pin, spot) {
  const card = document.createElement('div');
  card.className = 'group-pin-card group-pin-card--saved';

  card.innerHTML = /* html */`
    <div class="group-pin-card-top">
      <span class="group-pin-spot-name">${spot ? _escHtml(spot.name) : 'Unknown spot'}</span>
      <span class="group-pin-tag">Saved</span>
    </div>
    ${pin.custom_name ? `<p class="group-pin-note">${_escHtml(pin.custom_name)}</p>` : ''}
  `;

  return card;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function _handleShareInvite(code) {
  const url = buildGroupJoinUrl(code);
  try {
    await navigator.clipboard.writeText(url);
    showToast('Invite link copied! Share it with your squad.', 'success');
  } catch {
    showToast(`Share this code: ${code}`, 'success');
  }
}

function _handleLeave(groupName) {
  openModal({
    title:   'Leave group?',
    body:    `You will be removed from "${groupName}". Your pins will remain.`,
    confirm: {
      label:     'Leave',
      onConfirm: () => leaveGroup(),
    },
    cancel: { label: 'Stay' },
  });
}

// ─── Store event listeners ────────────────────────────────────────────────────

function _onGroupStateChanged() {
  const { group } = getState();
  if (!group) return;
  const container = document.getElementById('panel-content');
  if (container && container.querySelector('.group-panel-header')) {
    renderGroupPanel(container);
  }
}

function _onGroupLeft() {
  // The panel controller (sidebar/bottomSheet) will switch view to 'filters'
  // when it handles GROUP_LEFT. Nothing to do here.
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function _escHtml(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
  ));
}
