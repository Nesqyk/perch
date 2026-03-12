/**
 * src/map/mapControls.js
 *
 * Custom map controls that replace Leaflet's default zoom UI.
 * Renders a single grouped control card (bottom-left) containing:
 *   - Locate Me  (MapPin icon)
 *   - Zoom in    (Plus icon)
 *   - Zoom out   (Minus icon)
 *
 * Icons are sourced from the `lucide` vanilla package (not lucide-react).
 * Each icon is serialised to an inline SVG string via _iconSvg().
 */

import { MapPin, Plus, Minus } from 'lucide';

import { L }                    from './mapLoader.js';
import { getMap, panTo }        from './mapInit.js';
import { getState, dispatch }   from '../core/store.js';
import { on, EVENTS }           from '../core/events.js';

// ─── SVG helper ───────────────────────────────────────────────────────────────

/**
 * Convert a lucide icon descriptor (array of [tag, attrs] tuples) into an
 * inline SVG string sized to `size` × `size` CSS pixels.
 *
 * @param {Array}  icon  Lucide icon export (e.g. MapPin, Plus, Minus)
 * @param {number} [size=18]
 * @returns {string}
 */
function _iconSvg(icon, size = 18) {
  const children = icon
    .map(([tag, attrs]) => {
      const attrStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${attrStr}/>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg"
    width="${size}" height="${size}" viewBox="0 0 24 24"
    fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${children}</svg>`;
}

// ─── Initialise ───────────────────────────────────────────────────────────────

/**
 * Build and inject the custom controls into the map.
 * Must be called after initMap().
 */
export function initMapControls() {
  const map = getMap();

  _MapControlGroup.addTo(map);

  on(EVENTS.LOCATION_SET, () => {
    const btn = document.getElementById('ctrl-locate');
    if (btn) btn.dataset.active = 'true';
  });
}

// ─── Single grouped control ───────────────────────────────────────────────────

const _MapControlGroup = L.control({ position: 'bottomleft' });

_MapControlGroup.onAdd = function () {
  const wrapper = L.DomUtil.create('div', 'map-controls');
  L.DomEvent.disableClickPropagation(wrapper);

  wrapper.appendChild(_buildLocateMeBtn());
  wrapper.appendChild(_buildDivider());
  wrapper.appendChild(_buildZoomInBtn());
  wrapper.appendChild(_buildZoomOutBtn());

  return wrapper;
};

// ─── DOM builders ─────────────────────────────────────────────────────────────

/**
 * @returns {HTMLButtonElement}
 */
function _buildLocateMeBtn() {
  const btn = document.createElement('button');
  btn.className = 'map-control-btn';
  btn.id        = 'ctrl-locate';
  btn.setAttribute('aria-label', 'Center map on my location');
  btn.innerHTML = _iconSvg(MapPin);

  btn.addEventListener('click', () => {
    const { userLocation } = getState();

    if (userLocation) {
      panTo(userLocation, 18);
      return;
    }

    if (!navigator.geolocation) return;

    btn.disabled  = true;
    btn.innerHTML = '…';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        dispatch('SET_USER_LOCATION', location);
        panTo(location, 18);
        btn.disabled  = false;
        btn.innerHTML = _iconSvg(MapPin);
        btn.dataset.active = 'true';
      },
      () => {
        btn.disabled  = false;
        btn.innerHTML = _iconSvg(MapPin);
      },
    );
  });

  return btn;
}

/**
 * @returns {HTMLButtonElement}
 */
function _buildZoomInBtn() {
  const btn = document.createElement('button');
  btn.className = 'map-control-btn';
  btn.id        = 'ctrl-zoom-in';
  btn.setAttribute('aria-label', 'Zoom in');
  btn.innerHTML = _iconSvg(Plus);

  btn.addEventListener('click', () => {
    const map = getMap();
    map.setZoom(map.getZoom() + 1);
  });

  return btn;
}

/**
 * @returns {HTMLButtonElement}
 */
function _buildZoomOutBtn() {
  const btn = document.createElement('button');
  btn.className = 'map-control-btn';
  btn.id        = 'ctrl-zoom-out';
  btn.setAttribute('aria-label', 'Zoom out');
  btn.innerHTML = _iconSvg(Minus);

  btn.addEventListener('click', () => {
    const map = getMap();
    map.setZoom(map.getZoom() - 1);
  });

  return btn;
}

/**
 * Thin divider between locate and zoom buttons.
 *
 * @returns {HTMLHRElement}
 */
function _buildDivider() {
  const hr = document.createElement('hr');
  hr.className     = 'map-control-divider';
  hr.setAttribute('aria-hidden', 'true');
  return hr;
}
