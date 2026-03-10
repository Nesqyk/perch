/**
 * src/utils/capacity.js
 *
 * Rough remaining capacity helpers.
 * These functions are used by spotCard.js and correctionPanel.js
 * to display "~5 people can still fit" without needing exact seat counts.
 */

/** Maps rough_capacity enum → approximate maximum head count. */
export const ROUGH_CAPACITY_MAX = {
  small:  8,
  medium: 20,
  large:  40,
};

/** Human-readable label for a capacity tier. */
export const ROUGH_CAPACITY_LABEL = {
  small:  '~8 people',
  medium: '~20 people',
  large:  '~40 people',
};

/**
 * Group size key → { min, max, label }.
 * Used when creating a claim and displaying capacity math.
 */
export const GROUP_SIZE_CONFIG = {
  solo:   { key: 'solo',   min: 1,  max: 1,    label: 'Just me' },
  small:  { key: 'small',  min: 2,  max: 5,    label: '2 – 5 people' },
  medium: { key: 'medium', min: 6,  max: 15,   label: '6 – 15 people' },
  large:  { key: 'large',  min: 16, max: null,  label: '16+ people' },
};

/**
 * Calculate remaining capacity after accounting for active claims.
 *
 * @param {string}   roughCapacity - 'small' | 'medium' | 'large'
 * @param {object[]} activeClaims  - array of claim rows (each has group_size_min)
 * @returns {{ remaining: number | null, label: string }}
 */
export function calcRemainingCapacity(roughCapacity, activeClaims) {
  const max = ROUGH_CAPACITY_MAX[roughCapacity] ?? null;
  if (max === null) return { remaining: null, label: 'Capacity unknown' };

  const claimedCount = activeClaims.reduce(
    (sum, c) => sum + (c.group_size_min ?? 1),
    0
  );

  const remaining = Math.max(0, max - claimedCount);

  if (remaining === 0) return { remaining: 0, label: 'Likely full' };

  return {
    remaining,
    label: `~${remaining} ${remaining === 1 ? 'person' : 'people'} can still fit`,
  };
}
