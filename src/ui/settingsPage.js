/**
 * src/ui/settingsPage.js
 *
 * Route-level settings dashboard for #/settings. The page renders persisted
 * account/settings data from the store and emits UI events for all writes.
 */

import {
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Cloud,
  FileText,
  Laptop,
  Link,
  LogIn,
  LogOut,
  Moon,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Smartphone,
  UserRound,
  Video,
} from 'lucide';

import { emit, on, EVENTS } from '../core/events.js';
import { getState } from '../core/store.js';
import { navigateTo } from '../core/router.js';
import { signOut } from '../api/auth.js';
import { normalizeSettings } from '../state/settingsState.js';
import { normalizePhoneNumber } from '../utils/phone.js';
import { loadUserPreferences } from '../utils/preferences.js';
import { iconSvg } from './icons.js';
import { showToast } from './toast.js';

const VIEW_ID = 'view-settings';
const DEFAULT_COVER = '/settings-library-cover.svg';

/**
 * Initialise the settings page renderer.
 *
 * @returns {void}
 */
export function initSettingsPage() {
  const rerender = () => _renderSettingsPage();

  on(EVENTS.AUTH_STATE_CHANGED, rerender);
  on(EVENTS.ROUTE_CHANGED, rerender);
  on(EVENTS.CAMPUSES_LOADED, rerender);
  on(EVENTS.CAMPUS_SELECTED, rerender);
  on(EVENTS.NICKNAME_UPDATED, rerender);
  on(EVENTS.SETTINGS_DASHBOARD_UPDATED, rerender);
  on(EVENTS.USER_SETTINGS_UPDATED, rerender);
  on(EVENTS.USER_DEVICE_UPDATED, rerender);

  _renderSettingsPage();
}

function _renderSettingsPage() {
  const view = document.getElementById(VIEW_ID);
  if (!view) return;

  const state = getState();
  view.innerHTML = '';

  if (!state.currentUser) {
    view.appendChild(_buildSignedOutState());
    return;
  }

  view.appendChild(_buildDashboard(state));
}

function _buildSignedOutState() {
  const shell = document.createElement('div');
  shell.className = 'settings-dashboard settings-dashboard--signed-out';
  shell.innerHTML = /* html */`
    <section class="settings-auth-card">
      <div class="page-empty__icon">${iconSvg(Settings, 28)}</div>
      <h1>Sign in to manage your Perch setup.</h1>
      <p>Account preferences, synced devices, and workspace cards need your Google session.</p>
      <button type="button" class="btn btn-primary" id="settings-login">${iconSvg(LogIn, 16)} Sign in</button>
    </section>
  `;
  shell.querySelector('#settings-login')?.addEventListener('click', () => emit(EVENTS.UI_LOGIN_REQUESTED, {}));
  return shell;
}

function _buildDashboard(state) {
  const shell = document.createElement('div');
  shell.className = 'settings-dashboard';

  const main = document.createElement('main');
  main.className = 'settings-dashboard__main';
  main.appendChild(_buildSearchBar());
  main.appendChild(_sectionTitle(UserRound, 'Account Settings'));
  main.appendChild(_buildAccountCard(state));
  main.appendChild(_sectionTitle(SlidersHorizontal, 'App Preferences'));
  main.appendChild(_buildPreferencesCard(state));
  main.appendChild(_sectionTitle(Bell, 'Notification Settings'));
  main.appendChild(_buildNotificationCard(state));
  main.appendChild(_sectionTitle(Shield, 'Privacy'));
  main.appendChild(_buildPrivacyCard());
  shell.appendChild(main);

  const aside = document.createElement('aside');
  aside.className = 'settings-dashboard__aside';
  aside.appendChild(_buildProfileCover(state));
  aside.appendChild(_buildGoogleCard(state));
  aside.appendChild(_buildSessionCard(state));
  aside.appendChild(_buildNoteCard(state));
  aside.appendChild(_buildWorkspaceFooter());
  shell.appendChild(aside);
  return shell;
}

function _buildSearchBar() {
  const bar = document.createElement('div');
  bar.className = 'settings-search';
  bar.innerHTML = /* html */`
    <label>
      ${iconSvg(Search, 22)}
      <input type="search" placeholder="Search for your next sanctuary..." aria-label="Search settings">
    </label>
    <button type="button" aria-label="Help">${iconSvg(CircleHelp, 22)}</button>
    <button type="button" aria-label="Theme">${iconSvg(Moon, 22)}</button>
  `;
  return bar;
}

function _sectionTitle(icon, text) {
  const title = document.createElement('h2');
  title.className = 'settings-section-title';
  title.innerHTML = `${iconSvg(icon, 21)} <span>${_escapeHtml(text)}</span>`;
  return title;
}

function _buildAccountCard(state) {
  const { settingsProfile, currentUser, campuses } = state;
  const settings = normalizeSettings(state.userSettings, loadUserPreferences());
  const displayName = settingsProfile?.nickname || state.nickname || currentUser.user_metadata?.full_name || 'Perch member';
  const currentSchool = settings.preferredCampusId || '';
  const card = document.createElement('section');
  card.className = 'settings-form-card settings-account-panel';
  card.innerHTML = /* html */`
    <label class="settings-field-block">
      <span>Edit Name</span>
      <input id="settings-name" value="${_escapeAttr(displayName)}" maxlength="40">
    </label>
    <label class="settings-field-block">
      <span>Change School</span>
      <div class="settings-select-wrap">
        <select id="settings-school">
          <option value="">${_escapeHtml(settingsProfile?.school_label ?? 'CTU Main Campus')}</option>
          ${campuses.map(campus => `<option value="${_escapeAttr(campus.id)}" ${campus.id === currentSchool ? 'selected' : ''}>${_escapeHtml(campus.name)}</option>`).join('')}
        </select>
        ${iconSvg(ChevronDown, 18)}
      </div>
    </label>
  `;

  const nameInput = card.querySelector('#settings-name');
  nameInput?.addEventListener('blur', () => {
    const nickname = nameInput.value.trim();
    if (!nickname || nickname === displayName) return;
    emit(EVENTS.UI_SETTINGS_PROFILE_UPDATE, { nickname });
  });
  nameInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') nameInput.blur();
  });

  card.querySelector('#settings-school')?.addEventListener('change', (event) => {
    const campusId = event.target.value;
    const campus = campuses.find(item => item.id === campusId);
    emit(EVENTS.UI_SETTINGS_UPDATE, { preferredCampusId: campusId });
    if (campus) {
      emit(EVENTS.UI_SETTINGS_PROFILE_UPDATE, { schoolLabel: campus.name });
    }
  });

  return card;
}

function _buildPreferencesCard(state) {
  const settings = normalizeSettings(state.userSettings, loadUserPreferences());
  const card = document.createElement('section');
  card.className = 'settings-form-card settings-preferences-panel';
  card.innerHTML = /* html */`
    <div class="settings-preference-row">
      <div>
        <strong>Default Map View</strong>
        <span>What you see first when opening the map.</span>
      </div>
      ${_segmentedControl('map-view', [
        ['campus', 'Campus'],
        ['cafes', 'Cafes'],
      ], settings.defaultMapView)}
    </div>
    <div class="settings-preference-row">
      <div>
        <strong>Preferred Study Environment</strong>
        <span>Match your focus style with noise levels.</span>
      </div>
      ${_segmentedControl('study-env', [
        ['quiet', 'Quiet'],
        ['moderate', 'Moderate'],
      ], settings.preferredStudyEnvironment)}
    </div>
  `;

  card.querySelectorAll('[data-segment-group="map-view"]').forEach((button) => {
    button.addEventListener('click', () => emit(EVENTS.UI_SETTINGS_UPDATE, { defaultMapView: button.dataset.value }));
  });
  card.querySelectorAll('[data-segment-group="study-env"]').forEach((button) => {
    button.addEventListener('click', () => emit(EVENTS.UI_SETTINGS_UPDATE, { preferredStudyEnvironment: button.dataset.value }));
  });
  return card;
}

function _buildNotificationCard(state) {
  const settings = normalizeSettings(state.userSettings, loadUserPreferences());
  const phoneValue = state.settingsProfile?.phone_e164 ?? '';
  const card = document.createElement('section');
  card.className = 'settings-form-card settings-notifications-panel';
  card.innerHTML = /* html */`
    ${_toggleRow('spot-alerts', 'Spot Availability Alerts', 'Get notified when your favorite spot opens up.', settings.spotAvailabilityAlerts)}
    ${_toggleRow('squad-updates', 'Squad Updates', "Stay updated on your study group's activity.", settings.squadUpdates)}
    <div class="settings-sms-box">
      <div class="settings-sms-box__head">
        ${iconSvg(Smartphone, 18)}
        <span>
          <strong>WhatsApp</strong>
          <small>Send availability alerts to a WhatsApp-ready mobile number.</small>
        </span>
      </div>
      <label class="settings-field-label" for="settings-phone">Phone number</label>
      <input
        id="settings-phone"
        class="input"
        type="tel"
        inputmode="tel"
        autocomplete="tel"
        placeholder="0917 123 4567"
        value="${_escapeAttr(phoneValue)}"
      >
      <p class="settings-field-hint" id="settings-phone-hint">PH mobile numbers are saved as E.164 for WhatsApp delivery.</p>
      ${_toggleRow('sms-enabled', 'Enable WhatsApp', 'Only opted-in users with valid phone numbers receive WhatsApp alerts.', settings.smsEnabled)}
    </div>
  `;

  card.querySelector('#spot-alerts')?.addEventListener('change', (event) => {
    emit(EVENTS.UI_SETTINGS_UPDATE, { spotAvailabilityAlerts: event.target.checked });
  });
  card.querySelector('#squad-updates')?.addEventListener('change', (event) => {
    emit(EVENTS.UI_SETTINGS_UPDATE, { squadUpdates: event.target.checked });
  });
  const phoneInput = card.querySelector('#settings-phone');
  const phoneHint = card.querySelector('#settings-phone-hint');
  phoneInput?.addEventListener('blur', () => {
    if (!phoneInput.value.trim()) {
      phoneInput.classList.remove('input--error');
      if (phoneHint) phoneHint.textContent = 'PH mobile numbers are saved as E.164 for WhatsApp delivery.';
      emit(EVENTS.UI_SETTINGS_PROFILE_UPDATE, {
        phoneE164: null,
        phoneCountry: 'PH',
      });
      return;
    }

    const normalized = normalizePhoneNumber(phoneInput.value);
    if (normalized.error) {
      phoneInput.classList.add('input--error');
      if (phoneHint) phoneHint.textContent = normalized.error;
      return;
    }

    phoneInput.classList.remove('input--error');
    phoneInput.value = normalized.value;
    if (phoneHint) phoneHint.textContent = 'Ready for WhatsApp alerts.';
    emit(EVENTS.UI_SETTINGS_PROFILE_UPDATE, {
      phoneE164: normalized.value,
      phoneCountry: 'PH',
    });
  });
  card.querySelector('#sms-enabled')?.addEventListener('change', (event) => {
    const normalized = normalizePhoneNumber(phoneInput?.value ?? '');
    if (event.target.checked && normalized.error) {
      event.target.checked = false;
      phoneInput?.classList.add('input--error');
      if (phoneHint) phoneHint.textContent = normalized.error;
      showToast('Add a valid phone number before enabling WhatsApp.', 'error');
      return;
    }

    if (normalized.value) {
      emit(EVENTS.UI_SETTINGS_PROFILE_UPDATE, {
        phoneE164: normalized.value,
        phoneCountry: 'PH',
      });
    }
    emit(EVENTS.UI_SETTINGS_UPDATE, { smsEnabled: event.target.checked });
  });
  return card;
}

function _buildPrivacyCard() {
  const card = document.createElement('section');
  card.className = 'settings-privacy-card';
  card.innerHTML = /* html */`
    <button type="button" id="settings-signout">${iconSvg(LogOut, 16)} Sign out</button>
  `;
  card.querySelector('#settings-signout')?.addEventListener('click', async () => {
    await signOut();
    showToast('Signed out.', 'success');
    navigateTo('/');
  });
  return card;
}

function _buildProfileCover(state) {
  const { settingsProfile, currentUser } = state;
  const name = settingsProfile?.nickname || state.nickname || currentUser.user_metadata?.full_name || 'Perch member';
  const avatar = settingsProfile?.avatar_url || currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || '';
  const cover = settingsProfile?.cover_image_url || DEFAULT_COVER;
  const card = document.createElement('section');
  card.className = 'settings-cover-card';
  card.innerHTML = /* html */`
    <img class="settings-cover-card__image" src="${_escapeAttr(cover)}" alt="">
    <div class="settings-cover-card__identity">
      ${avatar ? `<img src="${_escapeAttr(avatar)}" alt="">` : `<span>${_initials(name)}</span>`}
      <div>
        <strong>${_escapeHtml(name)}</strong>
        <small>${_escapeHtml(settingsProfile?.scholar_label ?? 'Senior Scholar')}</small>
      </div>
    </div>
  `;
  return card;
}

function _buildGoogleCard(state) {
  const settings = normalizeSettings(state.userSettings, loadUserPreferences());
  const devices = state.userDevices ?? [];
  const card = document.createElement('section');
  card.className = 'settings-google-card';
  card.innerHTML = /* html */`
    <div class="settings-google-card__title"><span class="settings-google-mark">G</span> Stitched with Google</div>
    <button type="button" class="settings-link-pill" id="settings-calendar-link">${iconSvg(Link, 16)} ${settings.googleCalendarLinked ? 'Unlink Google Calendar' : 'Link Google Calendar'}</button>
    <div class="settings-device-list">
      <span>Synced Devices</span>
      ${(devices.length ? devices : _fallbackDevices()).map(device => _deviceRow(device)).join('')}
    </div>
  `;

  card.querySelector('#settings-calendar-link')?.addEventListener('click', () => {
    emit(EVENTS.UI_SETTINGS_GOOGLE_CALENDAR_TOGGLE, { linked: !settings.googleCalendarLinked });
  });
  return card;
}

function _buildSessionCard(state) {
  const session = state.nextSession;
  const card = document.createElement('section');
  card.className = 'settings-session-card';
  card.innerHTML = /* html */`
    <span>Next Session</span>
    <h3>${_escapeHtml(session?.title ?? 'Physics Final Prep')}</h3>
    <p>${_escapeHtml(_formatSessionTime(session?.starts_at))}</p>
    <button type="button" id="settings-meet">${iconSvg(Video, 16)} Connect to Meet</button>
  `;
  card.querySelector('#settings-meet')?.addEventListener('click', () => {
    if (session?.meet_url) {
      window.open(session.meet_url, '_blank', 'noopener,noreferrer');
      return;
    }
    showToast('No Meet link has been attached yet.', 'info');
  });
  return card;
}

function _buildNoteCard(state) {
  const note = state.sharedNote;
  const card = document.createElement('section');
  card.className = 'settings-note-card';
  card.innerHTML = /* html */`
    <div>${iconSvg(FileText, 22)} <span>Shared Note</span></div>
    <p>${_escapeHtml(note?.title ?? 'Thermodynamics formulas for midterm')}</p>
    <button type="button" id="settings-docs">${iconSvg(FileText, 16)} Open in Docs</button>
  `;
  card.querySelector('#settings-docs')?.addEventListener('click', () => {
    if (note?.document_url) {
      window.open(note.document_url, '_blank', 'noopener,noreferrer');
      return;
    }
    showToast('No document link has been attached yet.', 'info');
  });
  return card;
}

function _buildWorkspaceFooter() {
  const footer = document.createElement('div');
  footer.className = 'settings-workspace-footer';
  footer.innerHTML = `${iconSvg(Cloud, 14)} <span>Connected to Google Workspace</span>`;
  return footer;
}

function _scrollMarker() {
  const marker = document.createElement('span');
  marker.className = 'settings-scroll-marker';
  marker.setAttribute('aria-hidden', 'true');
  return marker;
}

function _segmentedControl(group, options, selected) {
  return /* html */`
    <div class="settings-segmented" role="group">
      ${options.map(([value, label]) => `
        <button type="button" data-segment-group="${group}" data-value="${value}" class="${value === selected ? 'is-active' : ''}" aria-pressed="${String(value === selected)}">${_escapeHtml(label)}</button>
      `).join('')}
    </div>
  `;
}

function _toggleRow(id, title, copy, checked) {
  return /* html */`
    <label class="settings-switch-row" for="${id}">
      <span>
        <strong>${_escapeHtml(title)}</strong>
        <small>${_escapeHtml(copy)}</small>
      </span>
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
      <i aria-hidden="true">${iconSvg(Check, 14)}</i>
    </label>
  `;
}

function _deviceRow(device) {
  const icon = device.device_type === 'phone' ? Smartphone : Laptop;
  return /* html */`
    <div class="settings-device-row">
      ${iconSvg(icon, 16)}
      <span>${_escapeHtml(device.device_name ?? device.deviceName ?? 'Web Browser')}</span>
      <i aria-hidden="true"></i>
    </div>
  `;
}

function _fallbackDevices() {
  return [
    { device_name: 'This browser', device_type: 'laptop' },
  ];
}

function _formatSessionTime(value) {
  if (!value) return 'Today at 4:30 PM';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Today at 4:30 PM';
  const today = new Date().toDateString() === date.toDateString();
  const day = today ? 'Today' : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${day} at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function _initials(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('');
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _escapeAttr(value) {
  return _escapeHtml(value).replace(/'/g, '&#39;');
}
