/**
 * src/map/mapLoader.js
 *
 * Provides the Leaflet map library (L) to all other map/ modules.
 * Previously loaded the Google Maps JS API dynamically; now Leaflet is
 * bundled via npm so no runtime script injection is needed.
 *
 * The exported `loadGoogleMaps` name is kept for backwards-compatibility
 * with the main.js boot sequence — it resolves immediately as a no-op.
 *
 * All map/ modules import L from here (single source of truth):
 *   import { L } from './mapLoader.js';
 */

import L from 'leaflet';

export { L };

/**
 * No-op shim — Leaflet is bundled at build time, nothing to load at runtime.
 * Kept so main.js can still `await loadGoogleMaps()` without modification.
 *
 * @returns {Promise<void>}
 */
export function loadGoogleMaps() {
  return Promise.resolve();
}
