/**
 * src/map/mapControls.js
 *
 * Custom map controls that replace Leaflet's default zoom UI.
 * Wired up after initMap() resolves.
 *
 * Controls provided:
 *  - Zoom in (+)
 *  - Zoom out (-)
 *  - Locate Me (centers map on user's geolocation)
 *
 * These match the wireframe: [+][-] [📍 Me] in the bottom-left of the map.
 * Each control is a Leaflet L.Control subclass so it renders inside the map
 * frame and respects Leaflet's stacking / z-index management.
 */

import { L }              from './mapLoader.js';
import { getMap, panTo }  from './mapInit.js';
import { getState, dispatch } from '../core/store.js';
import { on, EVENTS }     from '../core/events.js';

// ─── Initialise ───────────────────────────────────────────────────────────────

/**
 * Build and inject the custom controls into the map.
 * Must be called after initMap().
 */
export function initMapControls() {
  const map = getMap();

  _ZoomControl.addTo(map);
  _LocateMeControl.addTo(map);

  // If location becomes available after init, update the Locate Me button.
  on(EVENTS.LOCATION_SET, () => {
    const btn = document.getElementById('ctrl-locate');
    if (btn) btn.classList.add('has-location');
  });
}

// ─── Zoom control ─────────────────────────────────────────────────────────────

const _ZoomControl = L.control({ position: 'bottomleft' });

_ZoomControl.onAdd = function () {
  const wrapper    = L.DomUtil.create('div', 'map-controls map-zoom-controls');
  L.DomEvent.disableClickPropagation(wrapper);

  wrapper.appendChild(_buildZoomInBtn());
  wrapper.appendChild(_buildZoomOutBtn());

  return wrapper;
};

// ─── Locate-me control ────────────────────────────────────────────────────────

const _LocateMeControl = L.control({ position: 'bottomleft' });

_LocateMeControl.onAdd = function () {
  const wrapper = L.DomUtil.create('div', 'map-controls map-locate-controls');
  L.DomEvent.disableClickPropagation(wrapper);

  wrapper.appendChild(_buildLocateMeBtn());

  return wrapper;
};

// ─── DOM builders ─────────────────────────────────────────────────────────────

function _buildZoomInBtn() {
  const btn       = document.createElement('button');
  btn.className   = 'map-ctrl-btn';
  btn.id          = 'ctrl-zoom-in';
  btn.textContent = '+';
  btn.setAttribute('aria-label', 'Zoom in');
  btn.addEventListener('click', () => {
    const map = getMap();
    map.setZoom(map.getZoom() + 1);
  });
  return btn;
}

function _buildZoomOutBtn() {
  const btn       = document.createElement('button');
  btn.className   = 'map-ctrl-btn';
  btn.id          = 'ctrl-zoom-out';
  btn.textContent = '−';
  btn.setAttribute('aria-label', 'Zoom out');
  btn.addEventListener('click', () => {
    const map = getMap();
    map.setZoom(map.getZoom() - 1);
  });
  return btn;
}

function _buildLocateMeBtn() {
  const btn       = document.createElement('button');
  btn.className   = 'map-ctrl-btn map-ctrl-locate';
  btn.id          = 'ctrl-locate';
  btn.textContent = '📍';
  btn.setAttribute('aria-label', 'Center map on my location');

  btn.addEventListener('click', () => {
    const { userLocation } = getState();

    if (userLocation) {
      panTo(userLocation, 18);
      return;
    }

    // Request geolocation if not yet granted.
    if (!navigator.geolocation) return;

    btn.disabled    = true;
    btn.textContent = '…';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        dispatch('SET_USER_LOCATION', location);
        panTo(location, 18);
        btn.disabled    = false;
        btn.textContent = '📍';
      },
      () => {
        btn.disabled    = false;
        btn.textContent = '📍';
      }
    );
  });

  return btn;
}
