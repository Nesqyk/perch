/**
 * src/ui/spotCard.js
 *
 * Renders the detailed view for a single selected spot.
 * Used by both sidebar.js (desktop) and bottomSheet.js (mobile) — they each
 * pass their container element, so the render logic is never duplicated.
 *
 * Layout (top → bottom):
 *   1. Header — spot name, subtitle, × close button
 *   2. Status chips — "Likely Free" pill + percentage pill
 *   3. Photo placeholder (full-width, striped)
 *   4. Info row — capacity (person icon + number) | amenity icons
 *   5. Divider
 *   6. "Reported Free: 14min ago" row
 *   7a. (No active claim) Action buttons row — "I'm going here" + "It's full"
 *   7b. (Active claim)    Claim section  — confirmation badge, groups table,
 *                          share link, cancel + report buttons
 *   8. Divider
 *   9. Create / Join a Group inline form (hidden when already in a group)
 *
 * Emits:
 *   EVENTS.UI_CLAIM_REQUESTED  — "I'm going here" clicked
 *   EVENTS.UI_REPORT_REQUESTED — "It's full" clicked
 *   EVENTS.UI_GROUP_CREATE     — create-group form submitted
 *   EVENTS.UI_GROUP_JOIN       — join-group form submitted
 */

import {
  Users, Wifi, WifiOff, Lightbulb, BarChart2,
  X, CheckCircle, Share, Clock,
  LogOut, ThumbsUp, Copy,
} from 'lucide';

import { emit, EVENTS }       from '../core/events.js';
import { getState, dispatch } from '../core/store.js';
import { formatConfidence }   from '../utils/confidence.js';
import { timeAgo, claimExpiresIn } from '../utils/time.js';
import { deriveSpotStatus, getActiveClaimsForSpot } from '../state/spotState.js';
import { calcRemainingCapacity } from '../utils/capacity.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { iconSvg } from './icons.js';
import { GROUP_PIN_EVENTS } from '../features/groupPins.js';
import { leaveGroup } from '../features/groups.js';

// ─── Group colour swatches ────────────────────────────────────────────────────

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

/** @type {'create' | 'join'} Which sub-form is active. */
let _groupSubForm = 'create';

// ─── Public render ────────────────────────────────────────────────────────────

/**
 * Render the spot detail card into a container element.
 *
 * @param {HTMLElement} container
 * @param {string}      spotId
 * @returns {void}
 */
export function renderSpotCard(container, spotId) {
  const {
    spots, confidence, claims, group,
    myActiveClaim, groupMember, groupPins, groupPinJoins, myGroupPinId,
  } = getState();
  const spot = spots.find(s => s.id === spotId);
  if (!spot) return;

  const conf         = confidence[spotId];
  const confDisplay  = formatConfidence(conf?.score);
  const status       = deriveSpotStatus(spotId);
  const activeClaims = getActiveClaimsForSpot(spotId, claims);

  // Is OUR claim on this spot?
  const ownClaim = myActiveClaim?.spotId === spotId ? myActiveClaim : null;

  container.innerHTML = '';
  container.appendChild(
    _buildCard(
      spot, confDisplay, status, activeClaims,
      group, groupMember, groupPins, groupPinJoins, myGroupPinId,
      ownClaim, spots,
    ),
  );
}

// ─── Card builder ─────────────────────────────────────────────────────────────

/**
 * @param {object}      spot
 * @param {object}      confDisplay   - { label, percent, cssClass }
 * @param {string}      status        - free | maybe | claimed | full
 * @param {object[]}    activeClaims
 * @param {object|null} group
 * @param {object|null} groupMember
 * @param {object}      groupPins     - Record<pinId, GroupPin>
 * @param {object}      groupPinJoins - Record<pinId, GroupPinJoin[]>
 * @param {string|null} myGroupPinId
 * @param {object|null} ownClaim      - myActiveClaim if it belongs to this spot
 * @param {object[]}    spots         - all spots (for member location lookup)
 * @returns {HTMLElement}
 */
function _buildCard(
  spot, confDisplay, status, activeClaims,
  group, groupMember, groupPins, groupPinJoins, myGroupPinId,
  ownClaim, spots,
) {
  const card     = document.createElement('div');
  card.className = 'spot-card';

  card.appendChild(_buildHeader(spot));
  card.appendChild(_buildStatusRow(confDisplay, status));
  card.appendChild(_buildPhoto());
  card.appendChild(_buildInfoRow(spot));
  card.appendChild(_buildDivider());
  card.appendChild(_buildReportedRow(activeClaims));

  if (ownClaim) {
    card.appendChild(_buildClaimSection(spot, activeClaims, ownClaim));
  } else {
    card.appendChild(_buildActions(spot.id, status));
  }

  card.appendChild(_buildDivider());
  if (group) {
    card.appendChild(_buildGroupMembersSection(
      group, groupMember, groupPins, groupPinJoins, myGroupPinId, spots,
    ));
  } else {
    card.appendChild(_buildGroupSection());
  }

  return card;
}

// ─── Section builders ─────────────────────────────────────────────────────────

/**
 * Header: spot name + floor/building subtitle + × close button.
 *
 * @param {object} spot
 * @returns {HTMLElement}
 */
function _buildHeader(spot) {
  const header     = document.createElement('div');
  header.className = 'spot-card__header';

  const text       = document.createElement('div');
  text.className   = 'spot-card__header-text';

  const name       = document.createElement('h2');
  name.className   = 'spot-card__name';
  name.textContent = spot.name;
  text.appendChild(name);

  const parts = [spot.floor, spot.building].filter(Boolean);
  if (parts.length) {
    const sub       = document.createElement('p');
    sub.className   = 'spot-card__subtitle';
    sub.textContent = parts.join(', ');
    text.appendChild(sub);
  }

  header.appendChild(text);

  const closeBtn     = document.createElement('button');
  closeBtn.type      = 'button';
  closeBtn.className = 'spot-card__close';
  closeBtn.setAttribute('aria-label', 'Close spot detail');
  closeBtn.innerHTML = iconSvg(X, 18);
  closeBtn.addEventListener('click', () => dispatch('DESELECT_SPOT', {}));
  header.appendChild(closeBtn);

  return header;
}

/**
 * Status chips row: "Likely Free" pill + "80%" pill.
 *
 * @param {object} confDisplay
 * @param {string} status
 * @returns {HTMLElement}
 */
function _buildStatusRow(confDisplay, status) {
  const row     = document.createElement('div');
  row.className = 'spot-card__status-row';

  const labelChip       = document.createElement('span');
  labelChip.className   = `spot-card__status-chip spot-card__status-chip--${status}`;
  labelChip.textContent = confDisplay.label;
  row.appendChild(labelChip);

  const pctChip       = document.createElement('span');
  pctChip.className   = `spot-card__status-chip spot-card__status-chip--${status}`;
  pctChip.textContent = `${confDisplay.percent}%`;
  row.appendChild(pctChip);

  return row;
}

/**
 * Full-width photo placeholder with diagonal stripe pattern.
 *
 * @returns {HTMLElement}
 */
function _buildPhoto() {
  const photo     = document.createElement('div');
  photo.className = 'spot-card__photo';
  photo.setAttribute('aria-hidden', 'true');
  return photo;
}

/**
 * Info row: capacity (left) + amenity icons (right).
 *
 * @param {object} spot
 * @returns {HTMLElement}
 */
function _buildInfoRow(spot) {
  const row     = document.createElement('div');
  row.className = 'spot-card__info-row';

  // ── Left: capacity ──
  const capSide     = document.createElement('div');
  capSide.className = 'spot-card__capacity';
  capSide.innerHTML = `${iconSvg(Users, 16)} <span>${_capacityNum(spot.rough_capacity)}</span>`;
  row.appendChild(capSide);

  // ── Right: amenity icons ──
  const amenSide     = document.createElement('div');
  amenSide.className = 'spot-card__amenities';

  const hasWifi = Boolean(spot.wifi_strength && spot.wifi_strength !== 'none');
  amenSide.appendChild(_amenityIcon(hasWifi ? Wifi : WifiOff, hasWifi, 'WiFi'));
  amenSide.appendChild(_amenityIcon(Lightbulb, Boolean(spot.has_outlets), 'Outlets'));
  amenSide.appendChild(_amenityIcon(BarChart2, spot.noise_baseline === 'quiet', 'Quiet'));

  row.appendChild(amenSide);
  return row;
}

/**
 * Single amenity icon span.
 *
 * @param {Array}   icon
 * @param {boolean} available
 * @param {string}  label
 * @returns {HTMLElement}
 */
function _amenityIcon(icon, available, label) {
  const el     = document.createElement('span');
  el.className = `spot-card__amenity-icon${available ? '' : ' spot-card__amenity-icon--off'}`;
  el.setAttribute('title', label);
  el.innerHTML = iconSvg(icon, 18);
  return el;
}

/**
 * Thin horizontal rule divider.
 *
 * @returns {HTMLHRElement}
 */
function _buildDivider() {
  const hr     = document.createElement('hr');
  hr.className = 'spot-card__divider';
  hr.setAttribute('aria-hidden', 'true');
  return hr;
}

/**
 * "Reported Free: 14min ago" row.
 * Uses the most recent claimed_at across active claims.
 *
 * @param {object[]} activeClaims
 * @returns {HTMLElement}
 */
function _buildReportedRow(activeClaims) {
  const row     = document.createElement('div');
  row.className = 'spot-card__reported';

  let ago = '—';
  if (activeClaims.length > 0) {
    const latest = activeClaims.reduce((best, c) => {
      const t = new Date(c.claimed_at).getTime();
      return t > best ? t : best;
    }, 0);
    ago = timeAgo(new Date(latest).toISOString());
  }

  const label       = document.createElement('span');
  label.className   = 'spot-card__reported-label';
  label.textContent = 'Reported Free:';

  const value       = document.createElement('span');
  value.className   = 'spot-card__reported-value';
  value.textContent = ago;

  row.appendChild(label);
  row.appendChild(value);
  return row;
}

/**
 * Side-by-side action buttons: "I'm going here" + "It's full".
 * Shown only when there is NO active own claim for this spot.
 *
 * @param {string} spotId
 * @param {string} status
 * @returns {HTMLElement}
 */
function _buildActions(spotId, status) {
  const row     = document.createElement('div');
  row.className = 'spot-card__actions';

  if (status !== 'full') {
    const claimBtn       = document.createElement('button');
    claimBtn.type        = 'button';
    claimBtn.className   = 'btn btn-primary spot-card__action-claim';
    claimBtn.textContent = "I'm going here";
    claimBtn.addEventListener('click', () => emit(EVENTS.UI_CLAIM_REQUESTED, { spotId }));
    row.appendChild(claimBtn);
  }

  const reportBtn       = document.createElement('button');
  reportBtn.type        = 'button';
  reportBtn.className   = 'btn btn-outline spot-card__action-report';
  reportBtn.textContent = "It's full";
  reportBtn.addEventListener('click', () => emit(EVENTS.UI_REPORT_REQUESTED, { spotId }));
  row.appendChild(reportBtn);

  return row;
}

// ─── Active claim section ─────────────────────────────────────────────────────

/**
 * Inline "You're heading here" claim section rendered inside the spot card
 * when this session has an active claim on this spot.
 *
 * @param {object}   spot
 * @param {object[]} activeClaims - all active claims for this spot
 * @param {object}   ownClaim     - myActiveClaim (has spotId, claimId, expiresAt)
 * @returns {HTMLElement}
 */
function _buildClaimSection(spot, activeClaims, ownClaim) {
  const capacity   = calcRemainingCapacity(spot.rough_capacity, activeClaims);

  const section     = document.createElement('div');
  section.className = 'spot-card__claim-section';

  // ── Confirmation banner ──
  const banner     = document.createElement('div');
  banner.className = 'spot-card__claim-banner';

  const bannerIcon     = document.createElement('span');
  bannerIcon.className = 'spot-card__claim-banner-icon';
  bannerIcon.innerHTML = iconSvg(CheckCircle, 20);
  banner.appendChild(bannerIcon);

  const bannerText     = document.createElement('div');
  bannerText.className = 'spot-card__claim-banner-text';

  const bannerTitle       = document.createElement('span');
  bannerTitle.className   = 'spot-card__claim-banner-title';
  bannerTitle.textContent = "You're heading here";
  bannerText.appendChild(bannerTitle);

  if (ownClaim.expiresAt) {
    const expiry       = document.createElement('span');
    expiry.className   = 'spot-card__claim-banner-sub';
    expiry.innerHTML   = `${iconSvg(Clock, 12)} ${claimExpiresIn(ownClaim.expiresAt)}`;
    bannerText.appendChild(expiry);
  }

  banner.appendChild(bannerText);

  if (capacity.remaining !== null) {
    const capBadge       = document.createElement('span');
    capBadge.className   = 'spot-card__claim-cap-badge';
    capBadge.innerHTML   = `${iconSvg(Users, 12)} ${capacity.label}`;
    banner.appendChild(capBadge);
  }

  section.appendChild(banner);

  // ── Groups heading here (scrollable table) ──
  if (activeClaims.length > 0) {
    const tableWrap     = document.createElement('div');
    tableWrap.className = 'spot-card__claim-groups-wrap';

    const tableLabel     = document.createElement('p');
    tableLabel.className = 'spot-card__claim-groups-label';
    tableLabel.textContent = 'Groups heading here:';
    tableWrap.appendChild(tableLabel);

    const table     = document.createElement('div');
    table.className = 'spot-card__claim-groups';

    activeClaims.forEach(claim => {
      const isMine = claim.id === ownClaim.claimId;
      const row     = document.createElement('div');
      row.className = `spot-card__claim-group-row${isMine ? ' spot-card__claim-group-row--mine' : ''}`;

      const name = isMine ? 'You' : (claim.nickname ?? 'Someone');

      row.innerHTML = /* html */`
        <span class="spot-card__claim-group-icon">${iconSvg(Users, 14)}</span>
        <span class="spot-card__claim-group-size"><strong>${name}</strong> • ${_groupLabel(claim.group_size_key)}</span>
        <span class="spot-card__claim-group-time">${timeAgo(claim.claimed_at)}</span>
      `;
      table.appendChild(row);
    });

    tableWrap.appendChild(table);
    section.appendChild(tableWrap);
  }

  // ── Share link ──
  const { sharedLink } = getState();
  const copyBtn     = document.createElement('button');
  copyBtn.type      = 'button';
  copyBtn.id        = 'btn-copy-link';
  copyBtn.className = 'btn btn-primary btn-full';
  copyBtn.innerHTML = `${iconSvg(Share, 16)} <span>Copy Link — Share to GC</span>`;
  copyBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;';
  copyBtn.addEventListener('click', () => _handleCopyLink(sharedLink?.url));
  section.appendChild(copyBtn);

  // ── Secondary: It's Full + Cancel ──
  const actions     = document.createElement('div');
  actions.className = 'spot-card__actions';

  const reportBtn       = document.createElement('button');
  reportBtn.type        = 'button';
  reportBtn.className   = 'btn btn-outline spot-card__action-report';
  reportBtn.textContent = "It's Full";
  reportBtn.addEventListener('click', () => emit(EVENTS.UI_REPORT_REQUESTED, { spotId: spot.id }));
  actions.appendChild(reportBtn);

  const cancelBtn       = document.createElement('button');
  cancelBtn.type        = 'button';
  cancelBtn.className   = 'btn btn-ghost spot-card__action-report';
  cancelBtn.textContent = 'Cancel Claim';
  cancelBtn.addEventListener('click', () => _handleCancelClaim(ownClaim.claimId, spot.id));
  actions.appendChild(cancelBtn);

  section.appendChild(actions);
  return section;
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

      // Name & Location
      const nameLoc = document.createElement('div');
      nameLoc.className = 'spot-card__gm-name-loc';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'spot-card__gm-member-name';
      nameSpan.textContent = pin.display_name ?? 'Someone';
      nameLoc.appendChild(nameSpan);

      const loc     = document.createElement('span');
      loc.className = 'spot-card__gm-location';
      loc.textContent = spotName;
      nameLoc.appendChild(loc);

      row.appendChild(nameLoc);

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

// ─── Group create / join section ─────────────────────────────────────────────

/**
 * Container for the create/join group form.
 *
 * @returns {HTMLElement}
 */
function _buildGroupSection() {
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
 * Create-group sub-form.
 *
 * @param {HTMLElement} section
 * @param {HTMLElement} heading
 * @returns {HTMLElement}
 */
function _buildCreateForm(section, heading) {
  const form      = document.createElement('div');
  form.className  = 'spot-card__group-form';

  // Name
  const nameLabel       = document.createElement('label');
  nameLabel.className   = 'spot-card__group-label';
  nameLabel.textContent = 'Group Name:';
  nameLabel.htmlFor     = 'sc-group-name';
  form.appendChild(nameLabel);

  const nameInput     = document.createElement('input');
  nameInput.type      = 'text';
  nameInput.id        = 'sc-group-name';
  nameInput.className = 'input';
  nameInput.maxLength = 40;
  form.appendChild(nameInput);

  // Color
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

  // Buttons
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

  // Join link
  const joinLink     = document.createElement('p');
  joinLink.className = 'spot-card__group-join-link';
  joinLink.innerHTML = /* html */`Already have a group to <a href="#" id="sc-link-join">join?</a>`;
  joinLink.querySelector('#sc-link-join').addEventListener('click', (e) => {
    e.preventDefault();
    _groupSubForm = 'join';
    heading.textContent = 'Join a Group';
    form.replaceWith(_buildJoinForm(section, heading));
  });

  form.appendChild(joinLink);
  return form;
}

/**
 * Join-group sub-form.
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
  codeLabel.htmlFor     = 'sc-group-code';
  form.appendChild(codeLabel);

  const codeInput     = document.createElement('input');
  codeInput.type      = 'text';
  codeInput.id        = 'sc-group-code';
  codeInput.className = 'input';
  codeInput.placeholder = 'e.g. AB12';
  codeInput.maxLength = 4;
  form.appendChild(codeInput);

  const nameLabel       = document.createElement('label');
  nameLabel.className   = 'spot-card__group-label';
  nameLabel.textContent = 'Your Name:';
  nameLabel.htmlFor     = 'sc-join-display-name';
  form.appendChild(nameLabel);

  const nameInput     = document.createElement('input');
  nameInput.type      = 'text';
  nameInput.id        = 'sc-join-display-name';
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

// ─── Claim handlers (called from within spotCard) ────────────────────────────

/**
 * @param {string|undefined} url
 * @returns {Promise<void>}
 */
async function _handleCopyLink(url) {
  if (!url) { showToast('No link to copy yet.', 'error'); return; }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied! Paste it in your GC.', 'success');
    const btn = document.getElementById('btn-copy-link');
    if (btn) {
      btn.innerHTML = `${iconSvg(CheckCircle, 16)} <span>Copied!</span>`;
      setTimeout(() => {
        btn.innerHTML = `${iconSvg(Share, 16)} <span>Copy Link — Share to GC</span>`;
      }, 2000);
    }
  } catch {
    showToast('Could not copy — try manually: ' + url, 'error');
  }
}

/**
 * @param {string} claimId
 * @param {string} spotId
 * @returns {void}
 */
function _handleCancelClaim(claimId, spotId) {
  openModal({
    title:   'Cancel your claim?',
    body:    'Your group will be removed from this spot. You can claim another.',
    confirm: {
      label:     'Yes, cancel',
      onConfirm: () => emit(EVENTS.UI_CANCEL_CLAIM, { claimId, spotId }),
    },
    cancel: { label: 'Keep it' },
  });
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/**
 * Approximate head-count for a rough_capacity tier.
 *
 * @param {string} rough
 * @returns {number|string}
 */
function _capacityNum(rough) {
  const sizes = { small: 8, medium: 20, large: 40 };
  return sizes[rough] ?? '—';
}

/**
 * Human-readable group size label.
 *
 * @param {string} key
 * @returns {string}
 */
function _groupLabel(key) {
  const map = { solo: '1 person', small: '2–5 ppl', medium: '6–15 ppl', large: '16+ ppl' };
  return map[key] ?? key;
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
