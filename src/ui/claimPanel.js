/**
 * src/ui/claimPanel.js
 *
 * The active-claim UI is now rendered inline inside the spotCard
 * (see spotCard.js _buildClaimSection). This module is kept as a
 * minimal stub so any lingering imports don't break.
 *
 * initClaimPanel() is a no-op — spotCard handles everything.
 * renderClaimPanel() is a no-op — spotCard handles it via CLAIM_UPDATED re-render.
 * hideClaimOverlay() is a no-op — there is no longer a standalone overlay element.
 */

/**
 * No-op initialiser — kept for API compatibility.
 *
 * @returns {void}
 */
export function initClaimPanel() {
  // Intentionally empty. Claim section lives inside spotCard.js.
}

/**
 * No-op renderer — kept for API compatibility.
 *
 * @param {HTMLElement} _container
 * @param {string}      _spotId
 * @returns {void}
 */
export function renderClaimPanel(_container, _spotId) {
  // Intentionally empty. Claim section lives inside spotCard.js.
}

/**
 * No-op — the overlay element no longer exists.
 *
 * @returns {void}
 */
export function hideClaimOverlay() {
  // Intentionally empty. No standalone overlay to hide.
}
