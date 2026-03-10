/**
 * src/core/store.js
 *
 * Central state — the single source of truth for the entire app.
 *
 * Rules:
 *  1. Nothing reads _state directly from outside this module.
 *     Use getState() to get a shallow-frozen snapshot.
 *  2. Nothing mutates _state directly.
 *     Use dispatch(action, payload) for every state change.
 *  3. After every mutation, dispatch fires the corresponding EVENTS.*
 *     constant so listeners re-render their own slice.
 *
 * Unidirectional flow:
 *   User action → feature module → dispatch() → _state mutated
 *   → EVENTS.* emitted → UI/map listeners re-render
 */

import { emit, EVENTS } from './events.js';

// ─── Initial state shape ─────────────────────────────────────────────────────

const _state = {
  /** Geolocation. null until the user grants permission. */
  userLocation: null,           // { lat: number, lng: number } | null

  /** Active filter selections driven by the filter panel. */
  filters: {
    groupSize:    null,         // 'solo' | 'small' | 'medium' | 'large' | null
    needs:        [],           // Array<'outlet' | 'wifi' | 'quiet' | 'food'>
    nearBuilding: null,         // building id string | null
  },

  /**
   * All approved spots fetched from Supabase.
   * Each spot object mirrors the `spots` table row plus its current
   * confidence record merged in at fetch time.
   */
  spots: [],                    // Spot[]

  /**
   * Confidence scores keyed by spot_id.
   * Updated by the background job and broadcast via Supabase Realtime.
   */
  confidence: {},               // Record<spotId, { score, reason, validUntil }>

  /**
   * Active claims keyed by spot_id.
   * Each value is an array because multiple groups can claim the same spot.
   * Populated from Supabase on load and updated via Realtime.
   */
  claims: {},                   // Record<spotId, ClaimRecord[]>

  /**
   * The current browser session's own active claim.
   * Only one claim per session at a time (by product design).
   * null when the user has no active claim.
   */
  myActiveClaim: null,          // { spotId, claimId, groupSizeKey, expiresAt } | null

  /**
   * The spot currently open in the detail panel.
   * null means the filter/home panel is shown.
   */
  selectedSpotId: null,         // string (uuid) | null

  /**
   * Shared group-chat link state.
   * Generated after a claim is made so the user can paste it into the GC.
   */
  sharedLink: {
    active:   false,            // boolean — true after first claim
    url:      '',               // full URL string
    copiedAt: null,             // Date | null — drives "Copied!" feedback
  },

  /**
   * Async operation status flags.
   * UI components watch STATUS_CHANGED to show spinners / error states.
   */
  status: {
    spotsLoading:       false,
    claimPending:       false,
    correctionPending:  false,
    error:              null,   // string | null
  },
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns a shallow-frozen snapshot of the current state.
 * Nested objects (spots array, claims map, etc.) are NOT deep-frozen
 * for performance — treat them as read-only by convention.
 */
export function getState() {
  return Object.freeze({ ..._state });
}

/**
 * The single entry point for every state mutation.
 *
 * @param {string} action   - One of the ACTION_* constants below.
 * @param {*}      payload  - Data shape depends on the action.
 */
export function dispatch(action, payload) {
  switch (action) {

    // ── Location ────────────────────────────────────────────────────────────
    case 'SET_USER_LOCATION': {
      _state.userLocation = payload; // { lat, lng }
      emit(EVENTS.LOCATION_SET, { location: payload });
      break;
    }

    // ── Filters ─────────────────────────────────────────────────────────────
    case 'SET_FILTERS': {
      // Merge partial filter updates — callers only pass what changed.
      _state.filters = { ..._state.filters, ...payload };
      emit(EVENTS.FILTERS_CHANGED, { filters: getState().filters });
      break;
    }

    case 'RESET_FILTERS': {
      _state.filters = { groupSize: null, needs: [], nearBuilding: null };
      emit(EVENTS.FILTERS_CHANGED, { filters: getState().filters });
      break;
    }

    // ── Spots ────────────────────────────────────────────────────────────────
    case 'SPOTS_LOADED': {
      _state.spots = payload.spots ?? [];
      // Confidence may be bundled in with spots at fetch time.
      if (payload.confidence) {
        _state.confidence = payload.confidence;
      }
      emit(EVENTS.SPOTS_LOADED, { spots: _state.spots });
      break;
    }

    case 'CONFIDENCE_UPDATED': {
      // Single spot confidence update pushed by Realtime.
      const { spotId, confidence } = payload;
      _state.confidence = { ..._state.confidence, [spotId]: confidence };
      emit(EVENTS.CLAIM_UPDATED, { spotId }); // reuse claim event to repaint pin
      break;
    }

    // ── Spot selection ───────────────────────────────────────────────────────
    case 'SELECT_SPOT': {
      _state.selectedSpotId = payload.spotId;
      emit(EVENTS.SPOT_SELECTED, { spotId: payload.spotId });
      break;
    }

    case 'DESELECT_SPOT': {
      _state.selectedSpotId = null;
      emit(EVENTS.SPOT_DESELECTED, {});
      break;
    }

    // ── Claims ───────────────────────────────────────────────────────────────
    case 'CLAIMS_LOADED': {
      // Initial bulk load keyed by spotId.
      _state.claims = payload.claims ?? {};
      emit(EVENTS.CLAIM_UPDATED, { spotId: null }); // null = repaint all pins
      break;
    }

    case 'CLAIM_ADDED': {
      // A new claim arrived (from Realtime or after our own claim write).
      const { spotId, claim } = payload;
      const existing = _state.claims[spotId] ?? [];
      _state.claims = {
        ..._state.claims,
        [spotId]: [...existing, claim],
      };
      // Track our own claim separately for the copy-link flow.
      if (payload.isMine) {
        _state.myActiveClaim = {
          spotId,
          claimId:      claim.id,
          groupSizeKey: claim.group_size_key,
          expiresAt:    claim.expires_at,
        };
        _state.sharedLink = {
          active:   true,
          url:      _buildShareLink(spotId),
          copiedAt: null,
        };
      }
      emit(EVENTS.CLAIM_UPDATED, { spotId, isMine: payload.isMine ?? false });
      break;
    }

    case 'CLAIM_REMOVED': {
      // Claim cancelled or expired (Realtime delete event).
      const { spotId, claimId } = payload;
      const updated = (_state.claims[spotId] ?? []).filter(c => c.id !== claimId);
      _state.claims = { ..._state.claims, [spotId]: updated };

      if (_state.myActiveClaim?.claimId === claimId) {
        _state.myActiveClaim = null;
        _state.sharedLink    = { active: false, url: '', copiedAt: null };
      }
      emit(EVENTS.CLAIM_UPDATED, { spotId });
      break;
    }

    // ── Corrections ──────────────────────────────────────────────────────────
    case 'CORRECTION_FILED': {
      // Immediately lower the local confidence to reflect the report.
      const { spotId } = payload;
      const current = _state.confidence[spotId] ?? { score: 0.5 };
      _state.confidence = {
        ..._state.confidence,
        [spotId]: { ...current, score: Math.max(0, current.score * 0.2) },
      };
      emit(EVENTS.CORRECTION_FILED, { spotId });
      break;
    }

    // ── Shared link ──────────────────────────────────────────────────────────
    case 'LINK_COPIED': {
      _state.sharedLink = { ..._state.sharedLink, copiedAt: new Date() };
      emit(EVENTS.LINK_COPIED, { url: _state.sharedLink.url });
      break;
    }

    // ── Status ───────────────────────────────────────────────────────────────
    case 'SET_STATUS': {
      _state.status = { ..._state.status, ...payload };
      emit(EVENTS.STATUS_CHANGED, { status: getState().status });
      break;
    }

    default:
      console.warn(`[store] Unknown action: "${action}"`);
  }
}

/**
 * Initialise the store. Called once from main.js before anything else.
 * Resets to the default shape — useful for testing.
 */
export function initStore() {
  // State is already initialised at module parse time.
  // This function exists as an explicit initialisation hook so main.js
  // has a clear, ordered bootstrap sequence.
}

// ─── Private helpers ─────────────────────────────────────────────────────────

/**
 * Build the shareable URL for a claimed spot.
 * Encodes the spot id as a query param so anyone opening the link
 * lands directly on that spot's live detail view.
 *
 * @param {string} spotId
 * @returns {string}
 */
function _buildShareLink(spotId) {
  const url = new URL(window.location.href);
  url.searchParams.set('spot', spotId);
  return url.toString();
}
