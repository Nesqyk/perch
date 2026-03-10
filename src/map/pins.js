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
 * On-campus spots use a pointed teardrop marker SVG.
 * Off-campus spots use a circular marker SVG.
 *
 * This module never touches the sidebar or bottom sheet.
 * It only emits MAP_PIN_CLICKED — the UI layer decides what to render.
 */

import { on, emit, EVENTS }  from '../core/events.js';
import { getState }           from '../core/store.js';
import { getMap }             from './mapInit.js';
import { deriveSpotStatus }   from '../state/spotState.js';

/** @type {Map<string, google.maps.Marker>}  spotId → Marker */
const _markers = new Map();

// ─── Initialise ──────────────────────────────────────────────────────────────

/**
 * Wire up all store event listeners.
 * Called once from main.js after initMap().
 */
export function initPins() {
  on(EVENTS.SPOTS_LOADED,    _onSpotsLoaded);
  on(EVENTS.CLAIM_UPDATED,   _onClaimUpdated);
  on(EVENTS.CORRECTION_FILED, _onCorrectionFiled);
  on(EVENTS.SPOT_SELECTED,   _onSpotSelected);
  on(EVENTS.SPOT_DESELECTED, _onSpotDeselected);
}

// ─── Event handlers ──────────────────────────────────────────────────────────

function _onSpotsLoaded() {
  const { spots } = getState();
  // Remove stale markers not in the new spots list.
  const incomingIds = new Set(spots.map(s => s.id));
  for (const [id, marker] of _markers) {
    if (!incomingIds.has(id)) {
      marker.setMap(null);
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
  // Scale up the selected marker slightly.
  for (const [id, marker] of _markers) {
    const isSelected = id === spotId;
    marker.setZIndex(isSelected ? 999 : 1);
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
      marker.setZIndex(1);
      marker.setIcon(_buildIcon(spot, false));
    }
  });
}

// ─── Marker CRUD ─────────────────────────────────────────────────────────────

/**
 * Create or update a marker for a given spot.
 * @param {object} spot - Row from the spots table.
 */
function _upsertMarker(spot) {
  const map    = getMap();
  const status = deriveSpotStatus(spot.id);
  const icon   = _buildIcon(spot, spot.id === getState().selectedSpotId);

  if (_markers.has(spot.id)) {
    const marker = _markers.get(spot.id);
    marker.setIcon(icon);
    marker.setTitle(spot.name);
  } else {
    const marker = new google.maps.Marker({
      position: { lat: spot.lat, lng: spot.lng },
      map,
      title:    spot.name,
      icon,
      zIndex:   1,
    });

    marker.addListener('click', () => {
      emit(EVENTS.MAP_PIN_CLICKED, { spotId: spot.id });
    });

    _markers.set(spot.id, marker);
  }

  // Apply CSS animation class via the marker's DOM element.
  // Google Maps exposes the marker DOM after it has been added to the map.
  google.maps.event.addListenerOnce(_markers.get(spot.id), 'idle', () => {
    // Animation is handled via CSS classes on the SVG wrapper.
    // We store the status as a data attribute for the CSS to target.
    const el = _markers.get(spot.id)?.getIcon()?.url;
    // Note: advanced animation (pulsing, ripple) is handled
    // using OverlayView or CSS-animated divs in Phase 2.
    // For Phase 1 the color alone communicates status.
  });
}

// ─── Icon factory ────────────────────────────────────────────────────────────

/**
 * Derive the status string and return a Google Maps icon descriptor.
 *
 * @param {object}  spot
 * @param {boolean} selected
 * @returns {google.maps.Icon}
 */
function _buildIcon(spot, selected) {
  const status = deriveSpotStatus(spot.id);
  const color  = PIN_COLORS[status] ?? PIN_COLORS.maybe;
  const scale  = selected ? 1.35 : 1;

  // On-campus → pointed teardrop; off-campus → circle
  const path   = spot.on_campus ? TEARDROP_PATH : CIRCLE_PATH;

  return {
    path,
    fillColor:    color,
    fillOpacity:  status === 'full' ? 0.5 : 1,
    strokeColor:  '#ffffff',
    strokeWeight: 2,
    scale,
    anchor:       spot.on_campus
      ? new google.maps.Point(12, 36)   // teardrop tip
      : new google.maps.Point(12, 12),  // circle centre
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maps status string → hex color. Must stay in sync with CSS variables. */
const PIN_COLORS = {
  free:    '#22c55e',
  maybe:   '#eab308',
  claimed: '#3b82f6',
  full:    '#ef4444',
};

/**
 * SVG path for an on-campus pin (pointed teardrop, 24×36 viewBox).
 * Defined as a Google Maps SymbolPath-compatible path string.
 */
const TEARDROP_PATH =
  'M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z';

/**
 * SVG path for an off-campus pin (circle, 24×24 viewBox).
 */
const CIRCLE_PATH =
  'M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z';
