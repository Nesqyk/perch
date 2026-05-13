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

/**
 * Fetch the authenticated user's profile row.
 * Returns null when unauthenticated or no profile row exists yet.
 *
 * @returns {Promise<{ user_id: string, nickname: string, avatar_url?: string, cover_image_url?: string, school_label?: string, scholar_label?: string } | null>}
 */
export async function getProfile() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, nickname, avatar_url, cover_image_url, school_label, scholar_label')
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
 * Update the authenticated user's nickname.
 *
 * The profile row is auto-created by the on_auth_user_created DB trigger
 * (seeded from Google display name). This function just updates the nickname.
 *
 * Returns an error string when called without an active session — the caller
 * must not rely solely on RLS silence to detect this case.
 *
 * @param {string} nickname
 * @returns {Promise<{ error: string | null }>}
 */
export async function upsertProfile(nickname) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated.' };
  }

  // RLS scopes this UPSERT to auth.uid() automatically.
  const { error } = await supabase
    .from('user_profiles')
    .upsert({
      user_id: user.id,
      nickname: nickname || user.user_metadata?.full_name || fallbackNameFromEmail(user.email),
      avatar_url: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
    }, { onConflict: 'user_id', ignoreDuplicates: false });

  if (error) {
    console.error('[profile] upsertProfile error:', error.message);
    return { error: error.message };
  }

  return { error: null };
}
