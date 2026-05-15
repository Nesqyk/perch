/**
 * src/api/profile.js
 *
 * Read/write operations for the `user_profiles` table.
 *
 * Users are now identified by their authenticated Supabase user id (auth.uid()).
 * The RLS policy restricts reads and writes to the owning user only, so the
 * client sends no identity — the JWT handles it automatically.
 */

import { supabase } from './supabaseClient.js';
import { fallbackNameFromEmail } from './auth.js';
import { fetchClaimHistory } from './claims.js';
import { fetchMyBuildings, fetchMySpotSubmissions } from './campuses.js';

const PROFILE_SELECT = `
  user_id,
  nickname,
  avatar_url,
  cover_image_url,
  school_label,
  scholar_label,
  student_id,
  course_label,
  class_label,
  verified_student,
  study_vibes,
  created_at,
  updated_at
`;

/**
 * Fetch the authenticated user's profile row.
 * Returns null when unauthenticated or no profile row exists yet.
 *
 * @returns {Promise<object | null>}
 */
export async function getProfile() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select(PROFILE_SELECT)
    .single();

  if (error) {
    // PGRST116 = no rows found (new user before trigger fires, or unauthenticated).
    if (error.code !== 'PGRST116') {
      console.error('[profile] getProfile error:', error.message);
    }
    return null;
  }

  return data;
}

/**
 * Fetch the authenticated user's composed profile dashboard payload.
 *
 * @param {{ activityLimit?: number, user?: object | null }} [options]
 * @returns {Promise<{ user: object | null, profile: object | null, claims: object[], submissions: object[], buildings: object[], error: string | null }>}
 */
export async function fetchProfileDashboard({ activityLimit = 12, user: providedUser = null } = {}) {
  let user = providedUser;
  let authError = null;

  if (!user) {
    const authResult = await supabase.auth.getUser();
    user = authResult.data?.user ?? null;
    authError = authResult.error;
  }

  if (authError || !user) {
    return {
      user: null,
      profile: null,
      claims: [],
      submissions: [],
      buildings: [],
      error: authError?.message ?? 'Not authenticated.',
    };
  }

  const [profileResult, claimResult, submissionsResult, buildingsResult] = await Promise.allSettled([
    _retryAuthLockAbort(() => _ensureProfile(user)),
    _retryAuthLockAbort(() => fetchClaimHistory({ limit: activityLimit, offset: 0 })),
    _retryAuthLockAbort(() => fetchMySpotSubmissions(user.id)),
    _retryAuthLockAbort(() => fetchMyBuildings(user.id)),
  ]);
  const claimsPayload = profileSettledValue(claimResult, { data: [], error: null });

  return {
    user,
    profile: profileSettledValue(profileResult, null),
    claims: claimsPayload.data ?? [],
    submissions: profileSettledValue(submissionsResult, []),
    buildings: profileSettledValue(buildingsResult, []),
    error: _profileDashboardError([profileResult, claimResult, submissionsResult, buildingsResult], claimsPayload),
  };
}

/**
 * @param {PromiseSettledResult<unknown>} result
 * @param {unknown} fallback
 * @returns {unknown}
 */
function profileSettledValue(result, fallback) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

/**
 * @param {PromiseSettledResult<unknown>[]} results
 * @param {{ error?: object | null }} claimPayload
 * @returns {string | null}
 */
function _profileDashboardError(results, claimPayload) {
  if (claimPayload?.error) return 'Could not load all profile activity.';
  return results.some((result) => result.status === 'rejected')
    ? 'Could not load all profile activity.'
    : null;
}

/**
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
async function _retryAuthLockAbort(task) {
  try {
    return await task();
  } catch (err) {
    if (!_isAuthLockAbort(err)) throw err;
    await new Promise(resolve => setTimeout(resolve, 150));
    return task();
  }
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function _isAuthLockAbort(err) {
  return err?.name === 'AbortError'
    && String(err?.message ?? '').includes('Lock broken by another request');
}

/**
 * Update the authenticated user's profile.
 *
 * The profile row is auto-created by the on_auth_user_created DB trigger
 * (seeded from auth metadata). This function upserts editable profile fields.
 *
 * Returns an error string when called without an active session — the caller
 * must not rely solely on RLS silence to detect this case.
 *
 * @param {string | {
 *   nickname?: string,
 *   studentId?: string,
 *   courseLabel?: string,
 *   classLabel?: string,
 *   studyVibes?: string[],
 *   avatarUrl?: string | null,
 *   coverImageUrl?: string | null,
 *   schoolLabel?: string,
 *   scholarLabel?: string,
 * }} profileInput
 * @returns {Promise<{ error: string | null }>}
 */
export async function upsertProfile(profileInput) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated.' };
  }

  const input = typeof profileInput === 'string'
    ? { nickname: profileInput }
    : (profileInput ?? {});

  // RLS scopes this UPSERT to auth.uid() automatically.
  const row = {
    user_id: user.id,
    nickname: input.nickname || user.user_metadata?.full_name || fallbackNameFromEmail(user.email),
    avatar_url: input.avatarUrl !== undefined
      ? input.avatarUrl
      : (user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null),
  };
  if (input.coverImageUrl !== undefined) row.cover_image_url = input.coverImageUrl;
  if (input.schoolLabel !== undefined) row.school_label = input.schoolLabel;
  if (input.scholarLabel !== undefined) row.scholar_label = input.scholarLabel;
  if (input.studentId !== undefined) row.student_id = input.studentId || null;
  if (input.courseLabel !== undefined) row.course_label = input.courseLabel || null;
  if (input.classLabel !== undefined) row.class_label = input.classLabel || null;
  if (input.studyVibes !== undefined) {
    row.study_vibes = Array.isArray(input.studyVibes)
      ? input.studyVibes.map((vibe) => String(vibe).trim()).filter(Boolean).slice(0, 6)
      : [];
  }

  const { error } = await supabase
    .from('user_profiles')
    .upsert(row, { onConflict: 'user_id', ignoreDuplicates: false });

  if (error) {
    console.error('[profile] upsertProfile error:', error.message);
    return { error: error.message };
  }

  return { error: null };
}

async function _ensureProfile(user) {
  const { data: existing, error: fetchError } = await supabase
    .from('user_profiles')
    .select(PROFILE_SELECT)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchError) {
    console.error('[profile] _ensureProfile fetch error:', fetchError.message);
    return null;
  }
  if (existing) return existing;

  const { error } = await upsertProfile({
    nickname: user.user_metadata?.full_name || fallbackNameFromEmail(user.email),
    avatarUrl: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
  });
  if (error) return null;

  const { data } = await supabase
    .from('user_profiles')
    .select(PROFILE_SELECT)
    .eq('user_id', user.id)
    .maybeSingle();

  return data ?? null;
}
