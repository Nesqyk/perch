/**
 * tests/unit/dashboardShellState.test.js
 *
 * Unit tests for pure dashboard shell route metadata helpers.
 */

import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_ROUTES,
  getRouteLayoutMode,
  getShellNavRoutes,
  getShellRoute,
} from '../../src/state/dashboardShellState.js';

describe('dashboardShellState', () => {
  it('defines shell metadata for all current hash routes', () => {
    expect(DASHBOARD_ROUTES.map((item) => item.route)).toEqual([
      '/',
      '/group',
      '/profile',
      '/notifications',
      '/settings',
      '/contributions',
      '/campus',
      '/spot',
      '/landing',
    ]);
  });

  it('returns map layout for the map route and page layouts for route pages', () => {
    expect(getRouteLayoutMode('/')).toBe('map');
    expect(getRouteLayoutMode('/group')).toBe('workspace');
    expect(getRouteLayoutMode('/spot')).toBe('immersive');
    expect(getRouteLayoutMode('/landing')).toBe('immersive');
  });

  it('falls back to the map route for unknown routes', () => {
    expect(getShellRoute('/unknown')).toEqual(getShellRoute('/'));
  });

  it('returns only nav-visible routes for the shell nav', () => {
    expect(getShellNavRoutes().map((item) => item.route)).toEqual([
      '/',
      '/group',
      '/profile',
      '/notifications',
      '/settings',
    ]);
  });
});
