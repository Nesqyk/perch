/**
 * tests/unit/store.test.js
 *
 * Unit tests for src/core/store.js — the central state store.
 *
 * We mock events.js and router.js so that dispatch() and getState() can be
 * tested in isolation.  initStore() is a no-op, so we use vi.resetModules()
 * + a fresh dynamic import in beforeEach to give every test a clean _state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (hoisted so vi.mock factory can reference them) ───────────────────

const emitMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/core/events.js', () => {
  const EVENTS = Object.freeze({
    LOCATION_SET:              'state:locationSet',
    VIEW_MODE_CHANGED:         'state:viewModeChanged',
    NICKNAME_UPDATED:          'state:nicknameUpdated',
    FILTERS_CHANGED:           'state:filtersChanged',
    SPOTS_LOADED:              'state:spotsLoaded',
    SPOT_SELECTED:             'state:spotSelected',
    SPOT_DESELECTED:           'state:spotDeselected',
    CLAIM_UPDATED:             'state:claimUpdated',
    CORRECTION_FILED:          'state:correctionFiled',
    LINK_COPIED:               'state:linkCopied',
    SETTINGS_DASHBOARD_UPDATED:'state:settingsDashboardUpdated',
    USER_SETTINGS_UPDATED:     'state:userSettingsUpdated',
    USER_DEVICE_UPDATED:       'state:userDeviceUpdated',
    STATUS_CHANGED:            'state:statusChanged',
    CAMPUSES_LOADED:           'state:campusesLoaded',
    CAMPUS_SELECTED:           'state:campusSelected',
    BUILDINGS_LOADED:          'state:buildingsLoaded',
    MAP_OVERLAY_CHANGED:       'map:overlayChanged',
    GROUP_JOINED:              'state:groupJoined',
    GROUP_LEFT:                'state:groupLeft',
    GROUP_UPDATED:             'state:groupUpdated',
    GROUP_DASHBOARD_UPDATED:   'state:groupDashboardUpdated',
    GROUP_PINS_UPDATED:        'state:groupPinsUpdated',
    GROUP_PIN_JOINS_UPDATED:   'state:groupPinJoinsUpdated',
    GROUP_MEMBERS_UPDATED:     'state:groupMembersUpdated',
    GROUP_MEETUP_UPDATED:      'state:groupMeetupUpdated',
    GROUP_PERK_UPDATED:        'state:groupPerkUpdated',
    ROUTE_CHANGED:             'state:routeChanged',
    AUTH_STATE_CHANGED:        'state:authChanged',
  });
  return { emit: emitMock, EVENTS };
});

vi.mock('../../src/core/router.js', () => ({
  buildSpotShareUrl: vi.fn(() => 'https://perch.app/spot/test-id'),
}));

// Re-assigned in beforeEach with a fresh module instance
let getState;
let dispatch;

beforeEach(async () => {
  emitMock.mockClear();
  vi.resetModules();
  const fresh = await import('../../src/core/store.js');
  getState = fresh.getState;
  dispatch = fresh.dispatch;
  fresh.initStore(); // no-op but signals intent
});

// ─── getState ────────────────────────────────────────────────────────────────

describe('getState', () => {
  it('returns a frozen snapshot of the state', () => {
    const state = getState();
    expect(Object.isFrozen(state)).toBe(true);
  });

  it('returns the initial state shape', () => {
    const state = getState();
    expect(state.spots).toEqual([]);
    expect(state.claims).toEqual({});
    expect(state.confidence).toEqual({});
    expect(state.filters).toEqual({ groupSize: null, needs: [], nearBuilding: null, areaId: null });
    expect(state.userLocation).toBeNull();
    expect(state.selectedSpotId).toBeNull();
    expect(state.currentRoute).toBe('/');
    expect(state.currentUser).toBeNull();
    expect(state.group).toBeNull();
    expect(state.availabilityHeatEnabled).toBe(false);
    expect(state.status).toEqual({
      spotsLoading: false, claimPending: false, correctionPending: false,
      groupPending: false, campusPending: false, error: null,
    });
  });

  it('returns a new snapshot each time (shallow copy)', () => {
    const a = getState();
    const b = getState();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ─── Location & View Mode ────────────────────────────────────────────────────

describe('dispatch — location & view mode', () => {
  it('SET_USER_LOCATION updates state and emits LOCATION_SET', () => {
    dispatch('SET_USER_LOCATION', { lat: 10.3, lng: 123.9 });
    expect(getState().userLocation).toEqual({ lat: 10.3, lng: 123.9 });
    expect(emitMock).toHaveBeenCalledWith(
      'state:locationSet',
      { location: { lat: 10.3, lng: 123.9 } },
    );
  });

  it('SET_VIEW_MODE updates viewMode and emits', () => {
    dispatch('SET_VIEW_MODE', 'city');
    expect(getState().viewMode).toBe('city');
    expect(emitMock).toHaveBeenCalledWith(
      'state:viewModeChanged',
      { viewMode: 'city' },
    );
  });

  it('SET_AVAILABILITY_HEAT_ENABLED updates heat visibility and emits', () => {
    dispatch('SET_AVAILABILITY_HEAT_ENABLED', true);
    expect(getState().availabilityHeatEnabled).toBe(true);
    expect(emitMock).toHaveBeenCalledWith(
      'map:overlayChanged',
      { availabilityHeatEnabled: true },
    );
  });

  it('SET_NICKNAME updates nickname and emits', () => {
    dispatch('SET_NICKNAME', 'Alice');
    expect(getState().nickname).toBe('Alice');
    expect(emitMock).toHaveBeenCalledWith(
      'state:nicknameUpdated',
      { nickname: 'Alice' },
    );
  });
});

// ─── Filters ─────────────────────────────────────────────────────────────────

describe('dispatch — filters', () => {
  it('SET_FILTERS merges partial filter updates', () => {
    dispatch('SET_FILTERS', { groupSize: 'solo' });
    expect(getState().filters.groupSize).toBe('solo');
    expect(getState().filters.needs).toEqual([]);
    expect(getState().filters.nearBuilding).toBeNull();
  });

  it('SET_FILTERS with multiple fields merges all', () => {
    dispatch('SET_FILTERS', { groupSize: 'large', needs: ['outlet', 'wifi'] });
    const f = getState().filters;
    expect(f.groupSize).toBe('large');
    expect(f.needs).toEqual(['outlet', 'wifi']);
  });

  it('RESET_FILTERS restores filter defaults', () => {
    dispatch('SET_FILTERS', { groupSize: 'large', needs: ['outlet'] });
    dispatch('RESET_FILTERS');
    expect(getState().filters).toEqual({ groupSize: null, needs: [], nearBuilding: null, areaId: null });
  });
});

// ─── Spots & Confidence ──────────────────────────────────────────────────────

describe('dispatch — spots & confidence', () => {
  it('SPOTS_LOADED sets spots and optional confidence', () => {
    dispatch('SPOTS_LOADED', {
      spots: [{ id: 's1' }, { id: 's2' }],
      confidence: { s1: { score: 0.9 }, s2: { score: 0.4 } },
    });
    expect(getState().spots).toHaveLength(2);
    expect(getState().confidence.s1.score).toBe(0.9);
    expect(emitMock).toHaveBeenCalledWith('state:spotsLoaded', { spots: expect.any(Array) });
  });

  it('SPOTS_LOADED preserves existing confidence when absent from payload', () => {
    dispatch('CONFIDENCE_UPDATED', { spotId: 's1', confidence: { score: 0.8 } });
    dispatch('SPOTS_LOADED', { spots: [{ id: 's1' }] });
    expect(getState().confidence.s1.score).toBe(0.8);
  });

  it('CONFIDENCE_UPDATED merges a single spot confidence', () => {
    dispatch('CONFIDENCE_UPDATED', { spotId: 's1', confidence: { score: 0.8 } });
    expect(getState().confidence.s1).toEqual({ score: 0.8 });
  });
});

// ─── Spot selection ──────────────────────────────────────────────────────────

describe('dispatch — spot selection', () => {
  it('SELECT_SPOT sets selectedSpotId and emits', () => {
    dispatch('SELECT_SPOT', { spotId: 's1', navigate: true });
    expect(getState().selectedSpotId).toBe('s1');
    expect(emitMock).toHaveBeenCalledWith('state:spotSelected', {
      spotId: 's1',
      navigate: true,
    });
  });

  it('DESELECT_SPOT clears selectedSpotId', () => {
    dispatch('SELECT_SPOT', { spotId: 's1' });
    dispatch('DESELECT_SPOT');
    expect(getState().selectedSpotId).toBeNull();
  });
});

// ─── Claims ──────────────────────────────────────────────────────────────────

describe('dispatch — claims', () => {
  it('CLAIMS_LOADED sets claims and emits', () => {
    dispatch('CLAIMS_LOADED', { claims: { s1: [{ id: 'c1' }] } });
    expect(getState().claims).toEqual({ s1: [{ id: 'c1' }] });
    expect(emitMock).toHaveBeenCalledWith('state:claimUpdated', { spotId: null });
  });

  it('CLAIM_ADDED appends a claim to the spot array', () => {
    dispatch('CLAIM_ADDED', {
      spotId: 's-a',
      claim: { id: 'c1' },
      isMine: false,
    });
    expect(getState().claims['s-a']).toHaveLength(1);
    expect(getState().claims['s-a'][0].id).toBe('c1');
    expect(getState().myActiveClaim).toBeNull();
  });

  it('CLAIM_ADDED with isMine tracks the claim as myActiveClaim', () => {
    dispatch('CLAIM_ADDED', {
      spotId: 's1',
      claim: { id: 'c1', group_size_key: 'solo', expires_at: '2999-01-01T00:00:00Z' },
      isMine: true,
    });
    expect(getState().myActiveClaim).toEqual({
      spotId: 's1',
      claimId: 'c1',
      groupSizeKey: 'solo',
      expiresAt: '2999-01-01T00:00:00Z',
    });
    expect(getState().sharedLink.active).toBe(true);
    expect(getState().sharedLink.url).toBe('https://perch.app/spot/test-id');
  });

  it('CLAIM_ADDED with isMine builds a share link', () => {
    dispatch('CLAIM_ADDED', {
      spotId: 's1',
      claim: { id: 'c1', group_size_key: 'solo', expires_at: '2999-01-01T00:00:00Z' },
      isMine: true,
    });
    expect(getState().sharedLink.url).toBe('https://perch.app/spot/test-id');
  });

  it('CLAIM_REMOVED removes the claim from the spot array', () => {
    dispatch('CLAIM_ADDED', {
      spotId: 's-rm',
      claim: { id: 'c-rm' },
      isMine: true,
    });
    dispatch('CLAIM_REMOVED', { spotId: 's-rm', claimId: 'c-rm' });
    expect(getState().claims['s-rm']).toEqual([]);
    expect(getState().myActiveClaim).toBeNull();
    expect(getState().sharedLink.active).toBe(false);
  });
});

// ─── Corrections ─────────────────────────────────────────────────────────────

describe('dispatch — corrections', () => {
  it('CORRECTION_FILED reduces confidence score by 80 %', () => {
    dispatch('CONFIDENCE_UPDATED', { spotId: 's1', confidence: { score: 0.8 } });
    dispatch('CORRECTION_FILED', { spotId: 's1' });
    expect(getState().confidence.s1.score).toBeCloseTo(0.16, 2);
  });

  it('CORRECTION_FILED uses default score of 0.5 when no prior confidence', () => {
    dispatch('CORRECTION_FILED', { spotId: 's-new' });
    expect(getState().confidence['s-new'].score).toBeCloseTo(0.1, 2);
  });
});

// ─── Shared link ─────────────────────────────────────────────────────────────

describe('dispatch — shared link', () => {
  it('LINK_COPIED sets copiedAt timestamp', () => {
    expect(getState().sharedLink.copiedAt).toBeNull();
    dispatch('LINK_COPIED');
    expect(getState().sharedLink.copiedAt).toBeInstanceOf(Date);
  });
});

// ─── Settings ────────────────────────────────────────────────────────────────

describe('dispatch — settings', () => {
  it('SETTINGS_DASHBOARD_LOADED updates all settings fields', () => {
    const payload = {
      profile: { nickname: 'Alice' },
      settings: { default_view: 'city' },
      devices: [{ id: 'd1' }],
      nextSession: { id: 'ns1' },
      sharedNote: { id: 'sn1' },
    };
    dispatch('SETTINGS_DASHBOARD_LOADED', payload);
    const s = getState();
    expect(s.settingsProfile).toEqual({ nickname: 'Alice' });
    expect(s.userSettings).toEqual({ default_view: 'city' });
    expect(s.userDevices).toEqual([{ id: 'd1' }]);
    expect(s.nextSession).toEqual({ id: 'ns1' });
    expect(s.sharedNote).toEqual({ id: 'sn1' });
  });

  it('SETTINGS_DASHBOARD_LOADED sets nickname from profile', () => {
    dispatch('SETTINGS_DASHBOARD_LOADED', {
      profile: { nickname: 'Bob' },
      settings: null, devices: [], nextSession: null, sharedNote: null,
    });
    expect(getState().nickname).toBe('Bob');
  });

  it('USER_SETTINGS_UPDATED merges settings', () => {
    dispatch('USER_SETTINGS_UPDATED', { settings: { notify_email: true } });
    expect(getState().userSettings).toEqual({ notify_email: true });
  });

  it('SETTINGS_PROFILE_UPDATED updates profile and nickname', () => {
    dispatch('SETTINGS_PROFILE_UPDATED', { profile: { nickname: 'Charlie' } });
    expect(getState().settingsProfile.nickname).toBe('Charlie');
    expect(getState().nickname).toBe('Charlie');
  });

  it('USER_DEVICE_UPSERTED adds a device', () => {
    dispatch('USER_DEVICE_UPSERTED', { device: { id: 'd1', device_key: 'k1' } });
    expect(getState().userDevices).toHaveLength(1);
    expect(getState().userDevices[0].id).toBe('d1');
  });

  it('USER_DEVICE_UPSERTED caps at 4 devices', () => {
    for (let i = 0; i < 5; i++) {
      dispatch('USER_DEVICE_UPSERTED', { device: { id: `d${i}`, device_key: `k${i}` } });
    }
    expect(getState().userDevices.length).toBeLessThanOrEqual(4);
  });

  it('USER_DEVICE_UPSERTED does nothing when device is null', () => {
    dispatch('USER_DEVICE_UPSERTED', { device: null });
    expect(getState().userDevices).toEqual([]);
  });
});

// ─── Status ──────────────────────────────────────────────────────────────────

describe('dispatch — status', () => {
  it('SET_STATUS merges partial status updates', () => {
    dispatch('SET_STATUS', { spotsLoading: true });
    expect(getState().status.spotsLoading).toBe(true);
    expect(getState().status.claimPending).toBe(false);
  });

  it('SET_STATUS can set error', () => {
    dispatch('SET_STATUS', { error: 'Something went wrong' });
    expect(getState().status.error).toBe('Something went wrong');
  });
});

// ─── Campuses ────────────────────────────────────────────────────────────────

describe('dispatch — campuses', () => {
  it('CAMPUSES_LOADED sets campuses and auto-selects the first', () => {
    dispatch('CAMPUSES_LOADED', { campuses: [{ id: 'c1' }, { id: 'c2' }] });
    expect(getState().campuses).toHaveLength(2);
    expect(getState().selectedCampusId).toBe('c1');
  });

  it('CAMPUSES_LOADED does not auto-select if one is already set', () => {
    dispatch('CAMPUS_SELECTED', { campusId: 'c2' });
    dispatch('CAMPUSES_LOADED', { campuses: [{ id: 'c1' }, { id: 'c2' }] });
    expect(getState().selectedCampusId).toBe('c2');
  });

  it('CAMPUS_SELECTED changes selected campus', () => {
    dispatch('CAMPUS_SELECTED', { campusId: 'c2' });
    expect(getState().selectedCampusId).toBe('c2');
  });

  it('BUILDINGS_LOADED sets buildings', () => {
    dispatch('BUILDINGS_LOADED', { buildings: [{ id: 'b1' }] });
    expect(getState().buildings).toEqual([{ id: 'b1' }]);
  });
});

// ─── Groups ──────────────────────────────────────────────────────────────────

describe('dispatch — groups', () => {
  it('GROUP_JOINED sets group, member and resets group state', () => {
    dispatch('GROUP_JOINED', {
      group: { id: 'g1', name: 'Squad' },
      member: { id: 'm1', displayName: 'Alice' },
    });
    expect(getState().group).toEqual({ id: 'g1', name: 'Squad' });
    expect(getState().groupMember).toEqual({ id: 'm1', displayName: 'Alice' });
    expect(getState().groupPins).toEqual({});
    expect(getState().groupMembers).toEqual([]);
  });

  it('GROUP_DASHBOARD_LOADED populates group members, spot, meetup, perk', () => {
    dispatch('GROUP_DASHBOARD_LOADED', {
      group: { id: 'g1' },
      members: [{ id: 'm1' }],
      currentSpot: { id: 's1' },
      meetup: { id: 'mt1' },
      perk: { id: 'pk1' },
    });
    const s = getState();
    expect(s.group).toEqual({ id: 'g1' });
    expect(s.groupMembers).toEqual([{ id: 'm1' }]);
    expect(s.groupCurrentSpot).toEqual({ id: 's1' });
    expect(s.groupMeetup).toEqual({ id: 'mt1' });
    expect(s.groupPerk).toEqual({ id: 'pk1' });
  });

  it('GROUP_LEFT clears all group-related state', () => {
    dispatch('GROUP_JOINED', {
      group: { id: 'g1' },
      member: { id: 'm1' },
    });
    dispatch('GROUP_LEFT');
    expect(getState().group).toBeNull();
    expect(getState().groupMember).toBeNull();
    expect(getState().groupPins).toEqual({});
    expect(getState().groupMembers).toEqual([]);
    expect(getState().groupCurrentSpot).toBeNull();
    expect(getState().groupMeetup).toBeNull();
    expect(getState().groupPerk).toBeNull();
  });

  it('GROUP_MEMBERS_UPDATED replaces members array', () => {
    dispatch('GROUP_MEMBERS_UPDATED', { members: [{ id: 'm1' }, { id: 'm2' }] });
    expect(getState().groupMembers).toHaveLength(2);
  });

  it('GROUP_MEETUP_UPDATED sets meetup', () => {
    dispatch('GROUP_MEETUP_UPDATED', { meetup: { id: 'mt1' } });
    expect(getState().groupMeetup).toEqual({ id: 'mt1' });
  });

  it('GROUP_PERK_UPDATED sets perk', () => {
    dispatch('GROUP_PERK_UPDATED', { perk: { id: 'pk1' } });
    expect(getState().groupPerk).toEqual({ id: 'pk1' });
  });
});

// ─── Router ──────────────────────────────────────────────────────────────────

describe('dispatch — router', () => {
  it('ROUTE_CHANGED updates currentRoute and emits', () => {
    dispatch('ROUTE_CHANGED', { route: '/profile' });
    expect(getState().currentRoute).toBe('/profile');
    expect(emitMock).toHaveBeenCalledWith('state:routeChanged', { route: '/profile' });
  });
});

// ─── Auth ────────────────────────────────────────────────────────────────────

describe('dispatch — auth', () => {
  it('AUTH_STATE_CHANGED sets currentUser', () => {
    dispatch('AUTH_STATE_CHANGED', { user: { id: 'u1', email: 'a@b.com' } });
    expect(getState().currentUser).toEqual({ id: 'u1', email: 'a@b.com' });
  });

  it('AUTH_STATE_CHANGED with null user clears auth and settings', () => {
    dispatch('SETTINGS_DASHBOARD_LOADED', {
      profile: { nickname: 'Alice' },
      settings: {},
      devices: [{ id: 'd1' }],
      nextSession: { id: 'ns1' },
      sharedNote: { id: 'sn1' },
    });
    dispatch('AUTH_STATE_CHANGED', { user: null });
    const s = getState();
    expect(s.currentUser).toBeNull();
    expect(s.settingsProfile).toBeNull();
    expect(s.userSettings).toBeNull();
    expect(s.userDevices).toEqual([]);
    expect(s.nextSession).toBeNull();
    expect(s.sharedNote).toBeNull();
  });
});

// ─── Unknown action ──────────────────────────────────────────────────────────

describe('dispatch — unknown action', () => {
  it('logs a warning and does not throw', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => dispatch('NOT_A_REAL_ACTION', {})).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      '[store] Unknown action: "NOT_A_REAL_ACTION"',
    );
    warn.mockRestore();
  });
});
