/**
 * src/ui/profilePage.js
 *
 * Route-level profile dashboard rendered into #view-profile.
 *
 * The page uses real authenticated data only: profile fields, claim history,
 * contribution rows, current squad data, and persisted meetup/session records.
 */

import {
  ArrowRight,
  BadgeCheck,
  Bookmark,
  Calendar,
  Handshake,
  IdCard,
  LogIn,
  Mail,
  MapPin,
  PencilLine,
  Radio,
  Share2,
  UserRound,
  Users,
} from 'lucide';

import { emit, on, EVENTS } from '../core/events.js';
import { getState } from '../core/store.js';
import { navigateTo } from '../core/router.js';
import { fetchProfileDashboard } from '../api/profile.js';
import { composeProfileActivity, deriveProfileStats, profileSubtitle } from '../state/profileState.js';
import { openProfileModal } from './profileModal.js';
import { showToast } from './toast.js';
import { iconSvg } from './icons.js';

const VIEW_ID = 'view-profile';

/** @type {{ userId: string | null, loading: boolean, error: string | null, profile: object | null, claims: object[], submissions: object[], buildings: object[] }} */
let _pageState = {
  userId: null,
  loading: false,
  error: null,
  profile: null,
  claims: [],
  submissions: [],
  buildings: [],
};

/**
 * Initialise the profile page renderer.
 *
 * @returns {void}
 */
export function initProfilePage() {
  const rerender = () => _renderProfilePage();

  on(EVENTS.AUTH_STATE_CHANGED, rerender);
  on(EVENTS.NICKNAME_UPDATED, rerender);
  on(EVENTS.SETTINGS_DASHBOARD_UPDATED, rerender);
  on(EVENTS.GROUP_JOINED, rerender);
  on(EVENTS.GROUP_LEFT, rerender);
  on(EVENTS.GROUP_DASHBOARD_UPDATED, rerender);
  on(EVENTS.GROUP_PINS_UPDATED, rerender);
  on(EVENTS.GROUP_PIN_JOINS_UPDATED, rerender);
  on(EVENTS.CLAIM_UPDATED, () => _reloadForCurrentUser());
  on(EVENTS.ROUTE_CHANGED, rerender);

  _renderProfilePage();
}

function _renderProfilePage() {
  const view = document.getElementById(VIEW_ID);
  if (!view) return;

  const state = getState();
  const { currentUser } = state;
  view.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'profile-dashboard';

  if (!currentUser) {
    shell.classList.add('profile-dashboard--signed-out');
    shell.appendChild(_buildSignedOutCard());
    view.appendChild(shell);
    return;
  }

  if (_pageState.userId !== currentUser.id && !_pageState.loading) {
    _loadProfileData(currentUser.id);
  }

  if (_pageState.loading && _pageState.userId === currentUser.id) {
    shell.appendChild(_buildLoadingCard());
    view.appendChild(shell);
    return;
  }

  if (_pageState.error) {
    shell.appendChild(_buildErrorCard(_pageState.error));
    view.appendChild(shell);
    return;
  }

  const profile = _pageState.profile ?? state.settingsProfile ?? {};
  const stats = deriveProfileStats({
    submissions: _pageState.submissions,
    buildings: _pageState.buildings,
    groupPins: state.groupPins,
    groupPinJoins: state.groupPinJoins,
    groupMember: state.groupMember,
    userId: currentUser.id,
  });
  const activities = composeProfileActivity({
    claims: _pageState.claims,
    submissions: _pageState.submissions,
    buildings: _pageState.buildings,
    group: state.group,
    groupMember: state.groupMember,
    groupPins: state.groupPins,
    groupPinJoins: state.groupPinJoins,
    spots: state.spots,
    userId: currentUser.id,
    limit: 4,
  });

  shell.innerHTML = /* html */`
    <header class="profile-dashboard__header">
      <h1>Perch Profile</h1>
      <p>Manage your academic identity and track campus life.</p>
    </header>
  `;

  const top = document.createElement('section');
  top.className = 'profile-dashboard__top';
  top.appendChild(_buildIdentityCard({ user: currentUser, profile }));
  top.appendChild(_buildStatCard({ icon: MapPin, value: stats.spotsFound, label: 'Spots Found', tone: 'map' }));
  top.appendChild(_buildStatCard({ icon: Handshake, value: stats.squadContributions, label: 'Squad Contributions', tone: 'squad' }));
  shell.appendChild(top);

  const content = document.createElement('section');
  content.className = 'profile-dashboard__content';
  const left = document.createElement('div');
  left.className = 'profile-dashboard__left';
  const right = document.createElement('div');
  right.className = 'profile-dashboard__right';

  left.appendChild(_buildPersonalInfoCard({ user: currentUser, profile }));
  left.appendChild(_buildMeetupCard({ meetup: state.groupMeetup }));
  right.appendChild(_buildActivityCard(activities));

  content.appendChild(left);
  content.appendChild(right);
  shell.appendChild(content);

  view.appendChild(shell);
}

async function _loadProfileData(userId) {
  _pageState = {
    userId,
    loading: true,
    error: null,
    profile: null,
    claims: [],
    submissions: [],
    buildings: [],
  };
  _renderProfilePage();

  try {
    const dashboard = await fetchProfileDashboard({ activityLimit: 12 });
    _pageState = {
      userId,
      loading: false,
      error: dashboard.error,
      profile: dashboard.profile,
      claims: dashboard.claims,
      submissions: dashboard.submissions,
      buildings: dashboard.buildings,
    };
  } catch (err) {
    console.error('[profilePage] load error:', err);
    _pageState = {
      userId,
      loading: false,
      error: 'Could not load your profile dashboard yet.',
      profile: null,
      claims: [],
      submissions: [],
      buildings: [],
    };
  }

  _renderProfilePage();
}

function _reloadForCurrentUser() {
  const { currentUser } = getState();
  if (currentUser?.id) _loadProfileData(currentUser.id);
}

function _buildSignedOutCard() {
  const card = document.createElement('section');
  card.className = 'page-card page-card--empty profile-auth-card';
  card.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(UserRound, 28)}</div>
    <h2 class="page-empty__title">Sign in to view your profile.</h2>
    <p class="page-empty__copy">Your claims, squad activity, and contribution history live behind your Perch account.</p>
    <div class="settings-page__cta-row">
      <button type="button" class="btn btn-primary" id="profile-page-login">${iconSvg(LogIn, 16)} Sign in</button>
      <button type="button" class="btn btn-ghost" id="profile-page-map">Back to map</button>
    </div>
  `;
  card.querySelector('#profile-page-login')?.addEventListener('click', () => emit(EVENTS.UI_LOGIN_REQUESTED, {}));
  card.querySelector('#profile-page-map')?.addEventListener('click', () => navigateTo('/'));
  return card;
}

function _buildLoadingCard() {
  const card = document.createElement('section');
  card.className = 'page-card page-card--empty profile-auth-card';
  card.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(Radio, 28)}</div>
    <h2 class="page-empty__title">Loading your profile.</h2>
    <p class="page-empty__copy">Gathering profile fields, recent claims, and your contribution history.</p>
  `;
  return card;
}

function _buildErrorCard(message) {
  const card = document.createElement('section');
  card.className = 'page-card page-card--empty profile-auth-card';
  card.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(UserRound, 28)}</div>
    <h2 class="page-empty__title">We could not load your profile.</h2>
    <p class="page-empty__copy">${_escapeHtml(message)}</p>
    <button type="button" class="btn btn-primary" id="profile-retry">Try again</button>
  `;
  card.querySelector('#profile-retry')?.addEventListener('click', _reloadForCurrentUser);
  return card;
}

function _buildIdentityCard({ user, profile }) {
  const card = document.createElement('article');
  card.className = 'profile-identity-card';
  const displayName = profile.nickname || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Perch member';
  const subtitle = profileSubtitle(profile) || profile.school_label || 'Add course and class details';
  const avatar = profile.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || '';
  const verified = !!profile.verified_student || user.email_confirmed_at || user.user_metadata?.email_verified;

  card.innerHTML = /* html */`
    <div class="profile-identity-card__avatar">
      ${avatar
        ? `<img src="${_escapeAttribute(avatar)}" alt="">`
        : `<span>${_escapeHtml(_initials(displayName))}</span>`}
    </div>
    <div class="profile-identity-card__body">
      <div class="profile-identity-card__name-row">
        <h2>${_escapeHtml(displayName)}</h2>
        ${verified ? `<span class="profile-verified">${iconSvg(BadgeCheck, 14)} Verified Student</span>` : ''}
      </div>
      <p>${_escapeHtml(subtitle)}</p>
      <div class="profile-identity-card__actions">
        <button type="button" class="btn btn-primary" id="profile-edit">${iconSvg(PencilLine, 15)} Edit Profile</button>
        <button type="button" class="btn btn-ghost" id="profile-share">${iconSvg(Share2, 15)} Share Profile</button>
      </div>
    </div>
  `;
  card.querySelector('#profile-edit')?.addEventListener('click', () => openProfileModal());
  card.querySelector('#profile-share')?.addEventListener('click', _copyProfileLink);
  return card;
}

function _buildStatCard({ icon, value, label, tone }) {
  const card = document.createElement('article');
  card.className = `profile-stat-card profile-stat-card--${tone}`;
  card.innerHTML = /* html */`
    <span class="profile-stat-card__icon">${iconSvg(icon, 22)}</span>
    <strong>${_escapeHtml(value)}</strong>
    <span>${_escapeHtml(label)}</span>
  `;
  return card;
}

function _buildPersonalInfoCard({ user, profile }) {
  const card = document.createElement('article');
  card.className = 'profile-panel profile-personal-card';
  const vibes = Array.isArray(profile.study_vibes) ? profile.study_vibes : [];

  card.innerHTML = /* html */`
    <h2>Personal Information</h2>
    <div class="profile-info-list">
      ${_infoRow({ icon: Mail, label: 'Email Address', value: user.email || 'No email available' })}
      ${_infoRow({ icon: IdCard, label: 'Student ID', value: profile.student_id || '', empty: 'Add student ID' })}
      <div class="profile-info-row profile-info-row--vibes">
        <span class="profile-info-row__icon">${iconSvg(Radio, 16)}</span>
        <div>
          <span class="profile-info-row__label">Preferred Study Vibe</span>
          <div class="profile-vibe-row">
            ${vibes.length
              ? vibes.map((vibe) => `<span class="profile-vibe-chip">${_escapeHtml(vibe)}</span>`).join('')
              : '<button type="button" class="profile-empty-action" id="profile-add-vibes">Add study vibes</button>'}
          </div>
        </div>
      </div>
    </div>
  `;
  card.querySelectorAll('[data-profile-edit]').forEach((button) => {
    button.addEventListener('click', () => openProfileModal());
  });
  card.querySelector('#profile-add-vibes')?.addEventListener('click', () => openProfileModal());
  return card;
}

function _buildMeetupCard({ meetup }) {
  const item = meetup || null;
  const card = document.createElement('article');
  card.className = `profile-meetup-card${item ? '' : ' profile-meetup-card--empty'}`;

  if (!item) {
    card.innerHTML = /* html */`
      <span class="profile-meetup-card__eyebrow">Next Meetup</span>
      <h2>No session scheduled</h2>
      <p>Your next squad meetup or personal study session will appear here once it is saved.</p>
      <button type="button" id="profile-open-group">Open Squad</button>
    `;
    card.querySelector('#profile-open-group')?.addEventListener('click', () => navigateTo('/group'));
    return card;
  }

  card.innerHTML = /* html */`
    <span class="profile-meetup-card__eyebrow">Next Meetup</span>
    <h2>${_escapeHtml(item.title)}</h2>
    <p>${iconSvg(Calendar, 15)} ${_escapeHtml(_formatMeetupTime(item.starts_at))}</p>
    <button type="button" id="profile-add-calendar">Add to Calendar</button>
  `;
  card.querySelector('#profile-add-calendar')?.addEventListener('click', () => _downloadCalendar(item));
  return card;
}

function _buildActivityCard(items) {
  const card = document.createElement('article');
  card.className = 'profile-activity-card';
  card.innerHTML = /* html */`
    <div class="profile-activity-card__head">
      <h2>Recent Activity</h2>
      <button type="button" id="profile-view-activity">View All ${iconSvg(ArrowRight, 14)}</button>
    </div>
    <div class="profile-activity-list">
      ${items.length
        ? items.map(_activityMarkup).join('')
        : `<div class="profile-activity-empty">
            <span>${iconSvg(Bookmark, 22)}</span>
            <strong>No activity yet</strong>
            <p>Claims, squad joins, saved pins, and map contributions will show up here.</p>
          </div>`}
    </div>
  `;
  card.querySelector('#profile-view-activity')?.addEventListener('click', () => navigateTo('/notifications'));
  return card;
}

function _infoRow({ icon, label, value, empty = '' }) {
  return /* html */`
    <div class="profile-info-row">
      <span class="profile-info-row__icon">${iconSvg(icon, 16)}</span>
      <div>
        <span class="profile-info-row__label">${_escapeHtml(label)}</span>
        ${value
          ? `<strong>${_escapeHtml(value)}</strong>`
          : `<button type="button" class="profile-empty-action" data-profile-edit>${_escapeHtml(empty)}</button>`}
      </div>
    </div>
  `;
}

function _activityMarkup(item) {
  return /* html */`
    <article class="profile-activity-row profile-activity-row--${_escapeAttribute(item.tone)}">
      <span class="profile-activity-row__icon">${_activityIcon(item.kind)}</span>
      <div class="profile-activity-row__body">
        <strong>${_escapeHtml(item.title)}</strong>
        <span>${_escapeHtml(item.meta)}</span>
      </div>
      <div class="profile-activity-row__aside">
        <time>${_escapeHtml(_formatRelative(item.date))}</time>
        <span>${_escapeHtml(item.tag)}</span>
      </div>
    </article>
  `;
}

function _activityIcon(kind) {
  switch (kind) {
    case 'squad':
      return iconSvg(Users, 18);
    case 'saved':
      return iconSvg(Bookmark, 18);
    case 'shared':
      return iconSvg(Radio, 18);
    case 'submission':
    case 'building':
      return iconSvg(Handshake, 18);
    default:
      return iconSvg(MapPin, 18);
  }
}

async function _copyProfileLink() {
  const url = `${window.location.origin}${window.location.pathname}#/profile`;
  try {
    await navigator.clipboard.writeText(url);
    showToast('Profile link copied.', 'success');
  } catch (err) {
    console.error('[profilePage] copy link error:', err);
    showToast('Could not copy the profile link.', 'error');
  }
}

function _downloadCalendar(item) {
  if (!item?.starts_at) {
    showToast('No calendar time saved yet.', 'info');
    return;
  }

  const starts = new Date(item.starts_at);
  const ends = new Date(starts.getTime() + 60 * 60 * 1000);
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Perch//Profile//EN',
    'BEGIN:VEVENT',
    `UID:${item.id ?? starts.getTime()}@perch`,
    `DTSTAMP:${_icsDate(new Date())}`,
    `DTSTART:${_icsDate(starts)}`,
    `DTEND:${_icsDate(ends)}`,
    `SUMMARY:${_icsText(item.title ?? 'Study session')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new window.Blob([body], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'perch-session.ics';
  link.click();
  URL.revokeObjectURL(url);
}

function _formatMeetupTime(value) {
  if (!value) return 'Time not set';
  return new Date(value).toLocaleString('en-PH', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  });
}

function _formatRelative(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  const diffHours = (Date.now() - date.getTime()) / 36e5;
  if (diffHours < 24) {
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-Math.max(1, Math.round(diffHours || 1)), 'hour');
  }
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function _icsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function _icsText(value) {
  return String(value ?? '').replace(/[\\,;]/g, '\\$&').replace(/\n/g, '\\n');
}

function _initials(value) {
  return String(value ?? 'P')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'P';
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _escapeAttribute(value) {
  return _escapeHtml(value);
}
