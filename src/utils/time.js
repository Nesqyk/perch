/**
 * src/utils/time.js
 *
 * Relative and formatted time helpers.
 * Used in spotCard.js for claim timestamps ("2m ago", "just now").
 */

/**
 * Convert a timestamp to a short relative string.
 *
 * @param {string | Date} timestamp
 * @returns {string}  e.g. "just now", "2m ago", "1h ago"
 */
export function timeAgo(timestamp) {
  const then  = new Date(timestamp);
  const diffMs = Date.now() - then.getTime();
  const diffS  = Math.floor(diffMs / 1000);
  const diffM  = Math.floor(diffS / 60);
  const diffH  = Math.floor(diffM / 60);

  if (diffS < 30)  return 'just now';
  if (diffS < 90)  return '1m ago';
  if (diffM < 60)  return `${diffM}m ago`;
  if (diffH < 24)  return `${diffH}h ago`;
  return then.toLocaleDateString();
}

/**
 * Format a time string (HH:MM:SS) to a short 12-hour label.
 *
 * @param {string} timeStr  e.g. "13:00:00"
 * @returns {string}        e.g. "1:00 PM"
 */
export function formatTime(timeStr) {
  if (!timeStr) return '';
  const [hourStr, minStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10);
  const min  = minStr ?? '00';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12  = hour % 12 || 12;
  return `${h12}:${min} ${ampm}`;
}

/**
 * Return a human-readable expiry countdown for an active claim.
 *
 * @param {string | Date} expiresAt
 * @returns {string}  e.g. "expires in 18m"
 */
export function claimExpiresIn(expiresAt) {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return 'expired';
  const diffM = Math.ceil(diffMs / 60_000);
  return `expires in ${diffM}m`;
}

/**
 * Format a distance in meters into a human-readable walk time string.
 * Uses 84m/min as average walking speed.
 *
 * @param {number} distanceMeters
 * @returns {string} e.g. "< 1 min walk", "5 min walk"
 */
export function formatWalkTime(distanceMeters) {
  const mins = Math.floor(distanceMeters / 84);
  return mins === 0 ? '< 1 min walk' : `${mins} min walk`;
}
