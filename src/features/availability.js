/**
 * src/features/availability.js
 *
 * Handles user-initiated spot availability reports and SMS watcher toggles.
 * UI modules emit intent events; this feature performs API work and dispatches
 * refreshed store state.
 */

import { on, emit, EVENTS } from '../core/events.js';
import { dispatch, getState } from '../core/store.js';

import {
  fetchMySmsWatchers,
  unwatchSpotForSms,
  updateSpotAvailability,
  watchSpotForSms,
} from '../api/availability.js';
import { fetchSpots } from '../api/spots.js';

import { showToast } from '../ui/toast.js';

/**
 * Wire availability and SMS watcher event handlers.
 *
 * @returns {void}
 */
export function initAvailabilityFeature() {
  on(EVENTS.AUTH_STATE_CHANGED, _onAuthChanged);
  on(EVENTS.UI_SPOT_AVAILABILITY_UPDATE, _onAvailabilityUpdate);
  on(EVENTS.UI_SPOT_SMS_WATCH_TOGGLE, _onSmsWatchToggle);
}

async function _onAuthChanged(e) {
  if (!e.detail.user) {
    dispatch('SPOT_WATCHERS_LOADED', { watchers: [] });
    return;
  }

  const watchers = await fetchMySmsWatchers();
  dispatch('SPOT_WATCHERS_LOADED', { watchers });
}

async function _onAvailabilityUpdate(e) {
  const { spotId, status, note } = e.detail ?? {};
  if (!spotId || !['available', 'occupied'].includes(status)) return;

  if (!getState().currentUser) {
    emit(EVENTS.UI_LOGIN_REQUESTED, {});
    return;
  }

  const { error, smsError } = await updateSpotAvailability({ spotId, status, note });
  if (error) {
    showToast(error, 'error');
    return;
  }

  const { spots, confidence } = await fetchSpots();
  dispatch('SPOTS_LOADED', { spots, confidence });
  showToast(status === 'available' ? 'Marked available.' : 'Marked occupied.', 'success');

  if (smsError) {
    showToast('Status saved, but SMS delivery needs provider setup.', 'error');
  }
}

async function _onSmsWatchToggle(e) {
  const { spotId, enabled } = e.detail ?? {};
  if (!spotId) return;

  if (!getState().currentUser) {
    emit(EVENTS.UI_LOGIN_REQUESTED, {});
    return;
  }

  if (enabled) {
    const { watcher, error } = await watchSpotForSms(spotId);
    if (error) {
      showToast(error, 'error');
      return;
    }
    dispatch('SPOT_WATCHER_UPDATED', { spotId, watcher });
    showToast('SMS alerts enabled for this spot.', 'success');
    return;
  }

  const { error } = await unwatchSpotForSms(spotId);
  if (error) {
    showToast(error, 'error');
    return;
  }
  dispatch('SPOT_WATCHER_UPDATED', { spotId, watcher: null });
  showToast('SMS alerts disabled for this spot.', 'success');
}
