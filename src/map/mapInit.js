/**
 * src/map/mapInit.js
 *
 * Constructs and configures the Leaflet map instance.
 * Called once from main.js after loadGoogleMaps() resolves (now a no-op).
 *
 * Tile layer: OpenStreetMap standard tiles so real-world place labels stay
 * readable and the map feels closer to a familiar everyday map.
 *
 * The map object is module-level so other map/ modules can import it
 * via getMap() without prop-drilling through the whole app.
 *
 * Campus selection:
 *   When CAMPUS_SELECTED fires, flyToBounds() animates the viewport to
 *   the selected campus bounding box without locking panning to that box.
 *
 * Map click:
 *   A single-click on the map (not on a marker) emits
 *   UI_SUBMIT_SPOT_REQUESTED with the click coordinates so the panel can
 *   open the "Suggest a Spot" wizard.
 *
 * View mode:
 *   Zoom ≥ _ZOOM_ROOM_THRESHOLD → 'city' (individual spot/room markers).
 *   Zoom  < _ZOOM_ROOM_THRESHOLD → 'campus' (building cluster markers).
 *   The user can also switch manually via the toggle in filterPanel.js.
 */

import { L }                    from './mapLoader.js';
import { on, emit, EVENTS }     from '../core/events.js';
import { getState, dispatch }   from '../core/store.js';

/** @type {import('leaflet').Map | null} */
let _map = null;

/**
 * CTU Main Campus, Cebu City, Philippines — default before campuses load.
 * @type {{ lat: number, lng: number }}
 */
const DEFAULT_CENTER = {
  lat: 10.2936,
  lng: 123.8809,
};

const DEFAULT_ZOOM = 17;

/**
 * Zoom level at which the map auto-switches from building cluster markers
 * (campus mode) to individual room/spot markers (city mode).
 * The user can also switch manually via the toggle in filterPanel.js.
 */
const _ZOOM_ROOM_THRESHOLD = 18;

// OpenStreetMap standard tiles — richer place labels, no API key required.
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** @type {import('leaflet').Rectangle | null} Temporary marker shown on click */
let _clickMarker = null;

/** @type {import('leaflet').CircleMarker | null} Marker shown at the selected spot's location */
let _selectionMarker = null;

/** @type {import('leaflet').CircleMarker | null} Marker shown after place search focus */
let _searchMarker = null;

// ─── Init ────────────────────────────────────────────────────────────────────

/**
 * Initialise the Leaflet map instance and mount it to #map-container.
 *
 * @returns {import('leaflet').Map}
 */
export function initMap() {
  const container = document.getElementById('map-container');

  if (!container) {
    throw new Error('[mapInit] #map-container element not found in the DOM');
  }

  _map = L.map(container, {
    center:             [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
    zoom:               DEFAULT_ZOOM,
    zoomControl:        false,
    attributionControl: true,
    minZoom:            14,
  });

  L.tileLayer(TILE_URL, {
    maxZoom:    19,
    attribution: TILE_ATTRIBUTION,
  }).addTo(_map);

  // ── Map click → suggest a spot ──────────────────────────────────────────
  _map.on('click', _onMapClick);

  // ── Zoom-based view mode reveal ──────────────────────────────────────────
  _map.on('zoomend', _onZoomChanged);

  // ── Spot selection navigation ───────────────────────────────────────────
  on(EVENTS.SPOT_SELECTED,   _onSpotSelected);
  on(EVENTS.SPOT_DESELECTED, _onSpotDeselected);

  // ── Campus selected → fly to new bounds ─────────────────────────────────
  on(EVENTS.CAMPUS_SELECTED, _onCampusSelected);
  on(EVENTS.UI_PLACE_FOCUS_REQUESTED, _onPlaceFocusRequested);

  emit(EVENTS.MAP_READY, { map: _map });

  return _map;
}

// ─── Zoom-based view mode ─────────────────────────────────────────────────────

/**
 * Auto-switch view mode based on current zoom level.
 * Zoom ≥ _ZOOM_ROOM_THRESHOLD → 'city' (individual room/spot markers).
 * Zoom  < _ZOOM_ROOM_THRESHOLD → 'campus' (building cluster markers).
 */
function _onZoomChanged() {
  if (!_map) return;
  const zoom = _map.getZoom();
  dispatch('SET_VIEW_MODE', zoom >= _ZOOM_ROOM_THRESHOLD ? 'city' : 'campus');
}

// ─── Campus viewport ─────────────────────────────────────────────────────────

/**
 * Fly the map to the bounding box of the newly selected campus while keeping
 * normal pan freedom around the surrounding area.
 *
 * @param {CustomEvent<{ campusId: string }>} e
 */
function _onCampusSelected(e) {
  if (!_map) return;

  const { campuses } = getState();
  const campus = campuses.find(c => c.id === e.detail.campusId);
  if (!campus) return;

  const bounds = L.latLngBounds(
    [campus.bounds_sw_lat, campus.bounds_sw_lng],
    [campus.bounds_ne_lat, campus.bounds_ne_lng],
  );

  _map.flyToBounds(bounds, {
    padding:   [16, 16],
    maxZoom:   campus.default_zoom + 1,
    duration:  0.8,
    easeLinearity: 0.5,
  });
}

// ─── Map click ────────────────────────────────────────────────────────────────

/**
 * Focus the map on a searched place and show a temporary focus marker.
 *
 * @param {CustomEvent<{ lat: number, lng: number, zoom?: number, viewMode?: 'campus' | 'city' }>} e
 */
function _onPlaceFocusRequested(e) {
  if (!_map) return;
  const lat = Number(e.detail?.lat);
  const lng = Number(e.detail?.lng);
  const requestedViewMode = e.detail?.viewMode;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  if (_searchMarker) {
    _searchMarker.remove();
    _searchMarker = null;
  }

  _searchMarker = L.circleMarker([lat, lng], {
    radius:      14,
    color:       'var(--color-green-700, #008f5f)',
    fillColor:   'var(--color-brand, #7BDEB7)',
    fillOpacity: 0.18,
    weight:      3,
    opacity:     0.95,
  }).addTo(_map);

  if (requestedViewMode) {
    _map.once('moveend', () => {
      dispatch('SET_VIEW_MODE', requestedViewMode);
    });
  }

  panTo({ lat, lng }, e.detail?.zoom ?? 17);
}

function _onMapClick(e) {
  const { lat, lng } = e.latlng;

  // Clear previous click marker if any.
  if (_clickMarker) {
    _clickMarker.remove();
    _clickMarker = null;
  }

  // Show a temporary pulsing dot at the click location.
  _clickMarker = L.circleMarker([lat, lng], {
    radius:      10,
    color:       'var(--color-brand, #7BDEB7)',
    fillColor:   'var(--color-brand, #7BDEB7)',
    fillOpacity: 0.4,
    weight:      2,
    opacity:     0.9,
  }).addTo(_map);

  emit(EVENTS.UI_SUBMIT_SPOT_REQUESTED, { lat, lng });
}

/**
 * Clear the click marker programmatically (e.g. when panel closes).
 *
 * @returns {void}
 */
export function clearClickMarker() {
  if (_clickMarker) {
    _clickMarker.remove();
    _clickMarker = null;
  }
}

/**
 * Clear the selection marker programmatically (e.g. when the spot card closes).
 *
 * @returns {void}
 */
export function clearSelectionMarker() {
  if (_selectionMarker) {
    _selectionMarker.remove();
    _selectionMarker = null;
  }
}

// ─── Spot navigation ─────────────────────────────────────────────────────────

/**
 * Place a selection marker at the spot's location and pan to it (no zoom change).
 * Fires on every SPOT_SELECTED regardless of the navigate flag.
 *
 * @param {CustomEvent<{ spotId: string, navigate: boolean }>} e
 */
function _onSpotSelected(e) {
  const { spots } = getState();
  const spot = spots.find(s => s.id === e.detail.spotId);
  if (!spot || !spot.lat || !spot.lng) return;

  // Remove any previous selection marker.
  if (_selectionMarker) {
    _selectionMarker.remove();
    _selectionMarker = null;
  }

  // Place a circle marker at the spot's position.
  _selectionMarker = L.circleMarker([spot.lat, spot.lng], {
    radius:      12,
    color:       'var(--color-brand, #7BDEB7)',
    fillColor:   'var(--color-brand, #7BDEB7)',
    fillOpacity: 0.25,
    weight:      3,
    opacity:     1,
  }).addTo(_map);

  // Pan to the spot without changing the zoom level or triggering view-mode switch.
  panTo({ lat: spot.lat, lng: spot.lng });
}

/**
 * Clear the selection marker when the spot card is closed.
 */
function _onSpotDeselected() {
  clearSelectionMarker();
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Returns the shared map instance.
 * Throws if called before initMap().
 *
 * @returns {import('leaflet').Map}
 */
export function getMap() {
  if (!_map) {
    throw new Error('[mapInit] getMap() called before initMap()');
  }
  return _map;
}

/**
 * Pan + zoom the map to a given position.
 *
 * @param {{ lat: number, lng: number }} position
 * @param {number} [zoom]
 */
export function panTo(position, zoom) {
  if (!_map) return;
  if (zoom !== undefined) {
    _map.setView([position.lat, position.lng], zoom);
  } else {
    _map.panTo([position.lat, position.lng]);
  }
}
