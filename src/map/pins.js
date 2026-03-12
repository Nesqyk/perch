/**
 * src/map/pins.js
 *
 * Owns every marker on the map.
 * Listens to store events and keeps the marker layer in sync with state.
 *
 * Pin state → visual mapping (mirrors the wireframe):
 *   free     → green  (#22c55e)  pulses
 *   maybe    → yellow (#eab308)  static
 *   claimed  → blue   (#3b82f6)  ripple animation
 *   full     → red    (#ef4444)  fades / dim
 *
 * On-campus spots use a pointed teardrop SVG icon.
 * Off-campus spots use a circular SVG icon.
 *
 * This module never touches the sidebar or bottom sheet.
 * It only emits MAP_PIN_CLICKED — the UI layer decides what to render.
 */

import { L }                    from './mapLoader.js';
import { on, emit, EVENTS }     from '../core/events.js';
import { getState }              from '../core/store.js';
import { getMap }                from './mapInit.js';
import { deriveSpotStatus }      from '../state/spotState.js';

/** @type {Map<string, import('leaflet').Marker>}  spotId → Marker */
const _markers = new Map();

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maps status string → hex color. Must stay in sync with CSS variables. */
export const PIN_COLORS = {
  free:    '#22c55e',
  maybe:   '#eab308',
  claimed: '#3b82f6',
  full:    '#ef4444',
};

// ─── Initialise ───────────────────────────────────────────────────────────────

/**
 * Wire up all store event listeners.
 * Called once from main.js after initMap().
 */
export function initPins() {
  on(EVENTS.SPOTS_LOADED,     _onSpotsLoaded);
  on(EVENTS.CLAIM_UPDATED,    _onClaimUpdated);
  on(EVENTS.CORRECTION_FILED, _onCorrectionFiled);
  on(EVENTS.SPOT_SELECTED,    _onSpotSelected);
  on(EVENTS.SPOT_DESELECTED,  _onSpotDeselected);
}

// ─── Event handlers ───────────────────────────────────────────────────────────

function _onSpotsLoaded() {
  const { spots } = getState();
  // Remove stale markers not in the new spots list.
  const incomingIds = new Set(spots.map(s => s.id));
  for (const [id, marker] of _markers) {
    if (!incomingIds.has(id)) {
      marker.remove();
      _markers.delete(id);
    }
  }
  // Add or update.
  spots.forEach(_upsertMarker);
}

function _onClaimUpdated(e) {
  const { spotId } = e.detail;
  if (spotId === null) {
    // Repaint all pins (bulk claim load on startup).
    getState().spots.forEach(s => _upsertMarker(s));
  } else {
    const spot = getState().spots.find(s => s.id === spotId);
    if (spot) _upsertMarker(spot);
  }
}

function _onCorrectionFiled(e) {
  const { spotId } = e.detail;
  const spot = getState().spots.find(s => s.id === spotId);
  if (spot) _upsertMarker(spot);
}

function _onSpotSelected(e) {
  const { spotId } = e.detail;
  // Scale up the selected marker slightly via zIndexOffset.
  for (const [id, marker] of _markers) {
    const isSelected = id === spotId;
    marker.setZIndexOffset(isSelected ? 999 : 0);
    marker.setIcon(_buildIcon(
      getState().spots.find(s => s.id === id),
      isSelected
    ));
  }
}

function _onSpotDeselected() {
  // Reset all markers to normal scale.
  getState().spots.forEach(spot => {
    const marker = _markers.get(spot.id);
    if (marker) {
      marker.setZIndexOffset(0);
      marker.setIcon(_buildIcon(spot, false));
    }
  });
}

// ─── Marker CRUD ──────────────────────────────────────────────────────────────

/**
 * Create or update a Leaflet marker for a given spot.
 *
 * @param {object} spot - Row from the spots table.
 */
function _upsertMarker(spot) {
  const map  = getMap();
  const icon = _buildIcon(spot, spot.id === getState().selectedSpotId);

  if (_markers.has(spot.id)) {
    const marker = _markers.get(spot.id);
    marker.setIcon(icon);
  } else {
    const marker = L.marker([spot.lat, spot.lng], { icon, title: spot.name })
      .addTo(map);

    marker.on('click', () => {
      emit(EVENTS.MAP_PIN_CLICKED, { spotId: spot.id });
    });

    _markers.set(spot.id, marker);
  }
}

// ─── Icon factory ─────────────────────────────────────────────────────────────

/**
 * Build a Leaflet DivIcon with an inline SVG for the given spot + selection state.
 *
 * @param {object}  spot
 * @param {boolean} selected
 * @returns {import('leaflet').DivIcon}
 */
function _buildIcon(spot, selected) {
  const status  = deriveSpotStatus(spot.id);
  const color   = PIN_COLORS[status] ?? PIN_COLORS.maybe;
  const opacity = status === 'full' ? 0.5 : 1;
  const scale   = selected ? 1.35 : 1;

  if (spot.on_campus) {
    // Teardrop: 24×36 natural size, tip at bottom-centre.
    const w = Math.round(24 * scale);
    const h = Math.round(36 * scale);
    return L.divIcon({
      html:        _teardropSvg(color, opacity, w, h),
      className:   '',              // suppress Leaflet's default white square
      iconSize:    [w, h],
      iconAnchor:  [w / 2, h],     // tip of the teardrop
    });
  }

  // Circle: 24×24 natural size, anchor at centre.
  const d = Math.round(24 * scale);
  return L.divIcon({
    html:       _circleSvg(color, opacity, d),
    className:  '',
    iconSize:   [d, d],
    iconAnchor: [d / 2, d / 2],
  });
}

/**
 * Inline SVG string for an on-campus (teardrop) pin.
 *
 * @param {string} color   - Hex fill color.
 * @param {number} opacity - Fill opacity (0–1).
 * @param {number} w       - Rendered width in pixels.
 * @param {number} h       - Rendered height in pixels.
 * @returns {string}
 */
function _teardropSvg(color, opacity, w, h) {
  return /* html */`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 36">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z"
      fill="${color}" fill-opacity="${opacity}" stroke="#ffffff" stroke-width="2"/>
  </svg>`;
}

/**
 * Inline SVG string for an off-campus (circle) pin.
 *
 * @param {string} color   - Hex fill color.
 * @param {number} opacity - Fill opacity (0–1).
 * @param {number} d       - Rendered diameter in pixels.
 * @returns {string}
 */
function _circleSvg(color, opacity, d) {
  return /* html */`<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="11"
      fill="${color}" fill-opacity="${opacity}" stroke="#ffffff" stroke-width="2"/>
  </svg>`;
}
