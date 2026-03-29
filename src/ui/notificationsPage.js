/**
 * src/ui/notificationsPage.js
 *
 * Route-level activity inbox for #/notifications.
 *
 * This is a derived feed built from existing product data: group pins, join
 * activity, personal claim history, and contribution review state. It avoids a
 * dedicated notifications table while still giving users one place to check the
 * important things that happened around them.
 */

import { BellRing, CheckCircle2, Clock3, Footprints, LogIn, MapPinned, Sparkles, Users } from 'lucide';

import { emit, on, EVENTS } from '../core/events.js';
import { getState } from '../core/store.js';
import { navigateTo } from '../core/router.js';
import { fetchMyBuildings, fetchMySpotSubmissions } from '../api/campuses.js';
import { fetchClaimHistory } from '../api/claims.js';
import { iconSvg } from './icons.js';

const VIEW_ID = 'view-notifications';
const FILTERS = ['all', 'squad', 'contributions', 'claims'];

/** @type {{ userId: string | null, loading: boolean, claims: object[], spots: object[], buildings: object[], error: string | null, activeFilter: 'all' | 'squad' | 'contributions' | 'claims' }} */
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
 * Initialise the activity inbox page.
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
  on(EVENTS.CLAIM_REMOVED, rerender);
  on(EVENTS.GROUP_JOINED, rerender);
  on(EVENTS.GROUP_LEFT, rerender);

  _renderNotificationsPage();
}

function _renderNotificationsPage() {
  const view = document.getElementById(VIEW_ID);
  if (!view) return;

  const { currentUser, group, groupPins, groupPinJoins, spots } = getState();
  view.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'page-shell';
  shell.innerHTML = /* html */`
    <div class="page-shell__header">
      <p class="page-shell__eyebrow">Perch</p>
      <h1 class="page-shell__title">Activity Inbox</h1>
      <p class="page-shell__subtitle">A single feed for squad movement, claim history, and the review state of spots and buildings you contributed.</p>
    </div>
  `;

  if (!currentUser) {
    shell.appendChild(_buildSignedOutCard());
    view.appendChild(shell);
    return;
  }

  if (_pageState.userId !== currentUser.id && !_pageState.loading) {
    _loadInboxData(currentUser.id);
  }

  const filterRow = _buildFilterRow();
  shell.appendChild(filterRow);

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

  const items = _deriveInboxItems({
    group,
    groupPins,
    groupPinJoins,
    spotRows: spots,
    claimRows: _pageState.claims,
    contributionSpots: _pageState.spots,
    contributionBuildings: _pageState.buildings,
  });

  const visibleItems = _pageState.activeFilter === 'all'
    ? items
    : items.filter((item) => item.kind === _pageState.activeFilter);

  shell.appendChild(_buildSummaryCard(items));
  shell.appendChild(_buildInboxCard(visibleItems));
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
      fetchClaimHistory({ limit: 10, offset: 0 }),
      fetchMySpotSubmissions(userId),
      fetchMyBuildings(userId),
    ]);

    _pageState = {
      ..._pageState,
      userId,
      loading: false,
      error: claimError ? 'Could not load your recent activity yet.' : null,
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
      error: 'Could not load your activity inbox yet.',
      claims: [],
      spots: [],
      buildings: [],
    };
  }

  _renderNotificationsPage();
}

function _buildSignedOutCard() {
  const card = document.createElement('section');
  card.className = 'page-card page-card--empty';
  card.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(BellRing, 28)}</div>
    <h2 class="page-empty__title">Sign in to follow your Perch activity.</h2>
    <p class="page-empty__copy">The inbox tracks your squad movement, claim updates, and contribution review state all in one place.</p>
    <div class="settings-page__cta-row">
      <button type="button" class="btn btn-primary" id="notifications-login">${iconSvg(LogIn, 16)} Sign in</button>
      <button type="button" class="btn btn-ghost" id="notifications-map">Back to map</button>
    </div>
  `;

  card.querySelector('#notifications-login')?.addEventListener('click', () => emit(EVENTS.UI_LOGIN_REQUESTED, {}));
  card.querySelector('#notifications-map')?.addEventListener('click', () => navigateTo('/'));
  return card;
}

function _buildFilterRow() {
  const row = document.createElement('section');
  row.className = 'page-card page-card--subtle notifications-page__filters';
  row.innerHTML = /* html */`
    <div class="chip-row notifications-page__chip-row">
      ${FILTERS.map((filter) => /* html */`
        <button type="button" class="chip${_pageState.activeFilter === filter ? ' chip-active' : ''}" data-notification-filter="${filter}">
          ${_labelForFilter(filter)}
        </button>
      `).join('')}
    </div>
  `;

  row.querySelectorAll('[data-notification-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.notificationFilter;
      if (!FILTERS.includes(filter)) return;
      _pageState.activeFilter = /** @type {'all' | 'squad' | 'contributions' | 'claims'} */ (filter);
      _renderNotificationsPage();
    });
  });

  return row;
}

function _buildLoadingCard() {
  const card = document.createElement('section');
  card.className = 'page-card page-card--empty';
  card.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(Clock3, 28)}</div>
    <h2 class="page-empty__title">Loading your recent activity.</h2>
    <p class="page-empty__copy">Pulling crew movement, claim history, and contribution review updates.</p>
  `;
  return card;
}

function _buildErrorCard(message) {
  const card = document.createElement('section');
  card.className = 'page-card page-card--empty';
  card.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(BellRing, 28)}</div>
    <h2 class="page-empty__title">We could not load your inbox.</h2>
    <p class="page-empty__copy">${_escapeHtml(message)}</p>
    <button type="button" class="btn btn-primary" id="notifications-retry">Try again</button>
  `;

  card.querySelector('#notifications-retry')?.addEventListener('click', () => {
    const { currentUser } = getState();
    if (currentUser?.id) _loadInboxData(currentUser.id);
  });

  return card;
}

function _buildSummaryCard(items) {
  const summary = {
    squad: items.filter((item) => item.kind === 'squad').length,
    claims: items.filter((item) => item.kind === 'claims').length,
    contributions: items.filter((item) => item.kind === 'contributions').length,
  };

  const card = document.createElement('section');
  card.className = 'page-card page-card--hero';
  card.innerHTML = /* html */`
    <div class="notifications-page__summary-head">
      <div>
        <div class="page-card__eyebrow">At a glance</div>
        <h2 class="page-card__title">Recent signal, not noise.</h2>
        <p class="page-card__copy">The feed stays lightweight by surfacing meaningful movement and review state instead of every minor event.</p>
      </div>
      <div class="settings-page__cta-row">
        <button type="button" class="btn btn-primary" id="notifications-open-map">Back to map</button>
        <button type="button" class="btn btn-ghost" id="notifications-open-settings">Notification settings</button>
      </div>
    </div>
    <div class="notifications-page__summary-stats">
      ${_statMarkup('Squad', String(summary.squad))}
      ${_statMarkup('Claims', String(summary.claims))}
      ${_statMarkup('Contributions', String(summary.contributions))}
      ${_statMarkup('Total', String(items.length))}
    </div>
  `;

  card.querySelector('#notifications-open-map')?.addEventListener('click', () => navigateTo('/'));
  card.querySelector('#notifications-open-settings')?.addEventListener('click', () => navigateTo('/settings'));
  return card;
}

function _buildInboxCard(items) {
  const card = document.createElement('section');
  card.className = 'page-card';
  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Inbox</div>
    <h2 class="page-card__title page-card__title--sm">Latest activity</h2>
    <div class="notifications-page__list">
      ${items.length
        ? items.map((item) => _itemMarkup(item)).join('')
        : '<p class="page-empty-inline">No activity in this view yet. Once you start claiming, contributing, or coordinating with a squad, updates will appear here.</p>'}
    </div>
  `;

  card.querySelectorAll('[data-inbox-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.inboxAction;
      const value = button.dataset.inboxValue;
      if (action === 'map') {
        navigateTo('/');
      } else if (action === 'profile') {
        navigateTo('/profile');
      } else if (action === 'contributions') {
        navigateTo('/contributions');
      } else if (action === 'group') {
        navigateTo('/group');
      } else if (action === 'settings') {
        navigateTo('/settings');
      } else if (action === 'spot' && value) {
        navigateTo('/');
        emit(EVENTS.UI_PANEL_CLOSED, {});
      }
    });
  });

  return card;
}

function _deriveInboxItems({ group, groupPins, groupPinJoins, spotRows, claimRows, contributionSpots, contributionBuildings }) {
  const items = [
    ..._deriveSquadItems(group, groupPins, groupPinJoins, spotRows),
    ..._deriveClaimItems(claimRows),
    ..._deriveContributionItems(contributionSpots, contributionBuildings),
  ];

  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function _deriveSquadItems(group, groupPins, groupPinJoins, spotRows) {
  if (!group) return [];

  const pins = Object.values(groupPins ?? {}).filter((pin) => pin.pin_type === 'live' && !pin.ended_at);
  const pinItems = pins.map((pin) => {
    const spotName = pin.spot_id
      ? (spotRows.find((spot) => spot.id === pin.spot_id)?.name ?? 'a study spot')
      : 'a saved pin';

    return {
      kind: 'squad',
      tone: 'info',
      icon: iconSvg(MapPinned, 16),
      title: `${pin.display_name ?? 'A squad member'} pinned ${spotName}`,
      meta: `${_joinCount(groupPinJoins[pin.id] ?? [])} heading there • ${_formatRelative(pin.pinned_at)}`,
      date: pin.pinned_at,
      ctaLabel: 'Open squad',
      ctaAction: 'group',
    };
  });

  const joinItems = Object.values(groupPinJoins ?? {})
    .flat()
    .filter((join) => join.status === 'heading')
    .map((join) => ({
      kind: 'squad',
      tone: 'good',
      icon: iconSvg(Footprints, 16),
      title: 'Someone in your squad is heading to a pinned spot',
      meta: `${_formatRelative(join.joined_at)} • travel coordination is active`,
      date: join.joined_at,
      ctaLabel: 'Open squad',
      ctaAction: 'group',
    }));

  return [...pinItems, ...joinItems];
}

function _deriveClaimItems(claimRows) {
  return (claimRows ?? []).map((claim) => ({
    kind: 'claims',
    tone: claim.cancelled_at ? 'warn' : 'info',
    icon: iconSvg(Clock3, 16),
    title: claim.cancelled_at
      ? `Your claim at ${claim.spots?.name ?? 'a spot'} ended`
      : `You claimed ${claim.spots?.name ?? 'a spot'}`,
    meta: `${claim.spots?.building ?? 'Campus location'} • ${_formatRelative(claim.claimed_at)}`,
    date: claim.claimed_at,
    ctaLabel: 'Back to map',
    ctaAction: 'map',
  }));
}

function _deriveContributionItems(spots, buildings) {
  const spotItems = (spots ?? []).map((spot) => ({
    kind: 'contributions',
    tone: spot.status === 'approved' ? 'good' : 'pending',
    icon: iconSvg(Sparkles, 16),
    title: spot.status === 'approved'
      ? `${spot.spot_name} was approved`
      : `${spot.spot_name} is waiting for review`,
    meta: `${spot.building_name || _campusName(spot.campuses)} • ${_confirmationLabel(spot.confirmation_count, spot.status)} • ${_formatRelative(spot.created_at)}`,
    date: spot.created_at,
    ctaLabel: 'Open contributions',
    ctaAction: 'contributions',
  }));

  const buildingItems = (buildings ?? []).map((building) => ({
    kind: 'contributions',
    tone: building.verification_status === 'verified' ? 'good' : 'pending',
    icon: iconSvg(CheckCircle2, 16),
    title: building.verification_status === 'verified'
      ? `${building.name} was verified`
      : `${building.name} still needs confirmation`,
    meta: `${_campusName(building.campuses)} • ${_buildingConfirmationLabel(building.confirmation_count, building.verification_status)} • ${_formatRelative(building.created_at)}`,
    date: building.created_at,
    ctaLabel: 'Open contributions',
    ctaAction: 'contributions',
  }));

  return [...spotItems, ...buildingItems];
}

function _itemMarkup(item) {
  return /* html */`
    <article class="notifications-page__item notifications-page__item--${item.tone}">
      <div class="notifications-page__item-summary">
        <span class="notifications-page__item-icon">${item.icon}</span>
        <div class="notifications-page__item-body">
          <span class="notifications-page__item-title">${_escapeHtml(item.title)}</span>
          <span class="notifications-page__item-meta">${_escapeHtml(item.meta)}</span>
        </div>
      </div>
      <button type="button" class="btn btn-ghost notifications-page__item-btn" data-inbox-action="${item.ctaAction}">${_escapeHtml(item.ctaLabel)}</button>
    </article>
  `;
}

function _statMarkup(label, value) {
  return /* html */`
    <div class="group-stat">
      <span class="group-stat__value">${_escapeHtml(value)}</span>
      <span class="group-stat__label">${_escapeHtml(label)}</span>
    </div>
  `;
}

function _joinCount(joins) {
  return joins.filter((join) => join.status === 'heading').length;
}

function _labelForFilter(filter) {
  switch (filter) {
    case 'squad': return 'Squad';
    case 'contributions': return 'Contributions';
    case 'claims': return 'Claims';
    default: return 'All';
  }
}

function _campusName(campus) {
  if (Array.isArray(campus)) return campus[0]?.short_name || campus[0]?.name || 'Campus contribution';
  return campus?.short_name || campus?.name || 'Campus contribution';
}

function _confirmationLabel(count, status) {
  if (status === 'approved') return 'Approved';
  return `${Number(count ?? 0)}/2 confirmations`;
}

function _buildingConfirmationLabel(count, status) {
  if (status === 'verified') return 'Verified';
  return `${Number(count ?? 0) + 1}/2 confirmations`;
}

function _formatRelative(value) {
  return value ? _formatDate(value) : 'Unknown time';
}

function _formatDate(value) {
  const date = new Date(value);
  const diffHours = Math.abs(Date.now() - date.getTime()) / 36e5;
  if (diffHours < 24) {
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-Math.max(1, Math.round(diffHours || 1)), 'hour');
  }
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
