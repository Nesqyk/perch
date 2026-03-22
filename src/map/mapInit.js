/**
 * src/map/mapInit.js
 *
 * Constructs and configures the Leaflet map instance.
 * Called once from main.js after loadGoogleMaps() resolves (now a no-op).
 *
 * Tile layer: CartoDB Positron — clean grey/minimal palette that keeps the
 * coloured pins visually dominant without competing road styling.
 *
 * The map object is module-level so other map/ modules can import it
 * via getMap() without prop-drilling through the whole app.
 *
 * Campus selection:
 *   When CAMPUS_SELECTED fires, flyToBounds() animates the viewport to
 *   the selected campus bounding box and updates maxBounds accordingly.
 *
 * Map click:
 *   A single-click on the map (not on a marker) emits
 *   UI_SUBMIT_SPOT_REQUESTED with the click coordinates so the panel can
 *   open the "Suggest a Spot" form.
 *
 * View mode:
 *   Always stays in 'campus' mode — building markers are the primary UI.
 *   Room detail is accessed via the building modal.
 */

import { L }                    from './mapLoader.js';
import { on, emit, EVENTS }     from '../core/events.js';
import { getState }             from '../core/store.js';

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

// CartoDB Positron tile URL — clean grey/minimal palette, no API key required.
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

/** @type {import('leaflet').Rectangle | null} Temporary marker shown on click */
let _clickMarker = null;

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

  const defaultBounds = L.latLngBounds([
    [10.2916, 123.8789],
    [10.2956, 123.8829],
  ]);

  _map = L.map(container, {
    center:             [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
    zoom:               DEFAULT_ZOOM,
    zoomControl:        false,
    attributionControl: false,
    maxBounds:          defaultBounds.pad(0.3),
    minZoom:            14,
  });

  L.tileLayer(TILE_URL, {
    maxZoom:    19,
    subdomains: 'abcd',
  }).addTo(_map);

  // ── Map click → suggest a spot ──────────────────────────────────────────
  _map.on('click', _onMapClick);

  // ── Spot selection navigation ───────────────────────────────────────────
  on(EVENTS.SPOT_SELECTED, _onSpotSelected);

  // ── Campus selected → fly to new bounds ─────────────────────────────────
  on(EVENTS.CAMPUS_SELECTED, _onCampusSelected);

  emit(EVENTS.MAP_READY, { map: _map });

  return _map;
}

// ─── Campus viewport ─────────────────────────────────────────────────────────

/**
 * Fly the map to the bounding box of the newly selected campus and update
 * maxBounds so the user cannot pan too far away.
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

  _map.setMaxBounds(bounds.pad(0.3));
  _map.flyToBounds(bounds, {
    padding:   [16, 16],
    maxZoom:   campus.default_zoom + 1,
    duration:  0.8,
    easeLinearity: 0.5,
  });
}

// ─── Map click ────────────────────────────────────────────────────────────────

/**
 * Handle a bare map click (not on a marker).
 * Emits UI_SUBMIT_SPOT_REQUESTED so the panel can show the "Suggest a Spot" form.
 *
 * @param {import('leaflet').LeafletMouseEvent} e
 */
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
 */
export function clearClickMarker() {
  if (_clickMarker) {
    _clickMarker.remove();
    _clickMarker = null;
  }
}

// ─── Spot navigation ─────────────────────────────────────────────────────────

function _onSpotSelected(e) {
  if (!e.detail.navigate) return;

  const { spots } = getState();
  const spot = spots.find(s => s.id === e.detail.spotId);

  if (spot && spot.lat && spot.lng) {
    panTo({ lat: spot.lat, lng: spot.lng }, 18);
  }
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
