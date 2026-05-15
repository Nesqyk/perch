/**
 * src/api/corrections.js
 *
 * Write operations for the `corrections` table.
 *
 * A correction ("Report Full") is an append-only event log entry.
 * The confidence engine reads this table to adjust future predictions for the
 * same spot + day + hour combination. Corrections are now auth-owned rows.
 */

import { supabase } from './supabaseClient.js';

/**
 * Submit a "Report Full" correction for a spot.
 *
 * @param {{
 *   spotId: string,
 *   reason: 'locked' | 'occupied' | 'overcrowded' | 'event' | null,
 * }} params
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export async function submitCorrection({ spotId, reason = null }) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const userId = authData?.user?.id ?? null;

  if (authError || !userId) {
    const error = { message: authError?.message ?? 'Please sign in before reporting a spot.' };
    console.error('[corrections] submitCorrection auth error:', error.message);
    return { data: null, error };
  }

  const now = new Date();

  const { data, error } = await supabase
    .from('corrections')
    .insert({
      spot_id:      spotId,
      user_id:      userId,
      reason,
      corrected_at: now.toISOString(),
      day_of_week:  now.getDay(),
      hour_of_day:  now.getHours(),
    })
    .select()
    .single();

  if (error) {
    console.error('[corrections] submitCorrection error:', error.message);
  }

  return { data, error };
}
