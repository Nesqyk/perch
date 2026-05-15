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

function conf(score, validUntil = null, updatedAt = null) {
  return { score, validUntil, updatedAt };
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

  it('uses 0.4 as the default score when no confidence data exists', () => {
    const s = spot({ id: 'no-conf', on_campus: false, walk_time_min: 0 });
    const result = _rankSpots([s], {}, { ...noFilters, viewMode: 'city' });
    expect(result[0]._score).toBeCloseTo(0.4, 5);
  });
});

describe('_rankSpots — campus mode pre-filter', () => {
  it('excludes off-campus spots entirely in campus mode', () => {
    const onCampus  = spot({ id: 'on',  on_campus: true });
    const offCampus = spot({ id: 'off', on_campus: false });
    const result = _rankSpots([onCampus, offCampus], {}, { ...noFilters, viewMode: 'campus' });
    expect(result.map(s => s.id)).toEqual(['on']);
  });

  it('includes both on-campus and off-campus spots in city mode', () => {
    const onCampus  = spot({ id: 'on',  on_campus: true });
    const offCampus = spot({ id: 'off', on_campus: false });
    const result = _rankSpots([onCampus, offCampus], {}, { ...noFilters, viewMode: 'city' });
    expect(result).toHaveLength(2);
  });

  it('defaults to campus mode when viewMode is not provided', () => {
    const onCampus  = spot({ id: 'on',  on_campus: true });
    const offCampus = spot({ id: 'off', on_campus: false });
    const result = _rankSpots([onCampus, offCampus], {}, noFilters);
    expect(result.map(s => s.id)).toEqual(['on']);
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

  it('does not filter off-campus spots by building (in city mode)', () => {
    const offCampus = spot({ id: 'bldg-off', on_campus: false, building: null });
    const result = _rankSpots(
      [offCampus],
      {},
      { ...noFilters, nearBuilding: 'engineering', viewMode: 'city' }
    );
    expect(result).toHaveLength(1);
  });
});

describe('_rankSpots — distance-based ranking', () => {
  it('prioritizes closer spots when userLocation is provided', () => {
    // a is far, b is near — both on-campus with equal (default) confidence
    const a = spot({ id: 'far',  on_campus: true, lat: 10.3,    lng: 123.9 });
    const b = spot({ id: 'near', on_campus: true, lat: 10.2936, lng: 123.8809 });
    const userLocation = { lat: 10.2935, lng: 123.8808 };

    const result = _rankSpots([a, b], {}, { ...noFilters, userLocation });
    expect(result[0].id).toBe('near');
  });

  it('quality beats proximity: high-confidence far spot beats low-confidence near spot', () => {
    // near has very low confidence, far has high confidence (~350m away)
    const near = spot({ id: 'near', on_campus: true, lat: 10.2936, lng: 123.8809 });
    const far  = spot({ id: 'far',  on_campus: true, lat: 10.296,  lng: 123.883  });
    const userLocation = { lat: 10.2935, lng: 123.8808 };

    const confidence = {
      [near.id]: conf(0.1),
      [far.id]:  conf(0.9),
    };

    // far: 0.9 × ~0.895 ≈ 0.806; near: 0.1 × ~0.999 ≈ 0.1 — far wins
    const result = _rankSpots([near, far], confidence, { ...noFilters, userLocation });
    expect(result[0].id).toBe('far');
  });

  it('applies a proximity multiplier not a subtracted penalty (far spot score stays above 0)', () => {
    // A spot 20 minutes walk away should still have a positive score (floor 0.5×)
    // Old code: 0.4 - (0.05 × 20) = -0.6 → clamped to 0. New code: 0.4 × 0.5 = 0.2.
    const farSpot = spot({ id: 'very-far', on_campus: false, lat: 10.5, lng: 124.5 });
    const userLocation = { lat: 10.2935, lng: 123.8808 };

    const result = _rankSpots([farSpot], {}, { ...noFilters, userLocation, viewMode: 'city' });
    expect(result[0]._score).toBeGreaterThan(0);
  });
});

describe('_rankSpots — viewMode context', () => {
  it('in campus mode, off-campus spots are excluded from results', () => {
    const onCampusNear  = spot({ id: 'on-near',  on_campus: true,  lat: 10.2936, lng: 123.8809 });
    const offCampusNear = spot({ id: 'off-near', on_campus: false, lat: 10.2937, lng: 123.8810 });
    const userLocation  = { lat: 10.2935, lng: 123.8808 };

    const result = _rankSpots([offCampusNear, onCampusNear], {}, { ...noFilters, userLocation, viewMode: 'campus' });
    expect(result.map(s => s.id)).toEqual(['on-near']);
  });

  it('in city mode, higher-confidence off-campus beats lower-confidence on-campus', () => {
    const onCampus  = spot({ id: 'on',  on_campus: true,  walk_time_min: 0 });
    const offCampus = spot({ id: 'off', on_campus: false, walk_time_min: 0 });
    const confidence = {
      [onCampus.id]:  conf(0.3),
      [offCampus.id]: conf(0.9),
    };
    // No campus bonus exists anymore — off-campus 0.9 simply beats on-campus 0.3
    const result = _rankSpots([onCampus, offCampus], confidence, { ...noFilters, viewMode: 'city' });
    expect(result[0].id).toBe('off');
  });

  it('prioritizes nearest spots in city mode regardless of campus status', () => {
    const onCampusFar   = spot({ id: 'on-far',   on_campus: true,  lat: 10.4,    lng: 124.0 });
    const offCampusNear = spot({ id: 'off-near', on_campus: false, lat: 10.2936, lng: 123.8809 });
    const userLocation  = { lat: 10.2935, lng: 123.8808 };

    const result = _rankSpots([onCampusFar, offCampusNear], {}, { ...noFilters, userLocation, viewMode: 'city' });
    expect(result[0].id).toBe('off-near');
  });

  it('does not apply campus bonus in city mode (no such bonus exists)', () => {
    const onCampus  = spot({ id: 'on',  on_campus: true,  walk_time_min: 0 });
    const offCampus = spot({ id: 'off', on_campus: false, walk_time_min: 0 });
    const confidence = {
      [onCampus.id]:  conf(0.7),
      [offCampus.id]: conf(0.9),
    };
    const result = _rankSpots([onCampus, offCampus], confidence, { ...noFilters, viewMode: 'city' });
    expect(result[0].id).toBe('off');
  });
});

describe('_rankSpots — recency bonus', () => {
  it('raises effective score for confidence updated within 15 minutes', () => {
    const recent = spot({ id: 'recent', on_campus: false, walk_time_min: 0 });
    const stale  = spot({ id: 'stale',  on_campus: false, walk_time_min: 0 });

    const recentUpdatedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();  // 5 min ago
    const staleUpdatedAt  = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago

    const confidence = {
      [recent.id]: conf(0.5, null, recentUpdatedAt),
      [stale.id]:  conf(0.5, null, staleUpdatedAt),
    };

    // In city mode the only difference is the recency bonus
    const result = _rankSpots([stale, recent], confidence, { ...noFilters, viewMode: 'city' });
    expect(result[0].id).toBe('recent');
  });

  it('does not apply recency bonus when updatedAt is older than 15 minutes', () => {
    const a = spot({ id: 'a', on_campus: false, walk_time_min: 0 });
    const b = spot({ id: 'b', on_campus: false, walk_time_min: 0 });

    const oldUpdatedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const confidence = {
      [a.id]: conf(0.8, null, oldUpdatedAt),
      [b.id]: conf(0.9),
    };

    const result = _rankSpots([a, b], confidence, { ...noFilters, viewMode: 'city' });
    expect(result[0].id).toBe('b');
  });

  it('caps availability score at 1.0 after recency bonus', () => {
    const s = spot({ id: 's', on_campus: false, walk_time_min: 0 });
    const recentUpdatedAt = new Date(Date.now() - 1 * 60 * 1000).toISOString(); // 1 min ago
    const confidence = { [s.id]: conf(1.0, null, recentUpdatedAt) };

    const result = _rankSpots([s], confidence, { ...noFilters, viewMode: 'city' });
    // Score = min(1.0, 1.0 + 0.08) × 1.0 = 1.0
    expect(result[0]._score).toBeCloseTo(1.0, 5);
  });
});

describe('_rankSpots — _isBusy flag', () => {
  it('annotates _isBusy: true when effective score is below 0.25', () => {
    // conf(0.1) × 1.0 multiplier = 0.1 < 0.25 → busy
    const busySpot = spot({ id: 'busy', on_campus: false, walk_time_min: 0 });
    const confidence = { [busySpot.id]: conf(0.1) };

    const result = _rankSpots([busySpot], confidence, { ...noFilters, viewMode: 'city' });
    expect(result[0]._isBusy).toBe(true);
  });

  it('does not set _isBusy: true when score is 0.25 or above', () => {
    // conf(0.5) × 1.0 = 0.5 ≥ 0.25 → not busy
    const okSpot = spot({ id: 'ok', on_campus: false, walk_time_min: 0 });
    const confidence = { [okSpot.id]: conf(0.5) };

    const result = _rankSpots([okSpot], confidence, { ...noFilters, viewMode: 'city' });
    expect(result[0]._isBusy).toBe(false);
  });

  it('still includes busy spots in the results (not excluded)', () => {
    const busySpot = spot({ id: 'busy', on_campus: false, walk_time_min: 0 });
    const goodSpot = spot({ id: 'good', on_campus: false, walk_time_min: 0 });
    const confidence = {
      [busySpot.id]: conf(0.05),
      [goodSpot.id]: conf(0.8),
    };

    const result = _rankSpots([busySpot, goodSpot], confidence, { ...noFilters, viewMode: 'city' });
    expect(result).toHaveLength(2);
    expect(result.find(s => s.id === 'busy')?._isBusy).toBe(true);
  });

  it('_isBusy triggers at the 0.25 boundary correctly', () => {
    // A spot with conf(0.25) and no walk penalty → score = 0.25, not busy
    const borderSpot = spot({ id: 'border', on_campus: false, walk_time_min: 0 });
    const confidence = { [borderSpot.id]: conf(0.25) };

    const result = _rankSpots([borderSpot], confidence, { ...noFilters, viewMode: 'city' });
    expect(result[0]._isBusy).toBe(false);

    // conf(0.24) → score = 0.24, is busy
    const justBelowSpot = spot({ id: 'just-below', on_campus: false, walk_time_min: 0 });
    const confidence2 = { [justBelowSpot.id]: conf(0.24) };
    const result2 = _rankSpots([justBelowSpot], confidence2, { ...noFilters, viewMode: 'city' });
    expect(result2[0]._isBusy).toBe(true);
  });
});
