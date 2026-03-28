/**
 * src/api/claims.js
 *
 * Read and write operations for the `claims` table.
 *
 * All writes require the user to be authenticated (Google OAuth via Supabase).
 * The database enforces ownership via auth.uid() in RLS policies — the client
 * never needs to pass a session or user id manually.
 *
 * The database enforces a 30-minute auto-expiry via the `expires_at` column.
 * A pg_cron job sets cancelled_at on expired rows; Supabase Realtime
 * broadcasts those updates to all connected clients automatically.
 */

import { supabase } from './supabaseClient.js';

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
  const { data, error } = await supabase
    .from('claims')
    .insert({
      spot_id:        spotId,
      // user_id is set implicitly by the RLS policy (auth.uid()) — not passed here.
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
 * Only succeeds if the caller owns the claim (enforced by RLS auth.uid()).
 *
 * @param {string} claimId
 * @returns {Promise<{ error: object | null }>}
 */
export async function cancelClaim(claimId) {
  const { error } = await supabase
    .from('claims')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', claimId);
  // RLS policy handles the user_id check (auth.uid() = user_id)

  if (error) {
    console.error('[claims] cancelClaim error:', error.message);
  }

  return { error };
}

/**
 * Fetch the personal claim history for the signed-in user.
 *
 * Rows are ordered newest-first and paginated. Each row includes a nested
 * `spots` object so callers can display the spot name and building without
 * a separate query.
 *
 * @param {{ limit?: number, offset?: number }} [options]
 * @returns {Promise<{ data: object[], error: object | null }>}
 *   `data` is an array of claim rows (empty array on error).
 *   Each row shape: { id, spot_id, group_size_key, claimed_at, expires_at,
 *                     cancelled_at, spots: { name, building } | null }
 */
export async function fetchClaimHistory({ limit = 20, offset = 0 } = {}) {
  const { data, error } = await supabase
    .from('claims')
    .select('id, spot_id, group_size_key, claimed_at, expires_at, cancelled_at, spots(name, building)')
    .order('claimed_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[claims] fetchClaimHistory error:', error.message);
    return { data: [], error };
  }

  return { data: data ?? [], error: null };
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
    .select('id, spot_id, user_id, nickname, group_size_key, group_size_min, group_size_max, claimed_at, expires_at')
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
