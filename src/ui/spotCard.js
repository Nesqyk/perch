/**
 * src/ui/spotCard.js
 *
 * Renders the detailed view for a single selected spot.
 * Used by both sidebar.js (desktop) and bottomSheet.js (mobile) — they each
 * pass their container element, so the render logic is never duplicated.
 *
 * Emits:
 *   EVENTS.UI_CLAIM_REQUESTED  when the user clicks "I'm Going Here"
 *   EVENTS.UI_REPORT_REQUESTED when the user clicks "It's Full"
 */

import { emit, EVENTS }         from '../core/events.js';
import { getState }              from '../core/store.js';
import { formatConfidence }      from '../utils/confidence.js';
import { calcRemainingCapacity } from '../utils/capacity.js';
import { timeAgo, formatTime as _formatTime }   from '../utils/time.js';
import { deriveSpotStatus, getActiveClaimsForSpot } from '../state/spotState.js';
import { GROUP_PIN_EVENTS } from '../features/groupPins.js';

/**
 * Render the spot detail card into a container element.
 *
 * @param {HTMLElement} container
 * @param {string}      spotId
 */
export function renderSpotCard(container, spotId) {
  const { spots, confidence, claims } = getState();
  const spot    = spots.find(s => s.id === spotId);
  if (!spot) return;

  const conf         = confidence[spotId];
  const confDisplay  = formatConfidence(conf?.score);
  const status       = deriveSpotStatus(spotId);
  const activeClaims = getActiveClaimsForSpot(spotId, claims);
  const capacity     = calcRemainingCapacity(spot.rough_capacity, activeClaims);
  const { group, myGroupPinId } = getState();

  container.innerHTML = '';
  container.appendChild(_buildCard(spot, confDisplay, status, activeClaims, capacity, group, myGroupPinId));
}

// ─── Card builder ────────────────────────────────────────────────────────────

function _buildCard(spot, confDisplay, status, activeClaims, capacity, group, myGroupPinId) {
  const card       = document.createElement('div');
  card.className   = 'spot-card';

  card.appendChild(_buildHeader(spot));
  card.appendChild(_buildStatusBadge(confDisplay, status));
  card.appendChild(_buildAmenities(spot));
  card.appendChild(_buildScheduleNote(spot));
  card.appendChild(_buildClaimsSection(activeClaims, capacity));
  card.appendChild(_buildActions(spot.id, status, group, myGroupPinId));

  return card;
}

function _buildHeader(spot) {
  const div       = document.createElement('div');
  div.className   = 'spot-card-header';

  const name      = document.createElement('h2');
  name.className  = 'spot-name';
  name.textContent = spot.name;
  div.appendChild(name);

  if (spot.floor || spot.building) {
    const sub       = document.createElement('p');
    sub.className   = 'spot-sublabel';
    sub.textContent = [spot.floor, spot.building].filter(Boolean).join(', ');
    div.appendChild(sub);
  }

  if (!spot.on_campus && spot.walk_time_min) {
    const walk      = document.createElement('p');
    walk.className  = 'spot-walk';
    walk.textContent = `${spot.walk_time_min} min walk`;
    div.appendChild(walk);
  }

  return div;
}

function _buildStatusBadge(confDisplay, _status) {
  const div       = document.createElement('div');
  div.className   = `spot-status-badge ${confDisplay.cssClass}`;

  const label     = document.createElement('span');
  label.className = 'status-label';
  label.textContent = confDisplay.label.toUpperCase();

  const pct       = document.createElement('span');
  pct.className   = 'status-pct';
  pct.textContent = `${confDisplay.percent}%`;

  div.appendChild(label);
  div.appendChild(pct);
  return div;
}

function _buildAmenities(spot) {
  const grid       = document.createElement('div');
  grid.className   = 'amenities-grid';

  const items = [
    { label: 'Outlets',   value: _yesNo(spot.has_outlets),    icon: '⚡' },
    { label: 'WiFi',      value: _wifiLabel(spot.wifi_strength), icon: '📶' },
    { label: 'Noise',     value: _capitalize(spot.noise_baseline), icon: '🔇' },
    { label: 'Food',      value: _yesNo(spot.has_food),        icon: '🍔' },
    { label: 'Capacity',  value: _capacityLabel(spot.rough_capacity), icon: '👥' },
  ];

  items.forEach(({ label, value, icon }) => {
    const item       = document.createElement('div');
    item.className   = 'amenity-item';
    item.innerHTML   = `<span class="amenity-icon">${icon}</span>
                        <span class="amenity-label">${label}</span>
                        <span class="amenity-value">${value}</span>`;
    grid.appendChild(item);
  });

  return grid;
}

function _buildScheduleNote(spot) {
  // Placeholder — the actual schedule note ("No class until 1:00 PM") is
  // populated asynchronously by fetchScheduleForSpot() in smartSuggestions.js.
  // This element's textContent is updated after the async call resolves.
  const note       = document.createElement('p');
  note.className   = 'schedule-note';
  note.id          = `schedule-note-${spot.id}`;
  note.textContent = ''; // filled in later
  return note;
}

function _buildClaimsSection(activeClaims, capacity) {
  const section    = document.createElement('div');
  section.className = 'claims-section';

  if (activeClaims.length > 0) {
    const heading    = document.createElement('p');
    heading.className = 'claims-heading';
    heading.textContent = 'Groups heading here:';
    section.appendChild(heading);

    activeClaims.forEach(claim => {
      const row       = document.createElement('p');
      row.className   = 'claim-row';
      row.textContent = `· ${_groupLabel(claim.group_size_key)} (${timeAgo(claim.claimed_at)})`;
      section.appendChild(row);
    });

    const rem       = document.createElement('p');
    rem.className   = 'capacity-remaining';
    rem.textContent = capacity.label;
    section.appendChild(rem);
  }

  return section;
}

function _buildActions(spotId, status, group, myGroupPinId) {
  const actions    = document.createElement('div');
  actions.className = 'spot-actions';

  // ── Perch Here (group pin drop) ── visible only when in a group
  if (group) {
    const perchBtn       = document.createElement('button');
    perchBtn.type        = 'button';
    perchBtn.className   = 'btn btn-group-pin btn-full';

    if (myGroupPinId) {
      // Pinner already has a live pin — let them end it from here.
      perchBtn.textContent = 'End My Pin';
      perchBtn.classList.add('btn-group-pin--end');
      perchBtn.addEventListener('click', () => {
        emit(GROUP_PIN_EVENTS.END_REQUESTED, { pinId: myGroupPinId });
      });
    } else {
      perchBtn.textContent = 'Perch Here';
      perchBtn.style.setProperty('--group-color', group.color);
      perchBtn.addEventListener('click', () => {
        emit(GROUP_PIN_EVENTS.DROP_REQUESTED, { spotId });
      });
    }

    actions.appendChild(perchBtn);
  }

  // ── I'm Going Here (anonymous claim) ──
  if (status !== 'full') {
    const claimBtn       = document.createElement('button');
    claimBtn.type        = 'button';
    claimBtn.className   = 'btn btn-primary btn-full';
    claimBtn.textContent = "I'm Going Here";
    claimBtn.addEventListener('click', () => {
      emit(EVENTS.UI_CLAIM_REQUESTED, { spotId });
    });
    actions.appendChild(claimBtn);
  }

  // ── It's Full ──
  const reportBtn       = document.createElement('button');
  reportBtn.type        = 'button';
  reportBtn.className   = 'btn btn-danger btn-full';
  reportBtn.textContent = "It's Full";
  reportBtn.addEventListener('click', () => {
    emit(EVENTS.UI_REPORT_REQUESTED, { spotId });
  });
  actions.appendChild(reportBtn);

  return actions;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function _yesNo(val)       { return val ? 'Yes' : 'No'; }
function _capitalize(str)  { return str ? str.charAt(0).toUpperCase() + str.slice(1) : '—'; }
function _wifiLabel(str) {
  const map = { strong: 'Strong', weak: 'Weak', none: 'None' };
  return map[str] ?? '—';
}
function _capacityLabel(rough) {
  const map = { small: '~8 ppl', medium: '~20 ppl', large: '~40 ppl' };
  return map[rough] ?? '—';
}
function _groupLabel(key) {
  const map = { solo: '1 person', small: '2–5 ppl', medium: '6–15 ppl', large: '16+ ppl' };
  return map[key] ?? key;
}
