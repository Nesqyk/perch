/**
 * src/utils/placeSearch.js
 *
 * Search helpers for the map place finder. Local ranking is pure so it can be
 * tested without DOM, network, or Leaflet.
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const MIN_QUERY_LENGTH = 2;

/**
 * Rank loaded Perch places for a free-text query.
 *
 * @param {string} query
 * @param {{ spots?: object[], buildings?: object[], areas?: object[] }} source
 * @returns {Array<{ kind: 'spot' | 'building' | 'area', id: string, name: string, subtitle: string, lat: number | null, lng: number | null, score: number }>}
 */
export function searchLocalPlaces(query, { spots = [], buildings = [], areas = [] } = {}) {
  const normalized = _normalize(query);
  if (normalized.length < MIN_QUERY_LENGTH) return [];

  const results = [];

  spots.forEach((spot) => {
    const haystack = [
      spot.name,
      spot.building,
      spot.floor,
      spot.type,
      spot.area?.sitio,
      spot.area?.barangay,
      spot.area?.city_municipality,
    ];
    const score = _scoreFields(normalized, haystack, 120);
    if (score <= 0) return;
    results.push({
      kind: 'spot',
      id: spot.id,
      name: spot.name,
      subtitle: _joinLabel([spot.building, spot.floor, spot.area?.barangay, spot.area?.city_municipality]),
      lat: _numberOrNull(spot.lat),
      lng: _numberOrNull(spot.lng),
      score,
    });
  });

  buildings.forEach((building) => {
    const score = _scoreFields(normalized, [building.name, building.slug], 105);
    if (score <= 0) return;
    results.push({
      kind: 'building',
      id: building.id,
      name: building.name,
      subtitle: 'Building',
      lat: _numberOrNull(building.lat),
      lng: _numberOrNull(building.lng),
      score,
    });
  });

  areas.forEach((area) => {
    const label = _joinLabel([area.sitio, area.barangay, area.city_municipality]);
    const score = _scoreFields(normalized, [label, area.sitio, area.barangay, area.city_municipality], 95);
    if (score <= 0) return;
    results.push({
      kind: 'area',
      id: area.id,
      name: label || 'Unnamed area',
      subtitle: 'Area',
      lat: _numberOrNull(area.lat),
      lng: _numberOrNull(area.lng),
      score,
    });
  });

  return results
    .sort((a, b) => b.score - a.score || _kindWeight(a.kind) - _kindWeight(b.kind) || a.name.localeCompare(b.name))
    .slice(0, 6);
}

/**
 * Return true when local results are strong enough to skip external lookup.
 *
 * @param {Array<{ score: number }>} results
 * @returns {boolean}
 */
export function hasStrongLocalPlaceMatch(results) {
  return (results?.[0]?.score ?? 0) >= 85;
}

/**
 * Search real-world places through Nominatim.
 *
 * @param {string} query
 * @returns {Promise<Array<{ kind: 'external', id: string, name: string, subtitle: string, lat: number, lng: number, score: number }>>}
 */
export async function searchPlaces(query) {
  const normalized = String(query ?? '').trim();
  if (normalized.length < MIN_QUERY_LENGTH) return [];

  const params = new URLSearchParams({
    q: normalized,
    format: 'jsonv2',
    limit: '5',
    addressdetails: '1',
  });

  try {
    const res = await fetch(`${NOMINATIM_BASE}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      console.error('[placeSearch] searchPlaces HTTP error:', res.status, res.statusText);
      return [];
    }

    const rows = await res.json();
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        kind: 'external',
        id: String(row.place_id ?? row.osm_id ?? row.display_name),
        name: _externalName(row),
        subtitle: row.display_name ?? 'External place',
        lat: Number(row.lat),
        lng: Number(row.lon),
        score: 40,
      }))
      .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));
  } catch (err) {
    console.error('[placeSearch] searchPlaces fetch error:', err);
    return [];
  }
}

function _scoreFields(query, fields, base) {
  let best = 0;
  fields.filter(Boolean).forEach((field) => {
    const value = _normalize(field);
    if (!value) return;
    if (value === query) best = Math.max(best, base);
    else if (value.startsWith(query)) best = Math.max(best, base - 15);
    else if (value.includes(query)) best = Math.max(best, base - 40);
  });
  return best;
}

function _kindWeight(kind) {
  return { spot: 0, building: 1, area: 2 }[kind] ?? 3;
}

function _externalName(row) {
  return row.name || row.address?.amenity || row.address?.road || row.display_name?.split(',')[0] || 'External place';
}

function _normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function _joinLabel(parts) {
  return parts
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

function _numberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
