/**
 * src/features/smartSuggestions.js
 *
 * Feature 1: Smart Spot Suggestions.
 *
 * Listens for UI_FILTER_SUBMITTED, applies the active filters to the
 * spots in the store, ranks results by confidence score, and updates
 * the map to highlight matching pins while dimming others.
 *
 * Also fetches the schedule note for the selected spot ("No class until 1:00 PM")
 * and injects it into the spot card once the async call resolves.
 *
 * No new state shape is introduced here — the filter state lives in
 * store.js and this module only reads it. The ranked results are
 * communicated back to the map via store events (SPOTS_LOADED carries
 * all spots; the filter is a view-layer concern, not a data concern).
 */

import { on, EVENTS }               from '../core/events.js';
import { getState }                  from '../core/store.js';
import { fetchScheduleForSpot }      from '../api/spots.js';
import { formatTime }                from '../utils/time.js';

// ─── Initialise ──────────────────────────────────────────────────────────────

export function initSmartSuggestions() {
  on(EVENTS.UI_FILTER_SUBMITTED, _onFilterSubmitted);
  on(EVENTS.SPOT_SELECTED,       _onSpotSelected);
}

// ─── Handlers ────────────────────────────────────────────────────────────────

function _onFilterSubmitted(e) {
  const { filters }   = e.detail;
  const { spots, confidence } = getState();

  const ranked = _rankSpots(spots, confidence, filters);

  // Update the map by adding a visual class to matching vs non-matching pins.
  // Pins module reads confidence + claims for colour; we annotate the spot
  // elements with a data attribute so CSS can dim non-results.
  _applyMapHighlight(ranked.map(s => s.id));
}

async function _onSpotSelected(e) {
  const { spotId } = e.detail;

  // Fetch and display the schedule note for the selected spot.
  const entries = await fetchScheduleForSpot(spotId);
  _updateScheduleNote(spotId, entries);
}

// ─── Ranking logic ────────────────────────────────────────────────────────────

/**
 * Filter and rank spots for the current filter selection.
 *
 * Ranking criteria (in order):
 *  1. Meets all required filter criteria (hard filter)
 *  2. Sorted by confidence score descending
 *  3. Off-campus spots ranked after on-campus (walk penalty)
 *
 * @param {object[]} spots
 * @param {object}   confidence  - Record<spotId, { score }>
 * @param {object}   filters     - { groupSize, needs, nearBuilding }
 * @returns {object[]} filtered + ranked spots
 */
export function _rankSpots(spots, confidence, filters) {
  return spots
    .filter(spot => _matchesFilters(spot, filters))
    .map(spot => ({
      ...spot,
      _score: _effectiveScore(spot, confidence),
    }))
    .sort((a, b) => {
      // On-campus spots first, then by score.
      if (a.on_campus !== b.on_campus) return a.on_campus ? -1 : 1;
      return b._score - a._score;
    });
}

function _matchesFilters(spot, filters) {
  // Near building filter.
  if (filters.nearBuilding && spot.on_campus) {
    if (spot.building?.toLowerCase() !== filters.nearBuilding.toLowerCase()) {
      return false;
    }
  }

  // Needs filters.
  if (filters.needs.includes('outlet') && !spot.has_outlets)              return false;
  if (filters.needs.includes('wifi')   && spot.wifi_strength === 'none')  return false;
  if (filters.needs.includes('quiet')  && spot.noise_baseline === 'loud') return false;
  if (filters.needs.includes('food')   && !spot.has_food)                 return false;

  // Group size filter (rough capacity check).
  if (filters.groupSize) {
    const minRequired = GROUP_SIZE_MIN[filters.groupSize] ?? 1;
    const maxCapacity = CAPACITY_MAX[spot.rough_capacity] ?? 0;
    if (maxCapacity < minRequired) return false;
  }

  return true;
}

function _effectiveScore(spot, confidence) {
  const conf = confidence[spot.id];
  if (!conf) return 0.5;
  if (conf.validUntil && new Date(conf.validUntil) < new Date()) return 0.5;
  // Small walk penalty for off-campus spots.
  const walkPenalty = spot.on_campus ? 0 : 0.05 * (spot.walk_time_min ?? 0);
  return Math.max(0, (conf.score ?? 0.5) - walkPenalty);
}

// ─── Map highlight ────────────────────────────────────────────────────────────

/**
 * Dim map pins that are not in the results set.
 * We use a data attribute on the map container that CSS uses to toggle
 * the dimming class on individual markers.
 *
 * In a full implementation this would manipulate marker opacity via the
 * Maps API. For Phase 1 we set a data attribute on #map-container and
 * use CSS to visually guide the eye.
 *
 * @param {string[]} resultIds
 */
function _applyMapHighlight(resultIds) {
  const mapContainer = document.getElementById('map-container');
  if (!mapContainer) return;

  if (resultIds.length === 0) {
    mapContainer.removeAttribute('data-filter-active');
    return;
  }

  mapContainer.dataset.filterActive = 'true';
  mapContainer.dataset.resultIds    = resultIds.join(',');
}

// ─── Schedule note ────────────────────────────────────────────────────────────

/**
 * Inject the "No class until X:XX PM" line into the spot card.
 * The element is rendered empty by spotCard.js and filled here once
 * the async fetch resolves — no re-render needed.
 *
 * @param {string}   spotId
 * @param {object[]} entries  - schedule_entries rows
 */
function _updateScheduleNote(spotId, entries) {
  const el = document.getElementById(`schedule-note-${spotId}`);
  if (!el) return;

  if (!entries || entries.length === 0) {
    el.textContent = '';
    return;
  }

  const now         = new Date();
  const dayOfWeek   = now.getDay();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  // Find the next class starting after now, today.
  const todayEntries = entries
    .filter(e => e.day_of_week === dayOfWeek)
    .map(e => ({ ...e, startMins: _timeToMins(e.start_time), endMins: _timeToMins(e.end_time) }))
    .sort((a, b) => a.startMins - b.startMins);

  const currentClass = todayEntries.find(
    e => e.startMins <= currentMins && currentMins < e.endMins
  );

  if (currentClass) {
    el.textContent = `Class in use until ${formatTime(currentClass.end_time)}`;
    return;
  }

  const nextClass = todayEntries.find(e => e.startMins > currentMins);
  if (nextClass) {
    el.textContent = `No class until ${formatTime(nextClass.start_time)}`;
    return;
  }

  el.textContent = 'No more classes today';
}

function _timeToMins(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m ?? 0);
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GROUP_SIZE_MIN = { solo: 1, small: 2, medium: 6, large: 16 };
const CAPACITY_MAX   = { small: 8, medium: 20, large: 40 };
