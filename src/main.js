/**
 * src/main.js
 *
 * Student app bootstrap — executed once when index.html loads.
 *
 * Initialisation sequence (order matters):
 *
 *  1. Import CSS (Vite processes these as side-effect imports)
 *  2. initStore()       — prime the state container
 *  3. initAuth()        — mount Supabase auth listener (syncs JWT to store)
 *  4. readUrlParams()   — parse ?spot=, ?size=, ?needs=, ?building=, ?join=
 *  5. Restore filters from URL into store
 *  6. loadGoogleMaps()  → initMap()  — load Maps SDK then mount the map
 *  7. initPins()        — register map pin listeners (needs map ready)
 *  8. initGroupPinLayer() — register group pin overlay listeners
 *  9. addMapControls()  — inject zoom + locate-me buttons into the map
 * 10. initRealtime()    — open Supabase Realtime channel
 * 11. fetchSpots()      — load spots + confidence → dispatch SPOTS_LOADED
 * 12. fetchActiveClaims() — load current claims → dispatch CLAIMS_LOADED
 * 13. Restore selected spot from URL (if ?spot= present)
 * 14. initSmartSuggestions() — wire F1 filter-submission listener
 * 15. initClaim()            — wire F2 claim flow listener
 * 16. initReportFull()       — wire F3 report-full flow listener
 * 17. initGroups()           — wire F4 group create/join listeners
 * 18. initGroupPins()        — wire F5 group pin lifecycle listeners
 * 19. initFilterPanel()      — render + wire filter UI
 * 20. initSidebar() / initBottomSheet() — wire panel controller for viewport
 * 21. Wire URL sync on store events
 * 22. Wire geolocation (request permission, update store on change)
 * 23. Wire MAP_PIN_CLICKED → SELECT_SPOT dispatch
 * 24. Handle ?join= URL param → pre-fill inline join form
 *
 * Page routes (wired early so views render before async data arrives):
 *  3.7 initProfilePage() — mount /profile route view
 *  3.8 initGroupPage()   — mount /group route view
 */

// ─── CSS side-effects (Vite bundles these) ────────────────────────────────────

import './styles/main.css';
import './styles/map.css';
import './styles/mapPopup.css';
import './styles/sidebar.css';
import './styles/bottomSheet.css';
import './styles/spotCard.css';
import './styles/filters.css';
import './styles/campusSelector.css';
import './styles/navMenu.css';
import './styles/pages.css';
import './styles/submitSpotPanel.css';
import './styles/buildingPanel.css';

// ─── Core ─────────────────────────────────────────────────────────────────────

import { initStore, dispatch, getState } from './core/store.js';
import { on, EVENTS }             from './core/events.js';
import { readUrlParams, writeUrlParams, clearUrlParams, readGroupCode, initRouter, getCurrentRoute } from './core/router.js';

// ─── API ──────────────────────────────────────────────────────────────────────

import { initAuth }          from './api/auth.js';

import { loadGoogleMaps }          from './map/mapLoader.js';
import { initMap, clearClickMarker } from './map/mapInit.js';
import { initPins, initGroupPinLayer } from './map/pins.js';
import { initMapControls }             from './map/mapControls.js';

// ─── API ──────────────────────────────────────────────────────────────────────

import { fetchSpots }        from './api/spots.js';
import { fetchActiveClaims } from './api/claims.js';
import { getProfile }        from './api/profile.js';
import { fetchCampuses, fetchBuildings } from './api/campuses.js';
import { subscribeToRealtime } from './api/realtime.js';

// ─── Features ────────────────────────────────────────────────────────────────

import { initSmartSuggestions } from './features/smartSuggestions.js';
import { initClaim }            from './features/claim.js';
import { initReportFull }       from './features/reportFull.js';
import { initGroups }           from './features/groups.js';
import { initGroupPins }        from './features/groupPins.js';
import { initCampus }           from './features/campus.js';

// ─── UI ───────────────────────────────────────────────────────────────────────

import { initFilterPanel } from './ui/filterPanel.js';
import { initSidebar }     from './ui/sidebar.js';
import { initBottomSheet } from './ui/bottomSheet.js';
import { showToast }       from './ui/toast.js';
import { initSubmitSpotPanel } from './ui/submitSpotPanel.js';
import { initBuildingPanel, openBuildingPanel } from './ui/buildingPanel.js';
import { initNavMenu }     from './ui/navMenu.js';
import { initAuthModal }   from './ui/authModal.js';
import { initProfilePage } from './ui/profilePage.js';
import { initGroupPage }   from './ui/groupPage.js';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function boot() {
  // ── 1 & 2. Prime state ──────────────────────────────────────────────────────
  initStore();

  // ── 3. Mount Auth ────────────────────────────────────────────────────────────
  // initialises onAuthStateChange that syncs currentUser to store.
  initAuth();

  // ── 3.5 UI Header + Router + Nav shell + AuthModal ─────────────────────────
  initAuthModal();

  // initRouter MUST come before initNavMenu so the hashchange listener is
  // active when initNavMenu fires its first syncActiveState call.
  initRouter((route) => {
    dispatch('ROUTE_CHANGED', { route });
  });
  initNavMenu();

  // ── 3.7 & 3.8 Route-level page views ────────────────────────────────────────
  // Mounted early — before async data — so views render immediately on navigation.
  initProfilePage();
  initGroupPage();

  // ── 3.6 Fetch user profile once auth resolves ────────────────────────────────
  // getProfile() must run AFTER onAuthStateChange fires (which is async), so
  // we wire it here rather than calling it synchronously after initAuth().
  on(EVENTS.AUTH_STATE_CHANGED, async (e) => {
    if (!e.detail.user) return;
    const profile = await getProfile();
    if (profile?.nickname) {
      dispatch('SET_NICKNAME', profile.nickname);
    }
  });

  // ── 4 & 5. URL params → restore filters + selected spot ──────────────────────
  const urlState   = readUrlParams();
  const groupCode  = readGroupCode();

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
  initGroupPinLayer();
  initMapControls();

  // ── 9. Realtime ───────────────────────────────────────────────────────────────
  subscribeToRealtime();

  // ── 9.5. Fetch campuses (needed before map flyToBounds) ─────────────────────────
  try {
    const campuses = await fetchCampuses();
    dispatch('CAMPUSES_LOADED', { campuses });

    // ?campus= deep-link overrides the auto-selected campus.
    const campusId = urlState.campusId ?? getState().selectedCampusId;
    if (urlState.campusId && campusId) {
      dispatch('CAMPUS_SELECTED', { campusId });
    }

    const activeCampusId = getState().selectedCampusId;
    if (activeCampusId) {
      const buildings = await fetchBuildings(activeCampusId);
      dispatch('BUILDINGS_LOADED', { buildings });
    }
  } catch (err) {
    // Non-fatal — app still works with default CTU bounds baked into mapInit.
    console.warn('[main] fetchCampuses failed:', err);
  }

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
  initSubmitSpotPanel();
  initBuildingPanel();

  // ── 12.5. Open building panel from deep-link (?campus=&building=) ─────────────
  // Must run after initBuildingPanel() (registers the listener) and after
  // spots + claims are loaded so the room counts are correct.
  if (urlState.buildingId) {
    const buildingExists = getState().buildings.find(b => b.id === urlState.buildingId);
    if (buildingExists) {
      openBuildingPanel(urlState.buildingId);
    }
  }

  // ── 16–17. Group feature modules ─────────────────────────────────────────────
  initGroups();
  initGroupPins();
  initCampus();

  // ── 18. Filter panel UI ───────────────────────────────────────────────────────
  const panelContent = document.getElementById('panel-content');
  if (panelContent) {
    initFilterPanel(panelContent);
  }

  // ── 19. Panel controller (responsive) ────────────────────────────────────────
  if (window.matchMedia('(min-width: 768px)').matches) {
    initSidebar();
  } else {
    initBottomSheet();
  }

  // ── 20. URL sync on state changes ────────────────────────────────────────────
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

  // ── 21. Geolocation ───────────────────────────────────────────────────────────
  _initGeolocation();

  // ── 22. Map pin clicks ────────────────────────────────────────────────────────
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

  on(EVENTS.CAMPUS_SELECTED, async (e) => {
    const buildings = await fetchBuildings(e.detail.campusId);
    dispatch('BUILDINGS_LOADED', { buildings });
  });

  // ── 23. ?join= URL param → pre-fill filter panel join form ──────────────────
  if (groupCode) {
    // Clear the join code from the URL bar so a refresh doesn't re-trigger.
    const cleanUrl = window.location.pathname;
    history.replaceState(null, '', cleanUrl);
    // The inline join form in filterPanel.js is the entry point — no modal needed.
    // Store the code so the filter panel can read it on next render if needed.
    sessionStorage.setItem('perch_prefill_join_code', groupCode);
  }

  // ── 24. Clear map click marker on panel close ─────────────────────────────────
  on(EVENTS.UI_PANEL_CLOSED, clearClickMarker);
  on(EVENTS.SPOT_SELECTED, clearClickMarker);

  console.warn('[Perch] App ready. Route:', getCurrentRoute());
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
