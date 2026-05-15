/**
 * src/api/spots.js
 *
 * All read operations against the `spots` and `spot_confidence` tables.
 *
 * Returns plain objects — no Supabase types leak into the rest of the app.
 * Callers (main.js) feed the result into dispatch('SPOTS_LOADED', ...).
 */

import { supabase } from './supabaseClient.js';

const COMMUNITY_SPOT_SELECT = `
  id,
  name,
  type,
  campus_id,
  area_id,
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
  image_path,
  created_by,
  availability_status,
  availability_updated_at,
  availability_updated_by,
  areas (
    id,
    sitio,
    barangay,
    city_municipality,
    lat,
    lng
  )
`;

const SPOT_IMAGES_BUCKET = 'spot-images';
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SPOT_SELECT = `
  id,
  name,
  type,
  campus_id,
  area_id,
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
  image_path,
  created_by,
  availability_status,
  availability_updated_at,
  availability_updated_by,
  areas (
    id,
    sitio,
    barangay,
    city_municipality,
    lat,
    lng
  ),
  spot_confidence (
    score,
    reason,
    valid_until
  )
`;

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
    .select(SPOT_SELECT)
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('[spots] fetchSpots error:', error.message);
    return { spots: [], confidence: {} };
  }

  // Flatten confidence: spot has at most one active confidence row.
  const confidence = {};
  const spots = await Promise.all(data.map(async (row) => {
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
    return _hydrateSpotImage(spot);
  }));

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
    .select(`
      id,
      name,
      type,
      campus_id,
      area_id,
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
      image_path,
      created_by,
      availability_status,
      availability_updated_at,
      availability_updated_by,
      areas (
        id,
        sitio,
        barangay,
        city_municipality,
        lat,
        lng
      ),
      is_active,
      created_at,
      updated_at
    `)
    .eq('id', spotId)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('[spots] fetchSpotById error:', error.message);
    return null;
  }

  return _hydrateSpotImage(data);
}

/**
 * Create a live community spot.
 *
 * @param {{
 *   campusId: string | null,
 *   areaId?: string | null,
 *   lat: number,
 *   lng: number,
 *   buildingName: string,
 *   floor: string,
 *   spotName: string,
 *   description?: string,
 *   spotType?: string,
 *   onCampus?: boolean,
 * }} params
 * @returns {Promise<{ spot: object | null, error: string | null }>}
 */
export async function createCommunitySpot({
  campusId,
  areaId = null,
  lat,
  lng,
  buildingName,
  floor,
  spotName,
  description = '',
  spotType = '',
  onCampus = true,
}) {
  const userId = await _getAuthenticatedUserId();
  if (!userId) {
    return { spot: null, error: 'Please sign in before adding a spot.' };
  }

  const result = await _createOrFindCommunitySpot({
    userId,
    campusId,
    areaId,
    lat,
    lng,
    buildingName,
    floor,
    spotName,
    description,
    spotType,
    onCampus,
  });

  if (result.error) {
    console.error('[spots] createCommunitySpot error:', result.error);
    return { spot: null, error: result.error };
  }

  return { spot: result.spot, error: null };
}

/**
 * Create many live community spots in one building using shared metadata.
 *
 * @param {{
 *   campusId: string | null,
 *   areaId?: string | null,
 *   lat: number,
 *   lng: number,
 *   buildingName: string,
 *   floor: string,
 *   roomNames: string[],
 *   description?: string,
 *   spotType?: string,
 *   onCampus?: boolean,
 * }} params
 * @returns {Promise<{ created: object[], skipped: string[], error: string | null }>}
 */
export async function createCommunitySpotsBulk({
  campusId,
  areaId = null,
  lat,
  lng,
  buildingName,
  floor,
  roomNames,
  description = '',
  spotType = '',
  onCampus = true,
}) {
  const userId = await _getAuthenticatedUserId();
  if (!userId) {
    return { created: [], skipped: [], error: 'Please sign in before adding rooms.' };
  }

  const created = [];
  const skipped = [];
  for (const roomName of roomNames) {
    const result = await _createOrFindCommunitySpot({
      userId,
      campusId,
      areaId,
      lat,
      lng,
      buildingName,
      floor,
      spotName: roomName,
      description,
      spotType,
      onCampus,
    });

    if (result.error) {
      console.error('[spots] createCommunitySpotsBulk error:', result.error);
      return { created, skipped, error: result.error };
    }

    if (result.duplicate) {
      skipped.push(roomName);
      continue;
    }

    if (result.spot) {
      created.push(result.spot);
    }
  }

  return { created, skipped, error: null };
}

async function _findExistingCommunitySpot(payload) {
  let query = supabase
    .from('spots')
    .select(COMMUNITY_SPOT_SELECT)
    .eq('is_active', true)
    .ilike('name', payload.name);

  query = payload.campus_id
    ? query.eq('campus_id', payload.campus_id)
    : query.is('campus_id', null);
  query = payload.building
    ? query.ilike('building', payload.building)
    : query.is('building', null);
  query = payload.floor
    ? query.ilike('floor', payload.floor)
    : query.is('floor', null);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) {
    console.warn('[spots] _findExistingCommunitySpot warning:', error.message);
    return null;
  }

  return data ?? null;
}

async function _getAuthenticatedUserId() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const userId = authData?.user?.id ?? null;
  if (authError || !userId) {
    console.error('[spots] auth error:', authError?.message ?? 'Missing authenticated user.');
    return null;
  }
  return userId;
}

async function _createOrFindCommunitySpot({
  userId,
  campusId,
  areaId = null,
  lat,
  lng,
  buildingName,
  floor,
  spotName,
  description = '',
  spotType = '',
  onCampus = true,
}) {
  const payload = {
    campus_id: campusId || null,
    area_id: areaId || null,
    name: spotName,
    type: spotType || (description ? 'community' : null),
    on_campus: Boolean(onCampus),
    building: buildingName || null,
    floor: floor || null,
    walk_time_min: 0,
    rough_capacity: null,
    has_outlets: false,
    wifi_strength: null,
    noise_baseline: null,
    has_food: false,
    lat,
    lng,
    is_active: true,
    created_by: userId,
  };

  const existing = await _findExistingCommunitySpot(payload);
  if (existing) {
    return { spot: await _hydrateSpotImage(existing), duplicate: true, error: null };
  }

  const { data, error } = await supabase
    .from('spots')
    .insert(payload)
    .select(COMMUNITY_SPOT_SELECT)
    .single();

  if (error) {
    const fallback = await _findExistingCommunitySpot(payload);
    if (fallback) {
      return { spot: await _hydrateSpotImage(fallback), duplicate: true, error: null };
    }
    return { spot: null, duplicate: false, error: error.message };
  }

  return { spot: await _hydrateSpotImage(data), duplicate: false, error: null };
}

/**
 * Upload a spot image into Supabase Storage.
 *
 * @param {{ spotId: string, file: File }} params
 * @returns {Promise<{ path: string, url: string, error: string | null }>}
 */
export async function uploadSpotImage({ spotId, file }) {
  if (!UUID_RE.test(String(spotId ?? ''))) {
    return { path: '', url: '', error: 'A valid spot is required before uploading an image.' };
  }

  const path = `spots/${spotId}/${Date.now()}-${_safeFileName(file.name)}`;
  const { error } = await supabase
    .storage
    .from(SPOT_IMAGES_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });

  if (error) {
    console.error('[spots] uploadSpotImage error:', error.message);
    return { path: '', url: '', error: error.message };
  }

  return { path, url: await signSpotImageUrl(path), error: null };
}

/**
 * Attach the first image to a spot.
 *
 * @param {{ spotId: string, imagePath: string }} params
 * @returns {Promise<{ spot: object | null, error: string | null }>}
 */
export async function attachSpotImage({ spotId, imagePath }) {
  const { data, error } = await supabase.rpc('set_spot_image', {
    p_spot_id: spotId,
    p_image_path: imagePath,
  });

  if (error) {
    console.error('[spots] attachSpotImage error:', error.message);
    return { spot: null, error: error.message };
  }

  return { spot: await _hydrateSpotImage(data), error: null };
}

/**
 * Create a temporary signed URL for a spot image path.
 *
 * @param {string | null | undefined} path
 * @returns {Promise<string>}
 */
export async function signSpotImageUrl(path) {
  if (!path) return '';

  const { data, error } = await supabase
    .storage
    .from(SPOT_IMAGES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn('[spots] signSpotImageUrl error:', error.message);
    return '';
  }

  return data?.signedUrl ?? '';
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

async function _hydrateSpotImage(spot) {
  if (!spot) return spot;
  const { areas, ...rest } = spot;
  return {
    ...rest,
    area: areas ?? null,
    image_url: await signSpotImageUrl(rest.image_path),
  };
}

function _safeFileName(name) {
  return String(name ?? 'spot-image')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'spot-image';
}
