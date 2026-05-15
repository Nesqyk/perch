import { describe, expect, it } from 'vitest';

import {
  buildMeetupIcs,
  deriveSpotOccupancy,
  getAvailabilityLabel,
  getPlugsLabel,
  getSquadRoleLabel,
  sortSquadMembers,
} from '../../src/state/groupDashboardState.js';

function member(overrides = {}) {
  return {
    id: 'member-1',
    role: 'member',
    joined_at: '2026-05-11T01:00:00.000Z',
    ...overrides,
  };
}

function spot(overrides = {}) {
  return {
    id: 'spot-1',
    rough_capacity: 'medium',
    has_outlets: true,
    ...overrides,
  };
}

describe('groupDashboardState', () => {
  it('sorts mayors first, then by join time', () => {
    const members = [
      member({ id: 'late', joined_at: '2026-05-11T03:00:00.000Z' }),
      member({ id: 'mayor', role: 'mayor', joined_at: '2026-05-11T02:00:00.000Z' }),
      member({ id: 'early', joined_at: '2026-05-11T00:00:00.000Z' }),
    ];

    expect(sortSquadMembers(members).map(item => item.id)).toEqual(['mayor', 'early', 'late']);
  });

  it('formats role, status, and plugs labels', () => {
    expect(getSquadRoleLabel('mayor')).toBe('Mayor');
    expect(getSquadRoleLabel('member')).toBe('Member');
    expect(getAvailabilityLabel('busy')).toBe('Busy');
    expect(getAvailabilityLabel('available')).toBe('Available');
    expect(getPlugsLabel(spot({ has_outlets: false }))).toBe('Limited');
    expect(getPlugsLabel(spot({ has_outlets: true }))).toBe('Plenty');
  });

  it('derives occupancy from active claims and rough capacity', () => {
    const result = deriveSpotOccupancy(spot({ rough_capacity: 'medium' }), {
      'spot-1': [
        { group_size_key: 'small' },
        { group_size_key: 'medium' },
        { group_size_key: 'solo', cancelled_at: '2026-05-11T02:00:00.000Z' },
      ],
    });

    expect(result).toEqual({ percent: 45, claimed: 9, capacity: 20 });
  });

  it('builds an escaped calendar payload', () => {
    const ics = buildMeetupIcs({
      title: 'Finals, Sprint; Session',
      starts_at: '2026-05-12T01:00:00.000Z',
      location_label: 'Nyor Cafe, Cebu',
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20260512T010000Z');
    expect(ics).toContain('SUMMARY:Finals\\, Sprint\\; Session');
    expect(ics).toContain('LOCATION:Nyor Cafe\\, Cebu');
  });
});
