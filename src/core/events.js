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
  VIEW_MODE_CHANGED:      'state:viewModeChanged',
  NICKNAME_UPDATED:       'state:nicknameUpdated',

  // ── Store: filters ───────────────────────────────────────────────────────
  FILTERS_CHANGED:        'state:filtersChanged',

  // ── Store: spots ─────────────────────────────────────────────────────────
  SPOTS_LOADED:           'state:spotsLoaded',
  SPOT_SELECTED:          'state:spotSelected',
  SPOT_DESELECTED:        'state:spotDeselected',
  SPOT_WATCHERS_UPDATED:  'state:spotWatchersUpdated',

  // ── Store: claims ────────────────────────────────────────────────────────
  CLAIM_UPDATED:          'state:claimUpdated',

  // ── Store: corrections ───────────────────────────────────────────────────
  CORRECTION_FILED:       'state:correctionFiled',

  // ── Store: shared link ───────────────────────────────────────────────────
  LINK_COPIED:            'state:linkCopied',

  // â”€â”€ Store: settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  SETTINGS_DASHBOARD_UPDATED: 'state:settingsDashboardUpdated',
  USER_SETTINGS_UPDATED:      'state:userSettingsUpdated',
  USER_DEVICE_UPDATED:        'state:userDeviceUpdated',

  // ── Store: status ────────────────────────────────────────────────────────
  STATUS_CHANGED:         'state:statusChanged',

  // ── Map ──────────────────────────────────────────────────────────────────
  MAP_READY:              'map:ready',
  MAP_PIN_CLICKED:        'map:pinClicked',
  MAP_BUILDING_CLICKED:   'map:buildingClicked',
  MAP_OVERLAY_CHANGED:    'map:overlayChanged',

  // ── Store: groups ────────────────────────────────────────────────────────
  GROUP_JOINED:           'state:groupJoined',
  GROUP_LEFT:             'state:groupLeft',
  GROUP_UPDATED:          'state:groupUpdated',
  GROUP_DASHBOARD_UPDATED:'state:groupDashboardUpdated',
  GROUP_PINS_UPDATED:     'state:groupPinsUpdated',
  GROUP_PIN_JOINS_UPDATED:'state:groupPinJoinsUpdated',
  GROUP_CONFIRMATIONS_UPDATED: 'state:groupConfirmationsUpdated',

  // ── Store: campus ────────────────────────────────────────────────────────
  CAMPUSES_LOADED:        'state:campusesLoaded',
  AREAS_LOADED:           'state:areasLoaded',
  CAMPUS_SELECTED:        'state:campusSelected',
  BUILDINGS_LOADED:       'state:buildingsLoaded',

  // ── Store: groups ────────────────────────────────────────────────────────
  GROUP_MEMBERS_UPDATED:  'state:groupMembersUpdated',
  GROUP_MEETUP_UPDATED:   'state:groupMeetupUpdated',
  GROUP_PERK_UPDATED:     'state:groupPerkUpdated',

  // ── UI ───────────────────────────────────────────────────────────────────
  UI_CLAIM_REQUESTED:          'ui:claimRequested',
  UI_REPORT_REQUESTED:         'ui:reportRequested',
  UI_CANCEL_CLAIM:             'ui:cancelClaim',
  UI_FILTER_SUBMITTED:         'ui:filterSubmitted',
  UI_SUGGEST_OPENED:           'ui:suggestOpened',
  UI_PANEL_CLOSED:             'ui:panelClosed',
  UI_GROUP_CREATE:             'ui:groupCreate',
  UI_GROUP_JOIN:               'ui:groupJoin',
  UI_GROUP_PRESENCE_UPDATE:    'ui:groupPresenceUpdate',
  UI_GROUP_CURRENT_SPOT_UPDATE:'ui:groupCurrentSpotUpdate',
  UI_GROUP_MEETUP_UPDATE:      'ui:groupMeetupUpdate',
  UI_GROUP_PERK_UPDATE:        'ui:groupPerkUpdate',
  UI_GROUP_PERK_REDEEM:        'ui:groupPerkRedeem',
  UI_GROUP_COVER_UPLOAD:       'ui:groupCoverUpload',
  UI_GROUP_AVATAR_UPLOAD:      'ui:groupAvatarUpload',
  UI_SUBMIT_SPOT_REQUESTED:    'ui:submitSpotRequested',
  UI_SPOT_AVAILABILITY_UPDATE: 'ui:spotAvailabilityUpdate',
  UI_SPOT_SMS_WATCH_TOGGLE:    'ui:spotSmsWatchToggle',
  UI_CAMPUS_CHANGE_REQUESTED:  'ui:campusChangeRequested',
  UI_CAMPUS_ADD_REQUESTED:     'ui:campusAddRequested',
  UI_PLACE_FOCUS_REQUESTED:    'ui:placeFocusRequested',
  UI_SETTINGS_UPDATE:          'ui:settingsUpdate',
  UI_SETTINGS_PROFILE_UPDATE:  'ui:settingsProfileUpdate',
  UI_SETTINGS_DEVICE_SYNC:     'ui:settingsDeviceSync',
  UI_SETTINGS_GOOGLE_CALENDAR_TOGGLE: 'ui:settingsGoogleCalendarToggle',

  // ── Auth ──────────────────────────────────────────────────────────────
  AUTH_STATE_CHANGED:          'state:authChanged',
  UI_LOGIN_REQUESTED:          'ui:loginRequested',

  // ── Router ───────────────────────────────────────────────────────────────
  ROUTE_CHANGED:               'state:routeChanged',
});
