/**
 * src/ui/contributionsPage.js
 *
 * Route-level contribution hub for #/contributions.
 *
 * This page gives signed-in users a home for community additions they made to
 * the map, including room submissions and buildings awaiting verification.
 */

import { Building2, CheckCircle2, Compass, FolderClock, Layers3, LogIn, MapPinned, Plus, Sparkles } from 'lucide';

import { on, emit, EVENTS } from '../core/events.js';
import { getState } from '../core/store.js';
import { navigateTo } from '../core/router.js';
import { fetchMyBuildings, fetchMySpotSubmissions } from '../api/campuses.js';
import { iconSvg } from './icons.js';

const VIEW_ID = 'view-contributions';

/** @type {{ userId: string | null, loading: boolean, error: string | null, spots: object[], buildings: object[] }} */
let _pageState = {
  userId: null,
  loading: false,
  error: null,
  spots: [],
  buildings: [],
};

/**
 * Initialise the contributions page renderer.
 *
 * @returns {void}
 */
export function initContributionsPage() {
  const rerender = () => _renderContributionsPage();

  on(EVENTS.AUTH_STATE_CHANGED, rerender);
  on(EVENTS.ROUTE_CHANGED, rerender);

  _renderContributionsPage();
}

function _renderContributionsPage() {
  const view = document.getElementById(VIEW_ID);
  if (!view) return;

  const { currentUser } = getState();
  view.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'page-shell';
  shell.innerHTML = /* html */`
    <div class="page-shell__header">
      <p class="page-shell__eyebrow">Perch</p>
      <h1 class="page-shell__title">My Contributions</h1>
      <p class="page-shell__subtitle">Track the rooms, spots, and buildings you helped add to the map so community review never feels invisible.</p>
    </div>
  `;

  if (!currentUser) {
    shell.appendChild(_buildSignedOutState());
    view.appendChild(shell);
    return;
  }

  if (_pageState.userId !== currentUser.id && !_pageState.loading) {
    _loadContributionData(currentUser.id);
  }

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

  const stats = _buildStats(_pageState.spots, _pageState.buildings);
  shell.appendChild(_buildHero(stats));

  const grid = document.createElement('div');
  grid.className = 'page-grid page-grid--two contributions-page__grid';
  grid.appendChild(_buildSpotsCard(_pageState.spots));
  grid.appendChild(_buildBuildingsCard(_pageState.buildings));
  shell.appendChild(grid);

  shell.appendChild(_buildTimelineCard(_pageState.spots, _pageState.buildings));
  view.appendChild(shell);
}

async function _loadContributionData(userId) {
  _pageState = {
    userId,
    loading: true,
    error: null,
    spots: [],
    buildings: [],
  };
  _renderContributionsPage();

  try {
    const [spots, buildings] = await Promise.all([
      fetchMySpotSubmissions(userId),
      fetchMyBuildings(userId),
    ]);

    _pageState = {
      userId,
      loading: false,
      error: null,
      spots,
      buildings,
    };
  } catch (err) {
    _pageState = {
      userId,
      loading: false,
      error: 'Could not load your contributions yet.',
      spots: [],
      buildings: [],
    };
    console.error('[contributionsPage] load error:', err);
  }

  _renderContributionsPage();
}

function _buildSignedOutState() {
  const empty = document.createElement('section');
  empty.className = 'page-card page-card--empty';
  empty.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(MapPinned, 28)}</div>
    <h2 class="page-empty__title">Sign in to see what you have added.</h2>
    <p class="page-empty__copy">Perch keeps browsing open, but your contribution history lives behind your account so your reviews and confirmations stay attached to you.</p>
    <div class="settings-page__cta-row">
      <button type="button" class="btn btn-primary" id="contrib-login">${iconSvg(LogIn, 16)} Sign in</button>
      <button type="button" class="btn btn-ghost" id="contrib-map">Back to map</button>
    </div>
  `;
  empty.querySelector('#contrib-login')?.addEventListener('click', () => emit(EVENTS.UI_LOGIN_REQUESTED, {}));
  empty.querySelector('#contrib-map')?.addEventListener('click', () => navigateTo('/'));
  return empty;
}

function _buildLoadingCard() {
  const card = document.createElement('section');
  card.className = 'page-card page-card--empty';
  card.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(FolderClock, 28)}</div>
    <h2 class="page-empty__title">Loading your map history.</h2>
    <p class="page-empty__copy">Pulling your room submissions, building markers, and current review state.</p>
  `;
  return card;
}

function _buildErrorCard(message) {
  const card = document.createElement('section');
  card.className = 'page-card page-card--empty';
  card.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(Compass, 28)}</div>
    <h2 class="page-empty__title">We could not load this page right now.</h2>
    <p class="page-empty__copy">${_escapeHtml(message)}</p>
    <button type="button" class="btn btn-primary" id="contrib-retry">Try again</button>
  `;
  card.querySelector('#contrib-retry')?.addEventListener('click', () => {
    const { currentUser } = getState();
    if (currentUser?.id) {
      _loadContributionData(currentUser.id);
    }
  });
  return card;
}

function _buildHero(stats) {
  const card = document.createElement('section');
  card.className = 'page-card page-card--hero';
  card.innerHTML = /* html */`
    <div class="contributions-hero__head">
      <div>
        <div class="page-card__eyebrow">Community map work</div>
        <h2 class="page-card__title">Your additions keep Perch useful.</h2>
        <p class="page-card__copy">Every room confirmation, building marker, and spot suggestion helps the next student skip the search spiral.</p>
      </div>
      <div class="settings-page__cta-row">
        <button type="button" class="btn btn-primary" id="contrib-open-map">${iconSvg(Plus, 16)} Add to the map</button>
        <button type="button" class="btn btn-ghost" id="contrib-open-profile">Back to profile</button>
      </div>
    </div>
    <div class="contributions-stats">
      ${_statMarkup('Pending', String(stats.pending))}
      ${_statMarkup('Approved', String(stats.approved))}
      ${_statMarkup('Buildings', String(stats.buildings))}
      ${_statMarkup('Confirmations', String(stats.confirmations))}
    </div>
  `;
  card.querySelector('#contrib-open-map')?.addEventListener('click', () => navigateTo('/'));
  card.querySelector('#contrib-open-profile')?.addEventListener('click', () => navigateTo('/profile'));
  return card;
}

function _buildSpotsCard(spots) {
  const card = document.createElement('section');
  card.className = 'page-card';

  if (!spots.length) {
    card.innerHTML = /* html */`
      <div class="page-card__eyebrow">Rooms and spots</div>
      <h2 class="page-card__title page-card__title--sm">Nothing submitted yet</h2>
      <p class="page-card__copy">Use Add to the Map from the live map to suggest a room, a corner, or a whole new place.</p>
    `;
    return card;
  }

  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Rooms and spots</div>
    <h2 class="page-card__title page-card__title--sm">Your recent submissions</h2>
    <div class="contribution-list">
      ${spots.map((spot) => _spotSubmissionMarkup(spot)).join('')}
    </div>
  `;
  return card;
}

function _buildBuildingsCard(buildings) {
  const card = document.createElement('section');
  card.className = 'page-card';

  if (!buildings.length) {
    card.innerHTML = /* html */`
      <div class="page-card__eyebrow">Buildings</div>
      <h2 class="page-card__title page-card__title--sm">No community buildings yet</h2>
      <p class="page-card__copy">Drop a building marker from the map when a campus shell still needs a structure before rooms can be mapped inside it.</p>
    `;
    return card;
  }

  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Buildings</div>
    <h2 class="page-card__title page-card__title--sm">Markers you created</h2>
    <div class="contribution-list">
      ${buildings.map((building) => _buildingMarkup(building)).join('')}
    </div>
  `;
  return card;
}

function _buildTimelineCard(spots, buildings) {
  const card = document.createElement('section');
  card.className = 'page-card page-card--subtle';

  const events = [
    ...spots.map((spot) => ({
      kind: 'spot',
      title: spot.spot_name,
      meta: [spot.building_name || 'Campus spot', spot.floor || null].filter(Boolean).join(' • '),
      status: _submissionStatusLabel(spot.status, spot.confirmation_count),
      date: spot.created_at,
    })),
    ...buildings.map((building) => ({
      kind: 'building',
      title: building.name,
      meta: _campusName(building.campuses),
      status: _buildingStatusLabel(building.verification_status, building.confirmation_count),
      date: building.created_at,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Timeline</div>
    <h2 class="page-card__title page-card__title--sm">Everything you have put into review</h2>
    <div class="contribution-timeline">
      ${events.length
        ? events.map((item) => /* html */`
          <div class="contribution-timeline__row">
            <span class="contribution-timeline__icon">${iconSvg(item.kind === 'building' ? Building2 : Sparkles, 14)}</span>
            <div class="contribution-timeline__body">
              <span class="contribution-timeline__title">${_escapeHtml(item.title)}</span>
              <span class="contribution-timeline__meta">${_escapeHtml(item.meta || 'Community contribution')} • ${_formatDate(item.date)}</span>
            </div>
            <span class="contribution-status-chip contribution-status-chip--${item.status.tone}">${_escapeHtml(item.status.label)}</span>
          </div>
        `).join('')
        : '<p class="page-empty-inline">Your contribution activity will show up here once you add something to the map.</p>'}
    </div>
  `;

  return card;
}

function _buildStats(spots, buildings) {
  const pending = spots.filter((spot) => spot.status === 'pending').length
    + buildings.filter((building) => building.verification_status === 'pending').length;
  const approved = spots.filter((spot) => spot.status === 'approved').length
    + buildings.filter((building) => building.verification_status === 'verified').length;
  const confirmations = spots.reduce((sum, spot) => sum + Number(spot.confirmation_count ?? 0), 0)
    + buildings.reduce((sum, building) => sum + Number(building.confirmation_count ?? 0), 0);

  return {
    pending,
    approved,
    buildings: buildings.length,
    confirmations,
  };
}

function _spotSubmissionMarkup(spot) {
  const status = _submissionStatusLabel(spot.status, spot.confirmation_count);

  return /* html */`
    <article class="contribution-row contribution-row--spot">
      <div class="contribution-row__summary">
        <span class="contribution-row__icon">${iconSvg(Sparkles, 16)}</span>
        <div class="contribution-row__body">
          <span class="contribution-row__title">${_escapeHtml(spot.spot_name)}</span>
          <span class="contribution-row__meta">${_escapeHtml([spot.building_name || _campusName(spot.campuses), spot.floor || null].filter(Boolean).join(' • '))}</span>
        </div>
      </div>
      <div class="contribution-row__aside">
        <span class="contribution-status-chip contribution-status-chip--${status.tone}">${_escapeHtml(status.label)}</span>
        <span class="contribution-row__date">${_formatDate(spot.created_at)}</span>
      </div>
    </article>
  `;
}

function _buildingMarkup(building) {
  const status = _buildingStatusLabel(building.verification_status, building.confirmation_count);

  return /* html */`
    <article class="contribution-row contribution-row--building">
      <div class="contribution-row__summary">
        <span class="contribution-row__icon">${iconSvg(Building2, 16)}</span>
        <div class="contribution-row__body">
          <span class="contribution-row__title">${_escapeHtml(building.name)}</span>
          <span class="contribution-row__meta">${_escapeHtml(_campusName(building.campuses))}</span>
        </div>
      </div>
      <div class="contribution-row__aside">
        <span class="contribution-status-chip contribution-status-chip--${status.tone}">${_escapeHtml(status.label)}</span>
        <span class="contribution-row__date">${_formatDate(building.created_at)}</span>
      </div>
    </article>
  `;
}

function _submissionStatusLabel(status, confirmationCount) {
  if (status === 'approved') {
    return { label: 'Approved', tone: 'good' };
  }
  if (status === 'rejected') {
    return { label: 'Needs work', tone: 'warn' };
  }

  return {
    label: `${Number(confirmationCount ?? 0)}/2 confirmations`,
    tone: 'pending',
  };
}

function _buildingStatusLabel(status, confirmationCount) {
  if (status === 'verified') {
    return { label: 'Verified', tone: 'good' };
  }

  return {
    label: `${Number(confirmationCount ?? 0) + 1}/2 confirmations`,
    tone: 'pending',
  };
}

function _statMarkup(label, value) {
  return /* html */`
    <div class="group-stat">
      <span class="group-stat__value">${_escapeHtml(value)}</span>
      <span class="group-stat__label">${_escapeHtml(label)}</span>
    </div>
  `;
}

function _campusName(campus) {
  if (Array.isArray(campus)) {
    return campus[0]?.short_name || campus[0]?.name || 'Campus contribution';
  }
  return campus?.short_name || campus?.name || 'Campus contribution';
}

function _formatDate(value) {
  if (!value) return 'Unknown date';
  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
