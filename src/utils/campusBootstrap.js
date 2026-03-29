/**
 * src/utils/campusBootstrap.js
 *
 * Pure helpers for campus-name normalisation and starter-campus bootstrapping.
 *
 * This module is intentionally network-free. It provides deterministic
 * templates and fallbacks so the app can create a usable campus shell
 * immediately, even before a richer geospatial import pipeline exists.
 */

/**
 * Known campus templates used to avoid a blank map on first create.
 * Coordinates are intentionally approximate and lightweight.
 */
export const CAMPUS_BOOTSTRAP_TEMPLATES = Object.freeze([
  {
    aliases: ['cebu technological university', 'ctu main campus', 'ctu main'],
    campus: {
      name:              'CTU Main Campus',
      short_name:        'CTU Main',
      city:              'Cebu City',
      lat:               10.2936,
      lng:               123.8809,
      bounds_sw_lat:     10.2916,
      bounds_sw_lng:     123.8789,
      bounds_ne_lat:     10.2956,
      bounds_ne_lng:     123.8829,
      default_zoom:      17,
      bootstrap_source:  'template',
      bootstrap_status:  'ready',
      bootstrap_notes:   'Template-seeded campus shell with common buildings.',
    },
    buildings: [
      { name: 'Main Library',      latOffset:  0.00055, lngOffset: -0.00030, source: 'imported' },
      { name: 'IT Building',       latOffset: -0.00010, lngOffset:  0.00020, source: 'imported' },
      { name: 'Academic Hall',     latOffset:  0.00015, lngOffset:  0.00055, source: 'imported' },
      { name: 'Campus Cafeteria',  latOffset: -0.00045, lngOffset: -0.00010, source: 'imported' },
    ],
    starterSpots: [
      { name: 'Library Reading Room', buildingName: 'Main Library',     type: 'library',    floor: '2F', roughCapacity: 'large' },
      { name: 'IT Lobby Benches',     buildingName: 'IT Building',      type: 'lobby',      floor: '1F', roughCapacity: 'small' },
      { name: 'Academic Hallway',     buildingName: 'Academic Hall',    type: 'hallway',    floor: '2F', roughCapacity: 'medium' },
      { name: 'Cafeteria Tables',     buildingName: 'Campus Cafeteria', type: 'cafeteria',  floor: '1F', roughCapacity: 'medium' },
    ],
  },
  {
    aliases: ['university of san carlos', 'usc talamban', 'usc downtown campus'],
    campus: {
      name:              'University of San Carlos',
      short_name:        'USC',
      city:              'Cebu City',
      lat:               10.3540,
      lng:               123.9113,
      bounds_sw_lat:     10.3512,
      bounds_sw_lng:     123.9085,
      bounds_ne_lat:     10.3564,
      bounds_ne_lng:     123.9139,
      default_zoom:      16,
      bootstrap_source:  'template',
      bootstrap_status:  'ready',
      bootstrap_notes:   'Template-seeded campus shell with common buildings.',
    },
    buildings: [
      { name: 'Main Library',      latOffset:  0.00060, lngOffset: -0.00015, source: 'imported' },
      { name: 'Engineering Hall',  latOffset: -0.00020, lngOffset:  0.00035, source: 'imported' },
      { name: 'Student Center',    latOffset:  0.00020, lngOffset:  0.00060, source: 'imported' },
      { name: 'Campus Cafe',       latOffset: -0.00040, lngOffset: -0.00025, source: 'imported' },
    ],
    starterSpots: [
      { name: 'Main Library Quiet Wing', buildingName: 'Main Library',     type: 'library',   floor: '3F', roughCapacity: 'large' },
      { name: 'Engineering Commons',     buildingName: 'Engineering Hall', type: 'commons',   floor: '1F', roughCapacity: 'medium' },
      { name: 'Student Center Tables',   buildingName: 'Student Center',   type: 'lounge',    floor: '1F', roughCapacity: 'medium' },
    ],
  },
]);

/**
 * Collapse a campus name into a stable slug used for matching.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeCampusName(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Pick the matching campus template when one exists.
 *
 * @param {string} campusName
 * @returns {object | null}
 */
export function findCampusTemplate(campusName) {
  const normalized = normalizeCampusName(campusName);
  return CAMPUS_BOOTSTRAP_TEMPLATES.find((template) =>
    template.aliases.some((alias) => normalizeCampusName(alias) === normalized)
  ) ?? null;
}

/**
 * Build a ready-to-insert campus shell. Unknown campuses get a usable
 * fallback centered on the current default campus footprint and are marked
 * for later review.
 *
 * @param {string} campusName
 * @returns {object}
 */
export function deriveCampusShell(campusName) {
  const template = findCampusTemplate(campusName);
  if (template) {
    return {
      ...template.campus,
      normalized_name: normalizeCampusName(template.campus.name),
    };
  }

  const safeName = String(campusName ?? '').trim() || 'New Campus';
  return {
    name:              safeName,
    short_name:        _shortName(safeName),
    city:              'Campus City',
    lat:               10.2936,
    lng:               123.8809,
    bounds_sw_lat:     10.2922,
    bounds_sw_lng:     123.8795,
    bounds_ne_lat:     10.2950,
    bounds_ne_lng:     123.8823,
    default_zoom:      17,
    bootstrap_source:  'manual',
    bootstrap_status:  'needs_review',
    bootstrap_notes:   'Created from user input without a template match.',
    normalized_name:   normalizeCampusName(safeName),
  };
}

/**
 * Build starter buildings relative to the campus center.
 *
 * @param {string} campusId
 * @param {object} campusShell
 * @returns {object[]}
 */
export function buildStarterBuildings(campusId, campusShell) {
  const template = findCampusTemplate(campusShell.name);
  if (!template) return [];

  return template.buildings.map((building) => ({
    campus_id: campusId,
    name:      building.name,
    slug:      normalizeCampusName(building.name),
    lat:       Number((campusShell.lat + building.latOffset).toFixed(7)),
    lng:       Number((campusShell.lng + building.lngOffset).toFixed(7)),
    source:    building.source ?? 'imported',
  }));
}

/**
 * Build starter spot rows after the building ids are known.
 *
 * @param {string} campusId
 * @param {object} campusShell
 * @param {Record<string, { id: string, name: string, lat: number, lng: number }>} buildingBySlug
 * @returns {object[]}
 */
export function buildStarterSpots(campusId, campusShell, buildingBySlug) {
  const template = findCampusTemplate(campusShell.name);
  if (!template) return [];

  return template.starterSpots
    .map((spot) => {
      const building = buildingBySlug[normalizeCampusName(spot.buildingName)];
      if (!building) return null;

      return {
        campus_id:                campusId,
        building_id:              building.id,
        name:                     spot.name,
        type:                     spot.type,
        on_campus:                true,
        building:                 building.name,
        floor:                    spot.floor ?? null,
        walk_time_min:            0,
        rough_capacity:           spot.roughCapacity ?? 'small',
        lat:                      building.lat ?? campusShell.lat,
        lng:                      building.lng ?? campusShell.lng,
        source:                   'imported',
        discoverer_display_name:  null,
      };
    })
    .filter(Boolean);
}

function _shortName(name) {
  const letters = String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return letters || 'CMP';
}
