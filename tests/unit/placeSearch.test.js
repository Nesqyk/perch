/**
 * tests/unit/placeSearch.test.js
 *
 * Unit tests for local map place search ranking.
 */

import { describe, expect, it } from 'vitest';

import { hasStrongLocalPlaceMatch, searchLocalPlaces } from '../../src/utils/placeSearch.js';

function spot(overrides = {}) {
  return {
    id: 'spot-1',
    name: 'Engineering Building Corridor',
    building: 'Engineering Building',
    floor: '2F',
    lat: 10.1,
    lng: 123.1,
    area: { barangay: 'Tinago', city_municipality: 'Cebu City' },
    ...overrides,
  };
}

function building(overrides = {}) {
  return {
    id: 'building-1',
    name: 'Engineering Building',
    lat: 10.2,
    lng: 123.2,
    ...overrides,
  };
}

function area(overrides = {}) {
  return {
    id: 'area-1',
    sitio: 'Purok 1',
    barangay: 'Tinago',
    city_municipality: 'Cebu City',
    lat: 10.3,
    lng: 123.3,
    ...overrides,
  };
}

describe('placeSearch', () => {
  it('ranks exact spot matches above building and area matches', () => {
    const results = searchLocalPlaces('Engineering Building Corridor', {
      spots: [spot()],
      buildings: [building()],
      areas: [area()],
    });

    expect(results[0]).toMatchObject({
      kind: 'spot',
      id: 'spot-1',
      score: 120,
    });
    expect(hasStrongLocalPlaceMatch(results)).toBe(true);
  });

  it('finds buildings and areas from loaded map data', () => {
    const results = searchLocalPlaces('tinago', {
      spots: [],
      buildings: [building()],
      areas: [area()],
    });

    expect(results[0]).toMatchObject({
      kind: 'area',
      id: 'area-1',
    });
  });

  it('does not search short queries', () => {
    expect(searchLocalPlaces('e', {
      spots: [spot()],
      buildings: [building()],
      areas: [area()],
    })).toEqual([]);
  });
});
