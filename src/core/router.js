/**
 * src/core/router.js
 *
 * URL parameter utilities for Perch.
 *
 * Perch has no client-side routing (no pages, no history.pushState navigation).
 * The URL is used purely as a serialisable state container so that:
 *
 *   1. Shared links carry filter context + a selected spot id.
 *   2. Page refresh restores the last visible state.
 *   3. The GC link "just works" — anyone opening it sees the same view.
 *
 * URL shape:
 *   /?spot=<uuid>                  → opens spot detail directly
 *   /?size=small&needs=outlet,wifi&building=main  → pre-fills filters
 *   /?spot=<uuid>&size=...         → both (claim link with filter context)
 *
 * Nothing here touches the DOM or the store directly.
 * main.js reads the result of readUrlParams() and calls dispatch() itself.
 */

// ─── Read ────────────────────────────────────────────────────────────────────

/**
 * Parse the current URL search params into an object that main.js
 * can feed directly into dispatch().
 *
 * @returns {{
 *   selectedSpotId: string | null,
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
    selectedSpotId: p.get('spot') ?? null,

    filters: {
      groupSize:    p.get('size')     ?? null,
      needs:        p.get('needs')    ? p.get('needs').split(',').filter(Boolean) : [],
      nearBuilding: p.get('building') ?? null,
    },
  };
}

// ─── Write ───────────────────────────────────────────────────────────────────

/**
 * Sync the URL bar with the current filter + selection state.
 * Uses history.replaceState so the back button is never polluted.
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

  const newUrl =
    p.toString()
      ? `${window.location.pathname}?${p.toString()}`
      : window.location.pathname;

  history.replaceState(null, '', newUrl);
}

/**
 * Clear all Perch-managed URL params without triggering a page reload.
 */
export function clearUrlParams() {
  history.replaceState(null, '', window.location.pathname);
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
