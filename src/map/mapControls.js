/**
 * src/map/mapControls.js
 *
 * Custom map controls that replace Google Maps' default UI.
 * Wired up after initMap() resolves.
 *
 * Controls provided:
 *  - Zoom in (+)
 *  - Zoom out (-)
 *  - Locate Me (centers map on user's geolocation)
 *
 * These match the wireframe: [+][-] [📍 Me] in the bottom-left of the map.
 * All buttons are plain HTML elements injected into the Maps control layer
 * so they render inside the map frame and respond to the same CSS variables.
 */

import { getMap, panTo }  from './mapInit.js';
import { getState }       from '../core/store.js';
import { dispatch }       from '../core/store.js';
import { on, EVENTS }     from '../core/events.js';

// ─── Initialise ──────────────────────────────────────────────────────────────

/**
 * Build and inject the custom controls into the map.
 * Must be called after initMap().
 */
export function initMapControls() {
  const map = getMap();

  const controlWrapper = _buildControlWrapper();
  map.controls[google.maps.ControlPosition.BOTTOM_LEFT].push(controlWrapper);

  // If location becomes available after init, update the Locate Me button.
  on(EVENTS.LOCATION_SET, () => {
    const btn = controlWrapper.querySelector('#ctrl-locate');
    if (btn) btn.classList.add('has-location');
  });
}

// ─── DOM builders ────────────────────────────────────────────────────────────

function _buildControlWrapper() {
  const wrapper    = document.createElement('div');
  wrapper.className = 'map-controls';

  wrapper.appendChild(_buildZoomInBtn());
  wrapper.appendChild(_buildZoomOutBtn());
  wrapper.appendChild(_buildLocateMeBtn());

  return wrapper;
}

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

    btn.disabled   = true;
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
