/**
 * src/state/dashboardShellState.js
 *
 * Pure route metadata helpers for the dashboard shell.
 */

export const DASHBOARD_ROUTES = Object.freeze([
  { route: '/', label: 'Map', nav: true, authRequired: false, layout: 'map' },
  { route: '/group', label: 'Squad', nav: true, authRequired: true, layout: 'workspace' },
  { route: '/profile', label: 'Profile', nav: true, authRequired: true, layout: 'workspace' },
  { route: '/notifications', label: 'Notifications', nav: true, authRequired: true, layout: 'workspace' },
  { route: '/settings', label: 'Settings', nav: true, authRequired: true, layout: 'workspace' },
  { route: '/contributions', label: 'Contributions', nav: false, authRequired: true, layout: 'workspace' },
  { route: '/campus', label: 'Campus', nav: false, authRequired: false, layout: 'immersive' },
  { route: '/spot', label: 'Spot', nav: false, authRequired: false, layout: 'immersive' },
]);

/**
 * Return metadata for a route, falling back to the map route.
 *
 * @param {string} route
 * @returns {{ route: string, label: string, nav: boolean, authRequired: boolean, layout: string }}
 */
export function getShellRoute(route) {
  return DASHBOARD_ROUTES.find((item) => item.route === route) ?? DASHBOARD_ROUTES[0];
}

/**
 * Return the dashboard shell layout mode for a route.
 *
 * @param {string} route
 * @returns {string}
 */
export function getRouteLayoutMode(route) {
  return getShellRoute(route).layout;
}

/**
 * Return nav-visible route metadata.
 *
 * @returns {Array<{ route: string, label: string, nav: boolean, authRequired: boolean, layout: string }>}
 */
export function getShellNavRoutes() {
  return DASHBOARD_ROUTES.filter((item) => item.nav);
}
