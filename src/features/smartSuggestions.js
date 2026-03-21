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

import { on, emit, EVENTS }               from '../core/events.js';
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
  const { spots, confidence, userLocation, viewMode } = getState();

  const ranked = _rankSpots(spots, confidence, { ...filters, userLocation, viewMode });

  // 1. Update the map highlights (highlights all matches)
  _applyMapHighlight(ranked.map(s => s.id));

  // 2. Notify the UI to show the top 3 results
  emit(EVENTS.UI_SUGGEST_OPENED, { rankedSpots: ranked });
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
 * Ranking criteria:
 *  1. Meets all required filter criteria (hard filter)
 *  2. Sorted by effective score descending
 *     - On-campus spots receive a +0.15 soft bonus in campus mode
 *     - Spots with a recency signal (confidence updated < 15 min ago) get +0.10
 *     - Walk-time distance penalty applied when GPS is available
 *  3. Spots with _score < 0.15 are annotated _isBusy: true (not excluded)
 *
 * @param {object[]} spots
 * @param {object}   confidence  - Record<spotId, { score, updatedAt? }>
 * @param {object}   filters     - { groupSize, needs, nearBuilding, userLocation, viewMode }
 * @returns {object[]} filtered + ranked spots (annotated with _score, _distance, _isBusy)
 */
export function _rankSpots(spots, confidence, filters) {
  const { userLocation, viewMode = 'campus' } = filters;

  return spots
    .filter(spot => _matchesFilters(spot, filters))
    .map(spot => {
      const score = _effectiveScore(spot, confidence, userLocation, viewMode);
      return {
        ...spot,
        _distance: userLocation ? _calculateDistance(userLocation, { lat: spot.lat, lng: spot.lng }) : null,
        _score: score,
        _isBusy: score < 0.15,
      };
    })
    .sort((a, b) => b._score - a._score);
}

/**
 * Calculate the great-circle distance between two points (Haversine formula).
 * Returns distance in meters.
 *
 * @param {{lat: number, lng: number}} p1
 * @param {{lat: number, lng: number}} p2
 * @returns {number} meters
 */
function _calculateDistance(p1, p2) {
  if (!p1 || !p2 || p1.lat === undefined || p2.lat === undefined) return Infinity;

  const R = 6371e3; // Earth radius in meters
  const φ1 = p1.lat * Math.PI / 180;
  const φ2 = p2.lat * Math.PI / 180;
  const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
  const Δλ = (p2.lng - p1.lng) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
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

function _effectiveScore(spot, confidence, userLocation, viewMode = 'campus') {
  const conf = confidence[spot.id];
  let baseScore = 0.5;

  if (conf) {
    const isValid = !conf.validUntil || new Date(conf.validUntil) > new Date();
    if (isValid) baseScore = conf.score ?? 0.5;
  }

  // Soft on-campus bonus in campus mode.
  if (viewMode === 'campus' && spot.on_campus) {
    baseScore += 0.15;
  }

  // Recency bonus: confidence entry updated within the last 15 minutes.
  if (conf?.updatedAt) {
    const ageMs = Date.now() - new Date(conf.updatedAt).getTime();
    if (ageMs < 15 * 60 * 1000) {
      baseScore += 0.10;
    }
  }

  let walkPenalty = 0;

  if (userLocation && spot.lat !== undefined && spot.lng !== undefined) {
    // Calculate distance-based penalty (assuming 84m/min walking speed)
    const distanceMeters = _calculateDistance(userLocation, { lat: spot.lat, lng: spot.lng });
    const walkMins      = distanceMeters / 84;
    walkPenalty         = 0.05 * walkMins;
  } else if (!spot.on_campus) {
    // Fallback to static walk_time_min for off-campus spots if GPS unavailable
    walkPenalty = 0.05 * (spot.walk_time_min ?? 0);
  }

  return Math.max(0, baseScore - walkPenalty);
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
