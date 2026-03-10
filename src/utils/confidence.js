/**
 * src/utils/confidence.js
 *
 * Converts a raw confidence score (0.0 – 1.0) into the human-readable
 * labels and CSS class names used throughout the UI.
 *
 * These thresholds must stay in sync with the pin color logic in
 * src/state/spotState.js and the CSS variables in src/styles/main.css.
 */

/**
 * @typedef {{ label: string, cssClass: string, percent: number }} ConfidenceDisplay
 */

/**
 * Convert a raw score to a display object.
 *
 * @param {number | null | undefined} score  0.0 – 1.0
 * @returns {ConfidenceDisplay}
 */
export function formatConfidence(score) {
  if (score === null || score === undefined) {
    return { label: 'Unknown', cssClass: 'confidence-unknown', percent: 0 };
  }

  const pct = Math.round(score * 100);

  if (score >= 0.75) return { label: 'Likely Free',     cssClass: 'confidence-free',    percent: pct };
  if (score >= 0.50) return { label: 'Maybe Free',      cssClass: 'confidence-maybe',   percent: pct };
  if (score >= 0.25) return { label: 'Probably Busy',   cssClass: 'confidence-busy',    percent: pct };
  return               { label: 'Likely Full',     cssClass: 'confidence-full',    percent: pct };
}

/**
 * Return just the short status label for a pin tooltip.
 *
 * @param {number | null | undefined} score
 * @returns {string}
 */
export function confidenceLabel(score) {
  return formatConfidence(score).label;
}
