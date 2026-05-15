/**
 * src/state/buildingState.js
 *
 * Pure derivation helpers for the building-first campus experience.
 *
 * Buildings aggregate room-level spots in campus mode. These helpers keep the
 * map layer and the room modal consistent without reaching into the DOM or the
 * global store directly.
 */

/**
 * Return all canonical rooms/spots that belong to a building.
 *
 * @param {object[]} spots
 * @param {object} building
 * @returns {object[]}
 */
export function getRoomsForBuilding(spots, building) {
  if (!building) return [];

  return (spots ?? []).filter((spot) =>
    spot.on_campus &&
    (
      (building.id && spot.building_id === building.id) ||
      (
        !spot.building_id &&
        String(spot.building ?? '').trim().toLowerCase() === String(building.name ?? '').trim().toLowerCase()
      )
    )
  );
}

/**
 * Compute the aggregate building status from its rooms.
 *
 * @param {object[]} rooms
 * @param {Record<string, object[]>} claims
 * @param {Record<string, { score?: number, validUntil?: string }>} confidence
 * @returns {'free' | 'maybe' | 'claimed' | 'full'}
 */
export function deriveBuildingStatus(rooms, claims, confidence) {
  if (!rooms?.length) return 'maybe';

  const statuses = rooms.map((room) => deriveRoomStatus(room.id, claims, confidence));

  if (statuses.includes('free')) return 'free';
  if (statuses.includes('claimed')) return 'claimed';
  if (statuses.includes('full')) return 'full';
  return 'maybe';
}

/**
 * Count canonical rooms and pending submissions for a building.
 *
 * @param {object[]} rooms
 * @param {object[]} pendingSubmissions
 * @returns {{ rooms: number, pending: number }}
 */
export function summarizeBuildingInventory(rooms, pendingSubmissions) {
  return {
    rooms: Array.isArray(rooms) ? rooms.length : 0,
    pending: Array.isArray(pendingSubmissions) ? pendingSubmissions.length : 0,
  };
}

/**
 * Filter and sort room cards for the building modal.
 *
 * @param {object[]} rooms
 * @param {Record<string, object[]>} claims
 * @param {Record<string, { score?: number, validUntil?: string }>} confidence
 * @param {{ search?: string, status?: string }} options
 * @returns {Array<object & { derivedStatus: string, sortKey: number }>}
 */
export function getVisibleRooms(rooms, claims, confidence, options = {}) {
  const search = String(options.search ?? '').trim().toLowerCase();
  const statusFilter = String(options.status ?? 'all').toLowerCase();

  return (rooms ?? [])
    .map((room) => {
      const derivedStatus = deriveRoomStatus(room.id, claims, confidence);
      return {
        ...room,
        derivedStatus,
        sortKey: _roomSortWeight(derivedStatus),
      };
    })
    .filter((room) => {
      const haystack = [room.name, room.floor, room.building].filter(Boolean).join(' ').toLowerCase();
      const searchMatch = !search || haystack.includes(search);
      const statusMatch = statusFilter === 'all' || room.derivedStatus === statusFilter;
      return searchMatch && statusMatch;
    })
    .sort((a, b) => {
      if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
      return String(a.name).localeCompare(String(b.name));
    });
}

/**
 * Derive the display status for a single room from claims + confidence maps.
 *
 * @param {string} roomId
 * @param {Record<string, object[]>} claims
 * @param {Record<string, { score?: number, validUntil?: string }>} confidence
 * @returns {'free' | 'maybe' | 'claimed' | 'full'}
 */
export function deriveRoomStatus(roomId, claims, confidence) {
  const conf = confidence?.[roomId];
  const score = _effectiveScore(conf);
  const activeClaims = _activeClaimsForSpot(roomId, claims);

  if (score <= 0.15) return 'full';
  if (activeClaims.length > 0) return 'claimed';
  if (score >= 0.65) return 'free';
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

function _roomSortWeight(status) {
  switch (status) {
    case 'free': return 0;
    case 'claimed': return 1;
    case 'maybe': return 2;
    case 'full': return 3;
    default: return 9;
  }
}
