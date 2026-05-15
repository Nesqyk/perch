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
  const mockUpsert = vi.fn();
  const mockSelect = vi.fn().mockReturnThis();
  const mockFrom   = vi.fn(() => ({
    select: mockSelect,
    update: mockUpdate,
    upsert: mockUpsert,
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

vi.mock('../../src/api/claims.js', () => ({
  fetchClaimHistory: vi.fn(),
}));

vi.mock('../../src/api/campuses.js', () => ({
  fetchMyBuildings: vi.fn(),
  fetchMySpotSubmissions: vi.fn(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { fetchMyBuildings, fetchMySpotSubmissions } from '../../src/api/campuses.js';
import { fetchClaimHistory } from '../../src/api/claims.js';
import { fetchProfileDashboard, getProfile, upsertProfile } from '../../src/api/profile.js';

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

    it('upserts the authenticated profile with the correct data', async () => {
      supabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'uid-1',
            email: 'student@example.com',
            user_metadata: {},
          },
        },
      });
      const fromResult = supabase.from('user_profiles');
      fromResult.upsert.mockResolvedValue({ error: null });

      const result = await upsertProfile('NewNickname');

      expect(supabase.from).toHaveBeenCalledWith('user_profiles');
      expect(fromResult.upsert).toHaveBeenCalledWith({
        user_id: 'uid-1',
        nickname: 'NewNickname',
        avatar_url: null,
      }, { onConflict: 'user_id', ignoreDuplicates: false });
      expect(result.error).toBeNull();
    });

    it('returns error message on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      supabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'uid-1',
            email: 'fail@example.com',
            user_metadata: {},
          },
        },
      });
      const fromResult = supabase.from('user_profiles');
      fromResult.upsert.mockResolvedValue({ error: { message: 'Update failed' } });

      const result = await upsertProfile('FailName');

      expect(result.error).toBe('Update failed');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('fetchProfileDashboard', () => {
    it('uses a provided user instead of calling auth.getUser again', async () => {
      const user = { id: 'uid-1', email: 'student@example.com', user_metadata: {} };
      const profileQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: 'uid-1', nickname: 'Ty' }, error: null }),
      };
      supabase.from.mockReturnValueOnce(profileQuery);
      fetchClaimHistory.mockResolvedValue({ data: [{ id: 'claim-1' }], error: null });
      fetchMySpotSubmissions.mockResolvedValue([{ id: 'sub-1' }]);
      fetchMyBuildings.mockResolvedValue([{ id: 'building-1' }]);

      const result = await fetchProfileDashboard({ user });

      expect(supabase.auth.getUser).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        user,
        profile: { user_id: 'uid-1', nickname: 'Ty' },
        claims: [{ id: 'claim-1' }],
        submissions: [{ id: 'sub-1' }],
        buildings: [{ id: 'building-1' }],
        error: null,
      });
    });

    it('retries once when a profile dashboard task hits a Supabase auth lock abort', async () => {
      const user = { id: 'uid-1', email: 'student@example.com', user_metadata: {} };
      const profileQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
      };
      profileQuery.maybeSingle
        .mockRejectedValueOnce(new DOMException("Lock broken by another request with the 'steal' option.", 'AbortError'))
        .mockResolvedValueOnce({ data: { user_id: 'uid-1', nickname: 'Ty' }, error: null });
      supabase.from.mockReturnValue(profileQuery);
      fetchClaimHistory.mockResolvedValue({ data: [], error: null });
      fetchMySpotSubmissions.mockResolvedValue([]);
      fetchMyBuildings.mockResolvedValue([]);

      const result = await fetchProfileDashboard({ user });

      expect(profileQuery.maybeSingle).toHaveBeenCalledTimes(2);
      expect(result.profile).toEqual({ user_id: 'uid-1', nickname: 'Ty' });
      expect(result.error).toBeNull();
    });
  });
});
