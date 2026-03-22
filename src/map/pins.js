/**
 * src/map/pins.js
 *
 * Owns every marker on the map.
 *
 * Campus mode renders building markers; room details live inside the building
 * modal. Group live pins always render as an overlay above both.
 */

import { L } from './mapLoader.js';

import { on, emit, EVENTS } from '../core/events.js';
import { getState } from '../core/store.js';
import { getMap } from './mapInit.js';
import { deriveSpotStatus } from '../state/spotState.js';
import { deriveBuildingStatus, getRoomsForBuilding } from '../state/buildingState.js';
import { formatConfidence } from '../utils/confidence.js';

/** @type {Map<string, import('leaflet').Marker>} */
const _spotMarkers = new Map();

/** @type {Map<string, import('leaflet').Marker>} */
const _buildingMarkers = new Map();

/** @type {Map<string, import('leaflet').Marker>} */
const _groupMarkers = new Map();

/** Maps status string to hex color. Must stay in sync with CSS variables. */
export const PIN_COLORS = {
  free: '#22c55e',
  maybe: '#eab308',
  claimed: '#3b82f6',
  full: '#ef4444',
};

/**
 * Wire up all store event listeners.
 *
 * @returns {void}
 */
export function initPins() {
  on(EVENTS.SPOTS_LOADED, _syncMarkers);
  on(EVENTS.BUILDINGS_LOADED, _syncMarkers);
  on(EVENTS.CLAIM_UPDATED, _syncMarkers);
  on(EVENTS.CORRECTION_FILED, _syncMarkers);
  on(EVENTS.SPOT_SELECTED, _onSpotSelected);
  on(EVENTS.SPOT_DESELECTED, _onSpotDeselected);
  on(EVENTS.VIEW_MODE_CHANGED, _syncMarkers);
  on(EVENTS.CAMPUS_SELECTED, _syncMarkers);
}

function _syncMarkers() {
  const { viewMode } = getState();
  if (viewMode === 'campus') {
    _syncBuildingMarkers();
    _clearSpotMarkers();
    return;
  }

  _syncSpotMarkers();
  _clearBuildingMarkers();
}

function _syncSpotMarkers() {
  const { spots } = getState();
  const incomingIds = new Set(spots.map((spot) => spot.id));

  for (const [id, marker] of _spotMarkers) {
    if (!incomingIds.has(id)) {
      marker.remove();
      _spotMarkers.delete(id);
    }
  }

  spots.forEach(_upsertSpotMarker);
}

function _syncBuildingMarkers() {
  const { buildings, selectedCampusId } = getState();
  const visibleBuildings = (buildings ?? []).filter((building) => building.campus_id === selectedCampusId);
  const incomingIds = new Set(visibleBuildings.map((building) => building.id));

  for (const [id, marker] of _buildingMarkers) {
    if (!incomingIds.has(id)) {
      marker.remove();
      _buildingMarkers.delete(id);
    }
  }

  visibleBuildings.forEach(_upsertBuildingMarker);
}

// ─── Marker upsert ────────────────────────────────────────────────────────────

/**
 * Create or update a Leaflet marker for a given spot.
 *
 * @param {object} spot
 * @returns {void}
 */
function _upsertSpotMarker(spot) {
  const map = getMap();
  const icon = _buildSpotIcon(spot, spot.id === getState().selectedSpotId);

  if (_spotMarkers.has(spot.id)) {
    const marker = _spotMarkers.get(spot.id);
    marker.setIcon(icon);
    marker.setTooltipContent(_buildSpotTooltipHtml(spot));
    return;
  }

  const marker = L.marker([spot.lat, spot.lng], { icon, title: spot.name }).addTo(map);
  marker.on('click', () => emit(EVENTS.MAP_PIN_CLICKED, { spotId: spot.id }));
  marker.bindTooltip(_buildSpotTooltipHtml(spot), {
    direction: 'top',
    permanent: false,
    opacity: 1,
    className: 'map-spot-tooltip-wrapper',
    offset: [0, -32],
  });
  _spotMarkers.set(spot.id, marker);
}

/**
 * Create or update a Leaflet marker for a campus building.
 *
 * @param {object} building
 * @returns {void}
 */
function _upsertBuildingMarker(building) {
  if (building.lat == null || building.lng == null) return;

  const map = getMap();
  const rooms = getRoomsForBuilding(getState().spots, building);
  const status = deriveBuildingStatus(rooms, getState().claims, getState().confidence);
  const icon = _buildBuildingIcon(building, status, rooms.length);

  if (_buildingMarkers.has(building.id)) {
    const marker = _buildingMarkers.get(building.id);
    marker.setIcon(icon);
    marker.setTooltipContent(_buildBuildingTooltipHtml(building, status, rooms.length));
    return;
  }

  const marker = L.marker([building.lat, building.lng], {
    icon,
    title: building.name,
    zIndexOffset: 250,
  }).addTo(map);

  marker.on('click', () => emit(EVENTS.MAP_BUILDING_CLICKED, { buildingId: building.id }));
  marker.bindTooltip(_buildBuildingTooltipHtml(building, status, rooms.length), {
    direction: 'top',
    permanent: false,
    opacity: 1,
    className: 'map-spot-tooltip-wrapper',
    offset: [0, -28],
  });

  _buildingMarkers.set(building.id, marker);
}

function _clearSpotMarkers() {
  for (const marker of _spotMarkers.values()) {
    marker.remove();
  }
  _spotMarkers.clear();
}

function _clearBuildingMarkers() {
  for (const marker of _buildingMarkers.values()) {
    marker.remove();
  }
  _buildingMarkers.clear();
}

function _onSpotSelected(e) {
  if (getState().viewMode === 'campus') return;

  const { spotId } = e.detail;
  for (const [id, marker] of _spotMarkers) {
    const isSelected = id === spotId;
    marker.setZIndexOffset(isSelected ? 999 : 0);
    marker.setIcon(_buildSpotIcon(
      getState().spots.find((spot) => spot.id === id),
      isSelected,
    ));
  }
}

function _onSpotDeselected() {
  if (getState().viewMode === 'campus') return;

  getState().spots.forEach((spot) => {
    const marker = _spotMarkers.get(spot.id);
    if (!marker) return;
    marker.setZIndexOffset(0);
    marker.setIcon(_buildSpotIcon(spot, false));
  });
}

/**
 * Build the HTML string injected into a Leaflet tooltip for a spot marker.
 *
 * @param {object} spot
 * @returns {string}
 */
function _buildSpotTooltipHtml(spot) {
  const status = deriveSpotStatus(spot.id);
  const conf = getState().confidence[spot.id];
  const confLabel = formatConfidence(conf?.score).label;

  return /* html */`
    <div class="map-spot-popup">
      <div class="map-spot-popup__header">
        <span class="map-spot-popup__name">${_escapeHtml(spot.name)}</span>
        <span class="map-spot-popup__badge map-spot-popup__badge--${status}">${confLabel}</span>
      </div>
      <div class="map-spot-popup__photo-placeholder" aria-hidden="true"></div>
      <div class="map-spot-popup__meta">
        <span class="map-spot-popup__capacity">👤 ${_capacityNum(spot.rough_capacity)}</span>
        <span class="map-spot-popup__amenities">${_amenityIcons(spot)}</span>
      </div>
    </div>
  `;
}

/**
 * Build tooltip HTML for a building marker.
 *
 * @param {object} building
 * @param {string} status
 * @param {number} roomCount
 * @returns {string}
 */
function _buildBuildingTooltipHtml(building, status, roomCount) {
  const verification = building.verification_status === 'pending'
    ? 'Pending verification'
    : 'Verified building';

  return /* html */`
    <div class="map-spot-popup">
      <div class="map-spot-popup__header">
        <span class="map-spot-popup__name">${_escapeHtml(building.name)}</span>
        <span class="map-spot-popup__badge map-spot-popup__badge--${status}">${verification}</span>
      </div>
      <div class="map-spot-popup__meta">
        <span class="map-spot-popup__capacity">🏢 ${roomCount} mapped room${roomCount === 1 ? '' : 's'}</span>
      </div>
    </div>
  `;
}

/**
 * Build a Leaflet DivIcon with an inline SVG for a city spot.
 *
 * @param {object} spot
 * @param {boolean} selected
 * @returns {import('leaflet').DivIcon}
 */
function _buildSpotIcon(spot, selected) {
  const status = deriveSpotStatus(spot.id);
  const color = PIN_COLORS[status] ?? PIN_COLORS.maybe;
  const opacity = status === 'full' ? 0.5 : 1;
  const scale = selected ? 1.35 : 1;

  if (spot.on_campus) {
    const width = Math.round(24 * scale);
    const height = Math.round(36 * scale);
    return L.divIcon({
      html: _teardropSvg(color, opacity, width, height),
      className: '',
      iconSize: [width, height],
      iconAnchor: [width / 2, height],
    });
  }

  const diameter = Math.round(24 * scale);
  return L.divIcon({
    html: _circleSvg(color, opacity, diameter),
    className: '',
    iconSize: [diameter, diameter],
    iconAnchor: [diameter / 2, diameter / 2],
  });
}

/**
 * Build a compact building marker icon for campus mode.
 *
 * @param {object} building
 * @param {string} status
 * @param {number} roomCount
 * @returns {import('leaflet').DivIcon}
 */
function _buildBuildingIcon(building, status, roomCount) {
  const color = PIN_COLORS[status] ?? PIN_COLORS.maybe;
  const verificationClass = building.verification_status === 'pending'
    ? 'campus-building-marker--pending'
    : 'campus-building-marker--verified';

  return L.divIcon({
    className: '',
    iconSize: [56, 42],
    iconAnchor: [28, 36],
    html: /* html */`
      <div class="campus-building-marker ${verificationClass}" style="--building-color:${color}">
        <span class="campus-building-marker__glyph">🏢</span>
        <span class="campus-building-marker__count">${roomCount > 0 ? roomCount : '+'}</span>
      </div>
    `,
  });
}

function _capacityNum(rough) {
  const sizes = { small: 8, medium: 20, large: 40 };
  return sizes[rough] ?? '-';
}

function _amenityIcons(spot) {
  const icons = [];
  if (spot.noise_baseline === 'quiet') icons.push('🔇');
  if (spot.has_outlets) icons.push('⚡');
  if (spot.wifi_strength && spot.wifi_strength !== 'none') icons.push('📶');
  if (spot.has_food) icons.push('🍔');
  return icons.join(' ');
}

function _escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _teardropSvg(color, opacity, width, height) {
  return /* html */`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 24 36">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z"
      fill="${color}" fill-opacity="${opacity}" stroke="#ffffff" stroke-width="2"/>
    ${_clipboardPath()}
  </svg>`;
}

function _circleSvg(color, opacity, diameter) {
  return /* html */`<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="11"
      fill="${color}" fill-opacity="${opacity}" stroke="#ffffff" stroke-width="2"/>
    ${_clipboardPathCircle()}
  </svg>`;
}

function _clipboardPath() {
  return /* html */`<g transform="translate(7, 4)" fill="#ffffff">
    <rect x="1" y="2" width="8" height="10" rx="1" ry="1"/>
    <rect x="3.5" y="0.5" width="3" height="2.5" rx="0.75" ry="0.75" fill="#ffffff" opacity="0.9"/>
    <rect x="2.5" y="5" width="5" height="0.8" rx="0.4" fill="#88ddbb"/>
    <rect x="2.5" y="7" width="5" height="0.8" rx="0.4" fill="#88ddbb"/>
    <rect x="2.5" y="9" width="3.5" height="0.8" rx="0.4" fill="#88ddbb"/>
  </g>`;
}

function _clipboardPathCircle() {
  return /* html */`<g transform="translate(7, 5)" fill="#ffffff">
    <rect x="1" y="2" width="8" height="10" rx="1" ry="1"/>
    <rect x="3.5" y="0.5" width="3" height="2.5" rx="0.75" ry="0.75" opacity="0.9"/>
    <rect x="2.5" y="5" width="5" height="0.8" rx="0.4" fill="#88ddbb"/>
    <rect x="2.5" y="7" width="5" height="0.8" rx="0.4" fill="#88ddbb"/>
    <rect x="2.5" y="9" width="3.5" height="0.8" rx="0.4" fill="#88ddbb"/>
  </g>`;
}

/**
 * Wire up group pin layer listeners.
 *
 * @returns {void}
 */
export function initGroupPinLayer() {
  on(EVENTS.GROUP_PINS_UPDATED, _onGroupPinsUpdated);
  on(EVENTS.GROUP_PIN_JOINS_UPDATED, _onGroupPinsUpdated);
  on(EVENTS.GROUP_LEFT, _clearGroupPinLayer);
}

function _onGroupPinsUpdated() {
  const { groupPins, groupPinJoins, group, groupPinsVisible } = getState();
  if (!group || !groupPinsVisible) {
    _clearGroupPinLayer();
    return;
  }
  updateGroupPinLayer(groupPins, groupPinJoins, group.color);
}

function _clearGroupPinLayer() {
  for (const marker of _groupMarkers.values()) {
    marker.remove();
  }
  _groupMarkers.clear();
}

/**
 * Sync the group pin marker layer with the provided pins + joins.
 *
 * @param {object} pins
 * @param {object} joins
 * @param {string} color
 * @returns {void}
 */
export function updateGroupPinLayer(pins, joins, color) {
  const map = getMap();
  const pinsList = Object.values(pins);
  const incomingIds = new Set(pinsList.map((pin) => pin.id));

  for (const [id, marker] of _groupMarkers) {
    if (!incomingIds.has(id)) {
      marker.remove();
      _groupMarkers.delete(id);
    }
  }

  for (const pin of pinsList) {
    if (pin.status === 'ended' || pin.ended_at) {
      if (_groupMarkers.has(pin.id)) {
        _groupMarkers.get(pin.id).remove();
        _groupMarkers.delete(pin.id);
      }
      continue;
    }

    const pinJoins = joins[pin.id] || [];
    const transitCount = pinJoins.filter((join) => join.status === 'heading').length;
    const icon = _buildGroupPinIcon(pin, pinJoins, color, transitCount);

    if (_groupMarkers.has(pin.id)) {
      _groupMarkers.get(pin.id).setIcon(icon);
    } else {
      const marker = L.marker([pin.lat, pin.lng], {
        icon,
        title: `Group pin (${pin.status})`,
        zIndexOffset: 500,
      }).addTo(map);
      _groupMarkers.set(pin.id, marker);
    }
  }
}

function _buildGroupPinIcon(pin, joins, color, transitCount) {
  const initials = _initials(pin.display_name ?? '?');
  const badge = transitCount > 0
    ? /* html */`<span class="group-pin-badge">${transitCount}</span>`
    : '';

  const dots = joins
    .filter((join) => join.status === 'heading')
    .slice(0, 5)
    .map(() => /* html */`<span class="group-transit-dot" style="background:${color}"></span>`)
    .join('');

  const dotsRow = dots
    ? /* html */`<div class="group-transit-dots">${dots}</div>`
    : '';

  const html = /* html */`
    <div class="group-pin-wrapper">
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 24 36" class="group-pin-svg">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z"
          fill="${color}" stroke="#ffffff" stroke-width="2"/>
        <text x="12" y="14" text-anchor="middle" dominant-baseline="middle"
          font-family="system-ui,sans-serif" font-size="9" font-weight="700"
          fill="#ffffff">${initials}</text>
      </svg>
      ${badge}
      ${dotsRow}
    </div>`;

  return L.divIcon({
    html,
    className: '',
    iconSize: [40, 52],
    iconAnchor: [16, 44],
  });
}

function _initials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
