/**
 * src/features/settings.js
 *
 * Feature module for persisted user settings. UI modules emit events here;
 * this module calls the settings API, dispatches store updates, and keeps the
 * local preference fallback in sync for startup/offline behavior.
 */

import { on, EVENTS } from '../core/events.js';
import { dispatch } from '../core/store.js';
import {
  fetchSettingsDashboard,
  updateGoogleCalendarLinked,
  updateSettingsProfile,
  updateUserSettings,
  upsertUserDevice,
} from '../api/settings.js';
import { describeDevice, mapSettingsViewToViewMode, normalizeSettings } from '../state/settingsState.js';
import { loadUserPreferences, saveUserPreferences } from '../utils/preferences.js';
import { showToast } from '../ui/toast.js';

/**
 * Wire settings feature event listeners.
 *
 * @returns {void}
 */
export function initSettingsFeature() {
  on(EVENTS.AUTH_STATE_CHANGED, _onAuthChanged);
  on(EVENTS.UI_SETTINGS_UPDATE, _onSettingsUpdate);
  on(EVENTS.UI_SETTINGS_PROFILE_UPDATE, _onProfileUpdate);
  on(EVENTS.UI_SETTINGS_DEVICE_SYNC, _onDeviceSync);
  on(EVENTS.UI_SETTINGS_GOOGLE_CALENDAR_TOGGLE, _onCalendarToggle);
}

async function _onAuthChanged(e) {
  if (!e.detail.user) return;

  const dashboard = await fetchSettingsDashboard();
  if (dashboard.error) {
    showToast('Settings are using local preferences for now.', 'info');
    return;
  }

  dispatch('SETTINGS_DASHBOARD_LOADED', dashboard);
  const normalized = normalizeSettings(dashboard.settings, loadUserPreferences());
  _applySettingsLocally(normalized);
  await _syncCurrentDevice();
}

async function _onSettingsUpdate(e) {
  const { settings, error } = await updateUserSettings(e.detail);
  if (error || !settings) {
    const local = saveUserPreferences(_localPreferenceUpdates(e.detail));
    dispatch('SET_VIEW_MODE', local.defaultView);
    if (local.preferredCampusId) {
      dispatch('CAMPUS_SELECTED', { campusId: local.preferredCampusId });
    }
    showToast('Saved locally. Cloud settings will retry later.', 'info');
    return;
  }

  dispatch('USER_SETTINGS_UPDATED', { settings });
  const normalized = normalizeSettings(settings, loadUserPreferences());
  _applySettingsLocally(normalized);
  showToast('Settings saved.', 'success');
}

async function _onProfileUpdate(e) {
  const { profile, error } = await updateSettingsProfile(e.detail);
  if (error || !profile) {
    showToast(error ?? 'Could not update account settings.', 'error');
    return;
  }

  dispatch('SETTINGS_PROFILE_UPDATED', { profile });
  showToast('Account settings saved.', 'success');
}

async function _onDeviceSync() {
  await _syncCurrentDevice();
}

async function _onCalendarToggle(e) {
  const { settings, error } = await updateGoogleCalendarLinked(!!e.detail.linked);
  if (error || !settings) {
    showToast(error ?? 'Could not update Google Calendar status.', 'error');
    return;
  }

  dispatch('USER_SETTINGS_UPDATED', { settings });
  showToast(settings.google_calendar_linked ? 'Google Calendar marked linked.' : 'Google Calendar disconnected.', 'success');
}

async function _syncCurrentDevice() {
  const descriptor = describeDevice({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
  const { device } = await upsertUserDevice(descriptor);
  if (device) dispatch('USER_DEVICE_UPSERTED', { device });
}

function _applySettingsLocally(settings) {
  saveUserPreferences({
    defaultView: settings.defaultMapView === 'cafes' ? 'city' : 'campus',
    preferredCampusId: settings.preferredCampusId,
    notifyClaimExpiry: settings.spotAvailabilityAlerts,
    notifyGroupActivity: settings.squadUpdates,
  });
  dispatch('SET_VIEW_MODE', mapSettingsViewToViewMode(settings.defaultMapView));
  if (settings.preferredCampusId) {
    dispatch('CAMPUS_SELECTED', { campusId: settings.preferredCampusId });
  }
}

function _localPreferenceUpdates(settings) {
  const updates = {};
  if (settings.defaultMapView !== undefined) {
    updates.defaultView = settings.defaultMapView === 'cafes' ? 'city' : settings.defaultMapView;
  }
  if (settings.preferredCampusId !== undefined) updates.preferredCampusId = settings.preferredCampusId;
  if (settings.spotAvailabilityAlerts !== undefined) updates.notifyClaimExpiry = settings.spotAvailabilityAlerts;
  if (settings.squadUpdates !== undefined) updates.notifyGroupActivity = settings.squadUpdates;
  return updates;
}
