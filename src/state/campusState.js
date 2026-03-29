/**
 * src/state/campusState.js
 *
 * Pure derivation helpers for route-level campus overview pages.
 *
 * These helpers aggregate buildings, rooms, and live claim activity into a
 * campus-level summary without reading from the store directly.
 */

/**
 * Build a campus overview snapshot from current map data.
 *
 * @param {{ id: string, name?: string, short_name?: string, city?: string | null }} campus
 * @param {object[]} spots
 * @param {object[]} buildings
 * @param {Record<string, object[]>} claims
 * @param {Record<string, { score?: number, validUntil?: string }>} confidence
 * @returns {{
 *   spotCount: number,
 *   buildingCount: number,
 *   liveClaimCount: number,
 *   freeCount: number,
 *   claimedCount: number,
 *   maybeCount: number,
 *   fullCount: number,
 *   topBuildings: Array<{ id: string, name: string, roomCount: number, liveClaims: number, pendingRooms: number, status: 'free' | 'claimed' | 'maybe' | 'full' }>,
 *   categories: Array<{ key: string, label: string, count: number, tone: string }>,
 * }}
 */
export function deriveCampusOverview(campus, spots, buildings, claims, confidence) {
  const campusSpots = (spots ?? []).filter((spot) => spot.campus_id === campus?.id);
  const campusBuildings = (buildings ?? []).filter((building) => building.campus_id === campus?.id);

  const statusCounts = { free: 0, claimed: 0, maybe: 0, full: 0 };

  campusSpots.forEach((spot) => {
    statusCounts[_deriveSpotStatus(spot, claims, confidence)] += 1;
  });

  const topBuildings = campusBuildings
    .map((building) => {
      const buildingSpots = campusSpots.filter((spot) =>
        spot.building_id === building.id
        || (!spot.building_id && String(spot.building ?? '').trim().toLowerCase() === String(building.name ?? '').trim().toLowerCase()));

      const liveClaims = buildingSpots.reduce((total, spot) => total + _activeClaimsForSpot(spot.id, claims).length, 0);
      const status = _deriveBuildingStatus(buildingSpots, claims, confidence);

      return {
        id: building.id,
        name: building.name,
        roomCount: buildingSpots.length,
        liveClaims,
        pendingRooms: 0,
        status,
      };
    })
    .sort((a, b) => {
      if (b.liveClaims !== a.liveClaims) return b.liveClaims - a.liveClaims;
      if (b.roomCount !== a.roomCount) return b.roomCount - a.roomCount;
      return String(a.name).localeCompare(String(b.name));
    })
    .slice(0, 6);

  const categories = [
    {
      key: 'libraries',
      label: 'Libraries',
      count: _countCategory(campusSpots, campusBuildings, /(library|learning commons|commons)/i),
      tone: 'good',
    },
    {
      key: 'cafes',
      label: 'Cafe corners',
      count: campusSpots.filter((spot) => spot.has_food || /(cafe|coffee|canteen|espresso)/i.test(`${spot.name} ${spot.building}`)).length,
      tone: 'warm',
    },
    {
      key: 'quiet',
      label: 'Quiet spots',
      count: campusSpots.filter((spot) => /quiet|low/i.test(String(spot.noise_baseline ?? ''))).length,
      tone: 'cool',
    },
    {
      key: 'open-study',
      label: 'Open study',
      count: campusSpots.filter((spot) => /(open|lounge|hall|study)/i.test(`${spot.type} ${spot.name}`)).length,
      tone: 'neutral',
    },
  ];

  return {
    spotCount: campusSpots.length,
    buildingCount: campusBuildings.length,
    liveClaimCount: Object.values(claims ?? {})
      .flat()
      .filter((claim) => claim?.campus_id === campus?.id).length || campusSpots.reduce((total, spot) => total + _activeClaimsForSpot(spot.id, claims).length, 0),
    freeCount: statusCounts.free,
    claimedCount: statusCounts.claimed,
    maybeCount: statusCounts.maybe,
    fullCount: statusCounts.full,
    topBuildings,
    categories,
  };
}

function _deriveSpotStatus(spot, claims, confidence) {
  const conf = confidence?.[spot.id];
  const score = _effectiveScore(conf);
  const activeClaims = _activeClaimsForSpot(spot.id, claims);

  if (score <= 0.15) return 'full';
  if (activeClaims.length > 0) return 'claimed';
  if (score >= 0.65) return 'free';
  return 'maybe';
}

function _deriveBuildingStatus(spots, claims, confidence) {
  if (!spots.length) return 'maybe';

  const statuses = spots.map((spot) => _deriveSpotStatus(spot, claims, confidence));
  if (statuses.includes('free')) return 'free';
  if (statuses.includes('claimed')) return 'claimed';
  if (statuses.includes('full')) return 'full';
  return 'maybe';
}

function _effectiveScore(conf) {
  if (!conf) return 0.5;
  if (conf.validUntil && new Date(conf.validUntil) < new Date()) return 0.5;
  return conf.score ?? 0.5;
}

function _activeClaimsForSpot(spotId, claims) {
  const list = claims?.[spotId] ?? [];
  const now = new Date();
  return list.filter((claim) => !claim.cancelled_at && (!claim.expires_at || new Date(claim.expires_at) > now));
}

function _countCategory(spots, buildings, pattern) {
  const matchingSpots = spots.filter((spot) => pattern.test(`${spot.name} ${spot.building}`)).length;
  const matchingBuildings = buildings.filter((building) => pattern.test(String(building.name ?? ''))).length;
  return Math.max(matchingSpots, matchingBuildings);
}
