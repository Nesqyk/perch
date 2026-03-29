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

  /** The user's manually set nickname. Fetched from Supabase on init. */
  nickname: null,               // string | null

  /**
   * Current macro view of the map.
   * 'campus' restricts viewport and filters for on-campus locations.
   * 'city' allows free movement to see external cafes/spots.
   */
  viewMode: 'campus',           // 'campus' | 'city'

  /**
   * All active campuses from the database.
   * Populated on boot. Used by campus selector UI and mapInit.
   */
  campuses: [],                 // Campus[]

  /** The id of the currently selected campus. null = no campus constraint. */
  selectedCampusId: null,       // string (uuid) | null

  /** Building catalogue for the selected campus in campus mode. */
  buildings: [],                // Building[]

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
    groupPending:       false,
    campusPending:      false,
    error:              null,   // string | null
  },

  // ── Groups ────────────────────────────────────────────────────────────────

  /**
   * The group this session currently belongs to.
   * null until the user creates or joins a group.
   */
  group: null,                  // { id, name, code, color, context } | null

  /**
   * This session's member record for the current group.
   * null until group is joined.
   */
  groupMember: null,            // { id, groupId, userId, displayName, scoutPoints } | null

  /**
   * Live and saved pins for the current group, keyed by pin id.
   */
  groupPins: {},                // Record<pinId, GroupPin>

  /**
   * Transit joins keyed by group_pin_id.
   * Each value is an array of join records.
   */
  groupPinJoins: {},            // Record<pinId, GroupPinJoin[]>

  /**
   * The active live pin placed by this session.
   * null when the session has no live pin in the current group.
   */
  myGroupPinId: null,           // string (uuid) | null

  /**
   * Controls whether group member pins are rendered on the map.
   * Toggled by the Eye/EyeOff button in the Group tab header.
   */
  groupPinsVisible: true,       // boolean

  /**
   * All members of the current group, fetched on join and refreshed on demand.
   * Keyed by member id for fast lookup.
   */
  groupMembers: [],             // GroupMember[]

  /**
   * The currently active client-side route.
   * Driven by the hash router in router.js via dispatch('ROUTE_CHANGED').
   * '/' is the Dashboard (map). '/profile', '/group', '/settings', and
   * '/contributions' are page views.
   */
  currentRoute: '/',            // '/' | '/profile' | '/group' | '/settings' | '/contributions'

  /**
   * The authenticated Supabase user object, or null when signed out.
   * Set via dispatch('AUTH_STATE_CHANGED') from src/api/auth.js.
   * This is the single source of truth for auth state — nothing else in the
   * app reads from supabase.auth.getUser() directly.
   *
   * @type {import('@supabase/supabase-js').User | null}
   */
  currentUser: null,            // User | null
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

    // ── Location & View Mode ────────────────────────────────────────────────
    case 'SET_USER_LOCATION': {
      _state.userLocation = payload; // { lat, lng }
      emit(EVENTS.LOCATION_SET, { location: payload });
      break;
    }

    case 'SET_VIEW_MODE': {
      _state.viewMode = payload; // 'campus' | 'city'
      emit(EVENTS.VIEW_MODE_CHANGED, { viewMode: payload });
      break;
    }

    case 'SET_NICKNAME': {
      _state.nickname = payload; // string | null
      emit(EVENTS.NICKNAME_UPDATED, { nickname: payload });
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
      emit(EVENTS.SPOT_SELECTED, {
        spotId: payload.spotId,
        navigate: payload.navigate ?? false,
      });
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

    // ── Campuses ────────────────────────────────────────────────────────
    case 'CAMPUSES_LOADED': {
      _state.campuses = payload.campuses ?? [];
      // Auto-select the first campus if none is selected yet.
      if (!_state.selectedCampusId && _state.campuses.length > 0) {
        _state.selectedCampusId = _state.campuses[0].id;
      }
      emit(EVENTS.CAMPUSES_LOADED, { campuses: _state.campuses });
      break;
    }

    case 'CAMPUS_SELECTED': {
      _state.selectedCampusId = payload.campusId;
      emit(EVENTS.CAMPUS_SELECTED, { campusId: payload.campusId });
      break;
    }

    case 'BUILDINGS_LOADED': {
      _state.buildings = payload.buildings ?? [];
      emit(EVENTS.BUILDINGS_LOADED, { buildings: _state.buildings });
      break;
    }

    // ── Groups ───────────────────────────────────────────────────────────────
    case 'GROUP_JOINED': {
      const { group, member } = payload;
      _state.group         = group;
      _state.groupMember   = member;
      _state.groupPins     = {};
      _state.groupPinJoins = {};
      _state.myGroupPinId  = null;
      _state.groupMembers  = [];
      emit(EVENTS.GROUP_JOINED, { group, member });
      break;
    }

    case 'GROUP_LEFT': {
      _state.group         = null;
      _state.groupMember   = null;
      _state.groupPins     = {};
      _state.groupPinJoins = {};
      _state.myGroupPinId  = null;
      _state.groupMembers  = [];
      emit(EVENTS.GROUP_LEFT, {});
      break;
    }

    case 'SET_GROUP_PINS_VISIBLE': {
      _state.groupPinsVisible = !!payload; // boolean
      emit(EVENTS.GROUP_PINS_UPDATED, { groupPins: getState().groupPins });
      break;
    }

    case 'GROUP_MEMBERS_UPDATED': {
      _state.groupMembers = payload.members ?? [];
      emit(EVENTS.GROUP_MEMBERS_UPDATED, { members: _state.groupMembers });
      break;
    }

    case 'GROUP_PINS_LOADED': {
      // Bulk replace — used at join time after fetching existing pins.
      const pins = payload.pins ?? [];
      _state.groupPins = pins.reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
      emit(EVENTS.GROUP_PINS_UPDATED, { groupPins: getState().groupPins });
      break;
    }

    case 'GROUP_PIN_UPSERTED': {
      const { pin } = payload;
      _state.groupPins = { ..._state.groupPins, [pin.id]: pin };
      // Track our own live pin.
      if (pin.user_id === _state.currentUser?.id && pin.pin_type === 'live' && !pin.ended_at) {
        _state.myGroupPinId = pin.id;
      } else if (_state.myGroupPinId === pin.id && pin.ended_at) {
        _state.myGroupPinId = null;
      }
      emit(EVENTS.GROUP_PINS_UPDATED, { groupPins: getState().groupPins });
      break;
    }

    case 'GROUP_PIN_ENDED': {
      const { pinId } = payload;
      const existing = _state.groupPins[pinId];
      if (existing) {
        _state.groupPins = {
          ..._state.groupPins,
          [pinId]: { ...existing, ended_at: new Date().toISOString() },
        };
      }
      if (_state.myGroupPinId === pinId) _state.myGroupPinId = null;
      emit(EVENTS.GROUP_PINS_UPDATED, { groupPins: getState().groupPins });
      break;
    }

    case 'GROUP_PIN_JOIN_UPSERTED': {
      const { join } = payload;
      const pinId    = join.group_pin_id;
      const existing = (_state.groupPinJoins[pinId] ?? []).filter(j => j.id !== join.id);
      _state.groupPinJoins = {
        ..._state.groupPinJoins,
        [pinId]: [...existing, join],
      };
      emit(EVENTS.GROUP_PIN_JOINS_UPDATED, { groupPinJoins: getState().groupPinJoins });
      break;
    }

    // ── Router ──────────────────────────────────────────────────────────────
    case 'ROUTE_CHANGED': {
      _state.currentRoute = payload.route;
      emit(EVENTS.ROUTE_CHANGED, { route: payload.route });
      break;
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    case 'AUTH_STATE_CHANGED': {
      _state.currentUser = payload.user ?? null;
      emit(EVENTS.AUTH_STATE_CHANGED, { user: _state.currentUser });
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
