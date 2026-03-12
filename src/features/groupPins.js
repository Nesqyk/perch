/**
 * src/features/groupPins.js
 *
 * Feature module — group pin lifecycle management.
 *
 * Handles:
 *   - "Perch Here" → drop a live pin for the current group at a spot
 *   - "I'm heading there" → transit join a live pin
 *   - "End pin" → pinner manually ends their live pin
 *   - Vibe Confirm → passive one-tap status signal
 *
 * Wired up by main.js at boot via initGroupPins().
 * All communication through the event bus — never imports UI siblings.
 */

import { on }    from '../core/events.js';
import { dispatch, getState } from '../core/store.js';
import {
  dropLivePin,
  endLivePin,
  joinGroupPin,
  confirmVibe,
} from '../api/groupPins.js';
import { showToast }    from '../ui/toast.js';

// ─── Event name constants (UI → feature boundary) ─────────────────────────────

/**
 * UI emits these strings; feature module listens.
 * Kept here (not in EVENTS) because they are internal to the groups feature.
 */
export const GROUP_PIN_EVENTS = Object.freeze({
  DROP_REQUESTED:    'ui:groupPinDrop',
  JOIN_REQUESTED:    'ui:groupPinJoin',
  END_REQUESTED:     'ui:groupPinEnd',
  VIBE_SUBMITTED:    'ui:groupVibeSubmit',
});

// ─── Initialise ───────────────────────────────────────────────────────────────

/**
 * Wire up group pin UI event listeners.
 * Call once from main.js after boot.
 */
export function initGroupPins() {
  on(GROUP_PIN_EVENTS.DROP_REQUESTED,  _onDropRequested);
  on(GROUP_PIN_EVENTS.JOIN_REQUESTED,  _onJoinRequested);
  on(GROUP_PIN_EVENTS.END_REQUESTED,   _onEndRequested);
  on(GROUP_PIN_EVENTS.VIBE_SUBMITTED,  _onVibeSubmitted);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * Drop a live pin at the currently selected spot.
 *
 * @param {CustomEvent<{ spotId: string, vibe?: string, note?: string }>} e
 */
async function _onDropRequested(e) {
  const { group } = getState();
  if (!group) {
    showToast('Join a group first to drop a pin.', 'error');
    return;
  }

  const { spotId, vibe = null, note = null } = e.detail;

  dispatch('SET_STATUS', { groupPending: true });
  const { data, error } = await dropLivePin({ groupId: group.id, spotId, vibe, note });
  dispatch('SET_STATUS', { groupPending: false });

  if (error || !data) {
    showToast('Could not drop pin. Try again.', 'error');
    return;
  }

  // Realtime will broadcast the insert back to us and call GROUP_PIN_UPSERTED,
  // but for instant feedback we also dispatch optimistically.
  dispatch('GROUP_PIN_UPSERTED', { pin: data });
  showToast('Pin dropped! Your squad can see it.', 'success');
}

/**
 * Signal transit — "I'm heading to this pin".
 *
 * @param {CustomEvent<{ pinId: string, status?: string }>} e
 */
async function _onJoinRequested(e) {
  const { group } = getState();
  if (!group) return;

  const { pinId, status = 'heading' } = e.detail;

  const { data, error } = await joinGroupPin({ pinId, status });

  if (error || !data) {
    showToast('Could not update status. Try again.', 'error');
    return;
  }

  dispatch('GROUP_PIN_JOIN_UPSERTED', { join: data });

  const label = status === 'arrived' ? 'Marked as arrived!' : 'On your way — squad notified.';
  showToast(label, 'success');
}

/**
 * Pinner manually ends their live pin.
 *
 * @param {CustomEvent<{ pinId: string }>} e
 */
async function _onEndRequested(e) {
  const { pinId } = e.detail;

  dispatch('SET_STATUS', { groupPending: true });
  const { error } = await endLivePin(pinId);
  dispatch('SET_STATUS', { groupPending: false });

  if (error) {
    showToast('Could not end pin. Try again.', 'error');
    return;
  }

  dispatch('GROUP_PIN_ENDED', { pinId });
  showToast('Pin ended. Thanks for the update!', 'success');
}

/**
 * Passive Vibe Confirm tap.
 *
 * @param {CustomEvent<{ pinId: string, vibeStatus: 'free' | 'filling' | 'full' }>} e
 */
async function _onVibeSubmitted(e) {
  const { pinId, vibeStatus } = e.detail;
  const { error } = await confirmVibe({ pinId, vibeStatus });

  if (error) {
    showToast('Could not send vibe. Try again.', 'error');
    return;
  }

  showToast('Vibe confirmed!', 'success');
}
