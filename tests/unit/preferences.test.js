/**
 * @vitest-environment jsdom
 *
 * tests/unit/preferences.test.js
 *
 * Unit tests for src/utils/preferences.js — local user preference helpers.
 * Requires jsdom for localStorage access.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadUserPreferences, saveUserPreferences } from '../../src/utils/preferences.js';

const PREFERENCES_KEY = 'perch_user_preferences';

beforeEach(() => {
  localStorage.clear();
});

// ─── loadUserPreferences ─────────────────────────────────────────────────────

describe('loadUserPreferences', () => {
  it('returns default values when nothing is stored', () => {
    const prefs = loadUserPreferences();
    expect(prefs.defaultView).toBe('campus');
    expect(prefs.preferredCampusId).toBe('');
    expect(prefs.showGroupPins).toBe(true);
    expect(prefs.notifyGroupActivity).toBe(true);
    expect(prefs.notifyClaimExpiry).toBe(true);
    expect(prefs.notifyContributionStatus).toBe(true);
    expect(prefs.shareProfileInGroups).toBe(true);
  });

  it('returns stored values merged with defaults', () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({
      defaultView: 'city',
      showGroupPins: false,
    }));
    const prefs = loadUserPreferences();
    expect(prefs.defaultView).toBe('city');
    expect(prefs.showGroupPins).toBe(false);
    expect(prefs.notifyClaimExpiry).toBe(true);
  });

  it('handles corrupt JSON gracefully and returns defaults', () => {
    localStorage.setItem(PREFERENCES_KEY, '{corrupt data');
    const prefs = loadUserPreferences();
    expect(prefs.defaultView).toBe('campus');
  });

  it('normalises invalid defaultView to campus', () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ defaultView: 'invalid' }));
    const prefs = loadUserPreferences();
    expect(prefs.defaultView).toBe('campus');
  });

  it('normalises null preferredCampusId to empty string', () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ preferredCampusId: null }));
    const prefs = loadUserPreferences();
    expect(prefs.preferredCampusId).toBe('');
  });

  it('coerces falsy booleans to false', () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({
      showGroupPins: false,
      notifyGroupActivity: false,
    }));
    const prefs = loadUserPreferences();
    expect(prefs.showGroupPins).toBe(false);
    expect(prefs.notifyGroupActivity).toBe(false);
  });
});

// ─── saveUserPreferences ─────────────────────────────────────────────────────

describe('saveUserPreferences', () => {
  it('persists partial updates merged with existing defaults', () => {
    const result = saveUserPreferences({ defaultView: 'city' });
    expect(result.defaultView).toBe('city');
    expect(result.showGroupPins).toBe(true);

    const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY));
    expect(stored.defaultView).toBe('city');
    expect(stored.showGroupPins).toBe(true);
  });

  it('returns the merged snapshot', () => {
    const result = saveUserPreferences({ notifyClaimExpiry: false });
    expect(result.notifyClaimExpiry).toBe(false);
    expect(result.defaultView).toBe('campus');
  });

  it('overwrites previously stored values', () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ defaultView: 'city' }));
    const result = saveUserPreferences({ defaultView: 'campus' });
    expect(result.defaultView).toBe('campus');
  });

  it('normalises invalid values on save', () => {
    const result = saveUserPreferences({ defaultView: 'invalid' });
    expect(result.defaultView).toBe('campus');
  });

  it('handles localStorage write errors gracefully', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const setItem = vi.spyOn(localStorage, 'setItem')
      .mockImplementation(() => { throw new Error('QuotaExceededError'); });

    const result = saveUserPreferences({ defaultView: 'city' });
    expect(result.defaultView).toBe('city');

    warn.mockRestore();
    setItem.mockRestore();
  });
});
