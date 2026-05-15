/**
 * src/features/availability.js
 *
 * Handles user-initiated spot availability reports and WhatsApp watcher toggles.
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
import { sendSpotEmailNotification } from '../api/emailNotifications.js';
import { fetchSpots } from '../api/spots.js';

import { showToast } from '../ui/toast.js';

/**
 * Wire availability and WhatsApp watcher event handlers.
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

  const watchers = await _retryAuthLockAbort(() => fetchMySmsWatchers());
  dispatch('SPOT_WATCHERS_LOADED', { watchers });
}

async function _onAvailabilityUpdate(e) {
  const { spotId, status, note } = e.detail ?? {};
  if (!spotId || !['available', 'occupied'].includes(status)) return;

  if (!getState().currentUser) {
    emit(EVENTS.UI_LOGIN_REQUESTED, {});
    return;
  }

  const { error, smsError, smsResult } = await updateSpotAvailability({ spotId, status, note });
  if (error) {
    showToast(error, 'error');
    return;
  }

  const { spots, confidence } = await fetchSpots();
  dispatch('SPOTS_LOADED', { spots, confidence });
  showToast(_statusToastCopy(status, smsResult), 'success');

  if (smsError) {
    showToast('Status saved, but WhatsApp delivery needs provider setup.', 'error');
  } else if (smsResult?.error) {
    showToast(smsResult.error, 'error');
  } else if (Number(smsResult?.failed ?? 0) > 0) {
    showToast('WhatsApp provider rejected at least one alert. Check notification logs.', 'error');
  } else if (status === 'available' && Number(smsResult?.queued ?? 0) === 0) {
    showToast('No eligible WhatsApp watchers for this spot yet.', 'info');
  }

  if (status === 'available') {
    _sendDemoEmailPreview(spotId, getState().currentUser?.email);
  }
}

function _statusToastCopy(status, smsResult) {
  if (status !== 'available') return 'Marked occupied.';

  const sent = Number(smsResult?.sent ?? 0);
  if (sent > 0) return `Marked available. ${sent} WhatsApp alert${sent === 1 ? '' : 's'} sent.`;

  return 'Marked available.';
}

async function _sendDemoEmailPreview(spotId, userEmail) {
  const { previewUrl, error } = await sendSpotEmailNotification({ spotId, userEmail });
  if (error) {
    console.warn('[availability] demo email notification skipped:', error);
    showToast('Status saved, but demo email preview failed.', 'error');
    return;
  }

  if (!previewUrl) {
    showToast('Demo email sent.', 'success');
    return;
  }

  const opened = window.open(previewUrl, '_blank', 'noopener,noreferrer');
  showToast(opened ? 'Demo email sent. Preview opened.' : 'Demo email sent. Preview link ready.', 'success');

  if (!opened) {
    window.alert(`Demo email preview:\n${previewUrl}`);
  }
}

/**
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
async function _retryAuthLockAbort(task) {
  try {
    return await task();
  } catch (err) {
    if (!_isAuthLockAbort(err)) throw err;
    await new Promise(resolve => setTimeout(resolve, 150));
    return task();
  }
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function _isAuthLockAbort(err) {
  return err?.name === 'AbortError'
    && String(err?.message ?? '').includes('Lock broken by another request');
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
    showToast('WhatsApp alerts enabled for this spot.', 'success');
    return;
  }

  const { error } = await unwatchSpotForSms(spotId);
  if (error) {
    showToast(error, 'error');
    return;
  }
  dispatch('SPOT_WATCHER_UPDATED', { spotId, watcher: null });
  showToast('WhatsApp alerts disabled for this spot.', 'success');
}
