/**
 * src/api/campuses.js
 *
 * Read operations for the `campuses` table.
 *
 * Campuses hold map center coords and bounding boxes used by mapInit.js
 * to fly+constrain the viewport when the user selects a campus.
 *
 * Returns plain objects — no Supabase types leak out.
 */

import { supabase } from './supabaseClient.js';

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetch all active campuses ordered by name.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchCampuses() {
  const { data, error } = await supabase
    .from('campuses')
    .select('id, name, short_name, city, lat, lng, bounds_sw_lat, bounds_sw_lng, bounds_ne_lat, bounds_ne_lng, default_zoom')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('[campuses] fetchCampuses error:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Submit a user-dropped marker as a pending spot_submission.
 *
 * @param {{ campusId: string, lat: number, lng: number, spotName: string, description: string, sessionId: string }} params
 * @returns {Promise<{ data: object | null, error: string | null }>}
 */
export async function submitSpot({ campusId, lat, lng, spotName, description, sessionId }) {
  const { data, error } = await supabase
    .from('spot_submissions')
    .insert({
      campus_id:    campusId,
      lat,
      lng,
      spot_name:    spotName,
      description:  description || null,
      submitted_by: sessionId,
      session_id:   sessionId,
      status:       'pending',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[campuses] submitSpot error:', error.message);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}
