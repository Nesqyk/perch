/**
 * src/ui/navMenu.js
 *
 * Global navigation shell.
 *
 * Renders two complementary nav surfaces:
 *   • Desktop (≥ 768px) — a left rail injected into #app-layout
 *   • Mobile  (< 768px) — a fixed bottom tab bar appended to <body>
 *
 * Responsibilities:
 *   1. Inject nav DOM on init.
 *   2. Highlight the active tab on every ROUTE_CHANGED event.
 *   3. Emit navigateTo() on tap/click.
 *
 * Anti-patterns avoided:
 *   - This module never imports from sibling UI modules (no circular deps).
 *   - It never reads from the store directly — it reacts only to EVENTS.ROUTE_CHANGED.
 *   - DOM injection is idempotent (safe to call initNavMenu() more than once).
 *
 * Icons are rendered via the shared iconSvg() helper using Lucide descriptors
 * (Map, Users, User). Icon calls happen at module-evaluation time; this is safe
 * because iconSvg() is a pure function with no DOM dependency.
 *
 * @module navMenu
 */

import { Bell, Map, Settings, User, Users } from 'lucide';

import { on, EVENTS } from '../core/events.js';
import { getState } from '../core/store.js';
import { navigateTo } from '../core/router.js';
import { iconSvg } from './icons.js';

// ─── Route metadata ──────────────────────────────────────────────────────────

/** @type {Array<{ route: string, label: string, icon: string, id: string }>} */
const _NAV_ITEMS = [
  {
    route: '/',
    label: 'Map',
    id:    'nav-map',
    icon:  iconSvg(Map, 22),
  },
  {
    route: '/group',
    label: 'Squad',
    id:    'nav-group',
    icon:  iconSvg(Users, 22),
  },
  {
    route: '/profile',
    label: 'Profile',
    id:    'nav-profile',
    icon:  iconSvg(User, 22),
  },
  {
    route: '/notifications',
    label: 'Notifications',
    id:    'nav-notifications',
    icon:  iconSvg(Bell, 22),
  },
  {
    route: '/settings',
    label: 'Settings',
    id:    'nav-settings',
    icon:  iconSvg(Settings, 22),
  },
];

// ─── Initialise ──────────────────────────────────────────────────────────────

/**
 * Bootstrap the navigation shell.
 *
 * Call once from main.js, AFTER initRouter() mounts the hashchange listener.
 * The nav reacts to EVENTS.ROUTE_CHANGED to keep active state in sync.
 */
export function initNavMenu() {
  _injectRail();
  _injectBottomBar();

  on(EVENTS.ROUTE_CHANGED, (e) => {
    _syncActiveState(e.detail.route);
  });

  on(EVENTS.AUTH_STATE_CHANGED, (e) => {
    _syncNavVisibility(!!e.detail.user);
  });

  _syncNavVisibility(!!getState().currentUser);
}

// ─── DOM injection ────────────────────────────────────────────────────────────

/**
 * Inject the desktop nav rail before the map container in #app-layout.
 * Idempotent — skips if already present.
 */
function _injectRail() {
  if (document.getElementById('nav-rail')) return;

  const rail = document.createElement('nav');
  rail.id        = 'nav-rail';
  rail.className = 'nav-rail';
  rail.setAttribute('aria-label', 'Main navigation');

  rail.innerHTML = /* html */`
    <div class="nav-rail__list">
      ${_NAV_ITEMS.map(({ route, label, icon, id }) => /* html */`
    <button
      id="${id}-rail"
      class="nav-rail__item"
      data-route="${route}"
      data-tooltip="${label}"
      aria-label="${label}"
      type="button"
    >
      <span class="nav-rail__icon">${icon}</span>
    </button>
      `).join('')}
    </div>
  `;

  // Insert as first child of #app-layout so it occupies the leftmost grid column.
  const layout = document.getElementById('app-layout');
  if (layout) {
    layout.insertBefore(rail, layout.firstChild);
  }

  rail.addEventListener('click', _onNavClick);
}

/**
 * Inject the mobile fixed bottom tab bar into <body>.
 * Idempotent — skips if already present.
 */
function _injectBottomBar() {
  if (document.getElementById('nav-bottom')) return;

  const bar = document.createElement('nav');
  bar.id        = 'nav-bottom';
  bar.className = 'nav-bottom';
  bar.setAttribute('aria-label', 'Main navigation');

  bar.innerHTML = _NAV_ITEMS.map(({ route, label, icon, id }) => /* html */`
    <button
      id="${id}-bottom"
      class="nav-bottom__item"
      data-route="${route}"
      data-tooltip="${label}"
      aria-label="${label}"
      type="button"
    >
      <span class="nav-bottom__icon">${icon}</span>
      <span class="nav-bottom__label">${label}</span>
    </button>
  `).join('');

  document.body.appendChild(bar);
  bar.addEventListener('click', _onNavClick);
}

// ─── Active state ─────────────────────────────────────────────────────────────

/**
 * Update the active CSS class on both rail and bottom bar items.
 *
 * @param {string} route  The current normalised route string (e.g. '/profile').
 */
function _syncActiveState(route) {
  _NAV_ITEMS.forEach(({ id }) => {
    const railBtn   = document.getElementById(`${id}-rail`);
    const bottomBtn = document.getElementById(`${id}-bottom`);

    const isActive = _NAV_ITEMS.find(item => item.id === id)?.route === route;

    railBtn?.classList.toggle('nav-rail__item--active',   isActive);
    bottomBtn?.classList.toggle('nav-bottom__item--active', isActive);

    if (railBtn)   railBtn.setAttribute('aria-current',   isActive ? 'page' : 'false');
    if (bottomBtn) bottomBtn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  // Toggle page-view visibility in the layout.
  _syncPageViews(route);
}

/**
 * Show navigation only when the user is authenticated.
 *
 * @param {boolean} isAuthenticated
 * @returns {void}
 */
function _syncNavVisibility(isAuthenticated) {
  const rail = document.getElementById('nav-rail');
  const bottom = document.getElementById('nav-bottom');

  rail?.toggleAttribute('hidden', !isAuthenticated);
  bottom?.toggleAttribute('hidden', !isAuthenticated);

  if (isAuthenticated) {
    document.body.dataset.nav = 'ready';
    _syncActiveState(getState().currentRoute);
    return;
  }

  delete document.body.dataset.nav;
}

// ─── Page view toggling ───────────────────────────────────────────────────────

/**
 * Show/hide page view containers and the map based on the active route.
 *
 * The map layer (#map-container + #panel) is the Dashboard ('/').
 * Other routes render into dedicated #view-* containers.
 *
 * We use CSS class toggling (never display:none directly from JS on the map)
 * so the Leaflet instance is never destroyed.
 *
 * @param {string} route
 */
function _syncPageViews(route) {
  const mapContainer = document.getElementById('map-container');
  const panel        = document.getElementById('panel');
  const viewProfile  = document.getElementById('view-profile');
  const viewGroup    = document.getElementById('view-group');
  const viewCampus   = document.getElementById('view-campus');
  const viewSpot     = document.getElementById('view-spot');
  const viewSettings = document.getElementById('view-settings');
  const viewContributions = document.getElementById('view-contributions');
  const viewNotifications = document.getElementById('view-notifications');

  const isDashboard = route === '/';

  // Map + panel: only visible on Dashboard.
  mapContainer?.classList.toggle('view--active', isDashboard);
  panel?.classList.toggle('view--active',        isDashboard);

  // Page views: toggle by route.
  viewProfile?.classList.toggle('view--active', route === '/profile');
  viewGroup?.classList.toggle('view--active',   route === '/group');
  viewCampus?.classList.toggle('view--active', route === '/campus');
  viewSpot?.classList.toggle('view--active', route === '/spot');
  viewSettings?.classList.toggle('view--active', route === '/settings');
  viewContributions?.classList.toggle('view--active', route === '/contributions');
  viewNotifications?.classList.toggle('view--active', route === '/notifications');
}

// ─── Click handler ────────────────────────────────────────────────────────────

/**
 * Handle nav item clicks on both rail and bottom bar.
 * Uses event delegation via the parent <nav> element.
 *
 * @param {MouseEvent} e
 */
function _onNavClick(e) {
  const btn = e.target.closest('[data-route]');
  if (!btn) return;
  navigateTo(btn.dataset.route);
}
