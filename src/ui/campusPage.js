/**
 * src/ui/campusPage.js
 *
 * Route-level campus detail / explore page for #/campus.
 *
 * This page gives each campus a browsable overview before the user jumps back
 * into the live map. It reuses the existing campus selection and building data
 * already present in the store.
 */

import { ArrowRight, Building2, Compass, MapPinned, Navigation, Sparkles, Users } from 'lucide';

import { on, EVENTS } from '../core/events.js';
import { getState, dispatch } from '../core/store.js';
import { navigateTo, navigateToCampus, readUrlParams } from '../core/router.js';
import { deriveCampusOverview } from '../state/campusState.js';
import { campusStats } from '../state/spotState.js';
import { iconSvg } from './icons.js';

const VIEW_ID = 'view-campus';

/**
 * Initialise the campus detail page renderer.
 *
 * @returns {void}
 */
export function initCampusPage() {
  const rerender = () => _renderCampusPage();

  on(EVENTS.ROUTE_CHANGED, rerender);
  on(EVENTS.CAMPUSES_LOADED, rerender);
  on(EVENTS.CAMPUS_SELECTED, rerender);
  on(EVENTS.BUILDINGS_LOADED, rerender);
  on(EVENTS.SPOTS_LOADED, rerender);
  on(EVENTS.CLAIM_UPDATED, rerender);
  on(EVENTS.CLAIM_REMOVED, rerender);

  _renderCampusPage();
}

function _renderCampusPage() {
  const view = document.getElementById(VIEW_ID);
  if (!view) return;

  const { currentRoute, campuses, selectedCampusId, spots, claims, buildings, confidence } = getState();
  const { campusId } = readUrlParams();
  view.innerHTML = '';

  if (currentRoute !== '/campus') return;

  const activeCampusId = campusId ?? selectedCampusId;
  const campus = campuses.find((entry) => entry.id === activeCampusId) ?? null;

  const shell = document.createElement('div');
  shell.className = 'page-shell';

  if (!campus) {
    shell.appendChild(_buildEmptyState());
    view.appendChild(shell);
    return;
  }

  if (campus.id !== selectedCampusId) {
    dispatch('CAMPUS_SELECTED', { campusId: campus.id });
  }

  const statsMap = campusStats(campuses, spots, claims);
  const campusStat = statsMap.get(campus.id) ?? { spotCount: 0, liveClaimCount: 0, liveClaimantCount: 0 };
  const overview = deriveCampusOverview(campus, spots, buildings, claims, confidence);

  shell.innerHTML = /* html */`
    <div class="page-shell__header">
      <p class="page-shell__eyebrow">Perch</p>
      <h1 class="page-shell__title">${_escapeHtml(campus.short_name || campus.name)}</h1>
      <p class="page-shell__subtitle">${_escapeHtml(_buildCampusSubtitle(campus, overview))}</p>
    </div>
  `;

  shell.appendChild(_buildHeroCard(campus, campusStat, overview));

  const grid = document.createElement('div');
  grid.className = 'page-grid page-grid--two campus-page__grid';
  grid.appendChild(_buildBuildingCard(campus, overview));
  grid.appendChild(_buildCategoriesCard(overview));
  shell.appendChild(grid);

  shell.appendChild(_buildCampusSelectorCard(campuses, campus.id));
  view.appendChild(shell);
}

function _buildHeroCard(campus, campusStat, overview) {
  const card = document.createElement('section');
  card.className = 'page-card page-card--hero';
  card.innerHTML = /* html */`
    <div class="campus-page__hero-head">
      <div>
        <div class="page-card__eyebrow">Campus overview</div>
        <h2 class="page-card__title">${_escapeHtml(campus.name)}</h2>
        <p class="page-card__copy">${_escapeHtml(campus.city || 'Community-mapped campus')} • ${overview.buildingCount} buildings in the live catalogue</p>
      </div>
      <div class="settings-page__cta-row">
        <button type="button" class="btn btn-primary" id="campus-page-open-map">${iconSvg(MapPinned, 16)} Open in map</button>
        <button type="button" class="btn btn-ghost" id="campus-page-back">Back to map</button>
      </div>
    </div>
    <div class="campus-page__stats">
      ${_statMarkup('Live spots', String(campusStat.spotCount))}
      ${_statMarkup('Active claims', String(campusStat.liveClaimCount))}
      ${_statMarkup('Free now', String(overview.freeCount))}
      ${_statMarkup('Likely full', String(overview.fullCount))}
    </div>
  `;

  card.querySelector('#campus-page-open-map')?.addEventListener('click', () => {
    dispatch('CAMPUS_SELECTED', { campusId: campus.id });
    navigateTo('/');
  });
  card.querySelector('#campus-page-back')?.addEventListener('click', () => navigateTo('/'));
  return card;
}

function _buildBuildingCard(campus, overview) {
  const card = document.createElement('section');
  card.className = 'page-card';

  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Buildings</div>
    <h2 class="page-card__title page-card__title--sm">Where the live activity clusters</h2>
    <div class="campus-page__building-list">
      ${overview.topBuildings.length
        ? overview.topBuildings.map((building) => /* html */`
          <button type="button" class="campus-page__building-row" data-campus-building="${building.id}">
            <span class="campus-page__building-icon">${iconSvg(Building2, 16)}</span>
            <span class="campus-page__building-body">
              <span class="campus-page__building-name">${_escapeHtml(building.name)}</span>
              <span class="campus-page__building-meta">${building.roomCount} rooms • ${building.liveClaims} active claims</span>
            </span>
            <span class="contribution-status-chip contribution-status-chip--${_statusTone(building.status)}">${_escapeHtml(building.status)}</span>
          </button>
        `).join('')
        : '<p class="page-empty-inline">Building activity will show up here once this campus has mapped spaces.</p>'}
    </div>
  `;

  card.querySelectorAll('[data-campus-building]').forEach((button) => {
    button.addEventListener('click', () => {
      dispatch('CAMPUS_SELECTED', { campusId: campus.id });
      navigateTo('/');
      history.replaceState(null, '', `${window.location.pathname}?campus=${encodeURIComponent(campus.id)}&building=${encodeURIComponent(button.dataset.campusBuilding)}#/`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });

  return card;
}

function _buildCategoriesCard(overview) {
  const card = document.createElement('section');
  card.className = 'page-card';
  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Explore</div>
    <h2 class="page-card__title page-card__title--sm">Quick campus read</h2>
    <div class="campus-page__category-grid">
      ${overview.categories.map((category) => /* html */`
        <div class="campus-page__category-card campus-page__category-card--${category.tone}">
          <span class="campus-page__category-label">${_escapeHtml(category.label)}</span>
          <span class="campus-page__category-count">${category.count}</span>
        </div>
      `).join('')}
    </div>
    <div class="campus-page__summary-list">
      <div class="profile-meta">
        <span class="profile-meta__icon">${iconSvg(Compass, 16)}</span>
        <div>
          <span class="profile-meta__title">Maybe available</span>
          <span class="profile-meta__copy">${overview.maybeCount} spaces still need stronger confidence signals.</span>
        </div>
      </div>
      <div class="profile-meta">
        <span class="profile-meta__icon">${iconSvg(Users, 16)}</span>
        <div>
          <span class="profile-meta__title">Student activity</span>
          <span class="profile-meta__copy">${overview.claimedCount} spaces are actively claimed right now.</span>
        </div>
      </div>
      <div class="profile-meta">
        <span class="profile-meta__icon">${iconSvg(Navigation, 16)}</span>
        <div>
          <span class="profile-meta__title">Best next step</span>
          <span class="profile-meta__copy">Open the map when you want the live pin-by-pin view for this campus.</span>
        </div>
      </div>
    </div>
  `;
  return card;
}

function _buildCampusSelectorCard(campuses, activeCampusId) {
  const card = document.createElement('section');
  card.className = 'page-card page-card--subtle';
  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Other campuses</div>
    <h2 class="page-card__title page-card__title--sm">Switch context without leaving explore</h2>
    <div class="campus-page__switcher-list">
      ${campuses.map((campus) => /* html */`
        <button type="button" class="campus-page__switcher-row${campus.id === activeCampusId ? ' campus-page__switcher-row--active' : ''}" data-campus-route="${campus.id}">
          <span class="campus-page__switcher-body">
            <span class="campus-page__switcher-name">${_escapeHtml(campus.name)}</span>
            <span class="campus-page__switcher-meta">${_escapeHtml(campus.city || 'Campus community')}</span>
          </span>
          <span class="campus-page__switcher-arrow">${iconSvg(ArrowRight, 16)}</span>
        </button>
      `).join('')}
    </div>
  `;

  card.querySelectorAll('[data-campus-route]').forEach((button) => {
    button.addEventListener('click', () => navigateToCampus(button.dataset.campusRoute));
  });

  return card;
}

function _buildEmptyState() {
  const card = document.createElement('section');
  card.className = 'page-card page-card--empty';
  card.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(Sparkles, 28)}</div>
    <h2 class="page-empty__title">Choose a campus first.</h2>
    <p class="page-empty__copy">This page needs a selected campus so it can summarize the buildings, live claims, and mapped spaces around you.</p>
    <button type="button" class="btn btn-primary" id="campus-page-back-map">Back to map</button>
  `;
  card.querySelector('#campus-page-back-map')?.addEventListener('click', () => navigateTo('/'));
  return card;
}

function _buildCampusSubtitle(campus, overview) {
  return `${campus.city || 'Community-mapped campus'} with ${overview.spotCount} mapped spaces, ${overview.freeCount} likely free right now, and ${overview.claimedCount} actively claimed.`;
}

function _statMarkup(label, value) {
  return /* html */`
    <div class="group-stat">
      <span class="group-stat__value">${_escapeHtml(value)}</span>
      <span class="group-stat__label">${_escapeHtml(label)}</span>
    </div>
  `;
}

function _statusTone(status) {
  switch (status) {
    case 'free': return 'good';
    case 'full': return 'warn';
    default: return 'pending';
  }
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
