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
 * Group live pins are rendered as a separate layer on top of spot pins.
 * Each group pin uses a coloured teardrop with member initials and a
 * joiner count badge; transit "on the way" joiners appear as small dots
 * orbiting the pin.
 *
 * This module never touches the sidebar or bottom sheet.
 * It only emits MAP_PIN_CLICKED — the UI layer decides what to render.
 */

import { L }                    from './mapLoader.js';
import { on, emit, EVENTS }     from '../core/events.js';
import { getState }              from '../core/store.js';
import { getMap }                from './mapInit.js';
import { deriveSpotStatus }      from '../state/spotState.js';
import { formatConfidence }      from '../utils/confidence.js';

/** @type {Map<string, import('leaflet').Marker>}  spotId → Marker */
const _markers = new Map();

/** @type {Map<string, import('leaflet').Marker>}  pinId → Marker for group live pins */
const _groupMarkers = new Map();

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
    // Refresh tooltip content so status badge stays current.
    marker.setTooltipContent(_buildTooltipHtml(spot));
  } else {
    const marker = L.marker([spot.lat, spot.lng], { icon, title: spot.name })
      .addTo(map);

    marker.on('click', () => {
      emit(EVENTS.MAP_PIN_CLICKED, { spotId: spot.id });
    });

    marker.bindTooltip(_buildTooltipHtml(spot), {
      direction:  'top',
      permanent:  false,
      opacity:    1,
      className:  'map-spot-tooltip-wrapper',
      offset:     [0, -4],
    });

    _markers.set(spot.id, marker);
  }
}

// ─── Tooltip HTML factory ─────────────────────────────────────────────────────

/**
 * Build the HTML string injected into a Leaflet tooltip for a spot marker.
 * Leaflet wraps this in `.leaflet-tooltip.map-spot-tooltip-wrapper`; our CSS
 * resets that wrapper and styles the inner `.map-spot-popup` card.
 *
 * @param {object} spot
 * @returns {string}
 */
function _buildTooltipHtml(spot) {
  const status    = deriveSpotStatus(spot.id);
  const conf      = getState().confidence[spot.id];
  const confLabel = formatConfidence(conf?.score).label;

  const amenities = _amenityIcons(spot);

  return /* html */`
    <div class="map-spot-popup">
      <div class="map-spot-popup__header">
        <span class="map-spot-popup__name">${_escapeHtml(spot.name)}</span>
        <span class="map-spot-popup__badge map-spot-popup__badge--${status}">${confLabel}</span>
      </div>
      <div class="map-spot-popup__photo-placeholder" aria-hidden="true"></div>
      <div class="map-spot-popup__meta">
        <span class="map-spot-popup__capacity">👤 ${_capacityNum(spot.rough_capacity)}</span>
        <span class="map-spot-popup__amenities">${amenities}</span>
      </div>
    </div>
  `;
}

/**
 * Approximate head-count for a rough_capacity tier.
 *
 * @param {string} rough
 * @returns {number|string}
 */
function _capacityNum(rough) {
  const sizes = { small: 8, medium: 20, large: 40 };
  return sizes[rough] ?? '—';
}

/**
 * Render amenity emoji for a spot.
 *
 * @param {object} spot
 * @returns {string}
 */
function _amenityIcons(spot) {
  const icons = [];
  if (spot.noise_baseline === 'quiet')                      icons.push('🔇');
  if (spot.has_outlets)                                     icons.push('⚡');
  if (spot.wifi_strength && spot.wifi_strength !== 'none')  icons.push('📶');
  if (spot.has_food)                                        icons.push('🍔');
  return icons.join(' ');
}

/**
 * Escape HTML special characters to prevent XSS.
 *
 * @param {string} str
 * @returns {string}
 */
function _escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
 * Inline SVG string for an on-campus (teardrop) pin with a clipboard icon.
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
    ${_clipboardPath()}
  </svg>`;
}

/**
 * Inline SVG string for an off-campus (circle) pin with a clipboard icon.
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
    ${_clipboardPathCircle()}
  </svg>`;
}

/**
 * White clipboard icon path centred in a 24×36 teardrop viewBox (upper circle portion).
 * Rendered at approx 10×13px centred at (12, 11).
 *
 * @returns {string}
 */
function _clipboardPath() {
  return /* html */`<g transform="translate(7, 4)" fill="#ffffff">
    <!-- clipboard body -->
    <rect x="1" y="2" width="8" height="10" rx="1" ry="1"/>
    <!-- clipboard clip at top -->
    <rect x="3.5" y="0.5" width="3" height="2.5" rx="0.75" ry="0.75" fill="${'#ffffff'}" opacity="0.9"/>
    <!-- lines on clipboard -->
    <rect x="2.5" y="5" width="5" height="0.8" rx="0.4" fill="#88ddbb"/>
    <rect x="2.5" y="7" width="5" height="0.8" rx="0.4" fill="#88ddbb"/>
    <rect x="2.5" y="9" width="3.5" height="0.8" rx="0.4" fill="#88ddbb"/>
  </g>`;
}

/**
 * White clipboard icon path centred in a 24×24 circle viewBox.
 * Rendered at approx 10×12px centred at (12, 12).
 *
 * @returns {string}
 */
function _clipboardPathCircle() {
  return /* html */`<g transform="translate(7, 5)" fill="#ffffff">
    <!-- clipboard body -->
    <rect x="1" y="2" width="8" height="10" rx="1" ry="1"/>
    <!-- clipboard clip at top -->
    <rect x="3.5" y="0.5" width="3" height="2.5" rx="0.75" ry="0.75" opacity="0.9"/>
    <!-- lines on clipboard -->
    <rect x="2.5" y="5" width="5" height="0.8" rx="0.4" fill="#88ddbb"/>
    <rect x="2.5" y="7" width="5" height="0.8" rx="0.4" fill="#88ddbb"/>
    <rect x="2.5" y="9" width="3.5" height="0.8" rx="0.4" fill="#88ddbb"/>
  </g>`;
}

// ─── Group pin layer ──────────────────────────────────────────────────────────

/**
 * Wire up group pin layer listeners.
 * Call once from main.js after initMap(), after initPins().
 */
export function initGroupPinLayer() {
  on(EVENTS.GROUP_PINS_UPDATED,       _onGroupPinsUpdated);
  on(EVENTS.GROUP_PIN_JOINS_UPDATED,  _onGroupPinsUpdated);
  on(EVENTS.GROUP_LEFT,               _clearGroupPinLayer);
}

/**
 * Rebuild the group pin markers from current state.
 * Triggered when group pins or joins change.
 */
function _onGroupPinsUpdated() {
  const { groupPins, groupPinJoins, group } = getState();
  if (!group) {
    _clearGroupPinLayer();
    return;
  }
  updateGroupPinLayer(groupPins, groupPinJoins, group.color);
}

/**
 * Remove all group pin markers from the map.
 */
function _clearGroupPinLayer() {
  for (const marker of _groupMarkers.values()) {
    marker.remove();
  }
  _groupMarkers.clear();
}

/**
 * Sync the group pin marker layer with the provided pins + joins.
 * Called by feature module after a realtime update.
 *
 * @param {object[]} pins       - Array of group_pin rows.
 * @param {object[]} joins      - Array of group_pin_join rows.
 * @param {string}   color      - Hex colour for the group (e.g. '#7c3aed').
 */
export function updateGroupPinLayer(pins, joins, color) {
  const map = getMap();

  // Remove stale markers for pins no longer in the list.
  const incomingIds = new Set(pins.map(p => p.id));
  for (const [id, marker] of _groupMarkers) {
    if (!incomingIds.has(id)) {
      marker.remove();
      _groupMarkers.delete(id);
    }
  }

  // Upsert markers for each active pin.
  for (const pin of pins) {
    if (pin.status === 'ended') {
      // Remove ended pins from the map.
      if (_groupMarkers.has(pin.id)) {
        _groupMarkers.get(pin.id).remove();
        _groupMarkers.delete(pin.id);
      }
      continue;
    }

    const pinJoins    = joins.filter(j => j.pin_id === pin.id);
    const transitCount = pinJoins.filter(j => j.status === 'heading').length;
    const icon        = _buildGroupPinIcon(pin, pinJoins, color, transitCount);

    if (_groupMarkers.has(pin.id)) {
      _groupMarkers.get(pin.id).setIcon(icon);
    } else {
      const marker = L.marker([pin.lat, pin.lng], {
        icon,
        title: `Group pin (${pin.status})`,
        zIndexOffset: 500, // render above spot pins
      }).addTo(map);
      _groupMarkers.set(pin.id, marker);
    }
  }
}

/**
 * Build a Leaflet DivIcon for a group pin.
 * Renders a coloured teardrop with member initials, a joiner badge,
 * and small transit dots for members heading to the pin.
 *
 * @param {object}   pin          - group_pin row (must have lat, lng, status, display_name).
 * @param {object[]} joins        - group_pin_join rows for this pin.
 * @param {string}   color        - Group hex color.
 * @param {number}   transitCount - Number of members currently in transit.
 * @returns {import('leaflet').DivIcon}
 */
function _buildGroupPinIcon(pin, joins, color, transitCount) {
  const initials = _initials(pin.display_name ?? '?');
  const badge    = transitCount > 0
    ? /* html */`<span class="group-pin-badge">${transitCount}</span>`
    : '';

  // Transit dots: one small dot per member heading there (max 5).
  const dots = joins
    .filter(j => j.status === 'heading')
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
    className:  '',
    iconSize:   [40, 52],
    iconAnchor: [16, 44],
  });
}

/**
 * Extract up to 2 initials from a display name.
 *
 * @param {string} name
 * @returns {string}
 */
function _initials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
