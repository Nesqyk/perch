/**
 * src/core/events.js
 *
 * Shared Pub/Sub event bus built on the native EventTarget API.
 * Nothing in the app imports another module's internals — all
 * cross-module communication flows through this bus.
 *
 * Usage:
 *   import { on, off, emit } from './events.js';
 *
 *   // Subscribe
 *   on('state:spotsLoaded', (e) => render(e.detail));
 *
 *   // Unsubscribe (pass the exact same function reference)
 *   off('state:spotsLoaded', handler);
 *
 *   // Publish
 *   emit('state:spotsLoaded', { spots: [...] });
 *
 * Event name convention:  '<namespace>:<eventName>'
 *   state:*       — store mutations have been applied, re-render needed
 *   map:*         — map-layer internal events (pin clicked, map ready)
 *   ui:*          — user interactions that originate in a UI component
 *   api:*         — async API responses (used sparingly; prefer dispatch)
 */

/** Single shared EventTarget instance for the whole app. */
const _bus = new EventTarget();

/**
 * Subscribe to an event.
 * @param {string} eventName
 * @param {EventListener} handler  - receives a CustomEvent; data is in e.detail
 */
export function on(eventName, handler) {
  _bus.addEventListener(eventName, handler);
}

/**
 * Unsubscribe from an event.
 * Must pass the same function reference used in `on()`.
 * @param {string} eventName
 * @param {EventListener} handler
 */
export function off(eventName, handler) {
  _bus.removeEventListener(eventName, handler);
}

/**
 * Publish an event with an optional data payload.
 * @param {string} eventName
 * @param {*} [detail]  - any serialisable value; accessible as e.detail
 */
export function emit(eventName, detail) {
  _bus.dispatchEvent(new CustomEvent(eventName, { detail }));
}

/**
 * Subscribe and automatically unsubscribe after the first call.
 * @param {string} eventName
 * @param {EventListener} handler
 */
export function once(eventName, handler) {
  const wrapper = (e) => {
    handler(e);
    _bus.removeEventListener(eventName, wrapper);
  };
  _bus.addEventListener(eventName, wrapper);
}

/**
 * Catalogue of every event name used in the app.
 * Import this object instead of typing strings to get typo safety.
 *
 * Example:
 *   import { EVENTS } from './events.js';
 *   on(EVENTS.SPOTS_LOADED, handler);
 */
export const EVENTS = Object.freeze({
  // ── Store: location ──────────────────────────────────────────────────────
  LOCATION_SET:           'state:locationSet',

  // ── Store: filters ───────────────────────────────────────────────────────
  FILTERS_CHANGED:        'state:filtersChanged',

  // ── Store: spots ─────────────────────────────────────────────────────────
  SPOTS_LOADED:           'state:spotsLoaded',
  SPOT_SELECTED:          'state:spotSelected',
  SPOT_DESELECTED:        'state:spotDeselected',

  // ── Store: claims ────────────────────────────────────────────────────────
  CLAIM_UPDATED:          'state:claimUpdated',

  // ── Store: corrections ───────────────────────────────────────────────────
  CORRECTION_FILED:       'state:correctionFiled',

  // ── Store: shared link ───────────────────────────────────────────────────
  LINK_COPIED:            'state:linkCopied',

  // ── Store: status ────────────────────────────────────────────────────────
  STATUS_CHANGED:         'state:statusChanged',

  // ── Map ──────────────────────────────────────────────────────────────────
  MAP_READY:              'map:ready',
  MAP_PIN_CLICKED:        'map:pinClicked',

  // ── UI ───────────────────────────────────────────────────────────────────
  UI_CLAIM_REQUESTED:     'ui:claimRequested',
  UI_REPORT_REQUESTED:    'ui:reportRequested',
  UI_CANCEL_CLAIM:        'ui:cancelClaim',
  UI_FILTER_SUBMITTED:    'ui:filterSubmitted',
  UI_SUGGEST_OPENED:      'ui:suggestOpened',
  UI_PANEL_CLOSED:        'ui:panelClosed',
});
