/**
 * src/ui/suggestionsList.js
 *
 * Renders ranked spot suggestions after a user clicks "Find My Spot".
 * Shows up to 5 results as rich cards with rank number, building eyebrow,
 * spot name, score-coloured left border, walk time, capacity, amenity icons,
 * and a "Go →" CTA. Busy/full spots get a red border and "Likely full" badge.
 *
 * Imported styles: src/styles/suggestionsList.css
 */

import { X, Zap, Volume2, Utensils, Wifi, ArrowRight } from 'lucide';
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

// ─── Logic ───────────────────────────────────────────────────────────────────

/**
 * Take ranked spots and prepare the top 5 for display.
 * Annotates each spot with a `walkTimeLabel` if GPS distance is available.
 *
 * @param {object[]} rankedSpots
 * @returns {object[]} top 5 spots with walkTimeLabel
 */
export function formatSuggestions(rankedSpots) {
  return rankedSpots.slice(0, 5).map(spot => {
    const formatted = { ...spot };
    if (spot._distance !== undefined && spot._distance !== null) {
      formatted.walkTimeLabel = formatWalkTime(spot._distance);
    }
    return formatted;
  });
}

// ─── Render ──────────────────────────────────────────────────────────────────

/**
 * Render the top suggestions into a container element.
 *
 * @param {HTMLElement} container
 * @param {object[]}    rankedSpots
 * @returns {void}
 */
export function renderSuggestionsList(container, rankedSpots) {
  const suggestions = formatSuggestions(rankedSpots);

  container.innerHTML = '';
  container.appendChild(_buildSuggestionsList(suggestions));
}

// ─── Private ─────────────────────────────────────────────────────────────────

/**
 * Build the full suggestions list DOM tree.
 *
 * @param {object[]} suggestions
 * @returns {HTMLElement}
 */
function _buildSuggestionsList(suggestions) {
  const wrapper = document.createElement('div');
  wrapper.className = 'suggestions-list';

  const header = document.createElement('div');
  header.className = 'suggestions-list__header';

  const title = document.createElement('h2');
  title.className = 'suggestions-list__title';
  title.textContent = 'Top Suggestions';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'suggestions-list__close';
  closeBtn.setAttribute('aria-label', 'Close suggestions');
  closeBtn.innerHTML = iconSvg(X, 20);
  closeBtn.addEventListener('click', () => {
    emit(EVENTS.SPOT_DESELECTED);
  });

  header.appendChild(title);
  header.appendChild(closeBtn);
  wrapper.appendChild(header);

  if (suggestions.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'suggestions-list__empty';
    empty.textContent = 'No spots match your filters. Try adjusting them!';
    wrapper.appendChild(empty);
    return wrapper;
  }

  const list = document.createElement('div');
  list.className = 'suggestions-list__items';

  suggestions.forEach((spot, index) => {
    list.appendChild(_buildCard(spot, index + 1));
  });

  wrapper.appendChild(list);
  return wrapper;
}

/**
 * Build a single ranked suggestion card.
 *
 * @param {object} spot     - spot object annotated with _score, _isBusy, walkTimeLabel
 * @param {number} rank     - 1-based rank position
 * @returns {HTMLElement}
 */
function _buildCard(spot, rank) {
  const isBusy = spot._isBusy === true;

  // Score-based border colour modifier
  let borderMod = 'free';
  if (isBusy || spot._score < 0.15) borderMod = 'full';
  else if (spot._score < 0.5)       borderMod = 'maybe';

  const card = document.createElement('div');
  card.className = `suggestion-item suggestion-item--${borderMod}`;

  // Eyebrow: rank + building name
  const eyebrow = document.createElement('div');
  eyebrow.className = 'suggestion-item__eyebrow';

  const rankEl = document.createElement('span');
  rankEl.className = 'suggestion-item__rank';
  rankEl.textContent = `#${rank}`;

  const buildingEl = document.createElement('span');
  buildingEl.className = 'suggestion-item__building';
  buildingEl.textContent = spot.building ?? (spot.on_campus ? 'Campus' : 'Off campus');

  eyebrow.appendChild(rankEl);
  if (spot.building || spot.on_campus !== undefined) eyebrow.appendChild(buildingEl);
  card.appendChild(eyebrow);

  // Name row
  const nameRow = document.createElement('div');
  nameRow.className = 'suggestion-item__name-row';

  const name = document.createElement('h3');
  name.className = 'suggestion-item__name';
  name.textContent = spot.name;

  if (isBusy) {
    const busyBadge = document.createElement('span');
    busyBadge.className = 'suggestion-item__busy-badge';
    busyBadge.textContent = 'Likely full';
    nameRow.appendChild(name);
    nameRow.appendChild(busyBadge);
  } else {
    nameRow.appendChild(name);
  }

  card.appendChild(nameRow);

  // Footer row: walk time + capacity + amenities + Go button
  const footer = document.createElement('div');
  footer.className = 'suggestion-item__footer';

  const meta = document.createElement('div');
  meta.className = 'suggestion-item__meta';

  if (spot.walkTimeLabel) {
    const walkChip = document.createElement('span');
    walkChip.className = 'suggestion-item__walk';
    walkChip.textContent = spot.walkTimeLabel;
    meta.appendChild(walkChip);
  }

  const capLabel = CAPACITY_LABELS[spot.rough_capacity] ?? spot.rough_capacity ?? '';
  if (capLabel) {
    const sep = document.createElement('span');
    sep.className = 'suggestion-item__sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '·';

    const cap = document.createElement('span');
    cap.className = 'suggestion-item__cap';
    cap.textContent = capLabel;

    meta.appendChild(sep);
    meta.appendChild(cap);
  }

  const amenities = document.createElement('span');
  amenities.className = 'suggestion-item__amenities';
  if (spot.noise_baseline === 'quiet') amenities.innerHTML += iconSvg(Volume2, 16);
  if (spot.has_outlets)               amenities.innerHTML += iconSvg(Zap, 16);
  if (spot.wifi_strength !== 'none')  amenities.innerHTML += iconSvg(Wifi, 16);
  if (spot.has_food)                  amenities.innerHTML += iconSvg(Utensils, 16);
  if (amenities.innerHTML) meta.appendChild(amenities);

  const goBtn = document.createElement('button');
  goBtn.className = `suggestion-item__go suggestion-item__go--${borderMod}`;
  goBtn.setAttribute('aria-label', 'Navigate to spot');
  goBtn.innerHTML = iconSvg(ArrowRight, 14);
  goBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emit(EVENTS.SPOT_SELECTED, { spotId: spot.id, navigate: true });
  });

  footer.appendChild(meta);
  footer.appendChild(goBtn);
  card.appendChild(footer);

  card.addEventListener('click', () => {
    emit(EVENTS.SPOT_SELECTED, { spotId: spot.id });
  });

  return card;
}
