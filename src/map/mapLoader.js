/**
 * src/map/mapLoader.js
 *
 * Dynamically injects the Google Maps JavaScript API script at runtime.
 * The key is injected by Vite from .env (VITE_GOOGLE_MAPS_API_KEY).
 *
 * Why dynamic injection instead of a <script> tag in index.html?
 *  - Keeps the key out of the raw HTML source that browsers cache and
 *    devtools show plainly.
 *  - Allows main.js to `await loadGoogleMaps()` and guarantee the Maps
 *    object exists before mapInit.js tries to construct the map.
 *  - Prevents double-loading if loadGoogleMaps() is called more than once.
 *
 * Security note:
 *  The Maps JS API key IS visible in the browser network tab — this is
 *  normal and expected. Protect it by restricting allowed HTTP referrers
 *  in the Google Cloud Console (e.g., https://perch.app/*).
 */

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// The Maps script only needs to be loaded once per page lifecycle.
// This promise is reused on subsequent calls.
let _loadPromise = null;

/**
 * Load the Google Maps JavaScript API.
 * Safe to call multiple times — resolves immediately if already loaded.
 *
 * @returns {Promise<void>}
 */
export function loadGoogleMaps() {
  // Already loaded (e.g. hot-module-reload scenario).
  if (window.google?.maps) {
    return Promise.resolve();
  }

  // Already in-flight — return the same promise.
  if (_loadPromise) {
    return _loadPromise;
  }

  if (!MAPS_API_KEY) {
    console.error(
      '[mapLoader] VITE_GOOGLE_MAPS_API_KEY is not set. ' +
      'Copy .env.example to .env and add your key.'
    );
    return Promise.reject(new Error('Missing Google Maps API key'));
  }

  _loadPromise = new Promise((resolve, reject) => {
    const script    = document.createElement('script');

    // `libraries=places` included for the location autocomplete used
    // in the "Suggest a Spot" pin-drop flow (Feature 4, Phase 3).
    script.src      = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places`;
    script.async    = true;
    script.defer    = true;
    script.onload   = () => resolve();
    script.onerror  = () => {
      _loadPromise = null; // allow retry
      reject(new Error('[mapLoader] Google Maps script failed to load'));
    };

    document.head.appendChild(script);
  });

  return _loadPromise;
}
