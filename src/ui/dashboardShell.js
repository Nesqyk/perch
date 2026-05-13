/**
 * src/ui/dashboardShell.js
 *
 * Central dashboard shell for route navigation and route outlet visibility.
 * Owns the desktop rail, mobile tab bar, auth-aware nav visibility, and the
 * distinction between the live map route and full-page workspace routes.
 */

import { Bell, Map, Settings, User, Users } from 'lucide';

import { on, EVENTS } from '../core/events.js';
import { getState } from '../core/store.js';
import { navigateTo } from '../core/router.js';
import { getMap } from '../map/mapInit.js';
import { getRouteLayoutMode, getShellNavRoutes } from '../state/dashboardShellState.js';
import { iconSvg } from './icons.js';

const ROUTE_VIEW_IDS = Object.freeze({
  '/profile': 'view-profile',
  '/group': 'view-group',
  '/campus': 'view-campus',
  '/spot': 'view-spot',
  '/settings': 'view-settings',
  '/contributions': 'view-contributions',
  '/notifications': 'view-notifications',
});

const ROUTE_ICONS = Object.freeze({
  '/': iconSvg(Map, 22),
  '/group': iconSvg(Users, 22),
  '/profile': iconSvg(User, 22),
  '/notifications': iconSvg(Bell, 22),
  '/settings': iconSvg(Settings, 22),
});

let _resizeTimer = null;

/**
 * Initialise the dashboard shell.
 *
 * @returns {void}
 */
export function initDashboardShell() {
  _injectRail();
  _injectBottomBar();

  on(EVENTS.ROUTE_CHANGED, (e) => {
    _syncShell(e.detail.route, !!getState().currentUser);
  });

  on(EVENTS.AUTH_STATE_CHANGED, (e) => {
    _syncShell(getState().currentRoute, !!e.detail.user);
  });

  window.addEventListener('resize', _queueMapResize);

  _syncShell(getState().currentRoute, !!getState().currentUser);
}

function _injectRail() {
  if (document.getElementById('dashboard-rail')) return;

  const rail = document.createElement('nav');
  rail.id = 'dashboard-rail';
  rail.className = 'dashboard-rail';
  rail.setAttribute('aria-label', 'Main navigation');
  rail.innerHTML = /* html */`
    <img src="/logo.svg" alt="Perch" class="dashboard-rail__brand" />
    <div class="dashboard-rail__list">
      ${getShellNavRoutes().map((item) => /* html */`
        <button
          id="${_routeId(item.route)}-rail"
          class="dashboard-rail__item"
          data-route="${item.route}"
          data-tooltip="${item.label}"
          aria-label="${item.label}"
          type="button"
        >
          <span class="dashboard-rail__icon">${ROUTE_ICONS[item.route]}</span>
        </button>
      `).join('')}
    </div>
  `;

  const layout = document.getElementById('app-layout');
  layout?.insertBefore(rail, layout.firstChild);
  rail.addEventListener('click', _onNavClick);
}

function _injectBottomBar() {
  if (document.getElementById('dashboard-bottom')) return;

  const bar = document.createElement('nav');
  bar.id = 'dashboard-bottom';
  bar.className = 'dashboard-bottom';
  bar.setAttribute('aria-label', 'Main navigation');
  bar.innerHTML = getShellNavRoutes().map((item) => /* html */`
    <button
      id="${_routeId(item.route)}-bottom"
      class="dashboard-bottom__item"
      data-route="${item.route}"
      data-tooltip="${item.label}"
      aria-label="${item.label}"
      type="button"
    >
      <span class="dashboard-bottom__icon">${ROUTE_ICONS[item.route]}</span>
      <span class="dashboard-bottom__label">${item.label}</span>
    </button>
  `).join('');

  document.body.appendChild(bar);
  bar.addEventListener('click', _onNavClick);
}

function _syncShell(route, isAuthenticated) {
  const layoutMode = getRouteLayoutMode(route);
  const isMapRoute = layoutMode === 'map';
  const rail = document.getElementById('dashboard-rail');
  const bottom = document.getElementById('dashboard-bottom');

  rail?.toggleAttribute('hidden', !isAuthenticated);
  bottom?.toggleAttribute('hidden', !isAuthenticated);

  if (isAuthenticated) {
    document.body.dataset.nav = 'ready';
  } else {
    delete document.body.dataset.nav;
  }

  document.body.dataset.shellLayout = layoutMode;
  document.body.dataset.shellRoute = _routeId(route);

  document.getElementById('map-container')?.classList.toggle('view--active', isMapRoute);
  document.getElementById('panel')?.classList.toggle('view--active', isMapRoute);

  for (const [viewRoute, id] of Object.entries(ROUTE_VIEW_IDS)) {
    const view = document.getElementById(id);
    const isActive = route === viewRoute;
    view?.classList.toggle('view--active', isActive);
    view?.classList.toggle('page-view--immersive', isActive && layoutMode === 'immersive');
    view?.classList.toggle('page-view--workspace', isActive && layoutMode === 'workspace');
  }

  _syncActiveNav(route);

  if (isMapRoute) {
    _queueMapResize();
  }
}

function _syncActiveNav(route) {
  for (const item of getShellNavRoutes()) {
    const isActive = item.route === route;
    const railBtn = document.getElementById(`${_routeId(item.route)}-rail`);
    const bottomBtn = document.getElementById(`${_routeId(item.route)}-bottom`);

    railBtn?.classList.toggle('dashboard-rail__item--active', isActive);
    bottomBtn?.classList.toggle('dashboard-bottom__item--active', isActive);
    railBtn?.setAttribute('aria-current', isActive ? 'page' : 'false');
    bottomBtn?.setAttribute('aria-current', isActive ? 'page' : 'false');
  }
}

function _onNavClick(e) {
  const btn = e.target.closest('[data-route]');
  if (!btn) return;
  navigateTo(btn.dataset.route);
}

function _routeId(route) {
  return route === '/' ? 'route-map' : `route-${route.replace(/^\//, '')}`;
}

function _queueMapResize() {
  window.clearTimeout(_resizeTimer);
  _resizeTimer = window.setTimeout(() => {
    const container = document.getElementById('map-container');
    if (!container?.classList.contains('view--active')) return;

    try {
      getMap().invalidateSize({ pan: false });
    } catch {
      // The shell initializes before Leaflet. MAP_READY/render events will
      // trigger future invalidations once the map exists.
    }
  }, 80);
}
