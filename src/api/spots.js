/**
 * src/api/spots.js
 *
 * All read operations against the `spots` and `spot_confidence` tables.
 *
 * Returns plain objects — no Supabase types leak into the rest of the app.
 * Callers (main.js) feed the result into dispatch('SPOTS_LOADED', ...).
 */

import { supabase } from './supabaseClient.js';

/**
 * Fetch all active spots together with their latest confidence scores.
 *
 * We join spot_confidence in a single query to avoid a second round-trip.
 * Supabase's PostgREST syntax: spot_confidence(score, reason, valid_until)
 * returns the related rows as a nested array — we flatten it to a single
 * object keyed by spot id.
 *
 * @returns {Promise<{
 *   spots:      object[],
 *   confidence: Record<string, { score: number, reason: string, validUntil: string }>
 * }>}
 */
export async function fetchSpots() {
  const { data, error } = await supabase
    .from('spots')
    .select(`
      id,
      name,
      type,
      campus_id,
      building_id,
      on_campus,
      building,
      floor,
      walk_time_min,
      rough_capacity,
      has_outlets,
      wifi_strength,
      noise_baseline,
      has_food,
      lat,
      lng,
      spot_confidence (
        score,
        reason,
        valid_until
      )
    `)
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('[spots] fetchSpots error:', error.message);
    return { spots: [], confidence: {} };
  }

  // Flatten confidence: spot has at most one active confidence row.
  const confidence = {};
  const spots = data.map(row => {
    const conf = row.spot_confidence?.[0] ?? null;
    if (conf) {
      confidence[row.id] = {
        score:      conf.score,
        reason:     conf.reason,
        validUntil: conf.valid_until,
      };
    }
    // Return the spot without the nested confidence array.
    const { spot_confidence: _, ...spot } = row;
    return spot;
  });

  return { spots, confidence };
}

/**
 * Fetch a single spot by id.
 * Used when opening the app via a shared link (?spot=<uuid>).
 *
 * @param {string} spotId
 * @returns {Promise<object | null>}
 */
export async function fetchSpotById(spotId) {
  const { data, error } = await supabase
    .from('spots')
    .select('*')
    .eq('id', spotId)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('[spots] fetchSpotById error:', error.message);
    return null;
  }

  return data;
}

/**
 * Fetch all active schedule entries for a spot.
 * Used by the confidence display: "No class until 1:00 PM".
 *
 * @param {string} spotId
 * @returns {Promise<object[]>}
 */
export async function fetchScheduleForSpot(spotId) {
  const { data, error } = await supabase
    .from('schedule_entries')
    .select('subject_code, section, day_of_week, start_time, end_time')
    .eq('spot_id', spotId);

  if (error) {
    console.error('[spots] fetchScheduleForSpot error:', error.message);
    return [];
  }

  return data ?? [];
}
