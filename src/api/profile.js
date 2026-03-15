/**
 * src/api/profile.js
 *
 * Read/write operations for the `user_profiles` table.
 * Users are identified by their browser's anonymous session ID.
 */

import { supabase }   from './supabaseClient.js';
import { getSessionId } from '../utils/session.js';

/**
 * Fetch the user's nickname from the database.
 *
 * @returns {Promise<object | null>} { session_id, nickname } or null
 */
export async function getProfile() {
  const sessionId = getSessionId();
  if (!sessionId) return null;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('session_id, nickname')
    .eq('session_id', sessionId)
    .single();

  if (error) {
    // PGRST116 is the "no rows found" error code for .single()
    if (error.code !== 'PGRST116') {
      console.error('[profile] getProfile error:', error.message);
    }
    return null;
  }

  return data;
}

/**
 * Create or update the user's nickname in the database.
 *
 * @param {string} nickname
 * @returns {Promise<{ error: string | null }>}
 */
export async function upsertProfile(nickname) {
  const sessionId = getSessionId();
  if (!sessionId) return { error: 'No session id' };

  const { error } = await supabase
    .from('user_profiles')
    .upsert({
      session_id: sessionId,
      nickname:   nickname,
    });

  if (error) {
    console.error('[profile] upsertProfile error:', error.message);
    return { error: error.message };
  }

  return { error: null };
}
