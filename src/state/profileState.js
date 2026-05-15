/**
 * src/state/profileState.js
 *
 * Pure derivation helpers for the profile dashboard. No DOM and no network.
 */

/**
 * Count profile stats from real user-owned records.
 *
 * @param {{
 *   submissions?: object[],
 *   buildings?: object[],
 *   groupPins?: Record<string, object>,
 *   groupPinJoins?: Record<string, object[]>,
 *   groupMember?: object | null,
 *   userId?: string | null,
 * }} input
 * @returns {{ spotsFound: number, squadContributions: number }}
 */
export function deriveProfileStats(input = {}) {
  const submissions = Array.isArray(input.submissions) ? input.submissions : [];
  const buildings = Array.isArray(input.buildings) ? input.buildings : [];
  const userId = input.userId ?? null;

  const ownPins = Object.values(input.groupPins ?? {})
    .filter((pin) => !userId || pin.user_id === userId).length;
  const ownJoins = Object.values(input.groupPinJoins ?? {})
    .flat()
    .filter((join) => !userId || join.user_id === userId).length;
  const scoutPoints = Number(input.groupMember?.scout_points ?? 0);

  return {
    spotsFound: submissions.length + buildings.length,
    squadContributions: ownPins + ownJoins + scoutPoints,
  };
}

/**
 * Compose the profile activity feed from persisted claims, contributions, and
 * current squad records. Missing categories are omitted rather than faked.
 *
 * @param {{
 *   claims?: object[],
 *   submissions?: object[],
 *   buildings?: object[],
 *   group?: object | null,
 *   groupMember?: object | null,
 *   groupPins?: Record<string, object>,
 *   groupPinJoins?: Record<string, object[]>,
 *   spots?: object[],
 *   userId?: string | null,
 *   limit?: number,
 * }} input
 * @returns {Array<{ kind: string, tone: string, title: string, meta: string, date: string | null, tag: string }>}
 */
export function composeProfileActivity(input = {}) {
  const userId = input.userId ?? null;
  const spots = Array.isArray(input.spots) ? input.spots : [];
  const limit = Number(input.limit ?? 4);

  const claimItems = (input.claims ?? []).map((claim) => ({
    kind: 'claim',
    tone: claim.cancelled_at ? 'neutral' : 'blue',
    title: `Claimed a spot at ${claim.spots?.name ?? 'a study spot'}`,
    meta: [claim.spots?.building ?? 'Campus location', claim.cancelled_at ? 'Claim ended' : 'Active now'].join(' - '),
    date: claim.claimed_at ?? null,
    tag: 'CLAIMED',
  }));

  const submissionItems = (input.submissions ?? []).map((submission) => ({
    kind: 'submission',
    tone: _statusTone(submission.status),
    title: `${_statusVerb(submission.status)} ${submission.spot_name ?? 'a spot'}`,
    meta: [submission.building_name || _campusName(submission.campuses), submission.floor || null].filter(Boolean).join(' - '),
    date: submission.created_at ?? null,
    tag: String(submission.status ?? 'PENDING').toUpperCase(),
  }));

  const buildingItems = (input.buildings ?? []).map((building) => ({
    kind: 'building',
    tone: building.verification_status === 'verified' ? 'green' : 'orange',
    title: `${building.verification_status === 'verified' ? 'Verified' : 'Added'} ${building.name ?? 'a building'}`,
    meta: _campusName(building.campuses),
    date: building.created_at ?? null,
    tag: building.verification_status === 'verified' ? 'VERIFIED' : 'BUILDING',
  }));

  const groupItems = [];
  if (input.group && input.groupMember?.joined_at) {
    groupItems.push({
      kind: 'squad',
      tone: 'orange',
      title: `Joined ${input.group.name ?? 'a squad'}`,
      meta: `${input.groupMember.role === 'mayor' ? 'Squad mayor' : 'Squad member'} - ${input.group.context ?? 'campus'} crew`,
      date: input.groupMember.joined_at,
      tag: 'SQUAD',
    });
  }

  const pinItems = Object.values(input.groupPins ?? {})
    .filter((pin) => !userId || pin.user_id === userId)
    .map((pin) => {
      const spotName = spots.find((spot) => spot.id === pin.spot_id)?.name ?? pin.custom_name ?? 'a squad spot';
      return {
        kind: pin.pin_type === 'saved' ? 'saved' : 'shared',
        tone: pin.pin_type === 'saved' ? 'purple' : 'green',
        title: `${pin.pin_type === 'saved' ? 'Saved' : 'Shared'} ${spotName}`,
        meta: [pin.vibe || null, pin.note || null].filter(Boolean).join(' - ') || 'Squad map activity',
        date: pin.pinned_at ?? null,
        tag: pin.pin_type === 'saved' ? 'SAVED' : 'SHARED',
      };
    });

  const joinItems = Object.values(input.groupPinJoins ?? {})
    .flat()
    .filter((join) => !userId || join.user_id === userId)
    .map((join) => ({
      kind: 'squad',
      tone: 'orange',
      title: 'Joined a squad route',
      meta: `${join.status ?? 'heading'} - travel coordination`,
      date: join.joined_at ?? null,
      tag: 'SQUAD',
    }));

  return [
    ...claimItems,
    ...submissionItems,
    ...buildingItems,
    ...groupItems,
    ...pinItems,
    ...joinItems,
  ]
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, Math.max(0, limit));
}

/**
 * Build the profile subtitle from persisted fields.
 *
 * @param {object | null | undefined} profile
 * @returns {string}
 */
export function profileSubtitle(profile) {
  return [profile?.course_label, profile?.class_label].filter(Boolean).join(' - ');
}

function _statusTone(status) {
  if (status === 'approved') return 'green';
  if (status === 'rejected') return 'orange';
  return 'blue';
}

function _statusVerb(status) {
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Needs edits for';
  return 'Submitted';
}

function _campusName(campus) {
  if (Array.isArray(campus)) {
    return campus[0]?.short_name || campus[0]?.name || 'Campus contribution';
  }
  return campus?.short_name || campus?.name || 'Campus contribution';
}
