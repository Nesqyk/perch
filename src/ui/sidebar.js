/**
 * src/ui/sidebar.js
 *
 * Desktop right-panel controller.
 * Manages which view is rendered inside #panel on desktop layouts.
 * Always renders the filter panel — suggestions are injected inside
 * the Find tab body by filterPanel.js when UI_SUGGEST_OPENED fires.
 *
 * The spot detail card is rendered in the #spot-modal-overlay by spotCard.js
 * and is not part of the panel view system.
 *
 * On mobile, this module is inactive — bottomSheet.js takes over.
 * The breakpoint is defined in CSS (--breakpoint-desktop: 768px).
 */

import { on, EVENTS }         from '../core/events.js';
import { getState }            from '../core/store.js';
import { renderFilterPanel, initFilterPanel } from './filterPanel.js';
import { renderSpotCard, closeSpotCard }      from './spotCard.js';
import { renderReportPanel }   from './reportPanel.js';

// ─── Initialise ──────────────────────────────────────────────────────────────

/**
 * Bootstrap the sidebar: register event listeners and render the default view.
 *
 * @returns {void}
 */
export function initSidebar() {
  initFilterPanel();

  on(EVENTS.SPOT_SELECTED,      _onSpotSelected);
  on(EVENTS.SPOT_DESELECTED,    _onSpotDeselected);
  on(EVENTS.CLAIM_UPDATED,      _onClaimUpdated);
  on(EVENTS.CLAIM_REMOVED,      _onClaimUpdated);
  on(EVENTS.CORRECTION_FILED,   _onCorrectionFiled);
  on(EVENTS.GROUP_JOINED,       _onGroupJoined);
  on(EVENTS.GROUP_LEFT,         _onGroupLeft);
  on(EVENTS.GROUP_PINS_UPDATED, _onGroupPinsUpdated);

  // Render the default filter view on startup.
  _renderFilterPanel();
}

// ─── Event handlers ──────────────────────────────────────────────────────────

function _onSpotSelected(e) {
  if (!_isDesktop()) return;
  // Open the spot card modal; panel stays on the filter view.
  renderSpotCard(e.detail.spotId);
}

function _onSpotDeselected() {
  if (!_isDesktop()) return;
  closeSpotCard();
}

function _onClaimUpdated() {
  if (!_isDesktop()) return;
  // Re-render the spot card modal so the inline claim section updates.
  const { selectedSpotId } = getState();
  if (selectedSpotId) renderSpotCard(selectedSpotId);
}

function _onGroupPinsUpdated() {
  if (!_isDesktop()) return;
  const { selectedSpotId } = getState();
  if (selectedSpotId) renderSpotCard(selectedSpotId);
}

function _onCorrectionFiled(e) {
  if (!_isDesktop()) return;
  // Report panel is a modal — open it without touching the sidebar view.
  renderReportPanel(null, e.detail.spotId);
}

function _onGroupJoined() {
  if (!_isDesktop()) return;
  const { selectedSpotId } = getState();
  if (selectedSpotId) renderSpotCard(selectedSpotId);
}

function _onGroupLeft() {
  if (!_isDesktop()) return;
  closeSpotCard();
}

// ─── View renderer ────────────────────────────────────────────────────────────

/**
 * Render the filter panel into #panel-content (desktop only).
 *
 * @returns {void}
 */
function _renderFilterPanel() {
  if (!_isDesktop()) return;
  const container = document.getElementById('panel-content');
  if (!container) return;
  renderFilterPanel(container);
}

/**
 * @returns {boolean}
 */
function _isDesktop() {
  return window.matchMedia('(min-width: 768px)').matches;
}
