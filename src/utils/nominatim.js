/**
 * src/utils/nominatim.js
 *
 * Thin wrapper around the Nominatim OpenStreetMap geocoding API.
 * Used by the campus add flow to let users search for their university
 * and obtain real lat/lng/bounds instead of defaulting to placeholder coords.
 *
 * Nominatim usage policy:
 *  - Must include a descriptive User-Agent header.
 *  - Must not exceed 1 request per second. The 350 ms debounce at call sites
 *    satisfies this; no additional rate-limiting is applied here.
 *  - No authentication required.
 *
 * @module nominatim
 */

// ─── Constants ─────────────────────────────────────────────────────────────────

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT     = 'Perch-App/1.0 (https://github.com/anomalyco/perch)';

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Search Nominatim for universities matching `query`.
 * Returns up to 5 results enriched with a pre-extracted `city` field.
 *
 * Callers are responsible for debouncing (recommended: 350 ms) so that
 * the Nominatim rate-limit policy (≤ 1 req/sec) is respected.
 *
 * @param {string} query - Free-text university name to search for.
 * @returns {Promise<Array<{
 *   lat: string,
 *   lng: string,
 *   display_name: string,
 *   boundingbox: string[],
 *   osm_type: string,
 *   osm_id: string,
 *   address: object,
 *   city: string,
 * }>>}
 */
export async function searchUniversities(query) {
  const q = query?.trim();
  if (!q) return [];

  const params = new URLSearchParams({
    q,
    format:         'json',
    limit:          '5',
    addressdetails: '1',
    featuretype:    'education',
  });

  const url = `${NOMINATIM_BASE}?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept':     'application/json',
      },
    });

    if (!res.ok) {
      console.error('[nominatim] searchUniversities HTTP error:', res.status, res.statusText);
      return [];
    }

    /** @type {object[]} */
    const raw = await res.json();

    return (raw ?? []).map((item) => ({
      lat:          item.lat,
      lng:          item.lon,
      display_name: item.display_name,
      boundingbox:  item.boundingbox ?? [],
      osm_type:     item.osm_type ?? '',
      osm_id:       String(item.osm_id ?? ''),
      address:      item.address ?? {},
      city:         extractCity(item.address ?? {}),
    }));
  } catch (err) {
    console.error('[nominatim] searchUniversities fetch error:', err);
    return [];
  }
}

/**
 * Extract the best available city/locality string from a Nominatim address object.
 * Prefers city → town → county → state, in that order.
 *
 * @param {object} address - The `address` sub-object from a Nominatim result.
 * @returns {string}
 */
export function extractCity(address) {
  if (!address || typeof address !== 'object') return '';
  return (
    address.city   ||
    address.town   ||
    address.county ||
    address.state  ||
    ''
  );
}
