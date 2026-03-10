/**
 * src/api/claims.js
 *
 * Write operations for the `claims` table.
 *
 * All claims are anonymous — identified only by the session token stored
 * in localStorage (see utils/session.js). No user accounts needed.
 *
 * The database enforces a 30-minute auto-expiry via the `expires_at` column.
 * A pg_cron job sets cancelled_at on expired rows; Supabase Realtime
 * broadcasts those updates to all connected clients automatically.
 */

import { supabase }      from './supabaseClient.js';
import { getSessionId }  from '../utils/session.js';

/**
 * Write a new claim to the database.
 *
 * @param {{
 *   spotId:       string,
 *   groupSizeKey: 'solo' | 'small' | 'medium' | 'large',
 *   groupSizeMin: number,
 *   groupSizeMax: number | null,
 * }} params
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export async function createClaim({ spotId, groupSizeKey, groupSizeMin, groupSizeMax }) {
  const sessionId = getSessionId();

  const { data, error } = await supabase
    .from('claims')
    .insert({
      spot_id:        spotId,
      session_id:     sessionId,
      group_size_key: groupSizeKey,
      group_size_min: groupSizeMin,
      group_size_max: groupSizeMax,
      // expires_at is set by the DB default: now() + interval '30 minutes'
    })
    .select()
    .single();

  if (error) {
    console.error('[claims] createClaim error:', error.message);
  }

  return { data, error };
}

/**
 * Cancel an existing claim.
 * Only succeeds if the session_id matches (enforced by RLS).
 *
 * @param {string} claimId
 * @returns {Promise<{ error: object | null }>}
 */
export async function cancelClaim(claimId) {
  const sessionId = getSessionId();

  const { error } = await supabase
    .from('claims')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', claimId)
    .eq('session_id', sessionId); // RLS double-check

  if (error) {
    console.error('[claims] cancelClaim error:', error.message);
  }

  return { error };
}

/**
 * Fetch all currently active claims for a set of spot ids.
 * Called on app init to populate the initial claims state.
 *
 * @param {string[]} spotIds
 * @returns {Promise<Record<string, object[]>>}
 *   Object keyed by spot_id, each value is an array of claim rows.
 */
export async function fetchActiveClaims(spotIds) {
  if (!spotIds.length) return {};

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('claims')
    .select('id, spot_id, session_id, group_size_key, group_size_min, group_size_max, claimed_at, expires_at')
    .in('spot_id', spotIds)
    .is('cancelled_at', null)
    .gt('expires_at', now);

  if (error) {
    console.error('[claims] fetchActiveClaims error:', error.message);
    return {};
  }

  // Group by spot_id.
  return (data ?? []).reduce((acc, claim) => {
    if (!acc[claim.spot_id]) acc[claim.spot_id] = [];
    acc[claim.spot_id].push(claim);
    return acc;
  }, {});
}
