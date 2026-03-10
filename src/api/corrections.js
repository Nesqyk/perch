/**
 * src/api/corrections.js
 *
 * Write operations for the `corrections` table.
 *
 * A correction ("Report Full") is an append-only event log entry.
 * The confidence engine (background job) reads this table to adjust
 * future predictions for the same spot + day + hour combination.
 *
 * Client-side, a correction immediately tanks the local confidence score
 * so the pin turns red without waiting for the background job — see
 * dispatch('CORRECTION_FILED') in store.js.
 */

import { supabase }     from './supabaseClient.js';
import { getSessionId } from '../utils/session.js';

/**
 * Submit a "Report Full" correction for a spot.
 *
 * @param {{
 *   spotId: string,
 *   reason: 'locked' | 'occupied' | 'overcrowded' | 'event' | null,
 * }} params
 * @returns {Promise<{ error: object | null }>}
 */
export async function submitCorrection({ spotId, reason = null }) {
  const sessionId  = getSessionId();
  const now        = new Date();

  const { error } = await supabase
    .from('corrections')
    .insert({
      spot_id:     spotId,
      session_id:  sessionId,
      reason,
      corrected_at: now.toISOString(),
      day_of_week:  now.getDay(),   // 0 (Sun) – 6 (Sat)
      hour_of_day:  now.getHours(), // 0 – 23
    });

  if (error) {
    console.error('[corrections] submitCorrection error:', error.message);
  }

  return { error };
}
