/**
 * src/ui/sidebar.js
 *
 * Desktop right-panel controller.
 * Manages which view is rendered inside #panel on desktop layouts.
 *
 * Views (mutually exclusive):
 *   'filters'   — default; filter form + legend
 *   'spotCard'  — spot detail for a selected spot
 *   'claim'     — post-claim "you're heading here" panel
 *   'report'    — post-report "it's full" + alternatives panel
 *
 * On mobile, this module is inactive — bottomSheet.js takes over.
 * The breakpoint is defined in CSS (--breakpoint-desktop: 768px).
 */

import { on, EVENTS }         from '../core/events.js';
import { getState }            from '../core/store.js';
import { renderFilterPanel, initFilterPanel } from './filterPanel.js';
import { renderSpotCard }      from './spotCard.js';
import { renderClaimPanel, initClaimPanel }   from './claimPanel.js';
import { renderReportPanel }   from './reportPanel.js';

let _currentView = 'filters';

// ─── Initialise ──────────────────────────────────────────────────────────────

export function initSidebar() {
  initFilterPanel();
  initClaimPanel();

  on(EVENTS.SPOT_SELECTED,   _onSpotSelected);
  on(EVENTS.SPOT_DESELECTED, _onSpotDeselected);
  on(EVENTS.CLAIM_UPDATED,   _onClaimUpdated);
  on(EVENTS.CORRECTION_FILED, _onCorrectionFiled);

  // Render the default filter view on startup.
  _renderView('filters');
}

// ─── Event handlers ──────────────────────────────────────────────────────────

function _onSpotSelected(e) {
  const { myActiveClaim } = getState();
  // If the selected spot is already claimed by this session, show claim panel.
  if (myActiveClaim?.spotId === e.detail.spotId) {
    _renderView('claim', e.detail.spotId);
  } else {
    _renderView('spotCard', e.detail.spotId);
  }
}

function _onSpotDeselected() {
  _renderView('filters');
}

function _onClaimUpdated(_e) {
  const { myActiveClaim, selectedSpotId } = getState();
  // Switch to claim panel when this session's own claim is added.
  if (myActiveClaim && myActiveClaim.spotId === selectedSpotId) {
    _renderView('claim', selectedSpotId);
  }
}

function _onCorrectionFiled(e) {
  const { selectedSpotId } = getState();
  if (e.detail.spotId === selectedSpotId) {
    _renderView('report', selectedSpotId);
  }
}

// ─── View renderer ────────────────────────────────────────────────────────────

function _renderView(view, spotId) {
  // Guard: only act on desktop breakpoint.
  if (!_isDesktop()) return;

  _currentView = view;
  const container = document.getElementById('panel-content');
  if (!container) return;

  switch (view) {
    case 'filters':
      renderFilterPanel(container);
      break;
    case 'spotCard':
      renderSpotCard(container, spotId);
      break;
    case 'claim':
      renderClaimPanel(container, spotId);
      break;
    case 'report':
      renderReportPanel(container, spotId);
      break;
  }
}

function _isDesktop() {
  return window.matchMedia('(min-width: 768px)').matches;
}
