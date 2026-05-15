/**
 * tests/unit/profileState.test.js
 *
 * Unit tests for pure profile dashboard derivation helpers.
 */

import { describe, expect, it } from 'vitest';

import { composeProfileActivity, deriveProfileStats, profileSubtitle } from '../../src/state/profileState.js';

function claim(overrides = {}) {
  return {
    id: 'claim-1',
    claimed_at: '2026-05-13T09:00:00.000Z',
    cancelled_at: null,
    spots: { name: 'Library 3F', building: 'Main Library' },
    ...overrides,
  };
}

function submission(overrides = {}) {
  return {
    id: 'sub-1',
    spot_name: 'Quiet Corner',
    building_name: 'Library',
    floor: '3F',
    status: 'pending',
    created_at: '2026-05-12T09:00:00.000Z',
    ...overrides,
  };
}

describe('deriveProfileStats', () => {
  it('counts real map and squad contribution records', () => {
    const stats = deriveProfileStats({
      submissions: [submission()],
      buildings: [{ id: 'building-1' }],
      groupPins: {
        pin1: { user_id: 'user-1' },
        pin2: { user_id: 'user-2' },
      },
      groupPinJoins: {
        pin1: [{ user_id: 'user-1' }, { user_id: 'user-2' }],
      },
      groupMember: { scout_points: 3 },
      userId: 'user-1',
    });

    expect(stats).toEqual({ spotsFound: 2, squadContributions: 5 });
  });
});

describe('composeProfileActivity', () => {
  it('sorts mixed real activity newest first and respects the limit', () => {
    const items = composeProfileActivity({
      claims: [claim()],
      submissions: [submission()],
      buildings: [{ id: 'building-1', name: 'Engineering Hall', created_at: '2026-05-11T09:00:00.000Z' }],
      limit: 2,
    });

    expect(items).toHaveLength(2);
    expect(items[0].tag).toBe('CLAIMED');
    expect(items[1].tag).toBe('PENDING');
  });

  it('omits unavailable activity instead of adding fallback rows', () => {
    expect(composeProfileActivity({ claims: [], submissions: [], buildings: [] })).toEqual([]);
  });
});

describe('profileSubtitle', () => {
  it('joins course and class labels only when persisted', () => {
    expect(profileSubtitle({ course_label: 'BSIT', class_label: 'Class of 2025' })).toBe('BSIT - Class of 2025');
    expect(profileSubtitle({})).toBe('');
  });
});
