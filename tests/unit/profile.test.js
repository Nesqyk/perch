/**
 * tests/unit/profile.test.js
 *
 * Unit tests for src/api/profile.js.
 * Mocks Supabase to test fetching and updating user nicknames.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../../src/api/supabaseClient.js';

// ─── Mock Supabase ────────────────────────────────────────────────────────────

vi.mock('../../src/api/supabaseClient.js', () => {
  const mockSingle = vi.fn();
  const mockEq     = vi.fn().mockReturnThis();
  const mockUpdate = vi.fn().mockReturnThis();
  const mockSelect = vi.fn().mockReturnThis();
  const mockFrom   = vi.fn(() => ({
    select: mockSelect,
    update: mockUpdate,
    eq:     mockEq,
    single: mockSingle,
  }));

  const mockGetUser = vi.fn();

  return {
    supabase: {
      from: mockFrom,
      auth: {
        getUser: mockGetUser,
      },
    },
  };
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import { getProfile, upsertProfile } from '../../src/api/profile.js';

describe('profile API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProfile', () => {
    it('returns the profile data on success', async () => {
      const mockData = { user_id: 'test-user-id', nickname: 'TestUser' };
      const fromResult = supabase.from('user_profiles');
      fromResult.single.mockResolvedValue({ data: mockData, error: null });

      const result = await getProfile();

      expect(supabase.from).toHaveBeenCalledWith('user_profiles');
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
    it('returns an error when unauthenticated', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

      const result = await upsertProfile('NewNickname');

      expect(result.error).toBe('Not authenticated.');
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('calls update with the correct data', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'uid-1' } } });
      const fromResult = supabase.from('user_profiles');
      fromResult.eq.mockResolvedValue({ error: null });

      const result = await upsertProfile('NewNickname');

      expect(supabase.from).toHaveBeenCalledWith('user_profiles');
      expect(fromResult.update).toHaveBeenCalledWith({ nickname: 'NewNickname' });
      expect(fromResult.eq).toHaveBeenCalledWith('user_id', 'uid-1');
      expect(result.error).toBeNull();
    });

    it('returns error message on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'uid-1' } } });
      const fromResult = supabase.from('user_profiles');
      fromResult.eq.mockResolvedValue({ error: { message: 'Update failed' } });

      const result = await upsertProfile('FailName');

      expect(result.error).toBe('Update failed');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
