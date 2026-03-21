/**
 * src/state/spotState.js
 *
 * Pure derivation functions that compute the current display state
 * of a spot from raw store data.
 *
 * Nothing here reads the DOM or emits events.
 * These functions are called by pins.js (for pin color) and
 * spotCard.js (for the status badge) so both stay in sync from
 * the same logic without duplicating it.
 *
 * Status priority (highest wins):
 *   1. full    — recent "Report Full" correction in last 30 min
 *   2. claimed — at least one active claim
 *   3. free    — confidence score >= 0.65
 *   4. maybe   — everything else (uncertain / low confidence)
 *
 * Also exports campusStats() which derives per-campus spot/claim
 * summary data for the campus selector card row.
 */

import { getState } from '../core/store.js';

/**
 * Derive the display status for a spot.
 *
 * @param {string} spotId
 * @returns {'free' | 'maybe' | 'claimed' | 'full'}
 */
export function deriveSpotStatus(spotId) {
  const { confidence, claims } = getState();

  const conf   = confidence[spotId];
  const score  = _effectiveScore(conf);
  const active = _activeClaimsForSpot(spotId, claims);

  // A score of <= 0.15 means a very recent correction tanked it.
  if (score <= 0.15) return 'full';

  // Any active claim makes the spot "claimed" (blue) regardless of score.
  if (active.length > 0) return 'claimed';

  if (score >= 0.65) return 'free';

  return 'maybe';
}

/**
 * Return the active (non-cancelled, non-expired) claims for a spot.
 *
 * @param {string}                   spotId
 * @param {Record<string, object[]>} claims  - from store
 * @returns {object[]}
 */
export function getActiveClaimsForSpot(spotId, claims) {
  return _activeClaimsForSpot(spotId, claims);
}

/**
 * Compute the rough remaining capacity for a spot.
 *
 * @param {object}   spot    - spot row (has rough_capacity)
 * @param {object[]} claims  - active claims for this spot
 * @returns {{ remaining: number | null, label: string }}
 */
export function deriveRemainingCapacity(spot, claims) {
  const max = CAPACITY_MAP[spot.rough_capacity] ?? null;
  if (max === null) return { remaining: null, label: 'Unknown capacity' };

  const claimed = claims.reduce((sum, c) => sum + (c.group_size_min ?? 1), 0);
  const remaining = Math.max(0, max - claimed);

  return {
    remaining,
    label: remaining === 0
      ? 'Likely full'
      : `~${remaining} ${remaining === 1 ? 'person' : 'people'} can still fit`,
  };
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function _effectiveScore(conf) {
  if (!conf) return 0.5; // no data → uncertain

  // If the confidence record has expired, drift toward 0.5 (uncertain).
  if (conf.validUntil && new Date(conf.validUntil) < new Date()) {
    return 0.5;
  }

  return conf.score ?? 0.5;
}

function _activeClaimsForSpot(spotId, claims) {
  const list = claims[spotId] ?? [];
  const now  = new Date();
  return list.filter(c =>
    !c.cancelled_at &&
    (!c.expires_at || new Date(c.expires_at) > now)
  );
}

// ─── Campus stats ─────────────────────────────────────────────────────────────

/**
 * Derive per-campus statistics from the spots and claims already in the store.
 *
 * This is a pure function — no store reads, no side effects.
 * Called by campusSelector.js to populate the campus card row.
 *
 * @param {object[]}                   campuses - Campus rows from store
 * @param {object[]}                   spots    - Spot rows from store
 * @param {Record<string, object[]>}   claims   - Active claims map from store
 * @returns {Map<string, { spotCount: number, liveClaimCount: number, liveClaimantCount: number }>}
 */
export function campusStats(campuses, spots, claims) {
  const stats = new Map();

  // Initialise every campus with zero counts so callers never get undefined.
  for (const campus of campuses) {
    stats.set(campus.id, { spotCount: 0, liveClaimCount: 0, liveClaimantCount: 0 });
  }

  // Count spots per campus and accumulate live claim data.
  for (const spot of spots) {
    if (!spot.campus_id || !stats.has(spot.campus_id)) continue;
    const entry = stats.get(spot.campus_id);
    entry.spotCount += 1;

    const spotClaims = _activeClaimsForSpot(spot.id, claims);
    entry.liveClaimCount += spotClaims.length;

    // Unique claimants: collect user_ids into a Set stored on the entry.
    if (!entry._claimantSet) entry._claimantSet = new Set();
    for (const c of spotClaims) {
      if (c.user_id) entry._claimantSet.add(c.user_id);
    }
  }

  // Materialise claimant count and remove the internal Set.
  for (const entry of stats.values()) {
    entry.liveClaimantCount = entry._claimantSet ? entry._claimantSet.size : 0;
    delete entry._claimantSet;
  }

  return stats;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Maps rough_capacity strings to an approximate head count.
 * Used for the remaining-capacity estimate in the spot detail card.
 */
const CAPACITY_MAP = {
  small:  8,
  medium: 20,
  large:  40,
};
