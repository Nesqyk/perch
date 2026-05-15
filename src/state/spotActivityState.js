/**
 * src/state/spotActivityState.js
 *
 * Pure derivation helpers for public spot activity rows.
 * Activity is based only on active claim records with denormalized safe names.
 */

import { timeAgo } from '../utils/time.js';

const GROUP_SIZE_LABELS = Object.freeze({
  solo: 'Solo',
  small: 'Small group',
  medium: 'Group',
  large: 'Large group',
});

/**
 * Build compact recent check-in rows for a spot detail surface.
 *
 * @param {{ claims?: object[], currentUserId?: string | null, limit?: number }} [options]
 * @returns {Array<{ name: string, initials: string, meta: string, tag: string }>}
 */
export function deriveSpotActivityRows({ claims = [], currentUserId = null, limit = 3 } = {}) {
  return [...claims]
    .sort((a, b) => _timestampMs(b.claimed_at) - _timestampMs(a.claimed_at))
    .slice(0, limit)
    .map((claim) => {
      const isMine = Boolean(currentUserId && claim.user_id === currentUserId);
      const name = isMine ? 'You' : _safeName(claim.nickname);
      return {
        name,
        initials: isMine ? 'ME' : _initials(name),
        meta: claim.claimed_at ? `Checked in ${timeAgo(claim.claimed_at)}` : 'Checked in recently',
        tag: GROUP_SIZE_LABELS[claim.group_size_key] ?? 'Studying',
      };
    });
}

function _safeName(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned || 'Perch member';
}

function _timestampMs(value) {
  const timestamp = new Date(value ?? 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function _initials(value) {
  return String(value)
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'PM';
}
