/**
 * tests/unit/profile.test.js
 *
 * Unit tests for src/api/profile.js.
 * Mocks Supabase to test fetching and updating user nicknames.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../../src/api/supabaseClient.js';

// ─── Mock Supabase and session ────────────────────────────────────────────────

vi.mock('../../src/api/supabaseClient.js', () => {
  const mockSingle = vi.fn();
  const mockEq     = vi.fn().mockReturnThis();
  const mockSelect = vi.fn().mockReturnThis();
  const mockUpsert = vi.fn().mockReturnThis();
  const mockFrom   = vi.fn(() => ({
    select: mockSelect,
    upsert: mockUpsert,
    eq:     mockEq,
    single: mockSingle,
  }));

  return {
    supabase: {
      from: mockFrom,
    },
  };
});

vi.mock('../../src/utils/session.js', () => ({
  getSessionId: vi.fn(() => 'test-session-id'),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { getProfile, upsertProfile } from '../../src/api/profile.js';

describe('profile API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProfile', () => {
    it('returns the profile data on success', async () => {
      const mockData = { session_id: 'test-session-id', nickname: 'TestUser' };
      const fromResult = supabase.from('user_profiles');
      fromResult.single.mockResolvedValue({ data: mockData, error: null });

      const result = await getProfile();

      expect(supabase.from).toHaveBeenCalledWith('user_profiles');
      expect(fromResult.eq).toHaveBeenCalledWith('session_id', 'test-session-id');
      expect(result).toEqual(mockData);
    });

    it('returns null if the profile does not exist', async () => {
      const fromResult = supabase.from('user_profiles');
      fromResult.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

      const result = await getProfile();

      expect(result).toBeNull();
    });

    it('returns null and logs error on other failures', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fromResult = supabase.from('user_profiles');
      fromResult.single.mockResolvedValue({ data: null, error: { message: 'Database error' } });

      const result = await getProfile();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('upsertProfile', () => {
    it('calls upsert with the correct data', async () => {
      const fromResult = supabase.from('user_profiles');
      fromResult.upsert.mockResolvedValue({ error: null });

      const result = await upsertProfile('NewNickname');

      expect(supabase.from).toHaveBeenCalledWith('user_profiles');
      expect(fromResult.upsert).toHaveBeenCalledWith({
        session_id: 'test-session-id',
        nickname:   'NewNickname',
      });
      expect(result.error).toBeNull();
    });

    it('returns error message on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fromResult = supabase.from('user_profiles');
      fromResult.upsert.mockResolvedValue({ error: { message: 'Upsert failed' } });

      const result = await upsertProfile('FailName');

      expect(result.error).toBe('Upsert failed');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
