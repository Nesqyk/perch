/**
 * src/api/areas.js
 *
 * Read and create lightweight area records used to group spots beyond a single
 * sitio or campus. Map-based geo-referencing can layer on top later.
 */

import { supabase } from './supabaseClient.js';

const AREA_SELECT = 'id, sitio, barangay, city_municipality, lat, lng, is_active, created_at, updated_at';

/**
 * Fetch all active areas.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchAreas() {
  const { data, error } = await supabase
    .from('areas')
    .select(AREA_SELECT)
    .eq('is_active', true)
    .order('city_municipality')
    .order('barangay')
    .order('sitio');

  if (error) {
    console.error('[areas] fetchAreas error:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Find an existing matching area, or create one.
 *
 * @param {{ sitio?: string, barangay: string, cityMunicipality: string, lat?: number | null, lng?: number | null }} params
 * @returns {Promise<{ area: object | null, error: string | null }>}
 */
export async function findOrCreateArea({
  sitio = '',
  barangay,
  cityMunicipality,
  lat = null,
  lng = null,
}) {
  const normalized = _normalizeArea({ sitio, barangay, cityMunicipality, lat, lng });
  if (normalized.error) return { area: null, error: normalized.error };

  const existingQuery = supabase
    .from('areas')
    .select(AREA_SELECT)
    .eq('barangay', normalized.area.barangay)
    .eq('city_municipality', normalized.area.city_municipality)
    .eq('is_active', true);

  const query = normalized.area.sitio
    ? existingQuery.eq('sitio', normalized.area.sitio)
    : existingQuery.is('sitio', null);

  const { data: existingRows, error: fetchError } = await query
    .order('created_at', { ascending: true })
    .limit(1);
  if (fetchError) {
    console.error('[areas] findOrCreateArea fetch error:', fetchError.message);
    return { area: null, error: fetchError.message };
  }
  const existing = existingRows?.[0] ?? null;
  if (existing) return { area: existing, error: null };

  const { data, error } = await supabase
    .from('areas')
    .insert(normalized.area)
    .select(AREA_SELECT)
    .single();

  if (error) {
    console.error('[areas] findOrCreateArea insert error:', error.message);
    return { area: null, error: error.message };
  }

  return { area: data, error: null };
}

function _normalizeArea({ sitio, barangay, cityMunicipality, lat, lng }) {
  const area = {
    sitio: _cleanText(sitio) || null,
    barangay: _cleanText(barangay),
    city_municipality: _cleanText(cityMunicipality),
    lat: lat === null || lat === undefined || lat === '' ? null : Number(lat),
    lng: lng === null || lng === undefined || lng === '' ? null : Number(lng),
  };

  if (!area.barangay || !area.city_municipality) {
    return { area: null, error: 'Barangay and city/municipality are required.' };
  }
  if (area.lat !== null && (Number.isNaN(area.lat) || area.lat < -90 || area.lat > 90)) {
    return { area: null, error: 'Latitude must be between -90 and 90.' };
  }
  if (area.lng !== null && (Number.isNaN(area.lng) || area.lng < -180 || area.lng > 180)) {
    return { area: null, error: 'Longitude must be between -180 and 180.' };
  }

  return { area, error: null };
}

function _cleanText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}
