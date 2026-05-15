import { describe, expect, it } from 'vitest';

import {
  deriveNotificationItems,
  filterNotificationItems,
  pickSanctuaryRecommendation,
} from '../../src/state/notificationsState.js';

function claim(overrides = {}) {
  return {
    spot_id: 'spot-1',
    claimed_at: '2026-05-13T09:00:00.000Z',
    cancelled_at: null,
    spots: { name: 'Campus Brew Cafe', building: 'Library 3F' },
    ...overrides,
  };
}

function submission(overrides = {}) {
  return {
    spot_name: 'Quiet Corner',
    building_name: 'Library 3F',
    status: 'pending',
    confirmation_count: 1,
    created_at: '2026-05-13T08:00:00.000Z',
    ...overrides,
  };
}

function building(overrides = {}) {
  return {
    name: 'Engineering Hall',
    verification_status: 'pending',
    confirmation_count: 0,
    created_at: '2026-05-13T07:00:00.000Z',
    campuses: { short_name: 'CTU' },
    ...overrides,
  };
}

function spot(overrides = {}) {
  return {
    id: 'spot-1',
    name: 'Terrace Reading Room',
    noise_baseline: 'quiet',
    wifi_strength: 'strong',
    has_outlets: true,
    has_food: false,
    rough_capacity: 'medium',
    ...overrides,
  };
}

describe('notificationsState', () => {
  it('maps claims and contributions to spot updates', () => {
    const items = deriveNotificationItems({
      claimRows: [claim()],
      contributionSpots: [submission()],
      contributionBuildings: [building()],
    });

    expect(items).toHaveLength(3);
    expect(items.every((item) => item.category === 'spot')).toBe(true);
  });

  it('maps group pins and joins to squad updates', () => {
    const items = deriveNotificationItems({
      group: { id: 'group-1', name: 'BSIT 2-A' },
      groupPins: {
        'pin-1': {
          id: 'pin-1',
          spot_id: 'spot-1',
          display_name: 'Mayor',
          pinned_at: '2026-05-13T09:15:00.000Z',
        },
      },
      groupPinJoins: {
        'pin-1': [
          {
            id: 'join-1',
            status: 'heading',
            joined_at: '2026-05-13T09:20:00.000Z',
          },
        ],
      },
      spotRows: [spot()],
    });

    expect(items).toHaveLength(2);
    expect(items.every((item) => item.category === 'squad')).toBe(true);
  });

  it('filters notification items by target category', () => {
    const items = [
      { id: 'spot', category: 'spot' },
      { id: 'squad', category: 'squad' },
    ];

    expect(filterNotificationItems(items, 'all')).toHaveLength(2);
    expect(filterNotificationItems(items, 'spot')).toEqual([{ id: 'spot', category: 'spot' }]);
    expect(filterNotificationItems(items, 'squad')).toEqual([{ id: 'squad', category: 'squad' }]);
  });

  it('recommends the best unclaimed quiet spot', () => {
    const recommendation = pickSanctuaryRecommendation({
      spots: [
        spot({ id: 'busy', noise_baseline: 'quiet' }),
        spot({ id: 'quiet', name: 'Garden Study Room' }),
        spot({ id: 'loud', noise_baseline: 'moderate', wifi_strength: 'weak', has_outlets: false }),
      ],
      claims: {
        busy: [{ expires_at: '2999-01-01T00:00:00.000Z' }],
      },
    });

    expect(recommendation?.id).toBe('quiet');
  });

  it('returns null when no available spot can be recommended', () => {
    const recommendation = pickSanctuaryRecommendation({
      spots: [spot({ id: 'busy' })],
      claims: {
        busy: [{ expires_at: '2999-01-01T00:00:00.000Z' }],
      },
    });

    expect(recommendation).toBeNull();
  });
});
