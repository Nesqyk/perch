/**
 * src/ui/suggestionsList.js
 *
 * Renders the "Top 3" suggested spots after a user clicks "Find My Spot".
 * Displays spot name, confidence, capacity, and amenities.
 */

import { X, Navigation, Users, Wifi, Zap, Volume2, Utensils } from 'lucide';
import { emit, EVENTS } from '../core/events.js';
import { formatConfidence } from '../utils/confidence.js';
import { formatWalkTime } from '../utils/time.js';
import { iconSvg } from './icons.js';

// ─── Logic ───────────────────────────────────────────────────────────────────

/**
 * Capacity mapping for display text.
 */
const CAPACITY_LABELS = {
  'solo': '~1 person',
  'small': '~8 ppl',
  'medium': '~20 ppl',
  'large': '~40 ppl'
};

/**
 * Take ranked spots and prepare the top 3 for display.
 *
 * @param {object[]} rankedSpots
 * @returns {object[]} top 3 spots with walkTimeLabel
 */
export function formatSuggestions(rankedSpots) {
  return rankedSpots.slice(0, 3).map(spot => {
    const formatted = { ...spot };
    if (spot._distance !== undefined && spot._distance !== null) {
      formatted.walkTimeLabel = formatWalkTime(spot._distance);
    }
    return formatted;
  });
}

// ─── Render ──────────────────────────────────────────────────────────────────

/**
 * Render the top suggestions into a container.
 *
 * @param {HTMLElement} container
 * @param {object[]}    rankedSpots
 */
export function renderSuggestionsList(container, rankedSpots) {
  const suggestions = formatSuggestions(rankedSpots);

  container.innerHTML = '';
  container.appendChild(_buildSuggestionsList(suggestions));
}

function _buildSuggestionsList(suggestions) {
  const wrapper = document.createElement('div');
  wrapper.className = 'suggestions-list';

  // Header
  const header = document.createElement('div');
  header.className = 'suggestions-list__header';
  
  const title = document.createElement('h2');
  title.className = 'suggestions-list__title';
  title.textContent = 'Top Suggestions';
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'suggestions-list__close';
  closeBtn.innerHTML = iconSvg(X, 20);
  closeBtn.addEventListener('click', () => {
    emit(EVENTS.SPOT_DESELECTED); // Use existing event to reset UI to filters
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

  // List
  const list = document.createElement('div');
  list.className = 'suggestions-list__items';

  suggestions.forEach(spot => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    
    // Top Row: Name + Confidence Badge
    const topRow = document.createElement('div');
    topRow.className = 'suggestion-item__col suggestion-item__col--top';

    const name = document.createElement('h3');
    name.className = 'suggestion-item__name';
    name.textContent = spot.name;

    const conf = formatConfidence(spot._score);
    const confBadge = document.createElement('span');
    confBadge.className = 'suggestion-item__badge';
    
    // Use the same confidence classes as defined in main.css for color consistency
    if (spot._score >= 0.8) confBadge.classList.add('suggestion-item__badge--high');
    else if (spot._score >= 0.5) confBadge.classList.add('suggestion-item__badge--mid');
    else confBadge.classList.add('suggestion-item__badge--low');
    
    confBadge.textContent = `${conf.percent}% Match`;

    topRow.appendChild(name);
    topRow.appendChild(confBadge);

    // Bottom Row: Capacity + Amenities + Navigate Button
    const bottomRow = document.createElement('div');
    bottomRow.className = 'suggestion-item__row suggestion-item__row--bottom';

    // Left side of bottom row: Capacity
    const capInfo = document.createElement('div');
    capInfo.className = 'suggestion-item__cap';
    const capLabel = CAPACITY_LABELS[spot.rough_capacity] || spot.rough_capacity;
    capInfo.innerHTML = `${iconSvg(Users, 14)} <span>${capLabel}</span>`;

    // Right side of bottom row: Amenities + Nav
    const rightActions = document.createElement('div');
    rightActions.className = 'suggestion-item__actions';

    const amenities = document.createElement('div');
    amenities.className = 'suggestion-item__amenities';
    
    if (spot.wifi_strength !== 'none') amenities.innerHTML += iconSvg(Wifi, 14);
    if (spot.has_outlets) amenities.innerHTML += iconSvg(Zap, 14);
    if (spot.noise_baseline === 'quiet') amenities.innerHTML += iconSvg(Volume2, 14);
    if (spot.has_food) amenities.innerHTML += iconSvg(Utensils, 14);

    const navBtn = document.createElement('button');
    navBtn.className = 'suggestion-item__nav';
    navBtn.innerHTML = `${iconSvg(Navigation, 14)} <span>Navigate</span>`;
    navBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      emit(EVENTS.SPOT_SELECTED, { spotId: spot.id, navigate: true });
    });

    rightActions.appendChild(amenities);
    rightActions.appendChild(navBtn);

    bottomRow.appendChild(capInfo);
    bottomRow.appendChild(rightActions);

    item.appendChild(topRow);
    item.appendChild(bottomRow);

    item.addEventListener('click', () => {
      emit(EVENTS.SPOT_SELECTED, { spotId: spot.id });
    });

    list.appendChild(item);
  });

  wrapper.appendChild(list);
  return wrapper;
}
