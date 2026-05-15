/**
 * src/ui/notificationsPage.js
 *
 * Route-level notifications surface for #/notifications.
 *
 * This page is frontend-only for v1: it derives notification rows from real
 * claims, squad movement, and contribution data already loaded by the app.
 */

import {
  ArrowRight,
  Ban,
  Bell,
  CheckCircle2,
  Clock,
  Coffee,
  LogIn,
  Map,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide';

import { emit, on, EVENTS } from '../core/events.js';
import { dispatch, getState } from '../core/store.js';
import { navigateTo } from '../core/router.js';
import { fetchMyBuildings, fetchMySpotSubmissions } from '../api/campuses.js';
import { fetchClaimHistory } from '../api/claims.js';
import { deriveNotificationItems, filterNotificationItems, pickSanctuaryRecommendation } from '../state/notificationsState.js';
import { iconSvg } from './icons.js';

const VIEW_ID = 'view-notifications';
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'spot', label: 'Spot Updates' },
  { key: 'squad', label: 'Squad Updates' },
];

/** @type {{ userId: string | null, loading: boolean, claims: object[], spots: object[], buildings: object[], error: string | null, activeFilter: 'all' | 'spot' | 'squad' }} */
let _pageState = {
  userId: null,
  loading: false,
  claims: [],
  spots: [],
  buildings: [],
  error: null,
  activeFilter: 'all',
};

/**
 * Initialise the notifications page renderer.
 *
 * @returns {void}
 */
export function initNotificationsPage() {
  const rerender = () => _renderNotificationsPage();

  on(EVENTS.AUTH_STATE_CHANGED, rerender);
  on(EVENTS.ROUTE_CHANGED, rerender);
  on(EVENTS.GROUP_PINS_UPDATED, rerender);
  on(EVENTS.GROUP_PIN_JOINS_UPDATED, rerender);
  on(EVENTS.CLAIM_UPDATED, rerender);
  on(EVENTS.GROUP_JOINED, rerender);
  on(EVENTS.GROUP_LEFT, rerender);

  _renderNotificationsPage();
}

function _renderNotificationsPage() {
  const view = document.getElementById(VIEW_ID);
  if (!view) return;

  const state = getState();
  const { currentUser, group, groupPins, groupPinJoins, spots, claims } = state;
  view.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'notifications-dashboard';

  if (!currentUser) {
    shell.classList.add('notifications-dashboard--center');
    shell.appendChild(_buildSignedOutCard());
    view.appendChild(shell);
    return;
  }

  if (_pageState.userId !== currentUser.id && !_pageState.loading) {
    _loadInboxData(currentUser.id);
  }

  shell.appendChild(_buildFilterRow());

  if (_pageState.loading) {
    shell.appendChild(_buildLoadingCard());
    view.appendChild(shell);
    return;
  }

  if (_pageState.error) {
    shell.appendChild(_buildErrorCard(_pageState.error));
    view.appendChild(shell);
    return;
  }

  const items = deriveNotificationItems({
    group,
    groupPins,
    groupPinJoins,
    spotRows: spots,
    claimRows: _pageState.claims,
    contributionSpots: _pageState.spots,
    contributionBuildings: _pageState.buildings,
  });
  const visibleItems = filterNotificationItems(items, _pageState.activeFilter);
  const recommendation = pickSanctuaryRecommendation({ spots, claims });

  shell.appendChild(_buildList(visibleItems));
  shell.appendChild(_buildSanctuaryCard(recommendation));
  view.appendChild(shell);
}

async function _loadInboxData(userId) {
  _pageState = {
    ..._pageState,
    userId,
    loading: true,
    error: null,
    claims: [],
    spots: [],
    buildings: [],
  };
  _renderNotificationsPage();

  try {
    const [{ data: claims, error: claimError }, spots, buildings] = await Promise.all([
      fetchClaimHistory({ limit: 12, offset: 0 }),
      fetchMySpotSubmissions(userId),
      fetchMyBuildings(userId),
    ]);

    _pageState = {
      ..._pageState,
      userId,
      loading: false,
      error: claimError ? 'Could not load your recent spot updates yet.' : null,
      claims,
      spots,
      buildings,
    };
  } catch (err) {
    console.error('[notificationsPage] load error:', err);
    _pageState = {
      ..._pageState,
      userId,
      loading: false,
      error: 'Could not load your notifications yet.',
      claims: [],
      spots: [],
      buildings: [],
    };
  }

  _renderNotificationsPage();
}

function _buildFilterRow() {
  const row = document.createElement('nav');
  row.className = 'notifications-filter';
  row.setAttribute('aria-label', 'Notification filters');
  row.innerHTML = FILTERS.map((filter) => /* html */`
    <button
      type="button"
      class="notifications-filter__button${_pageState.activeFilter === filter.key ? ' is-active' : ''}"
      data-notification-filter="${filter.key}"
    >
      ${_escapeHtml(filter.label)}
    </button>
  `).join('');

  row.querySelectorAll('[data-notification-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.notificationFilter;
      if (!FILTERS.some((item) => item.key === filter)) return;
      _pageState.activeFilter = /** @type {'all' | 'spot' | 'squad'} */ (filter);
      _renderNotificationsPage();
    });
  });

  return row;
}

function _buildList(items) {
  const list = document.createElement('section');
  list.className = 'notifications-stream';

  if (!items.length) {
    list.appendChild(_buildEmptyCard());
    return list;
  }

  list.innerHTML = items.map(_itemMarkup).join('');
  list.querySelectorAll('[data-notification-action]').forEach((button) => {
    button.addEventListener('click', () => _handleAction(button.dataset.notificationAction, button.dataset.notificationValue));
  });

  return list;
}

function _buildSignedOutCard() {
  const card = document.createElement('section');
  card.className = 'notifications-state-card';
  card.innerHTML = /* html */`
    <span class="notifications-state-card__icon">${iconSvg(Bell, 28)}</span>
    <h1>Sign in for campus alerts.</h1>
    <p>Perch can only show your squad movement, claims, and contribution updates after you sign in.</p>
    <div class="notifications-state-card__actions">
      <button type="button" class="btn btn-primary" id="notifications-login">${iconSvg(LogIn, 16)} Sign in</button>
      <button type="button" class="btn btn-ghost" id="notifications-map">Back to map</button>
    </div>
  `;
  card.querySelector('#notifications-login')?.addEventListener('click', () => emit(EVENTS.UI_LOGIN_REQUESTED, {}));
  card.querySelector('#notifications-map')?.addEventListener('click', () => navigateTo('/'));
  return card;
}

function _buildLoadingCard() {
  const card = document.createElement('section');
  card.className = 'notifications-state-card';
  card.innerHTML = /* html */`
    <span class="notifications-state-card__icon">${iconSvg(Clock, 28)}</span>
    <h1>Loading your campus signal.</h1>
    <p>Pulling spot updates, squad movement, and contribution review status.</p>
  `;
  return card;
}

function _buildErrorCard(message) {
  const card = document.createElement('section');
  card.className = 'notifications-state-card';
  card.innerHTML = /* html */`
    <span class="notifications-state-card__icon">${iconSvg(Bell, 28)}</span>
    <h1>We could not load notifications.</h1>
    <p>${_escapeHtml(message)}</p>
    <button type="button" class="btn btn-primary" id="notifications-retry">Try again</button>
  `;
  card.querySelector('#notifications-retry')?.addEventListener('click', () => {
    const { currentUser } = getState();
    if (currentUser?.id) _loadInboxData(currentUser.id);
  });
  return card;
}

function _buildEmptyCard() {
  const card = document.createElement('article');
  card.className = 'notification-row notification-row--empty';
  card.innerHTML = /* html */`
    <span class="notification-row__icon">${iconSvg(Bell, 22)}</span>
    <div class="notification-row__content">
      <h2 class="notification-row__title">No updates in this view</h2>
      <p class="notification-row__message">Claim a spot, join a squad, or submit a campus contribution and updates will appear here.</p>
    </div>
  `;
  return card;
}

function _itemMarkup(item) {
  return /* html */`
    <article class="notification-row notification-row--${_escapeAttribute(item.tone)}">
      <span class="notification-row__icon notification-row__icon--${_escapeAttribute(item.tone)}">${_iconForItem(item.icon)}</span>
      <div class="notification-row__content">
        <h2 class="notification-row__title">${_escapeHtml(item.title)}</h2>
        <p class="notification-row__message">${_escapeHtml(item.body)}</p>
        <div class="notification-row__pills">
          ${(item.pills ?? []).filter(Boolean).slice(0, 3).map((pill) => `<span class="notification-row__pill notification-row__pill--${_escapeAttribute(_pillTone(pill))}">${_escapeHtml(pill)}</span>`).join('')}
        </div>
      </div>
      <div class="notification-row__meta">
        <time>${iconSvg(Clock, 13)} ${_escapeHtml(_formatRelative(item.date))}</time>
        <button
          type="button"
          class="notification-row__action"
          data-notification-action="${_escapeAttribute(item.action)}"
          data-notification-value="${_escapeAttribute(item.actionValue ?? '')}"
          aria-label="Open ${_escapeAttribute(item.title)}"
        >
          ${iconSvg(ArrowRight, 15)}
        </button>
      </div>
    </article>
  `;
}

function _buildSanctuaryCard(spot) {
  const card = document.createElement('section');
  card.className = `notifications-sanctuary${spot ? '' : ' notifications-sanctuary--empty'}`;
  const title = spot ? 'Need a quieter sanctuary?' : 'No sanctuary signal yet';
  const copy = spot
    ? `${spot.name} is a strong quiet candidate${spot.noise_baseline === 'quiet' ? ' with a quieter baseline' : ''}${spot.has_outlets ? ' and outlets nearby' : ''}.`
    : 'Once Perch has available quiet spots loaded, this card will point you toward a calmer place.';

  card.innerHTML = /* html */`
    <div class="notifications-sanctuary__copy">
      <h2>${_escapeHtml(title)}</h2>
      <p>${_escapeHtml(copy)}</p>
      <button type="button" class="notifications-sanctuary__button" id="notifications-sanctuary-action" ${spot ? '' : 'disabled'}>
        ${spot ? 'Take me there' : 'Waiting for signal'} ${spot ? iconSvg(ArrowRight, 15) : ''}
      </button>
    </div>
    <div class="notifications-sanctuary__image-wrap" aria-hidden="true">
      <img class="notifications-sanctuary__image" src="/notification-sanctuary.jpg" alt="">
    </div>
  `;

  card.querySelector('#notifications-sanctuary-action')?.addEventListener('click', () => {
    if (spot?.id) _openSpot(spot.id);
  });

  return card;
}

function _buildScrollMarker() {
  const marker = document.createElement('span');
  marker.className = 'notifications-scroll-marker';
  marker.setAttribute('aria-hidden', 'true');
  return marker;
}

function _iconForItem(key) {
  switch (key) {
    case 'ban':
      return iconSvg(Ban, 22);
    case 'check':
      return iconSvg(CheckCircle2, 22);
    case 'map':
      return iconSvg(Map, 22);
    case 'sparkles':
      return iconSvg(Sparkles, 22);
    case 'userPlus':
      return iconSvg(UserPlus, 22);
    case 'users':
      return iconSvg(Users, 22);
    case 'coffee':
    default:
      return iconSvg(Coffee, 22);
  }
}

function _handleAction(action, value) {
  if (action === 'group') {
    navigateTo('/group');
    return;
  }
  if (action === 'contributions') {
    navigateTo('/contributions');
    return;
  }
  if (action === 'map') {
    if (value) {
      _openSpot(value);
    } else {
      navigateTo('/');
    }
  }
}

function _pillTone(value) {
  const pill = String(value ?? '').toLowerCase();
  if (pill.includes('quick')) return 'quick';
  if (pill.includes('review') || pill.includes('confirmation') || pill.includes('verified')) return 'review';
  if (pill.includes('open') || pill.includes('heading') || pill.includes('arriving')) return 'open';
  return 'default';
}

function _openSpot(spotId) {
  navigateTo('/');
  dispatch('SELECT_SPOT', { spotId, navigate: true });
}

function _formatRelative(value) {
  if (!value) return 'now';
  const date = new Date(value);
  const diffMinutes = Math.max(1, Math.round(Math.abs(Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
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
