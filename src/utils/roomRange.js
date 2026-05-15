/**
 * src/utils/roomRange.js
 *
 * Pure helpers for parsing numeric room ranges used by the building composer.
 * These utilities are intentionally UI-agnostic so they can be unit tested
 * without DOM or network dependencies.
 */

const RANGE_PATTERN = /^(\d+)\s*-\s*(\d+)$/;

/**
 * Parse a numeric room range like `101-110`.
 *
 * @param {string} input
 * @param {{ maxCount?: number }} [options]
 * @returns {{ names: string[], error: string | null }}
 */
export function parseRoomRange(input, { maxCount = 50 } = {}) {
  const text = String(input ?? '').trim();
  const match = text.match(RANGE_PATTERN);

  if (!match) {
    return {
      names: [],
      error: 'Use a numeric range like 101-110.',
    };
  }

  const startText = match[1];
  const endText = match[2];
  const start = Number(startText);
  const end = Number(endText);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return {
      names: [],
      error: 'Room ranges must use numbers only.',
    };
  }

  if (start > end) {
    return {
      names: [],
      error: 'The room range must start before it ends.',
    };
  }

  const count = (end - start) + 1;
  if (count > maxCount) {
    return {
      names: [],
      error: `You can add up to ${maxCount} rooms at once.`,
    };
  }

  const width = Math.max(startText.length, endText.length);
  const names = [];
  for (let value = start; value <= end; value += 1) {
    names.push(String(value).padStart(width, '0'));
  }

  return { names, error: null };
}
