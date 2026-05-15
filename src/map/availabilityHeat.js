/**
 * src/map/availabilityHeat.js
 *
 * Lightweight availability heat overlay derived from spot confidence and
 * direct availability reports. Implemented with standard Leaflet circles so
 * no extra plugin is required.
 */

import { L } from './mapLoader.js';

import { on, EVENTS } from '../core/events.js';
import { getState } from '../core/store.js';
import { getMap } from './mapInit.js';

const PANE_NAME = 'availability-heat-pane';

/** @type {import('leaflet').LayerGroup | null} */
let _heatLayer = null;

/**
 * Initialize the map's toggleable availability heat overlay.
 *
 * @returns {void}
 */
export function initAvailabilityHeatLayer() {
  const map = getMap();
  _ensurePane(map);
  _heatLayer = L.layerGroup().addTo(map);

  on(EVENTS.SPOTS_LOADED, _syncAvailabilityHeat);
  on(EVENTS.CLAIM_UPDATED, _syncAvailabilityHeat);
  on(EVENTS.CORRECTION_FILED, _syncAvailabilityHeat);
  on(EVENTS.VIEW_MODE_CHANGED, _syncAvailabilityHeat);
  on(EVENTS.CAMPUS_SELECTED, _syncAvailabilityHeat);
  on(EVENTS.MAP_OVERLAY_CHANGED, _syncAvailabilityHeat);

  _syncAvailabilityHeat();
}

function _syncAvailabilityHeat() {
  if (!_heatLayer) return;
  _heatLayer.clearLayers();

  const { availabilityHeatEnabled, spots, confidence, viewMode, selectedCampusId } = getState();
  if (!availabilityHeatEnabled) return;

  const visibleSpots = (spots ?? []).filter((spot) => {
    if (!_hasCoordinates(spot)) return false;
    if (viewMode === 'campus') return spot.campus_id === selectedCampusId;
    return true;
  });

  visibleSpots.forEach((spot) => {
    const score = _spotHeatScore(spot, confidence?.[spot.id]);
    const { color, innerOpacity, outerOpacity } = _heatTone(score);
    const baseRadius = viewMode === 'campus' ? 70 : 110;

    L.circle([Number(spot.lat), Number(spot.lng)], {
      radius: baseRadius * 1.9,
      stroke: false,
      fillColor: color,
      fillOpacity: outerOpacity,
      pane: PANE_NAME,
      interactive: false,
    }).addTo(_heatLayer);

    L.circle([Number(spot.lat), Number(spot.lng)], {
      radius: baseRadius,
      stroke: false,
      fillColor: color,
      fillOpacity: innerOpacity,
      pane: PANE_NAME,
      interactive: false,
    }).addTo(_heatLayer);
  });
}

function _spotHeatScore(spot, confidenceRow) {
  if (spot.availability_status === 'available') return 0.95;
  if (spot.availability_status === 'occupied') return 0.05;
  return Number.isFinite(Number(confidenceRow?.score))
    ? Number(confidenceRow.score)
    : 0.5;
}

function _heatTone(score) {
  if (score >= 0.72) {
    return { color: '#23c36b', innerOpacity: 0.2, outerOpacity: 0.08 };
  }
  if (score >= 0.45) {
    return { color: '#eab308', innerOpacity: 0.18, outerOpacity: 0.07 };
  }
  return { color: '#ef4444', innerOpacity: 0.18, outerOpacity: 0.08 };
}

function _ensurePane(map) {
  if (map.getPane(PANE_NAME)) return;
  const pane = map.createPane(PANE_NAME);
  pane.style.zIndex = '360';
  pane.style.mixBlendMode = 'multiply';
}

function _hasCoordinates(spot) {
  return Number.isFinite(Number(spot?.lat)) && Number.isFinite(Number(spot?.lng));
}
