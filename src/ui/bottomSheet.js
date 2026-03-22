/**
 * src/ui/bottomSheet.js
 *
 * Mobile bottom sheet controller + swipe gesture handler.
 *
 * The sheet lives in the same #panel element as the desktop sidebar.
 * CSS repositions it based on viewport width — this module adds the
 * swipe-up / swipe-down gesture and manages the sheet's open/peek/closed states.
 *
 * States:
 *   closed  — sheet sits below the viewport fold (default on load)
 *   peek    — sheet shows ~40% of viewport height (filter form visible)
 *   open    — sheet covers ~80% of viewport (room to scroll suggestions)
 *
 * The filter panel is always the content of #panel-content. Suggestions are
 * injected into the Find tab body by filterPanel.js when UI_SUGGEST_OPENED
 * fires; this module only expands the sheet to 'open' so there's room to scroll.
 *
 * The spot detail card is rendered in the #spot-modal-overlay by spotCard.js.
 * When a spot is selected, the sheet stays at 'peek' and the modal opens on top.
 *
 * Gesture:
 *   Drag the handle bar up → expand to 'open'
 *   Drag down              → shrink to 'peek' or 'closed'
 */

import { on, emit, EVENTS }    from '../core/events.js';
import { getState }             from '../core/store.js';
import { renderFilterPanel }    from './filterPanel.js';
import { renderSpotCard, closeSpotCard } from './spotCard.js';
import { renderReportPanel }    from './reportPanel.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PEEK_HEIGHT_VH  = 42;   // percent of viewport height when peeking
const OPEN_HEIGHT_VH  = 82;   // percent of viewport height when open
const DRAG_THRESHOLD  = 50;   // px drag needed to trigger state change

// ─── State ───────────────────────────────────────────────────────────────────

/** @type {'closed' | 'peek' | 'open'} */
let _sheetState = 'peek';

/** @type {number} */
let _dragStartY = 0;

/** @type {number} */
let _dragStartH = 0;

// ─── Initialise ──────────────────────────────────────────────────────────────

/**
 * Bootstrap the bottom sheet: register gesture and event listeners,
 * then render the default filter view.
 *
 * @returns {void}
 */
export function initBottomSheet() {
  const panel  = document.getElementById('panel');
  const handle = document.getElementById('panel-handle');
  if (!panel || !handle) return;

  // Set initial peek state.
  _setSheetState('peek');

  // Wire gesture events on the handle.
  handle.addEventListener('pointerdown', _onDragStart, { passive: true });
  document.addEventListener('pointermove', _onDragMove, { passive: false });
  document.addEventListener('pointerup',   _onDragEnd);

  // Respond to store events.
  on(EVENTS.SPOT_SELECTED,      _onSpotSelected);
  on(EVENTS.SPOT_DESELECTED,    _onSpotDeselected);
  on(EVENTS.CLAIM_UPDATED,      _onClaimUpdated);
  on(EVENTS.CLAIM_REMOVED,      _onClaimUpdated);
  on(EVENTS.CORRECTION_FILED,   _onCorrectionFiled);
  on(EVENTS.GROUP_JOINED,       _onGroupJoined);
  on(EVENTS.GROUP_LEFT,         _onGroupLeft);
  on(EVENTS.GROUP_PINS_UPDATED, _onGroupPinsUpdated);
  on(EVENTS.UI_SUGGEST_OPENED,  _onSuggestOpened);

  // Default render — filter form.
  _renderFilterPanel();
}

// ─── Event handlers ──────────────────────────────────────────────────────────

function _onSuggestOpened() {
  if (_isDesktop()) return;
  // Suggestions are injected into the Find tab body by filterPanel.js.
  // Just expand the sheet so the list is scrollable.
  _setSheetState('open');
}

function _onSpotSelected(e) {
  if (_isDesktop()) return;
  // Open the spot card modal; sheet stays at peek with the filter view.
  renderSpotCard(e.detail.spotId);
  _setSheetState('peek');
}

function _onSpotDeselected() {
  if (_isDesktop()) return;
  closeSpotCard();
  _setSheetState('peek');
}

function _onClaimUpdated() {
  if (_isDesktop()) return;
  // Re-render the spot card modal so the inline claim section updates.
  const { selectedSpotId } = getState();
  if (selectedSpotId) renderSpotCard(selectedSpotId);
}

function _onGroupPinsUpdated() {
  if (_isDesktop()) return;
  const { selectedSpotId } = getState();
  if (selectedSpotId) renderSpotCard(selectedSpotId);
}

function _onCorrectionFiled(e) {
  if (_isDesktop()) return;
  // Report panel is a modal — open it without changing the bottom sheet.
  renderReportPanel(null, e.detail.spotId);
}

function _onGroupJoined() {
  if (_isDesktop()) return;
  const { selectedSpotId } = getState();
  if (selectedSpotId) renderSpotCard(selectedSpotId);
}

function _onGroupLeft() {
  if (_isDesktop()) return;
  closeSpotCard();
  _setSheetState('peek');
}

// ─── Gesture handlers ────────────────────────────────────────────────────────

function _onDragStart(e) {
  if (_isDesktop()) return;
  const panel    = document.getElementById('panel');
  _dragStartY    = e.clientY;
  _dragStartH    = panel.offsetHeight;
  panel.style.transition = 'none'; // disable CSS transition during drag
}

function _onDragMove(e) {
  if (!_dragStartY || _isDesktop()) return;
  const panel   = document.getElementById('panel');
  if (!panel) return;

  e.preventDefault(); // prevent page scroll while dragging the sheet
  const delta   = _dragStartY - e.clientY; // positive = dragging up
  const newH    = Math.max(80, Math.min(_dragStartH + delta, window.innerHeight * 0.90));
  panel.style.height = `${newH}px`;
}

function _onDragEnd(e) {
  if (!_dragStartY || _isDesktop()) return;
  const panel   = document.getElementById('panel');
  if (!panel) return;

  panel.style.transition = ''; // restore CSS transition

  const delta   = _dragStartY - e.clientY;
  if (delta > DRAG_THRESHOLD) {
    _setSheetState('open');
  } else if (delta < -DRAG_THRESHOLD) {
    const nextState = _sheetState === 'open' ? 'peek' : 'closed';
    _setSheetState(nextState);
    if (nextState === 'closed' || nextState === 'peek') {
      emit(EVENTS.UI_PANEL_CLOSED, {});
    }
  } else {
    // Snap back to current state.
    _setSheetState(_sheetState);
  }

  _dragStartY = 0;
}

// ─── Sheet state ─────────────────────────────────────────────────────────────

/**
 * Transition the sheet to the given state.
 *
 * @param {'closed' | 'peek' | 'open'} state
 * @returns {void}
 */
function _setSheetState(state) {
  _sheetState = state;
  const panel = document.getElementById('panel');
  if (!panel) return;

  panel.classList.remove('sheet-closed', 'sheet-peek', 'sheet-open');
  panel.classList.add(`sheet-${state}`);

  // Override height via inline style to match the state.
  switch (state) {
    case 'closed': panel.style.height = '0px';                              break;
    case 'peek':   panel.style.height = `${PEEK_HEIGHT_VH}vh`;             break;
    case 'open':   panel.style.height = `${OPEN_HEIGHT_VH}vh`;             break;
  }
}

// ─── View renderer ────────────────────────────────────────────────────────────

/**
 * Render the filter panel into #panel-content (mobile only).
 *
 * @returns {void}
 */
function _renderFilterPanel() {
  if (_isDesktop()) return;
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
