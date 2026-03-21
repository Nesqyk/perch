/**
 * src/api/campuses.js
 *
 * Read/write operations for campus shells, building directories, community
 * review actions, and structured spot discovery submissions.
 */

import { supabase } from './supabaseClient.js';

import { deriveCampusShell, normalizeCampusName } from '../utils/campusBootstrap.js';

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetch all active campuses ordered by name.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchCampuses() {
  const { data, error } = await supabase
    .from('campuses')
    .select(`
      id,
      name,
      short_name,
      city,
      lat,
      lng,
      bounds_sw_lat,
      bounds_sw_lng,
      bounds_ne_lat,
      bounds_ne_lng,
      default_zoom,
      bootstrap_status,
      bootstrap_source,
      import_requested_at,
      last_imported_at,
      import_error
    `)
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('[campuses] fetchCampuses error:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Fetch all buildings for a campus ordered by name.
 *
 * @param {string} campusId
 * @returns {Promise<object[]>}
 */
export async function fetchBuildings(campusId) {
  if (!campusId) return [];

  const { data, error } = await supabase
    .from('buildings')
    .select('id, campus_id, name, slug, lat, lng, source, verification_status, confirmation_count, created_by')
    .eq('campus_id', campusId)
    .order('name');

  if (error) {
    console.error('[campuses] fetchBuildings error:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Fetch recent import telemetry for campus bootstrap jobs.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchCampusImportRuns() {
  const { data, error } = await supabase
    .from('campus_import_runs')
    .select(`
      id,
      campus_id,
      provider,
      query,
      status,
      osm_type,
      osm_id,
      osm_display_name,
      building_count,
      starter_spot_count,
      error_message,
      started_at,
      completed_at
    `)
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[campuses] fetchCampusImportRuns error:', error.message);
    return [];
  }

  return data ?? [];
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

/**
 * Find or create a campus shell for community-led mapping.
 *
 * @param {string} campusName
 * @returns {Promise<{ campus: object | null, created: boolean, error: string | null }>}
 */
export async function ensureCampus(campusName) {
  const normalizedName = normalizeCampusName(campusName);
  if (!normalizedName) {
    return { campus: null, created: false, error: 'Campus name is required.' };
  }

  const existing = await _fetchCampusByNormalizedName(normalizedName);
  if (existing) {
    return { campus: existing, created: false, error: null };
  }

  const shell = deriveCampusShell(campusName);
  const campusShell = {
    ...shell,
    bootstrap_status: 'ready',
    bootstrap_source: 'manual',
    import_error: null,
  };

  const { data: insertedCampus, error: insertError } = await supabase
    .from('campuses')
    .insert(campusShell)
    .select(`
      id,
      name,
      short_name,
      city,
      lat,
      lng,
      bounds_sw_lat,
      bounds_sw_lng,
      bounds_ne_lat,
      bounds_ne_lng,
      default_zoom,
      bootstrap_status,
      bootstrap_source,
      import_requested_at,
      last_imported_at,
      import_error
    `)
    .single();

  if (insertError) {
    const racedCampus = await _fetchCampusByNormalizedName(normalizedName);
    if (racedCampus) {
      return { campus: racedCampus, created: false, error: null };
    }

    console.error('[campuses] ensureCampus insert error:', insertError.message);
    return { campus: null, created: false, error: insertError.message };
  }

  return { campus: insertedCampus, created: true, error: null };
}

/**
 * Trigger the async OSM import Edge Function.
 *
 * @param {string} campusId
 * @param {string} campusName
 * @returns {Promise<{ status: string | null, error: string | null }>}
 */
export async function triggerCampusImport(campusId, campusName) {
  const { data, error } = await supabase.functions.invoke('osm-campus-import', {
    body: { campusId, campusName },
  });

  if (error) {
    console.error('[campuses] triggerCampusImport error:', error.message);
    await _markCampusImportError(campusId, error.message);
    return { status: null, error: error.message };
  }

  return { status: data?.status ?? null, error: null };
}

async function _markCampusImportError(campusId, message) {
  const { error } = await supabase
    .from('campuses')
    .update({
      bootstrap_status: 'needs_review',
      import_error: message,
    })
    .eq('id', campusId);

  if (error) {
    console.error('[campuses] _markCampusImportError error:', error.message);
  }
}

async function _fetchCampusByNormalizedName(normalizedName) {
  const { data, error } = await supabase
    .from('campuses')
    .select(`
      id,
      name,
      short_name,
      city,
      lat,
      lng,
      bounds_sw_lat,
      bounds_sw_lng,
      bounds_ne_lat,
      bounds_ne_lng,
      default_zoom,
      bootstrap_status,
      bootstrap_source,
      import_requested_at,
      last_imported_at,
      import_error
    `)
    .eq('normalized_name', normalizedName)
    .maybeSingle();

  if (error) {
    console.error('[campuses] _fetchCampusByNormalizedName error:', error.message);
    return null;
  }

  return data ?? null;
}

// ─── Discovery ────────────────────────────────────────────────────────────────

/**
 * Submit a user-discovered room or study spot for approval.
 *
 * @param {{
 *   campusId: string,
 *   lat: number,
 *   lng: number,
 *   buildingName: string,
 *   floor: string,
 *   spotName: string,
 *   description: string,
 *   discovererDisplayName: string,
 * }} params
 * @returns {Promise<{ data: object | null, error: string | null }>}
 */
export async function submitSpot({
  campusId,
  lat,
  lng,
  buildingName,
  floor,
  spotName,
  description,
  discovererDisplayName,
}) {
  const { data, error } = await supabase
    .from('spot_submissions')
    .insert({
      campus_id:               campusId,
      lat,
      lng,
      building_name:           buildingName || null,
      floor:                   floor || null,
      spot_name:               spotName,
      description:             description || null,
      discoverer_display_name: discovererDisplayName || null,
      submitted_by:            discovererDisplayName || null,
      status:                  'pending',
    })
    .select('id, status, confirmation_count')
    .single();

  if (error) {
    console.error('[campuses] submitSpot error:', error.message);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

/**
 * Create a user-mapped building marker for a campus.
 *
 * @param {{ campusId: string, name: string, lat: number, lng: number }} params
 * @returns {Promise<{ data: object | null, error: string | null }>}
 */
export async function createBuilding({ campusId, name, lat, lng }) {
  const { data, error } = await supabase
    .from('buildings')
    .insert({
      campus_id: campusId,
      name: name.trim(),
      slug: normalizeCampusName(name),
      lat,
      lng,
      source: 'community',
      verification_status: 'pending',
      confirmation_count: 0,
    })
    .select('id, campus_id, name, slug, lat, lng, source, verification_status, confirmation_count')
    .single();

  if (error) {
    console.error('[campuses] createBuilding error:', error.message);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

/**
 * Fetch pending room discoveries for a campus or a specific building.
 *
 * @param {{ campusId: string, buildingName?: string }} params
 * @returns {Promise<object[]>}
 */
export async function fetchPendingSpotSubmissions({ campusId, buildingName = '' }) {
  let query = supabase
    .from('spot_submissions')
    .select(`
      id,
      campus_id,
      building_name,
      floor,
      spot_name,
      description,
      discoverer_display_name,
      created_at,
      status,
      confirmation_count,
      discovered_spot_id,
      user_id
    `)
    .eq('campus_id', campusId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (buildingName.trim()) {
    query = query.ilike('building_name', buildingName.trim());
  }

  const { data, error } = await query;
  if (error) {
    console.error('[campuses] fetchPendingSpotSubmissions error:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Register a community confirmation for a building.
 *
 * @param {string} buildingId
 * @returns {Promise<{ data: object | null, error: string | null }>}
 */
export async function confirmBuilding(buildingId) {
  const { data, error } = await supabase.rpc('confirm_building', {
    p_building_id: buildingId,
  });

  if (error) {
    console.error('[campuses] confirmBuilding error:', error.message);
    return { data: null, error: error.message };
  }

  return { data: Array.isArray(data) ? data[0] ?? null : data ?? null, error: null };
}

/**
 * Register a community confirmation for a pending room submission.
 *
 * @param {string} submissionId
 * @returns {Promise<{ data: object | null, error: string | null }>}
 */
export async function confirmSpotSubmission(submissionId) {
  const { data, error } = await supabase.rpc('confirm_spot_submission', {
    p_submission_id: submissionId,
  });

  if (error) {
    console.error('[campuses] confirmSpotSubmission error:', error.message);
    return { data: null, error: error.message };
  }

  return { data: Array.isArray(data) ? data[0] ?? null : data ?? null, error: null };
}
