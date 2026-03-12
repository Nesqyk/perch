/**
 * src/map/mapInit.js
 *
 * Constructs and configures the Leaflet map instance.
 * Called once from main.js after loadGoogleMaps() resolves (now a no-op).
 *
 * Tile layer: CartoDB Positron — free, no API key required, muted palette
 * that lets the coloured spot pins dominate visually.
 *
 * The map object is module-level so other map/ modules can import it
 * via getMap() without prop-drilling through the whole app.
 */

import { L }              from './mapLoader.js';
import { emit, EVENTS }   from '../core/events.js';

/** @type {import('leaflet').Map | null} */
let _map = null;

/**
 * CTU Main Campus, Cebu City, Philippines.
 * Centered on the main building cluster at the heart of campus.
 *
 * @type {{ lat: number, lng: number }}
 */
const DEFAULT_CENTER = {
  lat: 10.2936,   // CTU Main Campus, Cebu City
  lng: 123.8809,  // CTU Main Campus, Cebu City
};

const DEFAULT_ZOOM = 17; // street-level zoom appropriate for a campus

// CartoDB Positron tile URL — muted, label-light, free tier, no API key.
const TILE_URL         = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>';

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
    center:      [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
    zoom:        DEFAULT_ZOOM,
    zoomControl: false,   // we provide our own controls via mapControls.js
  });

  L.tileLayer(TILE_URL, {
    attribution: TILE_ATTRIBUTION,
    maxZoom:     19,
    subdomains:  'abcd',
  }).addTo(_map);

  // Signal to the rest of the app that the map is ready to receive markers.
  emit(EVENTS.MAP_READY, { map: _map });

  return _map;
}

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
 * Used when the user's geolocation is granted or a spot is selected.
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
