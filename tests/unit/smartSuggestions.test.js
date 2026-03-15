/**
 * tests/unit/smartSuggestions.test.js
 *
 * Unit tests for the exported _rankSpots function in
 * src/features/smartSuggestions.js
 *
 * _rankSpots is a pure ranking function — no DOM, no network, no store.
 * We mock supabaseClient so the module can be imported without env vars.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock supabaseClient before any other import that might pull it in.
vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => ({ on: vi.fn(), subscribe: vi.fn() })),
  },
}));

// Also mock spots.js since we don't need real DB calls.
vi.mock('../../src/api/spots.js', () => ({
  fetchScheduleForSpot: vi.fn().mockResolvedValue([]),
}));

// Mock events + store since smartSuggestions wires up event listeners.
vi.mock('../../src/core/events.js', () => ({
  on: vi.fn(),
  EVENTS: {
    UI_FILTER_SUBMITTED: 'UI_FILTER_SUBMITTED',
    SPOT_SELECTED: 'SPOT_SELECTED',
  },
}));

vi.mock('../../src/core/store.js', () => ({
  getState: vi.fn(() => ({ spots: [], confidence: {} })),
}));

import { _rankSpots } from '../../src/features/smartSuggestions.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

let _spotCounter = 0;
function spot(overrides = {}) {
  return {
    id: 'spot-' + (++_spotCounter),
    on_campus: true,
    rough_capacity: 'medium',  // 20 people max
    has_outlets: true,
    has_food: false,
    wifi_strength: 'good',
    noise_baseline: 'moderate',
    building: null,
    walk_time_min: 0,
    ...overrides,
  };
}

function conf(score, validUntil = null) {
  return { score, validUntil };
}

const noFilters = { groupSize: null, needs: [], nearBuilding: null };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('_rankSpots — no filters', () => {
  it('returns all spots when filters are empty', () => {
    const spots = [spot(), spot(), spot()];
    const result = _rankSpots(spots, {}, noFilters);
    expect(result).toHaveLength(3);
  });

  it('sorts by confidence score descending', () => {
    const a = spot({ id: 'a' });
    const b = spot({ id: 'b' });
    const c = spot({ id: 'c' });
    const confidence = {
      [a.id]: conf(0.9),
      [b.id]: conf(0.3),
      [c.id]: conf(0.6),
    };
    const result = _rankSpots([a, b, c], confidence, noFilters);
    expect(result.map(s => s.id)).toEqual(['a', 'c', 'b']);
  });

  it('puts on-campus spots before off-campus at equal scores', () => {
    const onCampus  = spot({ id: 'on',  on_campus: true,  walk_time_min: 0 });
    const offCampus = spot({ id: 'off', on_campus: false, walk_time_min: 0 });
    const confidence = {
      [onCampus.id]:  conf(0.7),
      [offCampus.id]: conf(0.7),
    };
    const result = _rankSpots([offCampus, onCampus], confidence, noFilters);
    expect(result[0].id).toBe('on');
  });
});

describe('_rankSpots — needs filters', () => {
  it('excludes spots without outlets when outlet filter active', () => {
    const withOutlet    = spot({ id: 'w-out', has_outlets: true });
    const withoutOutlet = spot({ id: 'x-out', has_outlets: false });
    const result = _rankSpots(
      [withOutlet, withoutOutlet],
      {},
      { ...noFilters, needs: ['outlet'] }
    );
    expect(result.map(s => s.id)).toEqual(['w-out']);
  });

  it('excludes no-wifi spots when wifi filter active', () => {
    const goodWifi = spot({ id: 'g-wifi', wifi_strength: 'good' });
    const noWifi   = spot({ id: 'n-wifi', wifi_strength: 'none' });
    const result = _rankSpots(
      [goodWifi, noWifi],
      {},
      { ...noFilters, needs: ['wifi'] }
    );
    expect(result.map(s => s.id)).toEqual(['g-wifi']);
  });

  it('excludes loud spots when quiet filter active', () => {
    const quiet = spot({ id: 'q-noise', noise_baseline: 'quiet' });
    const loud  = spot({ id: 'l-noise', noise_baseline: 'loud' });
    const result = _rankSpots(
      [quiet, loud],
      {},
      { ...noFilters, needs: ['quiet'] }
    );
    expect(result.map(s => s.id)).toEqual(['q-noise']);
  });

  it('excludes spots without food when food filter active', () => {
    const withFood    = spot({ id: 'f-food',  has_food: true });
    const withoutFood = spot({ id: 'nf-food', has_food: false });
    const result = _rankSpots(
      [withFood, withoutFood],
      {},
      { ...noFilters, needs: ['food'] }
    );
    expect(result.map(s => s.id)).toEqual(['f-food']);
  });
});

describe('_rankSpots — groupSize filter', () => {
  it('excludes spots with insufficient capacity for large groups', () => {
    const bigSpot   = spot({ id: 'cap-big',   rough_capacity: 'large' });
    const smallSpot = spot({ id: 'cap-small', rough_capacity: 'small' });
    const result = _rankSpots(
      [bigSpot, smallSpot],
      {},
      { ...noFilters, groupSize: 'large' }
    );
    expect(result.map(s => s.id)).toEqual(['cap-big']);
  });

  it('includes small-capacity spots for solo groupSize', () => {
    const s = spot({ rough_capacity: 'small' });
    const result = _rankSpots([s], {}, { ...noFilters, groupSize: 'solo' });
    expect(result).toHaveLength(1);
  });
});

describe('_rankSpots — nearBuilding filter', () => {
  it('filters on-campus spots by building (case-insensitive)', () => {
    const engineering = spot({ id: 'bldg-eng', on_campus: true, building: 'Engineering' });
    const library     = spot({ id: 'bldg-lib', on_campus: true, building: 'Library' });
    const result = _rankSpots(
      [engineering, library],
      {},
      { ...noFilters, nearBuilding: 'engineering' }
    );
    expect(result.map(s => s.id)).toEqual(['bldg-eng']);
  });

  it('does not filter off-campus spots by building', () => {
    const offCampus = spot({ id: 'bldg-off', on_campus: false, building: null });
    const result = _rankSpots(
      [offCampus],
      {},
      { ...noFilters, nearBuilding: 'engineering' }
    );
    expect(result).toHaveLength(1);
  });
});

describe('_rankSpots — distance-based ranking', () => {
  it('prioritizes closer spots when userLocation is provided', () => {
    // a is far, b is near
    const a = spot({ id: 'far', lat: 10.3, lng: 123.9 });
    const b = spot({ id: 'near', lat: 10.2936, lng: 123.8809 });
    const userLocation = { lat: 10.2935, lng: 123.8808 };
    
    const result = _rankSpots([a, b], {}, { ...noFilters, userLocation });
    expect(result[0].id).toBe('near');
  });

  it('still respects confidence scores alongside distance', () => {
    // near has low confidence, far has high confidence
    const near = spot({ id: 'near', lat: 10.2936, lng: 123.8809 });
    const far  = spot({ id: 'far',  lat: 10.296,  lng: 123.883  }); // ~350m away
    const userLocation = { lat: 10.2935, lng: 123.8808 };
    
    const confidence = {
      [near.id]: conf(0.1),
      [far.id]:  conf(0.9),
    };
    
    const result = _rankSpots([near, far], confidence, { ...noFilters, userLocation });
    expect(result[0].id).toBe('far');
  });
});

describe('_rankSpots — viewMode context', () => {
  it('prioritizes on-campus spots in campus mode even if far', () => {
    const onCampusFar = spot({ id: 'on-far', on_campus: true,  lat: 10.4, lng: 124.0 });
    const offCampusNear = spot({ id: 'off-near', on_campus: false, lat: 10.2936, lng: 123.8809 });
    const userLocation = { lat: 10.2935, lng: 123.8808 };
    
    const result = _rankSpots([onCampusFar, offCampusNear], {}, { ...noFilters, userLocation, viewMode: 'campus' });
    expect(result[0].id).toBe('on-far');
  });

  it('prioritizes nearest spots in city mode regardless of campus status', () => {
    const onCampusFar = spot({ id: 'on-far', on_campus: true,  lat: 10.4, lng: 124.0 });
    const offCampusNear = spot({ id: 'off-near', on_campus: false, lat: 10.2936, lng: 123.8809 });
    const userLocation = { lat: 10.2935, lng: 123.8808 };
    
    const result = _rankSpots([onCampusFar, offCampusNear], {}, { ...noFilters, userLocation, viewMode: 'city' });
    expect(result[0].id).toBe('off-near');
  });
});
