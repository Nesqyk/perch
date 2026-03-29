/**
 * src/ui/settingsPage.js
 *
 * Route-level settings destination for #/settings.
 *
 * This page manages lightweight local preferences while preserving Perch's
 * current map-first flow. Preferences are stored in localStorage and, where
 * relevant, reflected immediately into the central store.
 */

import {
  BellRing,
  LogIn,
  LogOut,
  Map,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
} from 'lucide';

import { emit, on, EVENTS } from '../core/events.js';
import { getState, dispatch } from '../core/store.js';
import { navigateTo } from '../core/router.js';
import { signOut } from '../api/auth.js';
import { loadUserPreferences, saveUserPreferences } from '../utils/preferences.js';
import { openProfileModal } from './profileModal.js';
import { iconSvg } from './icons.js';
import { showToast } from './toast.js';

const VIEW_ID = 'view-settings';

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
  on(EVENTS.VIEW_MODE_CHANGED, rerender);
  on(EVENTS.GROUP_PINS_UPDATED, rerender);
  on(EVENTS.NICKNAME_UPDATED, rerender);

  _renderSettingsPage();
}

function _renderSettingsPage() {
  const view = document.getElementById(VIEW_ID);
  if (!view) return;

  const { currentUser, campuses, selectedCampusId, nickname, viewMode, groupPinsVisible } = getState();
  const preferences = loadUserPreferences();

  view.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'page-shell';
  shell.innerHTML = /* html */`
    <div class="page-shell__header">
      <p class="page-shell__eyebrow">Perch</p>
      <h1 class="page-shell__title">Settings</h1>
      <p class="page-shell__subtitle">Tune how Perch opens, which campus feels like home, and which updates matter most.</p>
    </div>
  `;

  if (!currentUser) {
    shell.appendChild(_buildSignedOutCard());
    view.appendChild(shell);
    return;
  }

  const preferredCampus = campuses.find((campus) => campus.id === preferences.preferredCampusId) ?? null;
  const activeCampus = campuses.find((campus) => campus.id === selectedCampusId) ?? null;

  shell.appendChild(_buildHeroCard({
    nickname,
    currentUser,
    preferredCampus,
    activeCampus,
    viewMode,
    groupPinsVisible,
  }));

  const grid = document.createElement('div');
  grid.className = 'page-grid page-grid--two settings-page__grid';
  grid.appendChild(_buildExperienceCard(preferences, campuses));
  grid.appendChild(_buildNotificationsCard(preferences));
  shell.appendChild(grid);

  shell.appendChild(_buildPrivacyCard(preferences));
  shell.appendChild(_buildAccountCard(currentUser));

  view.appendChild(shell);
}

function _buildSignedOutCard() {
  const empty = document.createElement('section');
  empty.className = 'page-card page-card--empty';
  empty.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(Settings, 28)}</div>
    <h2 class="page-empty__title">Sign in to manage your Perch setup.</h2>
    <p class="page-empty__copy">Preferences follow this browser, but account actions and squad-related settings need your Google session.</p>
    <div class="settings-page__cta-row">
      <button type="button" class="btn btn-primary" id="settings-page-login">${iconSvg(LogIn, 16)} Sign in</button>
      <button type="button" class="btn btn-ghost" id="settings-page-map">Back to map</button>
    </div>
  `;

  empty.querySelector('#settings-page-login')?.addEventListener('click', () => emit(EVENTS.UI_LOGIN_REQUESTED, {}));
  empty.querySelector('#settings-page-map')?.addEventListener('click', () => navigateTo('/'));
  return empty;
}

function _buildHeroCard({ nickname, currentUser, preferredCampus, activeCampus, viewMode, groupPinsVisible }) {
  const card = document.createElement('section');
  card.className = 'page-card page-card--hero settings-hero';
  card.innerHTML = /* html */`
    <div class="settings-hero__head">
      <div class="profile-page__identity">
        <span class="profile-page__avatar">${_initials(nickname || currentUser.email || 'P')}</span>
        <div>
          <div class="page-card__eyebrow">Your setup</div>
          <h2 class="page-card__title">${_escapeHtml(nickname || currentUser.user_metadata?.full_name || 'Perch member')}</h2>
          <p class="page-card__copy">${_escapeHtml(currentUser.email ?? 'No email available')}</p>
        </div>
      </div>
      <div class="settings-page__cta-row">
        <button type="button" class="btn btn-primary" id="settings-hero-edit">Edit nickname</button>
        <button type="button" class="btn btn-ghost" id="settings-hero-profile">Back to profile</button>
      </div>
    </div>
    <div class="settings-hero__stats">
      <div class="group-stat">
        <span class="group-stat__value">${viewMode === 'city' ? 'City' : 'Campus'}</span>
        <span class="group-stat__label">Default View</span>
      </div>
      <div class="group-stat">
        <span class="group-stat__value">${_escapeHtml((preferredCampus ?? activeCampus)?.short_name || (preferredCampus ?? activeCampus)?.name || 'Auto')}</span>
        <span class="group-stat__label">Preferred Campus</span>
      </div>
      <div class="group-stat">
        <span class="group-stat__value">${groupPinsVisible ? 'On' : 'Off'}</span>
        <span class="group-stat__label">Squad Pins</span>
      </div>
    </div>
  `;

  card.querySelector('#settings-hero-edit')?.addEventListener('click', () => openProfileModal());
  card.querySelector('#settings-hero-profile')?.addEventListener('click', () => navigateTo('/profile'));
  return card;
}

function _buildExperienceCard(preferences, campuses) {
  const card = document.createElement('section');
  card.className = 'page-card';
  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Experience</div>
    <h2 class="page-card__title page-card__title--sm">How Perch should feel when it opens</h2>
    <p class="page-card__copy">These controls change how the app starts on this browser and how much of your crew context stays visible on the map.</p>

    <div class="settings-stack">
      <div class="settings-field">
        <span class="page-field__label">Default View On Load</span>
        <div class="chip-row" id="settings-default-view-toggle">
          <button type="button" class="chip${preferences.defaultView === 'campus' ? ' chip-active' : ''}" data-view="campus" aria-pressed="${String(preferences.defaultView === 'campus')}">Campus</button>
          <button type="button" class="chip${preferences.defaultView === 'city' ? ' chip-active' : ''}" data-view="city" aria-pressed="${String(preferences.defaultView === 'city')}">City</button>
        </div>
      </div>

      <label class="page-field">
        <span class="page-field__label">Preferred Campus</span>
        <select class="select" id="settings-preferred-campus">
          <option value="">Use current selection</option>
          ${campuses.map((campus) => `<option value="${_escapeHtml(campus.id)}" ${preferences.preferredCampusId === campus.id ? 'selected' : ''}>${_escapeHtml(campus.name)}</option>`).join('')}
        </select>
      </label>

      <label class="settings-toggle-row" for="settings-show-group-pins">
        <span class="settings-toggle-row__body">
          <span class="settings-toggle-row__title">Show squad pins on the map</span>
          <span class="settings-toggle-row__copy">Keep your crew's live pins visible when you switch back to map discovery.</span>
        </span>
        <input type="checkbox" class="settings-checkbox" id="settings-show-group-pins" ${preferences.showGroupPins ? 'checked' : ''}>
      </label>
    </div>

    <div class="settings-page__cta-row">
      <button type="button" class="btn btn-primary" id="settings-save-experience">Save experience settings</button>
      <button type="button" class="btn btn-ghost" id="settings-open-map">Back to map</button>
    </div>
  `;

  const toggle = card.querySelector('#settings-default-view-toggle');
  toggle?.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      toggle.querySelectorAll('[data-view]').forEach((chip) => {
        const active = chip.dataset.view === button.dataset.view;
        chip.classList.toggle('chip-active', active);
        chip.setAttribute('aria-pressed', String(active));
      });
    });
  });

  card.querySelector('#settings-save-experience')?.addEventListener('click', () => {
    const selectedView = toggle?.querySelector('.chip-active')?.dataset.view === 'city' ? 'city' : 'campus';
    const preferredCampusId = card.querySelector('#settings-preferred-campus')?.value ?? '';
    const showGroupPins = !!card.querySelector('#settings-show-group-pins')?.checked;

    const next = saveUserPreferences({
      defaultView: selectedView,
      preferredCampusId,
      showGroupPins,
    });

    dispatch('SET_VIEW_MODE', next.defaultView);
    dispatch('SET_GROUP_PINS_VISIBLE', next.showGroupPins);

    if (next.preferredCampusId) {
      dispatch('CAMPUS_SELECTED', { campusId: next.preferredCampusId });
    }

    showToast('Experience settings saved.', 'success');
    _renderSettingsPage();
  });

  card.querySelector('#settings-open-map')?.addEventListener('click', () => navigateTo('/'));
  return card;
}

function _buildNotificationsCard(preferences) {
  const card = document.createElement('section');
  card.className = 'page-card';
  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Notifications</div>
    <h2 class="page-card__title page-card__title--sm">Choose the updates worth your attention</h2>
    <p class="page-card__copy">These are local preferences for the inbox and notification surfaces we are rolling out next.</p>

    <div class="settings-stack">
      ${_toggleRowMarkup('settings-notify-group', 'Squad activity', 'Pins, join activity, and movement from your study crew.', preferences.notifyGroupActivity)}
      ${_toggleRowMarkup('settings-notify-claims', 'Claim reminders', 'Heads-up when your active claim is close to expiring.', preferences.notifyClaimExpiry)}
      ${_toggleRowMarkup('settings-notify-contributions', 'Contribution updates', 'Confirmation and review changes for spots, rooms, and buildings you submit.', preferences.notifyContributionStatus)}
    </div>

    <button type="button" class="btn btn-primary" id="settings-save-notifications">Save notification settings</button>
  `;

  card.querySelector('#settings-save-notifications')?.addEventListener('click', () => {
    saveUserPreferences({
      notifyGroupActivity: !!card.querySelector('#settings-notify-group')?.checked,
      notifyClaimExpiry: !!card.querySelector('#settings-notify-claims')?.checked,
      notifyContributionStatus: !!card.querySelector('#settings-notify-contributions')?.checked,
    });

    showToast('Notification settings saved.', 'success');
  });

  return card;
}

function _buildPrivacyCard(preferences) {
  const card = document.createElement('section');
  card.className = 'page-card page-card--subtle';
  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Privacy</div>
    <h2 class="page-card__title page-card__title--sm">Keep group context comfortable</h2>
    <label class="settings-toggle-row" for="settings-share-profile">
      <span class="settings-toggle-row__body">
        <span class="settings-toggle-row__title">Show my nickname in group context</span>
        <span class="settings-toggle-row__copy">Keep your profile recognizable in squad tools instead of feeling anonymous.</span>
      </span>
      <input type="checkbox" class="settings-checkbox" id="settings-share-profile" ${preferences.shareProfileInGroups ? 'checked' : ''}>
    </label>
    <div class="settings-page__cta-row">
      <button type="button" class="btn btn-primary" id="settings-save-privacy">Save privacy setting</button>
      <button type="button" class="btn btn-ghost" id="settings-back-profile">Back to profile</button>
    </div>
  `;

  card.querySelector('#settings-save-privacy')?.addEventListener('click', () => {
    saveUserPreferences({
      shareProfileInGroups: !!card.querySelector('#settings-share-profile')?.checked,
    });
    showToast('Privacy setting saved.', 'success');
  });

  card.querySelector('#settings-back-profile')?.addEventListener('click', () => navigateTo('/profile'));
  return card;
}

function _buildAccountCard(currentUser) {
  const card = document.createElement('section');
  card.className = 'page-card';
  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Account</div>
    <h2 class="page-card__title page-card__title--sm">Identity and session controls</h2>
    <div class="settings-account-list">
      <div class="profile-meta">
        <span class="profile-meta__icon">${iconSvg(UserRound, 16)}</span>
        <div>
          <span class="profile-meta__title">Signed in account</span>
          <span class="profile-meta__copy">${_escapeHtml(currentUser.email ?? 'No email available')}</span>
        </div>
      </div>
      <div class="profile-meta">
        <span class="profile-meta__icon">${iconSvg(ShieldCheck, 16)}</span>
        <div>
          <span class="profile-meta__title">Authentication</span>
          <span class="profile-meta__copy">Google sign-in through Supabase keeps account access lightweight.</span>
        </div>
      </div>
    </div>
    <div class="settings-page__cta-row">
      <button type="button" class="btn btn-primary" id="settings-account-edit">${iconSvg(SlidersHorizontal, 16)} Edit nickname</button>
      <button type="button" class="btn btn-ghost" id="settings-account-signout">${iconSvg(LogOut, 16)} Sign out</button>
    </div>
  `;

  card.querySelector('#settings-account-edit')?.addEventListener('click', () => openProfileModal());
  card.querySelector('#settings-account-signout')?.addEventListener('click', async () => {
    await signOut();
    showToast('Signed out.', 'success');
    navigateTo('/');
  });

  return card;
}

function _toggleRowMarkup(id, title, copy, checked) {
  return /* html */`
    <label class="settings-toggle-row" for="${id}">
      <span class="settings-toggle-row__body">
        <span class="settings-toggle-row__title">${_escapeHtml(title)}</span>
        <span class="settings-toggle-row__copy">${_escapeHtml(copy)}</span>
      </span>
      <input type="checkbox" class="settings-checkbox" id="${id}" ${checked ? 'checked' : ''}>
    </label>
  `;
}

function _initials(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
