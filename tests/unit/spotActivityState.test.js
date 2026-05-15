/**
 * tests/unit/spotActivityState.test.js
 *
 * Unit tests for shared spot activity row derivation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveSpotActivityRows } from '../../src/state/spotActivityState.js';

function claim(overrides = {}) {
  return {
    id: 'claim-1',
    user_id: 'user-1',
    nickname: 'Marc S.',
    group_size_key: 'medium',
    claimed_at: '2026-05-16T01:55:00.000Z',
    ...overrides,
  };
}

describe('deriveSpotActivityRows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T02:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders claim nicknames and relative check-in time', () => {
    const rows = deriveSpotActivityRows({ claims: [claim()] });

    expect(rows[0]).toMatchObject({
      name: 'Marc S.',
      initials: 'MS',
      meta: 'Checked in 5m ago',
      tag: 'Group',
    });
  });

  it('labels the current user claim as You', () => {
    const rows = deriveSpotActivityRows({ claims: [claim()], currentUserId: 'user-1' });

    expect(rows[0].name).toBe('You');
    expect(rows[0].initials).toBe('ME');
  });

  it('falls back to a generic safe name when nickname is missing', () => {
    const rows = deriveSpotActivityRows({ claims: [claim({ nickname: '' })] });

    expect(rows[0].name).toBe('Perch member');
    expect(rows[0].initials).toBe('PM');
  });

  it('returns no fallback rows when no claims exist', () => {
    expect(deriveSpotActivityRows({ claims: [] })).toEqual([]);
  });

  it('sorts newest check-ins first and respects the limit', () => {
    const rows = deriveSpotActivityRows({
      limit: 2,
      claims: [
        claim({ id: 'old', nickname: 'Old User', claimed_at: '2026-05-16T01:00:00.000Z' }),
        claim({ id: 'new', nickname: 'New User', claimed_at: '2026-05-16T01:59:50.000Z' }),
        claim({ id: 'middle', nickname: 'Middle User', claimed_at: '2026-05-16T01:30:00.000Z' }),
      ],
    });

    expect(rows.map((row) => row.name)).toEqual(['New User', 'Middle User']);
  });
});
