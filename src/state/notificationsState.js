/**
 * src/state/notificationsState.js
 *
 * Pure derivation helpers for the notifications route.
 */

/**
 * Build notification rows from existing real product data.
 *
 * @param {{
 *   group?: object | null,
 *   groupPins?: Record<string, object>,
 *   groupPinJoins?: Record<string, object[]>,
 *   spotRows?: object[],
 *   claimRows?: object[],
 *   contributionSpots?: object[],
 *   contributionBuildings?: object[],
 * }} input
 * @returns {Array<{ category: 'spot' | 'squad', tone: string, icon: string, title: string, body: string, date: string | null, pills: string[], action: string, actionValue?: string }>}
 */
export function deriveNotificationItems(input = {}) {
  const items = [
    ..._deriveSquadItems(input.group, input.groupPins, input.groupPinJoins, input.spotRows),
    ..._deriveClaimItems(input.claimRows),
    ..._deriveContributionItems(input.contributionSpots, input.contributionBuildings),
  ];

  return items
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Filter notification rows for the selected segmented control.
 *
 * @param {Array<{ category: string }>} items
 * @param {'all' | 'spot' | 'squad'} filter
 * @returns {Array<object>}
 */
export function filterNotificationItems(items, filter) {
  if (filter === 'spot') return items.filter((item) => item.category === 'spot');
  if (filter === 'squad') return items.filter((item) => item.category === 'squad');
  return [...items];
}

/**
 * Pick a real quiet/available spot for the sanctuary CTA.
 *
 * @param {{ spots?: object[], claims?: Record<string, object[]> }} input
 * @returns {object | null}
 */
export function pickSanctuaryRecommendation({ spots = [], claims = {} } = {}) {
  const now = Date.now();
  const candidates = (spots ?? [])
    .filter((spot) => spot && spot.id)
    .filter((spot) => {
      const activeClaims = (claims[spot.id] ?? []).filter((claim) => {
        if (claim.cancelled_at) return false;
        if (!claim.expires_at) return true;
        return new Date(claim.expires_at).getTime() > now;
      });
      return activeClaims.length === 0;
    })
    .map((spot) => ({
      spot,
      score: _spotScore(spot),
    }))
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.spot ?? null;
}

function _deriveSquadItems(group, groupPins = {}, groupPinJoins = {}, spotRows = []) {
  if (!group) return [];

  const pins = Object.values(groupPins ?? {}).filter((pin) => !pin.ended_at);
  const pinItems = pins.map((pin) => {
    const spotName = pin.spot_id
      ? (spotRows ?? []).find((spot) => spot.id === pin.spot_id)?.name ?? 'a study spot'
      : pin.custom_name ?? 'a saved spot';

    return {
      category: 'squad',
      tone: 'map',
      icon: 'map',
      title: `${pin.display_name ?? group.name ?? 'Your squad'} changed location`,
      body: `${group.name ?? 'Your squad'} moved toward ${spotName}.`,
      date: pin.pinned_at ?? null,
      pills: ['Squad', _joinCount(groupPinJoins[pin.id] ?? []) ? `${_joinCount(groupPinJoins[pin.id] ?? [])} heading` : 'Open map'],
      action: 'group',
    };
  });

  const joinItems = Object.values(groupPinJoins ?? {})
    .flat()
    .filter((join) => join.status === 'heading')
    .map((join) => ({
      category: 'squad',
      tone: 'arrival',
      icon: 'userPlus',
      title: 'Squad member is on the way',
      body: `${group.name ?? 'Your squad'} has active arrival movement.`,
      date: join.joined_at ?? null,
      pills: ['Squad', 'Arriving'],
      action: 'group',
    }));

  return [...pinItems, ...joinItems];
}

function _deriveClaimItems(claimRows = []) {
  return (claimRows ?? []).map((claim) => ({
    category: 'spot',
    tone: claim.cancelled_at ? 'full' : 'free',
    icon: claim.cancelled_at ? 'ban' : 'coffee',
    title: claim.cancelled_at
      ? `${claim.spots?.name ?? 'Spot'} claim ended`
      : `${claim.spots?.name ?? 'A spot'} is active`,
    body: claim.cancelled_at
      ? `${claim.spots?.building ?? 'Campus location'} is ready for a new check.`
      : `${claim.spots?.building ?? 'Campus location'} is part of your current claim history.`,
    date: claim.claimed_at ?? null,
    pills: ['Quick View', claim.cancelled_at ? 'Review' : 'Spot Update'],
    action: 'map',
    actionValue: claim.spot_id,
  }));
}

function _deriveContributionItems(spots = [], buildings = []) {
  const spotItems = (spots ?? []).map((spot) => ({
    category: 'spot',
    tone: spot.status === 'approved' ? 'free' : 'review',
    icon: spot.status === 'approved' ? 'check' : 'sparkles',
    title: spot.status === 'approved'
      ? `${spot.spot_name ?? 'Your spot'} was approved`
      : `${spot.spot_name ?? 'Your spot'} is under review`,
    body: `${spot.building_name || _campusName(spot.campuses)} is tracked in your contribution queue.`,
    date: spot.created_at ?? null,
    pills: ['Review', _confirmationLabel(spot.confirmation_count, spot.status)],
    action: 'contributions',
  }));

  const buildingItems = (buildings ?? []).map((building) => ({
    category: 'spot',
    tone: building.verification_status === 'verified' ? 'free' : 'review',
    icon: building.verification_status === 'verified' ? 'check' : 'map',
    title: building.verification_status === 'verified'
      ? `${building.name ?? 'Building'} was verified`
      : `${building.name ?? 'Building'} needs confirmation`,
    body: `${_campusName(building.campuses)} building marker is still community-reviewed.`,
    date: building.created_at ?? null,
    pills: ['Review', _buildingConfirmationLabel(building.confirmation_count, building.verification_status)],
    action: 'contributions',
  }));

  return [...spotItems, ...buildingItems];
}

function _spotScore(spot) {
  let score = 0;
  if (spot.noise_baseline === 'quiet') score += 6;
  if (spot.wifi_strength === 'strong') score += 2;
  if (spot.has_outlets) score += 2;
  if (spot.has_food) score += 1;
  if (spot.rough_capacity === 'large') score += 1;
  return score;
}

function _joinCount(joins) {
  return joins.filter((join) => join.status === 'heading').length;
}

function _campusName(campus) {
  if (Array.isArray(campus)) return campus[0]?.short_name || campus[0]?.name || 'Campus';
  return campus?.short_name || campus?.name || 'Campus';
}

function _confirmationLabel(count, status) {
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Needs edits';
  return `${Number(count ?? 0)}/2 confirmations`;
}

function _buildingConfirmationLabel(count, status) {
  if (status === 'verified') return 'Verified';
  return `${Number(count ?? 0) + 1}/2 confirmations`;
}
