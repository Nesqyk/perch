/**
 * src/core/router.js
 *
 * URL parameter utilities + hash-based page router for Perch.
 *
 * Two distinct responsibilities live here:
 *
 * ── 1. URL Params (unchanged) ──────────────────────────────────────────────
 * The URL is used as a serialisable state container so that:
 *   a. Shared links carry filter context + a selected spot id.
 *   b. Page refresh restores the last visible state.
 *   c. The GC link "just works" — anyone opening it sees the same view.
 *
 * URL param shape:
 *   /?spot=<uuid>                        → opens spot detail directly
 *   /?size=small&needs=outlet,wifi       → pre-fills filters
 *   /?join=CODE                          → auto-open group join modal
 *   /?campus=<uuid>&building=<uuid>      → deep-link into a building panel
 *
 * ── 2. Hash Router (new) ───────────────────────────────────────────────────
 * Hash-based routing drives the multi-page layout with zero server config.
 * Hash shape:   #/          → Dashboard (map)
 *               #/profile   → Profile & Settings
 *               #/group     → Group page
 *               #/settings  → Settings page
 *               #/contributions → Contributions page
 *
 * Routing is initialised once from main.js via initRouter(callback).
 * URL params and hash coexist: /?spot=<id>#/  is a valid URL.
 *
 * Nothing here touches the DOM or the store directly.
 * main.js is the bridge between this module and dispatch().
 */

// ─── URL Params: Read ────────────────────────────────────────────────────────

/**
 * Parse the current URL search params into an object that main.js
 * can feed directly into dispatch().
 *
 * @returns {{
 *   selectedSpotId: string | null,
 *   campusId: string | null,
 *   buildingId: string | null,
 *   filters: {
 *     groupSize: string | null,
 *     needs: string[],
 *     nearBuilding: string | null,
 *   }
 * }}
 */
export function readUrlParams() {
  const p = new URLSearchParams(window.location.search);

  return {
    selectedSpotId: p.get('spot')     ?? null,
    campusId:       p.get('campus')   ?? null,
    buildingId:     p.get('building') ?? null,

    filters: {
      groupSize:    p.get('size')  ?? null,
      needs:        p.get('needs') ? p.get('needs').split(',').filter(Boolean) : [],
      nearBuilding: null,
    },
  };
}

// ─── URL Params: Write ───────────────────────────────────────────────────────

/**
 * Sync the URL bar with the current filter + selection state.
 * Uses history.replaceState so the back button is never polluted.
 * Preserves the current hash so routing state is not clobbered.
 *
 * @param {{
 *   selectedSpotId?: string | null,
 *   filters?: { groupSize?, needs?, nearBuilding? }
 * }} state
 */
export function writeUrlParams({ selectedSpotId, filters } = {}) {
  const p = new URLSearchParams();

  if (selectedSpotId)           p.set('spot',     selectedSpotId);
  if (filters?.groupSize)       p.set('size',     filters.groupSize);
  if (filters?.needs?.length)   p.set('needs',    filters.needs.join(','));
  if (filters?.nearBuilding)    p.set('building', filters.nearBuilding);

  const search  = p.toString() ? `?${p.toString()}` : '';
  const newUrl  = `${window.location.pathname}${search}${window.location.hash}`;
  history.replaceState(null, '', newUrl);
}

/**
 * Clear all Perch-managed URL params without triggering a page reload.
 * Preserves the current hash.
 */
export function clearUrlParams() {
  history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
}

/**
 * Build a full, absolute share URL for a given spot.
 * This is the URL that gets copied into the group chat.
 *
 * @param {string} spotId
 * @returns {string}
 */
export function buildSpotShareUrl(spotId) {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('spot', spotId);
  return url.toString();
}

/**
 * Build a full, absolute share URL that deep-links into a building panel.
 * Opening this link selects the campus and immediately opens the room
 * directory for the specified building.
 *
 * @param {string} campusId
 * @param {string} buildingId
 * @returns {string}
 */
export function buildBuildingShareUrl(campusId, buildingId) {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('campus',   campusId);
  url.searchParams.set('building', buildingId);
  return url.toString();
}

/**
 * Read the ?join= param from the current URL.
 * Returns the 4-character group code if present, or null.
 *
 * @returns {string | null}
 */
export function readGroupCode() {
  const p    = new URLSearchParams(window.location.search);
  const code = p.get('join');
  return code ? code.toUpperCase() : null;
}

// ─── Hash Router ─────────────────────────────────────────────────────────────

/**
 * All valid client-side routes.
 * Any unrecognised hash falls back to '/' automatically.
 *
 * @type {readonly string[]}
 */
export const ROUTES = Object.freeze(['/', '/profile', '/group', '/settings', '/contributions']);

/**
 * Parse the current `window.location.hash` into a normalised route string.
 * Unknown hashes resolve to '/' so the app never enters an invalid state.
 *
 * hash → route mapping:
 *   ''        → '/'
 *   '#/'      → '/'
 *   '#/profile' → '/profile'
 *   '#/unknown' → '/'   (fallback)
 *
 * @returns {string}
 */
export function getCurrentRoute() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  return ROUTES.includes(raw) ? raw : '/';
}

/**
 * Programmatically navigate to a hash route.
 * Setting `window.location.hash` fires the native `hashchange` event,
 * which `initRouter()` already listens to — no manual callback needed here.
 *
 * @param {string} route  One of ROUTES: '/', '/profile', '/group', '/settings', '/contributions'.
 */
export function navigateTo(route) {
  window.location.hash = ROUTES.includes(route) ? route : '/';
}

/**
 * Initialise the hash router.
 *
 * Attaches a `hashchange` listener and fires the callback once immediately
 * so the route present on first load is honoured (e.g. a bookmarked #/group).
 *
 * ⚠️  Call order in main.js matters:
 *   1. readUrlParams()   — process ?spot= / ?join= first
 *   2. initRouter()      — only then mount the route listener
 *
 * This order guarantees that URL-param modals (group join, spot detail) open
 * on the Dashboard (#/) and are not raced against a route transition.
 *
 * @param {(route: string) => void} onRouteChange
 *   Called with the normalised route string on every navigation and on init.
 */
export function initRouter(onRouteChange) {
  const _handleHashChange = () => onRouteChange(getCurrentRoute());

  window.addEventListener('hashchange', _handleHashChange);

  // Fire immediately so the page renders the correct view on first load.
  _handleHashChange();
}
