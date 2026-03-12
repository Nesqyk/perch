/**
 * tests/unit/groupPins.test.js
 *
 * Unit tests for src/features/groupPins.js — pure logic only (no network).
 * Focuses on the GROUP_PIN_EVENTS constants contract.
 *
 * The Supabase client, store, and toast are mocked to prevent side-effects.
 */

import { describe, it, expect, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: {
    from:    vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() })),
    channel: vi.fn(() => ({ on: vi.fn(), subscribe: vi.fn() })),
  },
}));

vi.mock('../../src/core/store.js', () => ({
  getState:  vi.fn(() => ({ group: null, groupPins: [], groupPinJoins: [], myGroupPinId: null })),
  dispatch:  vi.fn(),
  initStore: vi.fn(),
}));

vi.mock('../../src/core/events.js', () => ({
  on:     vi.fn(),
  emit:   vi.fn(),
  EVENTS: {},
}));

vi.mock('../../src/api/groupPins.js', () => ({
  fetchGroupPins:    vi.fn(),
  fetchGroupPinJoins: vi.fn(),
  dropLivePin:       vi.fn(),
  endLivePin:        vi.fn(),
  joinGroupPin:      vi.fn(),
  confirmVibe:       vi.fn(),
}));

vi.mock('../../src/ui/toast.js', () => ({
  showToast: vi.fn(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { GROUP_PIN_EVENTS } from '../../src/features/groupPins.js';

// ─── GROUP_PIN_EVENTS constants ───────────────────────────────────────────────

describe('GROUP_PIN_EVENTS', () => {
  it('is a frozen object', () => {
    expect(Object.isFrozen(GROUP_PIN_EVENTS)).toBe(true);
  });

  it('has exactly 4 event keys', () => {
    const keys = Object.keys(GROUP_PIN_EVENTS);
    expect(keys).toHaveLength(4);
  });

  it('has the required event keys', () => {
    expect(GROUP_PIN_EVENTS).toHaveProperty('DROP_REQUESTED');
    expect(GROUP_PIN_EVENTS).toHaveProperty('JOIN_REQUESTED');
    expect(GROUP_PIN_EVENTS).toHaveProperty('END_REQUESTED');
    expect(GROUP_PIN_EVENTS).toHaveProperty('VIBE_SUBMITTED');
  });

  it('all event values are non-empty strings', () => {
    for (const [, value] of Object.entries(GROUP_PIN_EVENTS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('all event values are unique', () => {
    const values = Object.values(GROUP_PIN_EVENTS);
    const unique  = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('event values use the ui: namespace prefix', () => {
    for (const [, value] of Object.entries(GROUP_PIN_EVENTS)) {
      expect(value).toMatch(/^ui:/);
    }
  });

  it('cannot mutate the object', () => {
    expect(() => {
      GROUP_PIN_EVENTS.DROP_REQUESTED = 'hacked';
    }).toThrow();
  });

  it('DROP_REQUESTED is ui:groupPinDrop', () => {
    expect(GROUP_PIN_EVENTS.DROP_REQUESTED).toBe('ui:groupPinDrop');
  });

  it('JOIN_REQUESTED is ui:groupPinJoin', () => {
    expect(GROUP_PIN_EVENTS.JOIN_REQUESTED).toBe('ui:groupPinJoin');
  });

  it('END_REQUESTED is ui:groupPinEnd', () => {
    expect(GROUP_PIN_EVENTS.END_REQUESTED).toBe('ui:groupPinEnd');
  });

  it('VIBE_SUBMITTED is ui:groupVibeSubmit', () => {
    expect(GROUP_PIN_EVENTS.VIBE_SUBMITTED).toBe('ui:groupVibeSubmit');
  });
});
