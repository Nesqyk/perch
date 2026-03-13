/**
 * src/ui/mapPopup.js
 *
 * Floating spot-info popup card shown when the user hovers a map pin.
 * Hides when the cursor leaves the pin.
 *
 * The popup is a positioned <div> inside #map-container.
 * Coordinates come from Leaflet's latLngToContainerPoint() which gives
 * pixels relative to the map tile layer, not the container element.
 * Because #map-container has padding: var(--space-4) (16 px), the
 * Leaflet coordinate origin is offset by that amount; we subtract it
 * when setting left/top so the popup anchors correctly over the pin.
 *
 * Emits nothing. Listens to:
 *   EVENTS.MAP_PIN_HOVERED   — show popup for the hovered spot
 *   EVENTS.MAP_PIN_UNHOVERED — hide popup
 *   EVENTS.MAP_READY         — grab the map ref for move/zoom repositioning
 */

import { on, EVENTS }           from '../core/events.js';
import { getState }              from '../core/store.js';
import { getMap }                from '../map/mapInit.js';
import { deriveSpotStatus }      from '../state/spotState.js';
import { formatConfidence }      from '../utils/confidence.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Must match padding: var(--space-4) on #map-container in map.css */
const MAP_PADDING_PX = 16;

// ─── Module state ─────────────────────────────────────────────────────────────

/** @type {HTMLElement | null} */
let _popup = null;

/** @type {{ lat: number, lng: number } | null} */
let _pinLatLng = null;

// ─── Initialise ───────────────────────────────────────────────────────────────

/**
 * Wire up event listeners. Call once from main.js after initMap().
 */
export function initMapPopup() {
  on(EVENTS.MAP_PIN_HOVERED,   _onPinHovered);
  on(EVENTS.MAP_PIN_UNHOVERED, _onPinUnhovered);
  on(EVENTS.MAP_READY,         _onMapReady);
}

// ─── Map ready ────────────────────────────────────────────────────────────────

function _onMapReady() {
  const map = getMap();
  map.on('move zoom', _repositionPopup);
}

// ─── Event handlers ───────────────────────────────────────────────────────────

/**
 * @param {CustomEvent} e
 */
function _onPinHovered(e) {
  const { spotId } = e.detail;
  const { spots }  = getState();
  const spot       = spots.find(s => s.id === spotId);
  if (!spot) return;

  _pinLatLng = { lat: spot.lat, lng: spot.lng };
  _renderPopup(spot);
}

function _onPinUnhovered() {
  _hidePopup();
}

// ─── Render ───────────────────────────────────────────────────────────────────

/**
 * @param {object} spot
 */
function _renderPopup(spot) {
  const container = document.getElementById('map-container');
  if (!container) return;

  _hidePopup();

  const status    = deriveSpotStatus(spot.id);
  const conf      = getState().confidence[spot.id];
  const confLabel = formatConfidence(conf?.score).label;

  const popup     = document.createElement('div');
  popup.className = 'map-spot-popup';
  popup.id        = 'map-spot-popup';

  popup.innerHTML = /* html */`
    <div class="map-spot-popup__header">
      <span class="map-spot-popup__name">${_escape(spot.name)}</span>
      <span class="map-spot-popup__badge map-spot-popup__badge--${status}">${confLabel}</span>
    </div>
    <div class="map-spot-popup__photo-placeholder" aria-hidden="true"></div>
    <div class="map-spot-popup__meta">
      <span class="map-spot-popup__capacity">👤 ${_capacityNum(spot.rough_capacity)}</span>
      <span class="map-spot-popup__amenities">${_amenityIcons(spot)}</span>
    </div>
  `;

  container.appendChild(popup);
  _popup = popup;

  _repositionPopup();
}

function _hidePopup() {
  if (_popup) {
    _popup.remove();
    _popup = null;
  }
  _pinLatLng = null;
}

// ─── Positioning ──────────────────────────────────────────────────────────────

function _repositionPopup() {
  if (!_popup || !_pinLatLng) return;

  const map = getMap();
  // latLngToContainerPoint returns pixel coords measured from the outer
  // top-left of #map-container (border edge). CSS `absolute` positioning
  // measures from the content edge (padding edge), which is MAP_PADDING_PX
  // inset. Subtract the padding so the two coordinate systems align.
  const pt = map.latLngToContainerPoint([_pinLatLng.lat, _pinLatLng.lng]);

  _popup.style.left = `${pt.x - MAP_PADDING_PX}px`;
  _popup.style.top  = `${pt.y - MAP_PADDING_PX}px`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Approximate head-count label for a rough_capacity tier.
 *
 * @param {string} rough
 * @returns {number|string}
 */
function _capacityNum(rough) {
  const sizes = { small: 8, medium: 20, large: 40 };
  return sizes[rough] ?? '—';
}

/**
 * Render a small row of amenity emoji based on spot fields.
 *
 * @param {object} spot
 * @returns {string}
 */
function _amenityIcons(spot) {
  const icons = [];
  if (spot.noise_baseline === 'quiet')                       icons.push('🔇');
  if (spot.has_outlets)                                      icons.push('⚡');
  if (spot.wifi_strength && spot.wifi_strength !== 'none')   icons.push('📶');
  if (spot.has_food)                                         icons.push('🍔');
  return icons.join(' ');
}

/**
 * Escape HTML special characters to prevent XSS.
 *
 * @param {string} str
 * @returns {string}
 */
function _escape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
