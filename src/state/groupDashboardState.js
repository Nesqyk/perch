/**
 * src/state/groupDashboardState.js
 *
 * Pure derivation helpers for the squad dashboard. These functions keep
 * roster ordering, occupancy math, labels, and calendar export strings
 * out of the DOM layer so they can be unit tested.
 */

const ROUGH_CAPACITY_LIMITS = Object.freeze({
  solo: 2,
  small: 8,
  medium: 20,
  large: 40,
});

const GROUP_SIZE_COUNTS = Object.freeze({
  solo: 1,
  small: 3,
  medium: 6,
  large: 10,
});

/**
 * Sort squad members with mayors first, then oldest joined members.
 *
 * @param {object[]} members
 * @returns {object[]}
 */
export function sortSquadMembers(members = []) {
  return [...members].sort((a, b) => {
    const aRole = a.role === 'mayor' ? 0 : 1;
    const bRole = b.role === 'mayor' ? 0 : 1;
    if (aRole !== bRole) return aRole - bRole;
    return new Date(a.joined_at ?? 0).getTime() - new Date(b.joined_at ?? 0).getTime();
  });
}

/**
 * Human-readable role label.
 *
 * @param {string | null | undefined} role
 * @returns {string}
 */
export function getSquadRoleLabel(role) {
  return role === 'mayor' ? 'Mayor' : 'Member';
}

/**
 * Human-readable availability label.
 *
 * @param {string | null | undefined} status
 * @returns {string}
 */
export function getAvailabilityLabel(status) {
  return status === 'busy' ? 'Busy' : 'Available';
}

/**
 * Derive venue occupancy percentage from rough capacity and active claims.
 *
 * @param {object | null} spot
 * @param {Record<string, object[]>} claimsBySpotId
 * @returns {{ percent: number, claimed: number, capacity: number }}
 */
export function deriveSpotOccupancy(spot, claimsBySpotId = {}) {
  if (!spot?.id) return { percent: 0, claimed: 0, capacity: 0 };

  const capacity = ROUGH_CAPACITY_LIMITS[spot.rough_capacity] ?? ROUGH_CAPACITY_LIMITS.medium;
  const activeClaims = (claimsBySpotId[spot.id] ?? []).filter(claim => !claim.cancelled_at);
  const claimed = activeClaims.reduce((sum, claim) => {
    return sum + (GROUP_SIZE_COUNTS[claim.group_size_key] ?? 1);
  }, 0);

  const percent = capacity > 0 ? Math.min(100, Math.round((claimed / capacity) * 100)) : 0;
  return { percent, claimed, capacity };
}

/**
 * Label outlet availability for the venue card.
 *
 * @param {object | null} spot
 * @returns {string}
 */
export function getPlugsLabel(spot) {
  return spot?.has_outlets ? 'Plenty' : 'Limited';
}

/**
 * Build a standards-friendly .ics calendar payload for the meetup.
 *
 * @param {{ title: string, starts_at?: string, startsAt?: string, location_label?: string | null, locationLabel?: string | null }} meetup
 * @returns {string}
 */
export function buildMeetupIcs(meetup) {
  const startsAt = new Date(meetup.starts_at ?? meetup.startsAt);
  const endsAt = new Date(startsAt.getTime() + 90 * 60 * 1000);
  const uid = `perch-${startsAt.getTime()}@perch.local`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Perch//Squad Meetup//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${_toIcsDate(new Date())}`,
    `DTSTART:${_toIcsDate(startsAt)}`,
    `DTEND:${_toIcsDate(endsAt)}`,
    `SUMMARY:${_escapeIcs(meetup.title)}`,
    `LOCATION:${_escapeIcs(meetup.location_label ?? meetup.locationLabel ?? '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function _toIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function _escapeIcs(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');
}
