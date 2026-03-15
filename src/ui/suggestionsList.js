/**
 * src/ui/suggestionsList.js
 *
 * Renders the "Top 3" suggested spots after a user clicks "Find My Spot".
 * Displays spot name, confidence, and calculated walk time.
 */

import { X, Navigation, MapPin, Clock } from 'lucide';
import { emit, EVENTS } from '../core/events.js';
import { formatConfidence } from '../utils/confidence.js';
import { formatWalkTime } from '../utils/time.js';
import { iconSvg } from './icons.js';

// ─── Logic ───────────────────────────────────────────────────────────────────

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
    
    const info = document.createElement('div');
    info.className = 'suggestion-item__info';

    const name = document.createElement('h3');
    name.className = 'suggestion-item__name';
    name.textContent = spot.name;

    const meta = document.createElement('div');
    meta.className = 'suggestion-item__meta';
    
    const confScore = formatConfidence(spot._score);
    const confClass = spot._score >= 0.8 ? 'suggestion-item__badge--high' : 
                     spot._score >= 0.5 ? 'suggestion-item__badge--mid' : 
                     'suggestion-item__badge--low';

    const confBadge = document.createElement('span');
    confBadge.className = `suggestion-item__badge ${confClass}`;
    confBadge.innerHTML = `${iconSvg(MapPin, 12)} ${confScore} Match`;

    meta.appendChild(confBadge);

    if (spot.walkTimeLabel) {
      const walkTime = document.createElement('span');
      walkTime.className = 'suggestion-item__walk';
      walkTime.innerHTML = `${iconSvg(Clock, 12)} ${spot.walkTimeLabel}`;
      meta.appendChild(walkTime);
    }

    info.appendChild(name);
    info.appendChild(meta);

    const navBtn = document.createElement('button');
    navBtn.className = 'suggestion-item__nav';
    navBtn.innerHTML = iconSvg(Navigation, 20);
    navBtn.setAttribute('aria-label', `Navigate to ${spot.name}`);
    navBtn.addEventListener('click', () => {
      emit(EVENTS.SPOT_SELECTED, { spotId: spot.id, navigate: true });
    });

    item.appendChild(info);
    item.appendChild(navBtn);
    list.appendChild(item);
  });

  wrapper.appendChild(list);
  return wrapper;
}
