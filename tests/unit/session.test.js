/**
 * tests/unit/session.test.js
 *
 * Unit tests for src/utils/session.js
 * Uses jsdom environment for localStorage support.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// We reset modules before each test so the module-level _sessionId
// private variable is re-initialised fresh every time.

describe('getSessionId', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('creates a new UUID-like id when localStorage is empty', async () => {
    const { getSessionId } = await import('../../src/utils/session.js');
    const id = getSessionId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(8);
  });

  it('persists the id to localStorage', async () => {
    const { getSessionId } = await import('../../src/utils/session.js');
    const id = getSessionId();
    expect(localStorage.getItem('perch_session_id')).toBe(id);
  });

  it('returns the same id on subsequent calls within the same import (in-memory cache)', async () => {
    const { getSessionId } = await import('../../src/utils/session.js');
    const id1 = getSessionId();
    const id2 = getSessionId();
    expect(id1).toBe(id2);
  });

  it('restores id from localStorage on next module load', async () => {
    const savedId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';
    localStorage.setItem('perch_session_id', savedId);
    const { getSessionId } = await import('../../src/utils/session.js');
    expect(getSessionId()).toBe(savedId);
  });
});

describe('initSession', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('initialises the session without throwing', async () => {
    const { initSession } = await import('../../src/utils/session.js');
    expect(() => initSession()).not.toThrow();
  });

  it('ensures the session id is in localStorage after initSession', async () => {
    const { initSession } = await import('../../src/utils/session.js');
    initSession();
    expect(localStorage.getItem('perch_session_id')).toBeTruthy();
  });
});
