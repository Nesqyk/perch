/**
 * src/main.js
 *
 * Student app bootstrap — executed once when index.html loads.
 *
 * Initialisation sequence (order matters):
 *
 *  1. Import CSS (Vite processes these as side-effect imports)
 *  2. initStore()       — prime the state container
 *  3. initSession()     — ensure anonymous session token in localStorage
 *  4. readUrlParams()   — parse ?spot=, ?size=, ?needs=, ?building=
 *  5. Restore filters from URL into store
 *  6. loadGoogleMaps()  → initMap()  — load Maps SDK then mount the map
 *  7. initPins()        — register map pin listeners (needs map ready)
 *  8. addMapControls()  — inject zoom + locate-me buttons into the map
 *  9. initRealtime()    — open Supabase Realtime channel
 * 10. fetchSpots()      — load spots + confidence → dispatch SPOTS_LOADED
 * 11. fetchActiveClaims() — load current claims → dispatch CLAIMS_LOADED
 * 12. Restore selected spot from URL (if ?spot= present)
 * 13. initSmartSuggestions() — wire F1 filter-submission listener
 * 14. initClaim()            — wire F2 claim flow listener
 * 15. initReportFull()       — wire F3 report-full flow listener
 * 16. initFilterPanel()      — render + wire filter UI
 * 17. initSidebar() / initBottomSheet() — wire panel controller for viewport
 * 18. Wire URL sync on store events
 * 19. Wire geolocation (request permission, update store on change)
 * 20. Wire MAP_PIN_CLICKED → SELECT_SPOT dispatch
 */

// ─── CSS side-effects (Vite bundles these) ────────────────────────────────────

import './styles/main.css';
import './styles/map.css';
import './styles/sidebar.css';
import './styles/bottomSheet.css';
import './styles/spotCard.css';
import './styles/filters.css';

// ─── Core ─────────────────────────────────────────────────────────────────────

import { initStore, dispatch, getState } from './core/store.js';
import { on, EVENTS }                    from './core/events.js';
import { readUrlParams, writeUrlParams, clearUrlParams } from './core/router.js';

// ─── Utils ────────────────────────────────────────────────────────────────────

import { initSession }  from './utils/session.js';

// ─── Map ──────────────────────────────────────────────────────────────────────

import { loadGoogleMaps }  from './map/mapLoader.js';
import { initMap }         from './map/mapInit.js';
import { initPins }        from './map/pins.js';
import { initMapControls } from './map/mapControls.js';

// ─── API ──────────────────────────────────────────────────────────────────────

import { fetchSpots }        from './api/spots.js';
import { fetchActiveClaims } from './api/claims.js';
import { subscribeToRealtime } from './api/realtime.js';

// ─── Features ────────────────────────────────────────────────────────────────

import { initSmartSuggestions } from './features/smartSuggestions.js';
import { initClaim }            from './features/claim.js';
import { initReportFull }       from './features/reportFull.js';

// ─── UI ───────────────────────────────────────────────────────────────────────

import { initFilterPanel } from './ui/filterPanel.js';
import { initSidebar }     from './ui/sidebar.js';
import { initBottomSheet } from './ui/bottomSheet.js';
import { showToast }       from './ui/toast.js';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function boot() {
  // ── 1 & 2. Prime state ──────────────────────────────────────────────────────
  initStore();

  // ── 3. Anonymous session ─────────────────────────────────────────────────────
  initSession();

  // ── 4 & 5. URL params → restore filters + selected spot ──────────────────────
  const urlState = readUrlParams();

  if (urlState.filters.groupSize || urlState.filters.needs.length || urlState.filters.nearBuilding) {
    dispatch('SET_FILTERS', urlState.filters);
  }

  // ── 6. Google Maps ───────────────────────────────────────────────────────────
  try {
    await loadGoogleMaps();
    initMap();
  } catch (err) {
    console.error('[main] Google Maps failed to load:', err);
    showToast('Could not load the map. Check your internet connection.', 'error');
    return; // nothing else works without the map
  }

  // ── 7 & 8. Map pins + controls ───────────────────────────────────────────────
  initPins();
  initMapControls();

  // ── 9. Realtime ───────────────────────────────────────────────────────────────
  subscribeToRealtime();

  // ── 10. Fetch spots ───────────────────────────────────────────────────────────
  dispatch('SET_STATUS', { spotsLoading: true });
  try {
    const { spots, confidence } = await fetchSpots();
    dispatch('SPOTS_LOADED', { spots, confidence });
  } catch (err) {
    console.error('[main] fetchSpots failed:', err);
    showToast('Could not load spots. Try refreshing.', 'error');
    dispatch('SET_STATUS', { spotsLoading: false, error: err.message });
    return;
  }
  dispatch('SET_STATUS', { spotsLoading: false });

  // ── 11. Fetch active claims ───────────────────────────────────────────────────
  try {
    const spotIds = getState().spots.map(s => s.id);
    const claims  = await fetchActiveClaims(spotIds);
    dispatch('CLAIMS_LOADED', { claims });
  } catch (err) {
    // Non-fatal — the map still works without claims
    console.warn('[main] fetchActiveClaims failed:', err);
  }

  // ── 12. Restore selected spot from URL ────────────────────────────────────────
  if (urlState.selectedSpotId) {
    const exists = getState().spots.find(s => s.id === urlState.selectedSpotId);
    if (exists) {
      dispatch('SELECT_SPOT', { spotId: urlState.selectedSpotId });
    } else {
      // Spot may have been removed; silently clear the param
      clearUrlParams();
    }
  }

  // ── 13–15. Feature modules ────────────────────────────────────────────────────
  initSmartSuggestions();
  initClaim();
  initReportFull();

  // ── 16. Filter panel UI ───────────────────────────────────────────────────────
  const panelContent = document.getElementById('panel-content');
  if (panelContent) {
    initFilterPanel(panelContent);
  }

  // ── 17. Panel controller (responsive) ────────────────────────────────────────
  if (window.matchMedia('(min-width: 768px)').matches) {
    initSidebar();
  } else {
    initBottomSheet();
  }

  // ── 18. URL sync on state changes ────────────────────────────────────────────
  on(EVENTS.SPOT_SELECTED, (e) => {
    const state = getState();
    writeUrlParams({ selectedSpotId: e.detail.spotId, filters: state.filters });
  });

  on(EVENTS.SPOT_DESELECTED, () => {
    writeUrlParams({ filters: getState().filters });
  });

  on(EVENTS.FILTERS_CHANGED, () => {
    const state = getState();
    writeUrlParams({ selectedSpotId: state.selectedSpotId, filters: state.filters });
  });

  // ── 19. Geolocation ───────────────────────────────────────────────────────────
  _initGeolocation();

  // ── 20. Map pin clicks ────────────────────────────────────────────────────────
  on(EVENTS.MAP_PIN_CLICKED, (e) => {
    const { spotId } = e.detail;
    const current = getState().selectedSpotId;

    if (current === spotId) {
      // Clicking the same pin again → deselect (toggle)
      dispatch('DESELECT_SPOT', {});
    } else {
      dispatch('SELECT_SPOT', { spotId });
    }
  });

  console.warn('[Perch] App ready.');
}

// ─── Geolocation helper ──────────────────────────────────────────────────────

function _initGeolocation() {
  if (!('geolocation' in navigator)) return;

  const options = {
    enableHighAccuracy: false,
    timeout:            10_000,
    maximumAge:         60_000,
  };

  const onSuccess = (pos) => {
    dispatch('SET_USER_LOCATION', {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    });
  };

  const onError = (err) => {
    // Permission denied or unavailable — not fatal, just no "near me" ranking
    console.warn('[geolocation] error:', err.message);
  };

  // Initial fix
  navigator.geolocation.getCurrentPosition(onSuccess, onError, options);

  // Watch for position changes (battery-friendly — maximumAge is generous)
  navigator.geolocation.watchPosition(onSuccess, onError, options);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

boot().catch((err) => {
  console.error('[Perch] Fatal boot error:', err);
  showToast('Something went wrong loading Perch. Please refresh.', 'error');
});
