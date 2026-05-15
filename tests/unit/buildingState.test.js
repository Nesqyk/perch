/**
 * tests/unit/buildingState.test.js
 *
 * Unit tests for src/state/buildingState.js — pure derivation helpers
 * for the building-first campus experience.
 */

import { describe, it, expect } from 'vitest';
import {
  getRoomsForBuilding,
  deriveBuildingStatus,
  summarizeBuildingInventory,
  getVisibleRooms,
  deriveRoomStatus,
} from '../../src/state/buildingState.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function building(overrides = {}) {
  return { id: 'bldg-1', name: 'Library', campus_id: 'campus-1', ...overrides };
}

function room(overrides = {}) {
  return {
    id: 'room-1', on_campus: true, building_id: 'bldg-1',
    building: 'Library', name: 'Room A', floor: '2F', type: 'study',
    ...overrides,
  };
}

function claim(overrides = {}) {
  return {
    id: 'claim-1', user_id: 'u1',
    expires_at: '2999-01-01T00:00:00.000Z',
    cancelled_at: null,
    ...overrides,
  };
}

function conf(score, validUntil = null) {
  return { score, validUntil };
}

// ─── getRoomsForBuilding ─────────────────────────────────────────────────────

describe('getRoomsForBuilding', () => {
  it('returns rooms whose building_id matches the building id', () => {
    const rooms = [
      room({ id: 'r1', building_id: 'b1' }),
      room({ id: 'r2', building_id: 'b2' }),
    ];
    const result = getRoomsForBuilding(rooms, building({ id: 'b1' }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
  });

  it('matches by building name when building_id is null', () => {
    const rooms = [room({ id: 'r1', building_id: null, building: 'Library' })];
    const result = getRoomsForBuilding(rooms, building({ id: 'b1', name: 'Library' }));
    expect(result).toHaveLength(1);
  });

  it('performs case-insensitive name matching', () => {
    const rooms = [room({ id: 'r1', building_id: null, building: 'MAIN LIBRARY' })];
    const result = getRoomsForBuilding(rooms, building({ id: 'b1', name: 'Main Library' }));
    expect(result).toHaveLength(1);
  });

  it('excludes off-campus rooms even if building_id matches', () => {
    const rooms = [room({ id: 'r1', on_campus: false, building_id: 'b1' })];
    const result = getRoomsForBuilding(rooms, building({ id: 'b1' }));
    expect(result).toHaveLength(0);
  });

  it('returns empty array when building is null', () => {
    const rooms = [room()];
    expect(getRoomsForBuilding(rooms, null)).toEqual([]);
  });

  it('returns empty array when spots is null', () => {
    expect(getRoomsForBuilding(null, building())).toEqual([]);
  });
});

// ─── deriveBuildingStatus ────────────────────────────────────────────────────

describe('deriveBuildingStatus', () => {
  it('returns maybe for empty rooms', () => {
    expect(deriveBuildingStatus([], {}, {})).toBe('maybe');
  });

  it('returns free when at least one room is free', () => {
    const rooms = [room({ id: 'r1' }), room({ id: 'r2' })];
    expect(deriveBuildingStatus(rooms, {}, { r1: conf(0.8), r2: conf(0.4) })).toBe('free');
  });

  it('returns claimed when no room is free but one is claimed', () => {
    const rooms = [room({ id: 'r1' }), room({ id: 'r2' })];
    expect(deriveBuildingStatus(rooms, { r1: [claim()] }, { r1: conf(0.4) })).toBe('claimed');
  });

  it('returns full when rooms are full or maybe (no free/claimed)', () => {
    const rooms = [room({ id: 'r1' }), room({ id: 'r2' })];
    expect(deriveBuildingStatus(rooms, {}, { r1: conf(0.1), r2: conf(0.4) })).toBe('full');
  });

  it('returns maybe when all rooms are maybe', () => {
    const rooms = [room({ id: 'r1' }), room({ id: 'r2' })];
    expect(deriveBuildingStatus(rooms, {}, { r1: conf(0.4), r2: conf(0.5) })).toBe('maybe');
  });

  it('handles null/undefined rooms', () => {
    expect(deriveBuildingStatus(null, {}, {})).toBe('maybe');
    expect(deriveBuildingStatus(undefined, {}, {})).toBe('maybe');
  });
});

// ─── summarizeBuildingInventory ──────────────────────────────────────────────

describe('summarizeBuildingInventory', () => {
  it('counts canonical rooms and pending submissions', () => {
    const result = summarizeBuildingInventory(
      [room(), room()],
      [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
    );
    expect(result).toEqual({ rooms: 2, pending: 3 });
  });

  it('returns zero counts for null/undefined inputs', () => {
    expect(summarizeBuildingInventory(null, null)).toEqual({ rooms: 0, pending: 0 });
    expect(summarizeBuildingInventory(undefined, undefined)).toEqual({ rooms: 0, pending: 0 });
  });

  it('returns zero for empty arrays', () => {
    expect(summarizeBuildingInventory([], [])).toEqual({ rooms: 0, pending: 0 });
  });
});

// ─── deriveRoomStatus ────────────────────────────────────────────────────────

describe('deriveRoomStatus', () => {
  it('returns free for high confidence (>= 0.65) with no claims', () => {
    expect(deriveRoomStatus('r1', {}, { r1: conf(0.8) })).toBe('free');
  });

  it('returns claimed when active claims exist (score > 0.15)', () => {
    expect(deriveRoomStatus('r1', { r1: [claim()] }, { r1: conf(0.8) })).toBe('claimed');
  });

  it('returns maybe for medium confidence (0.15 < score < 0.65)', () => {
    expect(deriveRoomStatus('r1', {}, { r1: conf(0.4) })).toBe('maybe');
  });

  it('returns full for very low confidence (<= 0.15)', () => {
    expect(deriveRoomStatus('r1', {}, { r1: conf(0.1) })).toBe('full');
  });

  it('returns maybe for missing confidence data', () => {
    expect(deriveRoomStatus('r1', {}, {})).toBe('maybe');
  });

  it('full status takes priority over claims', () => {
    const claims = { r1: [claim()] };
    expect(deriveRoomStatus('r1', claims, { r1: conf(0.05) })).toBe('full');
  });

  it('ignores expired confidence (validUntil in past)', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(deriveRoomStatus('r1', {}, { r1: conf(0.9, past) }) ).toBe('maybe');
  });

  it('uses valid confidence when validUntil is in the future', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(deriveRoomStatus('r1', {}, { r1: conf(0.9, future) })).toBe('free');
  });
});

// ─── getVisibleRooms ─────────────────────────────────────────────────────────

describe('getVisibleRooms', () => {
  it('returns all rooms with derivedStatus when no filters are applied', () => {
    const rooms = [room({ id: 'r1' }), room({ id: 'r2' })];
    const result = getVisibleRooms(rooms, {}, { r1: conf(0.8), r2: conf(0.1) }, {});
    expect(result).toHaveLength(2);
    expect(result[0].derivedStatus).toBe('free');
    expect(result[1].derivedStatus).toBe('full');
  });

  it('filters by search text (case-insensitive)', () => {
    const rooms = [
      room({ id: 'r1', name: 'Reading Room', floor: '2F' }),
      room({ id: 'r2', name: 'Computer Lab', floor: '1F' }),
    ];
    const result = getVisibleRooms(rooms, {}, {}, { search: 'reading' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
  });

  it('searches across name, floor, and building fields', () => {
    const rooms = [
      room({ id: 'r1', name: 'Room 101', floor: '2F', building: 'Library' }),
      room({ id: 'r2', name: 'Room 102', floor: '1F', building: 'Science' }),
    ];
    const result = getVisibleRooms(rooms, {}, {}, { search: 'science' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r2');
  });

  it('filters by status', () => {
    const rooms = [room({ id: 'r1' }), room({ id: 'r2' })];
    const result = getVisibleRooms(rooms, {}, { r1: conf(0.8), r2: conf(0.1) }, { status: 'free' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
  });

  it('sorts rooms: free first, then claimed, maybe, full', () => {
    const rooms = [
      room({ id: 'full-room', name: 'Z Full' }),
      room({ id: 'free-room', name: 'A Free' }),
      room({ id: 'maybe-room', name: 'M Maybe' }),
    ];
    const result = getVisibleRooms(
      rooms,
      {},
      { 'full-room': conf(0.1), 'free-room': conf(0.8), 'maybe-room': conf(0.4) },
      {},
    );
    expect(result.map((r) => r.id)).toEqual(['free-room', 'maybe-room', 'full-room']);
  });

  it('sorts alphabetically within the same status group', () => {
    const rooms = [
      room({ id: 'r2', name: 'Beta' }),
      room({ id: 'r1', name: 'Alpha' }),
    ];
    const result = getVisibleRooms(rooms, {}, { r1: conf(0.8), r2: conf(0.8) }, {});
    expect(result.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('combines search and status filter together', () => {
    const rooms = [
      room({ id: 'r1', name: 'Study Room', building: 'Library' }),
      room({ id: 'r2', name: 'Study Room', building: 'Science' }),
    ];
    const result = getVisibleRooms(
      rooms,
      {},
      { r1: conf(0.1), r2: conf(0.8) },
      { search: 'study', status: 'free' },
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r2');
  });

  it('returns empty array when no rooms match', () => {
    const result = getVisibleRooms([room()], {}, {}, { search: 'nonexistent' });
    expect(result).toEqual([]);
  });

  it('handles null rooms gracefully', () => {
    expect(getVisibleRooms(null, {}, {}, {})).toEqual([]);
  });

  it('defaults options to empty object when not provided', () => {
    const rooms = [room({ id: 'r1' })];
    const result = getVisibleRooms(rooms, {}, { r1: conf(0.8) });
    expect(result).toHaveLength(1);
  });
});
