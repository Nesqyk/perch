/**
 * src/ui/availabilityControls.js
 *
 * Shared spot availability and WhatsApp watcher controls for card and route views.
 */

import { Bell, CheckCircle2, CircleSlash2, LogIn } from 'lucide';

import { emit, EVENTS } from '../core/events.js';
import { getState } from '../core/store.js';
import { navigateTo } from '../core/router.js';
import { normalizeSettings } from '../state/settingsState.js';
import { isValidPhoneNumber } from '../utils/phone.js';
import { loadUserPreferences } from '../utils/preferences.js';
import { iconSvg } from './icons.js';

/**
 * Build controls for status reporting and WhatsApp watching.
 *
 * @param {{ spot: object, compact?: boolean }} params
 * @returns {HTMLElement}
 */
export function createAvailabilityControls({ spot, compact = false }) {
  const state = getState();
  const settings = normalizeSettings(state.userSettings, loadUserPreferences());
  const profile = state.settingsProfile;
  const isWatched = Boolean(state.spotWatchers?.[spot.id]?.notify_by_sms);
  const smsReady = settings.smsEnabled && isValidPhoneNumber(profile?.phone_e164);
  const status = spot.availability_status ?? '';

  const wrap = document.createElement('div');
  wrap.className = `availability-controls${compact ? ' availability-controls--compact' : ''}`;
  wrap.innerHTML = /* html */`
    <div class="availability-controls__top">
      <span>
        <strong>Availability</strong>
        <small>${_availabilityCopy(spot)}</small>
      </span>
      <div class="availability-segmented" role="group" aria-label="Mark spot availability">
        <button type="button" data-status="available" class="${status === 'available' ? 'is-active' : ''}">
          ${iconSvg(CheckCircle2, 15)}
          <span>Available</span>
        </button>
        <button type="button" data-status="occupied" class="${status === 'occupied' ? 'is-active' : ''}">
          ${iconSvg(CircleSlash2, 15)}
          <span>Occupied</span>
        </button>
      </div>
    </div>
    ${_smsButtonMarkup({ currentUser: state.currentUser, smsReady, isWatched })}
  `;

  wrap.querySelectorAll('[data-status]').forEach((button) => {
    button.addEventListener('click', () => {
      emit(EVENTS.UI_SPOT_AVAILABILITY_UPDATE, {
        spotId: spot.id,
        status: button.dataset.status,
      });
    });
  });

  wrap.querySelector('[data-sms-action]')?.addEventListener('click', () => {
    const action = wrap.querySelector('[data-sms-action]')?.dataset.smsAction;
    if (action === 'login') {
      emit(EVENTS.UI_LOGIN_REQUESTED, {});
      return;
    }
    if (action === 'settings') {
      navigateTo('/settings');
      return;
    }
    emit(EVENTS.UI_SPOT_SMS_WATCH_TOGGLE, {
      spotId: spot.id,
      enabled: !isWatched,
    });
  });

  return wrap;
}

function _smsButtonMarkup({ currentUser, smsReady, isWatched }) {
  if (!currentUser) {
    return /* html */`
      <button type="button" class="availability-sms-btn" data-sms-action="login">
        ${iconSvg(LogIn, 15)}
        <span>Sign in for WhatsApp</span>
      </button>
    `;
  }

  if (!smsReady) {
    return /* html */`
      <button type="button" class="availability-sms-btn" data-sms-action="settings">
        ${iconSvg(Bell, 15)}
        <span>Set up WhatsApp</span>
      </button>
    `;
  }

  return /* html */`
    <button type="button" class="availability-sms-btn ${isWatched ? 'is-active' : ''}" data-sms-action="toggle">
      ${iconSvg(Bell, 15)}
      <span>${isWatched ? 'WhatsApp alerts on' : 'Notify me by WhatsApp'}</span>
    </button>
  `;
}

function _availabilityCopy(spot) {
  if (spot.availability_status === 'available') return 'Marked available by the community.';
  if (spot.availability_status === 'occupied') return 'Marked occupied by the community.';
  return 'Help classmates keep this spot current.';
}
