/**
 * src/ui/mapPopup.js
 *
 * Floating spot-info popup card rendered on the map when a pin is clicked.
 * Appears anchored above the selected pin; hides when deselected.
 *
 * The popup is a positioned <div> injected into #map-container.
 * It is repositioned using Leaflet's latLngToContainerPoint() and updated
 * on map move/zoom so it stays locked to the pin.
 *
 * This module never touches the sidebar. It is purely additive —
 * pin click still routes the full detail card to the sidebar as before.
 *
 * Emits nothing. Listens to:
 *   EVENTS.SPOT_SELECTED   — show popup for selected spot
 *   EVENTS.SPOT_DESELECTED — hide popup
 */

import { on, EVENTS }           from '../core/events.js';
import { getState }              from '../core/store.js';
import { getMap }                from '../map/mapInit.js';
import { deriveSpotStatus }      from '../state/spotState.js';
import { formatConfidence }      from '../utils/confidence.js';

// ─── Module state ─────────────────────────────────────────────────────────────

/** @type {HTMLElement | null} */
let _popup = null;

/** @type {{ lat: number, lng: number } | null} Current pin position. */
let _pinLatLng = null;

// ─── Initialise ───────────────────────────────────────────────────────────────

/**
 * Wire up event listeners. Call once from main.js after initMap().
 */
export function initMapPopup() {
  on(EVENTS.SPOT_SELECTED,   _onSpotSelected);
  on(EVENTS.SPOT_DESELECTED, _onSpotDeselected);
  on(EVENTS.MAP_READY,       _onMapReady);
}

// ─── Map ready ────────────────────────────────────────────────────────────────

function _onMapReady() {
  const map = getMap();
  // Reposition the popup whenever the map moves or zooms.
  map.on('move zoom', _repositionPopup);
}

// ─── Event handlers ───────────────────────────────────────────────────────────

function _onSpotSelected(e) {
  const { spotId } = e.detail;
  const { spots }  = getState();
  const spot       = spots.find(s => s.id === spotId);
  if (!spot) return;

  _pinLatLng = { lat: spot.lat, lng: spot.lng };
  _renderPopup(spot);
}

function _onSpotDeselected() {
  _hidePopup();
}

// ─── Render ───────────────────────────────────────────────────────────────────

function _renderPopup(spot) {
  const container = document.getElementById('map-container');
  if (!container) return;

  // Remove any existing popup.
  _hidePopup();

  const status     = deriveSpotStatus(spot.id);
  const conf       = getState().confidence[spot.id];
  const confLabel  = formatConfidence(conf?.score).label;

  const popup      = document.createElement('div');
  popup.className  = 'map-spot-popup';
  popup.id         = 'map-spot-popup';

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
  const pt  = map.latLngToContainerPoint([_pinLatLng.lat, _pinLatLng.lng]);

  // Anchor the popup so its bottom-centre sits above the pin.
  // We use CSS transform to keep it centred; just set left/top here.
  _popup.style.left = `${pt.x}px`;
  _popup.style.top  = `${pt.y}px`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Approximate head-count for a rough_capacity tier.
 *
 * @param {string} rough
 * @returns {number}
 */
function _capacityNum(rough) {
  const map = { small: 8, medium: 20, large: 40 };
  return map[rough] ?? '—';
}

/**
 * Render a small row of amenity icons based on spot fields.
 *
 * @param {object} spot
 * @returns {string}
 */
function _amenityIcons(spot) {
  const icons = [];
  if (spot.noise_baseline === 'quiet') icons.push('🔇');
  if (spot.has_outlets)                icons.push('⚡');
  if (spot.wifi_strength && spot.wifi_strength !== 'none') icons.push('📶');
  if (spot.has_food)                   icons.push('🍔');
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
