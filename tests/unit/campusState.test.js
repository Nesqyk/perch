/**
 * tests/unit/campusState.test.js
 *
 * Unit tests for deriveCampusOverview() in src/state/campusState.js.
 */

import { describe, it, expect } from 'vitest';
import { deriveCampusOverview } from '../../src/state/campusState.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function campus(overrides = {}) {
  return { id: 'campus-1', name: 'State U', short_name: 'SU', city: 'Cityville', ...overrides };
}

function spot(overrides = {}) {
  return {
    id: 'spot-1', campus_id: 'campus-1', name: 'Room A',
    building_id: 'bldg-1', building: 'Library', type: 'library',
    noise_baseline: 'quiet', has_food: false, floor: '2F',
    ...overrides,
  };
}

function building(overrides = {}) {
  return { id: 'bldg-1', campus_id: 'campus-1', name: 'Library', ...overrides };
}

function claim(overrides = {}) {
  return {
    id: 'claim-1', user_id: 'user-1',
    expires_at: '2999-01-01T00:00:00.000Z',
    cancelled_at: null,
    ...overrides,
  };
}

function conf(score, validUntil = null) {
  return { score, validUntil };
}

// ─── deriveCampusOverview ─────────────────────────────────────────────────────

describe('deriveCampusOverview', () => {
  it('returns zero counts for a campus with no spots or buildings', () => {
    const result = deriveCampusOverview(campus(), [], [], {}, {});
    expect(result).toMatchObject({
      spotCount: 0,
      buildingCount: 0,
      liveClaimCount: 0,
      freeCount: 0,
      claimedCount: 0,
      maybeCount: 0,
      fullCount: 0,
      topBuildings: [],
    });
    expect(result.categories).toHaveLength(4);
  });

  it('counts only spots and buildings belonging to the given campus', () => {
    const s1 = spot({ id: 's1', building_id: 'b1', building: 'Library' });
    const s2 = spot({ id: 's2', building_id: 'b2', building: 'Engineering', campus_id: 'campus-2' });
    const b1 = building({ id: 'b1', name: 'Library' });
    const b2 = building({ id: 'b2', name: 'Engineering', campus_id: 'campus-2' });
    const result = deriveCampusOverview(campus(), [s1, s2], [b1, b2], {}, {});
    expect(result.spotCount).toBe(1);
    expect(result.buildingCount).toBe(1);
  });

  // ── Status classification ─────────────────────────────────────────────

  it('classifies a spot as free when score >= 0.65 and no claims', () => {
    const s = spot({ id: 's1' });
    const result = deriveCampusOverview(campus(), [s], [building()], {}, { s1: conf(0.8) });
    expect(result.freeCount).toBe(1);
    expect(result.claimedCount).toBe(0);
    expect(result.maybeCount).toBe(0);
    expect(result.fullCount).toBe(0);
  });

  it('classifies a spot as claimed when active claims exist', () => {
    const s = spot({ id: 's1' });
    const result = deriveCampusOverview(campus(), [s], [building()], { s1: [claim()] }, { s1: conf(0.8) });
    expect(result.claimedCount).toBe(1);
  });

  it('classifies a spot as maybe when score is between 0.15 and 0.65', () => {
    const s = spot({ id: 's1' });
    const result = deriveCampusOverview(campus(), [s], [building()], {}, { s1: conf(0.4) });
    expect(result.maybeCount).toBe(1);
  });

  it('classifies a spot as full when score <= 0.15', () => {
    const s = spot({ id: 's1' });
    const result = deriveCampusOverview(campus(), [s], [building()], {}, { s1: conf(0.1) });
    expect(result.fullCount).toBe(1);
  });

  it('full status takes priority over active claims', () => {
    const s = spot({ id: 's1' });
    const result = deriveCampusOverview(campus(), [s], [building()], { s1: [claim()] }, { s1: conf(0.05) });
    expect(result.fullCount).toBe(1);
    expect(result.claimedCount).toBe(0);
  });

  it('uses effective score of 0.5 when no confidence data exists', () => {
    const s = spot({ id: 's1' });
    const result = deriveCampusOverview(campus(), [s], [building()], {}, {});
    expect(result.maybeCount).toBe(1);
  });

  it('ignores expired confidence (validUntil in the past)', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const s = spot({ id: 's1' });
    const result = deriveCampusOverview(campus(), [s], [building()], {}, { s1: conf(0.9, past) });
    expect(result.maybeCount).toBe(1);
  });

  it('uses valid confidence when validUntil is in the future', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const s = spot({ id: 's1' });
    const result = deriveCampusOverview(campus(), [s], [building()], {}, { s1: conf(0.9, future) });
    expect(result.freeCount).toBe(1);
  });

  // ── Claim counting ────────────────────────────────────────────────────

  it('counts active claims on campus spots', () => {
    const s1 = spot({ id: 's1', building_id: 'b1' });
    const s2 = spot({ id: 's2', building_id: 'b1' });
    const claims = {
      s1: [claim({ id: 'c1' }), claim({ id: 'c2' })],
      s2: [claim({ id: 'c3' })],
    };
    const result = deriveCampusOverview(campus(), [s1, s2], [building({ id: 'b1' })], claims, {});
    expect(result.liveClaimCount).toBe(3);
  });

  it('ignores expired claims', () => {
    const s = spot({ id: 's1' });
    const claims = {
      s1: [claim({ expires_at: '2000-01-01T00:00:00.000Z' })],
    };
    const result = deriveCampusOverview(campus(), [s], [building()], claims, {});
    expect(result.liveClaimCount).toBe(0);
  });

  it('ignores cancelled claims', () => {
    const s = spot({ id: 's1' });
    const claims = {
      s1: [claim({ cancelled_at: '2024-01-01T00:00:00.000Z' })],
    };
    const result = deriveCampusOverview(campus(), [s], [building()], claims, {});
    expect(result.liveClaimCount).toBe(0);
  });

  // ── Top buildings ─────────────────────────────────────────────────────

  it('sorts topBuildings by liveClaims desc, then roomCount desc, then name asc', () => {
    const spots = [
      spot({ id: 's1', building_id: 'b1', building: 'Library' }),
      spot({ id: 's2', building_id: 'b2', building: 'Engineering' }),
      spot({ id: 's3', building_id: 'b2', building: 'Engineering' }),
      spot({ id: 's4', building_id: 'b3', building: 'Science' }),
      spot({ id: 's5', building_id: 'b3', building: 'Science' }),
      spot({ id: 's6', building_id: 'b3', building: 'Science' }),
    ];
    const buildings = [
      building({ id: 'b1', name: 'Library' }),
      building({ id: 'b2', name: 'Engineering' }),
      building({ id: 'b3', name: 'Science' }),
    ];
    const claims = { s1: [claim({ id: 'c1' })] };

    const result = deriveCampusOverview(campus(), spots, buildings, claims, {
      s1: conf(0.8), s2: conf(0.8), s3: conf(0.8),
      s4: conf(0.8), s5: conf(0.8), s6: conf(0.8),
    });
    expect(result.topBuildings[0].name).toBe('Library');
    expect(result.topBuildings[1].name).toBe('Science');
    expect(result.topBuildings[2].name).toBe('Engineering');
  });

  it('limits topBuildings to at most 6 entries', () => {
    const spots = Array.from({ length: 8 }, (_, i) =>
      spot({ id: `s${i}`, building_id: `b${i}`, building: `Bldg ${i}` }),
    );
    const buildings = Array.from({ length: 8 }, (_, i) =>
      building({ id: `b${i}`, name: `Bldg ${i}` }),
    );
    const result = deriveCampusOverview(campus(), spots, buildings, {}, {});
    expect(result.topBuildings).toHaveLength(6);
  });

  // ── Building name fallback ────────────────────────────────────────────

  it('matches spots to buildings by name when building_id is null', () => {
    const b = building({ id: 'b1', name: 'Main Library' });
    const s = spot({ id: 's1', building_id: null, building: 'Main Library' });
    const result = deriveCampusOverview(campus(), [s], [b], {}, { s1: conf(0.8) });
    expect(result.topBuildings).toHaveLength(1);
    expect(result.topBuildings[0].roomCount).toBe(1);
  });

  // ── Categories ────────────────────────────────────────────────────────

  it('categorizes libraries', () => {
    const s = spot({ id: 's1', name: 'Study Room', building: 'Library' });
    const b = building({ name: 'Library' });
    const result = deriveCampusOverview(campus(), [s], [b], {}, {});
    const lib = result.categories.find((c) => c.key === 'libraries');
    expect(lib.count).toBeGreaterThanOrEqual(1);
    expect(lib.tone).toBe('good');
  });

  it('categorizes cafes via has_food or name match', () => {
    const s = spot({ id: 's1', name: 'Corner Table', building: 'Cafe', has_food: true });
    const result = deriveCampusOverview(campus(), [s], [], {}, {});
    const cafe = result.categories.find((c) => c.key === 'cafes');
    expect(cafe.count).toBeGreaterThanOrEqual(1);
    expect(cafe.tone).toBe('warm');
  });

  it('categorizes quiet spots by noise_baseline', () => {
    const s = spot({ id: 's1', noise_baseline: 'quiet' });
    const result = deriveCampusOverview(campus(), [s], [], {}, {});
    const quiet = result.categories.find((c) => c.key === 'quiet');
    expect(quiet.count).toBeGreaterThanOrEqual(1);
    expect(quiet.tone).toBe('cool');
  });

  it('categorizes open study by type or name', () => {
    const s = spot({ id: 's1', name: 'Open Lounge', type: 'lounge' });
    const result = deriveCampusOverview(campus(), [s], [], {}, {});
    const open = result.categories.find((c) => c.key === 'open-study');
    expect(open.count).toBeGreaterThanOrEqual(1);
    expect(open.tone).toBe('neutral');
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  it('handles null campus gracefully', () => {
    const result = deriveCampusOverview(null, [spot()], [building()], {}, {});
    expect(result.spotCount).toBe(0);
    expect(result.buildingCount).toBe(0);
  });

  it('handles null/undefined spots and buildings', () => {
    const result = deriveCampusOverview(campus(), null, null, {}, {});
    expect(result.spotCount).toBe(0);
    expect(result.buildingCount).toBe(0);
  });

  it('handles null/undefined claims and confidence', () => {
    const result = deriveCampusOverview(campus(), [spot()], [building()], null, null);
    expect(result.spotCount).toBe(1);
    expect(result.maybeCount).toBe(1);
  });
});
