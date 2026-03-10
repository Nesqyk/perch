/**
 * src/map/mapInit.js
 *
 * Constructs and configures the Google Maps instance.
 * Called once from main.js after loadGoogleMaps() resolves.
 *
 * The map object is module-level so other map/ modules can import it
 * via getMap() without prop-drilling through the whole app.
 */

import { emit, EVENTS } from '../core/events.js';

/** @type {google.maps.Map | null} */
let _map = null;

/**
 * Default campus center coordinates.
 * Replace lat/lng with the actual campus location before launch.
 * This is intentionally left as a placeholder — the campus coords
 * will be set when the first real spot data is seeded by the admin.
 */
const DEFAULT_CENTER = {
  lat: 10.3157,   // placeholder — update to actual campus lat
  lng: 123.8854,  // placeholder — update to actual campus lng
};

const DEFAULT_ZOOM = 17; // street-level zoom appropriate for a campus

/**
 * Google Maps styling that matches Perch's neutral, map-focused aesthetic.
 * Suppresses POI clutter (cafes, shops) so our custom pins dominate.
 * Uses the same muted palette referenced in main.css CSS variables.
 */
const MAP_STYLES = [
  { featureType: 'poi',             elementType: 'labels',      stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school',      elementType: 'geometry',    stylers: [{ color: '#e8f0e8' }] },
  { featureType: 'transit',         elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road',            elementType: 'geometry',    stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'road',            elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water',           elementType: 'geometry',    stylers: [{ color: '#c8dfc8' }] },
  { featureType: 'landscape',       elementType: 'geometry',    stylers: [{ color: '#f0f4f0' }] },
  { featureType: 'administrative',  elementType: 'geometry.stroke', stylers: [{ color: '#c9c9c9' }] },
];

/**
 * Initialise the Google Maps instance and mount it to #map-container.
 *
 * @returns {google.maps.Map}
 */
export function initMap() {
  const container = document.getElementById('map-container');

  if (!container) {
    throw new Error('[mapInit] #map-container element not found in the DOM');
  }

  _map = new google.maps.Map(container, {
    center:            DEFAULT_CENTER,
    zoom:              DEFAULT_ZOOM,
    styles:            MAP_STYLES,

    // Disable the default Google Maps UI controls — we provide our own
    // minimal controls via mapControls.js so the UI matches the wireframe.
    disableDefaultUI:    true,
    gestureHandling:     'greedy',    // single-finger pan on mobile (no two-finger conflict)
    clickableIcons:      false,       // prevent Google POI popups
    mapTypeControl:      false,
    streetViewControl:   false,
    fullscreenControl:   false,
  });

  // Signal to the rest of the app that the map is ready to receive markers.
  emit(EVENTS.MAP_READY, { map: _map });

  return _map;
}

/**
 * Returns the shared map instance.
 * Throws if called before initMap().
 *
 * @returns {google.maps.Map}
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
  _map.panTo(position);
  if (zoom !== undefined) _map.setZoom(zoom);
}
