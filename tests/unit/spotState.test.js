/**
 * tests/unit/spotState.test.js
 *
 * Unit tests for campusStats() in src/state/spotState.js.
 * The other exports (deriveSpotStatus, deriveRemainingCapacity) read from
 * the store via getState() and are exercised indirectly by integration paths;
 * campusStats() is purely functional and fully testable here.
 */

import { describe, it, expect } from 'vitest';
import { campusStats } from '../../src/state/spotState.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function campus(overrides = {}) {
  return { id: 'campus-1', name: 'State U', ...overrides };
}

function spot(overrides = {}) {
  return { id: 'spot-1', campus_id: 'campus-1', ...overrides };
}

function claim(overrides = {}) {
  return {
    id:          'claim-1',
    user_id:     'user-1',
    expires_at:  '2999-01-01T00:00:00.000Z',
    cancelled_at: null,
    ...overrides,
  };
}

// ─── campusStats ─────────────────────────────────────────────────────────────

describe('campusStats', () => {
  it('returns zero counts for a campus with no spots', () => {
    const result = campusStats([campus()], [], {});
    expect(result.get('campus-1')).toEqual({
      spotCount:          0,
      liveClaimCount:     0,
      liveClaimantCount:  0,
    });
  });

  it('counts spots correctly', () => {
    const spots = [
      spot({ id: 'spot-1' }),
      spot({ id: 'spot-2' }),
      spot({ id: 'spot-3', campus_id: 'campus-2' }), // different campus
    ];
    const result = campusStats([campus(), campus({ id: 'campus-2', name: 'Other U' })], spots, {});
    expect(result.get('campus-1').spotCount).toBe(2);
    expect(result.get('campus-2').spotCount).toBe(1);
  });

  it('counts live claims per campus', () => {
    const spots = [spot({ id: 'spot-1' }), spot({ id: 'spot-2' })];
    const claims = {
      'spot-1': [claim({ id: 'c1', user_id: 'u1' }), claim({ id: 'c2', user_id: 'u2' })],
      'spot-2': [claim({ id: 'c3', user_id: 'u3' })],
    };
    const result = campusStats([campus()], spots, claims);
    expect(result.get('campus-1').liveClaimCount).toBe(3);
  });

  it('counts unique claimants, not total claims', () => {
    const spots = [spot({ id: 'spot-1' }), spot({ id: 'spot-2' })];
    // Same user claims two different spots on the same campus.
    const claims = {
      'spot-1': [claim({ id: 'c1', user_id: 'u1' })],
      'spot-2': [claim({ id: 'c2', user_id: 'u1' })],
    };
    const result = campusStats([campus()], spots, claims);
    expect(result.get('campus-1').liveClaimantCount).toBe(1);
    expect(result.get('campus-1').liveClaimCount).toBe(2);
  });

  it('ignores expired claims', () => {
    const spots = [spot()];
    const claims = {
      'spot-1': [
        claim({ id: 'c1', user_id: 'u1', expires_at: '2000-01-01T00:00:00.000Z' }),
      ],
    };
    const result = campusStats([campus()], spots, claims);
    expect(result.get('campus-1').liveClaimCount).toBe(0);
    expect(result.get('campus-1').liveClaimantCount).toBe(0);
  });

  it('ignores cancelled claims', () => {
    const spots = [spot()];
    const claims = {
      'spot-1': [
        claim({ id: 'c1', user_id: 'u1', cancelled_at: '2024-01-01T00:00:00.000Z' }),
      ],
    };
    const result = campusStats([campus()], spots, claims);
    expect(result.get('campus-1').liveClaimCount).toBe(0);
  });

  it('ignores spots that have no campus_id', () => {
    const spots = [spot({ campus_id: null })];
    const result = campusStats([campus()], spots, {});
    expect(result.get('campus-1').spotCount).toBe(0);
  });

  it('ignores spots whose campus_id is not in the campuses list', () => {
    const spots = [spot({ campus_id: 'unknown-campus' })];
    const result = campusStats([campus()], spots, {});
    expect(result.get('campus-1').spotCount).toBe(0);
  });

  it('returns an entry for every campus even with no matching spots', () => {
    const campusList = [campus({ id: 'c1' }), campus({ id: 'c2' }), campus({ id: 'c3' })];
    const result = campusStats(campusList, [], {});
    expect(result.size).toBe(3);
    expect(result.get('c2')).toBeDefined();
  });

  it('handles claims with no user_id without throwing', () => {
    const spots = [spot()];
    const claims = {
      'spot-1': [claim({ user_id: null })],
    };
    const result = campusStats([campus()], spots, claims);
    expect(result.get('campus-1').liveClaimantCount).toBe(0);
    expect(result.get('campus-1').liveClaimCount).toBe(1);
  });
});
