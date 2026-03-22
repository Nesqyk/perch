/**
 * src/ui/suggestionsList.js
 *
 * Renders ranked spot suggestions after a user clicks "Find My Spot".
 * Shows the top 5 results as horizontally-scrolling rich cards with rank,
 * building eyebrow, spot name, score-coloured left border, walk time,
 * capacity, amenity icons, and a "Go →" CTA.
 *
 * When there are more than 5 total results a "View all N results →" text
 * button is rendered below the scroll track. Clicking it opens a fullscreen
 * modal with every result displayed as a compact horizontal row.
 *
 * Clicking any card or compact row emits EVENTS.SPOT_SELECTED with
 * { spotId, navigate: true } so the spot card modal opens AND the map pans
 * to place the selection marker.
 *
 * Results are injected into the #suggestions-inject slot inside the Find tab
 * body of filterPanel.js — no standalone header or close button is needed.
 *
 * Imported styles: src/styles/suggestionsList.css
 */

import { Zap, Volume2, Utensils, Wifi, ArrowRight, X } from 'lucide';
import { emit, EVENTS } from '../core/events.js';
import { formatWalkTime } from '../utils/time.js';
import { iconSvg } from './icons.js';

import '../styles/suggestionsList.css';

// ─── Constants ────────────────────────────────────────────────────────────────

/** @type {Record<string, string>} */
const CAPACITY_LABELS = {
  solo:   '~1 person',
  small:  '~8 ppl',
  medium: '~20 ppl',
  large:  '~40 ppl',
};

// ─── Module state ─────────────────────────────────────────────────────────────

/**
 * Full annotated ranked list from the last renderSuggestionsList call.
 * Used by the "View All" modal to show results beyond the top 5.
 *
 * @type {object[]}
 */
let _lastAllSuggestions = [];

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Annotate all ranked spots with a walkTimeLabel where GPS distance is known.
 * Does NOT slice — callers decide how many to display.
 *
 * @param {object[]} rankedSpots
 * @returns {object[]}
 */
export function formatSuggestions(rankedSpots) {
  return rankedSpots.map(spot => {
    const formatted = { ...spot };
    if (spot._distance !== undefined && spot._distance !== null) {
      formatted.walkTimeLabel = formatWalkTime(spot._distance);
    }
    return formatted;
  });
}

// ─── Render ──────────────────────────────────────────────────────────────────

/**
 * Render the top 5 suggestions into a container element.
 * If more than 5 results exist, a "View all N results →" button is appended
 * below the scroll track.
 *
 * @param {HTMLElement} container
 * @param {object[]}    rankedSpots  - full ranked list (not pre-sliced)
 * @returns {void}
 */
export function renderSuggestionsList(container, rankedSpots) {
  _lastAllSuggestions = formatSuggestions(rankedSpots);

  container.innerHTML = '';
  container.appendChild(_buildSuggestionsList(_lastAllSuggestions));
}

// ─── Private builders ─────────────────────────────────────────────────────────

/**
 * Build the wrapper: horizontal scroll row (top 5) + optional "View All" link.
 *
 * @param {object[]} allSuggestions - full annotated list
 * @returns {HTMLElement}
 */
function _buildSuggestionsList(allSuggestions) {
  const wrapper = document.createElement('div');
  wrapper.className = 'suggestions-list';

  if (allSuggestions.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'suggestions-list__empty';
    empty.textContent = 'No spots match your filters. Try adjusting them!';
    wrapper.appendChild(empty);
    return wrapper;
  }

  // ── Horizontal scroll row — top 5 only ──
  const list = document.createElement('div');
  list.className = 'suggestions-list__items';

  allSuggestions.slice(0, 5).forEach((spot, index) => {
    list.appendChild(_buildCard(spot, index + 1));
  });

  wrapper.appendChild(list);

  // ── "View All" button — only when there are more than 5 results ──
  if (allSuggestions.length > 5) {
    wrapper.appendChild(_buildViewAllButton(allSuggestions));
  }

  return wrapper;
}

/**
 * "View all N results →" text button rendered below the scroll track.
 *
 * @param {object[]} allSuggestions
 * @returns {HTMLElement}
 */
function _buildViewAllButton(allSuggestions) {
  const btn = document.createElement('button');
  btn.type      = 'button';
  btn.className = 'suggestions-list__view-all';
  btn.textContent = `View all ${allSuggestions.length} results →`;
  btn.addEventListener('click', () => _openViewAllModal(allSuggestions));
  return btn;
}

/**
 * Build a single horizontally-fixed-width ranked suggestion card.
 * Card click → SPOT_SELECTED with navigate:true (opens modal + pans map).
 * "Go →" button fires the same event (visual affordance, same behaviour).
 *
 * @param {object} spot  - annotated with _score, _isBusy, walkTimeLabel
 * @param {number} rank  - 1-based position
 * @returns {HTMLElement}
 */
function _buildCard(spot, rank) {
  const borderMod = _borderMod(spot);

  const card = document.createElement('div');
  card.className = `suggestion-item suggestion-item--${borderMod}`;

  // Eyebrow: rank + building
  const eyebrow = document.createElement('div');
  eyebrow.className = 'suggestion-item__eyebrow';

  const rankEl = document.createElement('span');
  rankEl.className   = 'suggestion-item__rank';
  rankEl.textContent = `#${rank}`;

  const buildingEl = document.createElement('span');
  buildingEl.className   = 'suggestion-item__building';
  buildingEl.textContent = spot.building ?? (spot.on_campus ? 'Campus' : 'Off campus');

  eyebrow.appendChild(rankEl);
  if (spot.building || spot.on_campus !== undefined) eyebrow.appendChild(buildingEl);
  card.appendChild(eyebrow);

  // Name row
  const nameRow = document.createElement('div');
  nameRow.className = 'suggestion-item__name-row';

  const name = document.createElement('h3');
  name.className   = 'suggestion-item__name';
  name.textContent = spot.name;
  nameRow.appendChild(name);

  if (spot._isBusy === true) {
    const busyBadge = document.createElement('span');
    busyBadge.className   = 'suggestion-item__busy-badge';
    busyBadge.textContent = 'Likely full';
    nameRow.appendChild(busyBadge);
  }

  card.appendChild(nameRow);

  // Footer: meta + Go button
  const footer = document.createElement('div');
  footer.className = 'suggestion-item__footer';

  footer.appendChild(_buildMeta(spot));

  const goBtn = document.createElement('button');
  goBtn.className = `suggestion-item__go suggestion-item__go--${borderMod}`;
  goBtn.setAttribute('aria-label', 'Open spot');
  goBtn.innerHTML = iconSvg(ArrowRight, 14);
  goBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emit(EVENTS.SPOT_SELECTED, { spotId: spot.id, navigate: true });
  });

  footer.appendChild(goBtn);
  card.appendChild(footer);

  // Whole-card click: open spot modal AND pan map
  card.addEventListener('click', () => {
    emit(EVENTS.SPOT_SELECTED, { spotId: spot.id, navigate: true });
  });

  return card;
}

// ─── View All modal ───────────────────────────────────────────────────────────

const _OVERLAY_ID = 'suggestions-all-overlay';

/**
 * Create (once) and show the "View All" modal populated with compact rows.
 *
 * @param {object[]} allSuggestions
 * @returns {void}
 */
function _openViewAllModal(allSuggestions) {
  let overlay = document.getElementById(_OVERLAY_ID);

  if (!overlay) {
    overlay = _createModalSkeleton();
    document.body.appendChild(overlay);
  }

  // Populate the scrollable body
  const body = overlay.querySelector('.suggestions-all-modal__body');
  if (body) {
    body.innerHTML = '';
    allSuggestions.forEach((spot, index) => {
      body.appendChild(_buildCompactRow(spot, index + 1));
    });
  }

  overlay.hidden = false;
}

/**
 * Hide the "View All" modal.
 *
 * @returns {void}
 */
function _closeViewAllModal() {
  const overlay = document.getElementById(_OVERLAY_ID);
  if (overlay) overlay.hidden = true;
}

/**
 * Build the modal DOM skeleton (header + empty scrollable body).
 * Created once and reused on subsequent opens.
 *
 * @returns {HTMLElement}
 */
function _createModalSkeleton() {
  const overlay = document.createElement('div');
  overlay.id        = _OVERLAY_ID;
  overlay.className = 'suggestions-all-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.hidden = true;

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) _closeViewAllModal();
  });

  const modal = document.createElement('div');
  modal.className = 'suggestions-all-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'suggestions-all-modal__header';

  const title = document.createElement('h2');
  title.className   = 'suggestions-all-modal__title';
  title.textContent = 'All Suggested Spots';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.type      = 'button';
  closeBtn.className = 'suggestions-all-modal__close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = iconSvg(X, 18);
  closeBtn.addEventListener('click', _closeViewAllModal);
  header.appendChild(closeBtn);

  modal.appendChild(header);

  // Scrollable body
  const body = document.createElement('div');
  body.className = 'suggestions-all-modal__body';
  modal.appendChild(body);

  overlay.appendChild(modal);
  return overlay;
}

/**
 * Build a compact horizontal row for the View All modal.
 * Row click → SPOT_SELECTED with navigate:true + close modal.
 *
 * @param {object} spot
 * @param {number} rank
 * @returns {HTMLElement}
 */
function _buildCompactRow(spot, rank) {
  const borderMod = _borderMod(spot);

  const row = document.createElement('div');
  row.className = 'suggestions-all-row';

  // Colored status dot
  const pill = document.createElement('span');
  pill.className = `suggestions-all-row__pill suggestions-all-row__pill--${borderMod}`;
  pill.setAttribute('aria-hidden', 'true');
  row.appendChild(pill);

  // Left: name + badges + meta
  const left = document.createElement('div');
  left.className = 'suggestions-all-row__left';

  const nameWrap = document.createElement('div');
  nameWrap.className = 'suggestions-all-row__name-wrap';

  const rankSpan = document.createElement('span');
  rankSpan.className   = 'suggestions-all-row__rank';
  rankSpan.textContent = `#${rank}`;
  nameWrap.appendChild(rankSpan);

  const nameSpan = document.createElement('span');
  nameSpan.className   = 'suggestions-all-row__name';
  nameSpan.textContent = spot.name;
  nameWrap.appendChild(nameSpan);

  if (spot._isBusy === true) {
    const badge = document.createElement('span');
    badge.className   = 'suggestion-item__busy-badge';
    badge.textContent = 'Likely full';
    nameWrap.appendChild(badge);
  }

  left.appendChild(nameWrap);
  left.appendChild(_buildMeta(spot));
  row.appendChild(left);

  // Right: Go button
  const goBtn = document.createElement('button');
  goBtn.type      = 'button';
  goBtn.className = `suggestion-item__go suggestion-item__go--${borderMod}`;
  goBtn.setAttribute('aria-label', 'Open spot');
  goBtn.innerHTML = iconSvg(ArrowRight, 14);
  goBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emit(EVENTS.SPOT_SELECTED, { spotId: spot.id, navigate: true });
    _closeViewAllModal();
  });
  row.appendChild(goBtn);

  // Whole-row click
  row.addEventListener('click', () => {
    emit(EVENTS.SPOT_SELECTED, { spotId: spot.id, navigate: true });
    _closeViewAllModal();
  });

  return row;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Derive the CSS border-modifier string from a spot's score / busy flag.
 *
 * @param {object} spot
 * @returns {'free' | 'maybe' | 'full'}
 */
function _borderMod(spot) {
  if (spot._isBusy === true || spot._score < 0.15) return 'full';
  if (spot._score < 0.5) return 'maybe';
  return 'free';
}

/**
 * Build the shared meta row (walk time · capacity · amenity icons).
 * Used by both the card and the compact row.
 *
 * @param {object} spot
 * @returns {HTMLElement}
 */
function _buildMeta(spot) {
  const meta = document.createElement('div');
  meta.className = 'suggestion-item__meta';

  if (spot.walkTimeLabel) {
    const walk = document.createElement('span');
    walk.className   = 'suggestion-item__walk';
    walk.textContent = spot.walkTimeLabel;
    meta.appendChild(walk);
  }

  const capLabel = CAPACITY_LABELS[spot.rough_capacity] ?? spot.rough_capacity ?? '';
  if (capLabel) {
    if (meta.children.length) {
      const sep = document.createElement('span');
      sep.className = 'suggestion-item__sep';
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = '·';
      meta.appendChild(sep);
    }
    const cap = document.createElement('span');
    cap.className   = 'suggestion-item__cap';
    cap.textContent = capLabel;
    meta.appendChild(cap);
  }

  const amenities = document.createElement('span');
  amenities.className = 'suggestion-item__amenities';
  if (spot.noise_baseline === 'quiet') amenities.innerHTML += iconSvg(Volume2, 14);
  if (spot.has_outlets)               amenities.innerHTML += iconSvg(Zap, 14);
  if (spot.wifi_strength !== 'none')  amenities.innerHTML += iconSvg(Wifi, 14);
  if (spot.has_food)                  amenities.innerHTML += iconSvg(Utensils, 14);
  if (amenities.innerHTML) meta.appendChild(amenities);

  return meta;
}
