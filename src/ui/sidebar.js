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
import { renderReportPanel }   from './reportPanel.js';
import { renderSuggestionsList } from './suggestionsList.js';

let _currentView = 'filters';
let _lastRanked = [];

// ─── Initialise ──────────────────────────────────────────────────────────────

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
  on(EVENTS.UI_SUGGEST_OPENED,  _onSuggestOpened);

  // Render the default filter view on startup.
  _renderView('filters');
}

// ─── Event handlers ──────────────────────────────────────────────────────────

function _onSuggestOpened(e) {
  _lastRanked = e.detail.rankedSpots;
  _renderView('suggestions');
}

function _onSpotSelected(e) {
  // Always show the spotCard in the sidebar — the floating overlay handles claims.
  _renderView('spotCard', e.detail.spotId);
}

function _onSpotDeselected() {
  _renderView('filters');
}

function _onClaimUpdated() {
  // Re-render the spotCard so the inline claim section appears/disappears.
  const { selectedSpotId } = getState();
  if (selectedSpotId && _currentView === 'spotCard') {
    _renderView('spotCard', selectedSpotId);
  }
}

function _onGroupPinsUpdated() {
  const { selectedSpotId } = getState();
  _renderView(_currentView, selectedSpotId);
}

function _onCorrectionFiled(e) {
  // Report panel is now a modal — open it without switching the sidebar view.
  renderReportPanel(null, e.detail.spotId);
}

function _onGroupJoined() {
  const { selectedSpotId } = getState();
  if (selectedSpotId && _currentView === 'spotCard') {
    _renderView('spotCard', selectedSpotId);
  } else {
    _renderView('filters');
  }
}

function _onGroupLeft() {
  _renderView('filters');
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
    case 'suggestions':
      renderSuggestionsList(container, _lastRanked);
      break;
  }
}

function _isDesktop() {
  return window.matchMedia('(min-width: 768px)').matches;
}
