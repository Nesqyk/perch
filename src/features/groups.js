/**
 * src/features/groups.js
 *
 * Feature module — group creation and joining flow.
 *
 * Handles UI events from groupCreateModal.js and groupJoinModal.js,
 * calls the API, dispatches to the store, and triggers side-effects
 * (realtime subscription, pin fetch, toast feedback).
 *
 * Wired up by main.js at boot via initGroups().
 * All cross-module communication goes through the event bus.
 */

import { on, emit, EVENTS }                    from '../core/events.js';
import { dispatch }                             from '../core/store.js';
import { createGroup, joinGroup,
         fetchGroupMembers }                    from '../api/groups.js';
import { fetchGroupPins, fetchGroupPinJoins }   from '../api/groupPins.js';
import { subscribeToGroupRealtime,
         unsubscribeFromGroupRealtime }          from '../api/realtime.js';
import { showToast }                            from '../ui/toast.js';

// ─── Initialise ───────────────────────────────────────────────────────────────

/**
 * Wire up group-related UI event listeners.
 * Call once from main.js after boot.
 */
export function initGroups() {
  on(EVENTS.UI_GROUP_CREATE, _onCreateRequested);
  on(EVENTS.UI_GROUP_JOIN,   _onJoinRequested);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * Handles UI_GROUP_CREATE event from groupCreateModal.js.
 *
 * @param {CustomEvent<{ name: string, displayName: string, context: string }>} e
 */
async function _onCreateRequested(e) {
  const { name, displayName, context } = e.detail;

  dispatch('SET_STATUS', { groupPending: true });

  const { group, member, error } = await createGroup({ name, displayName, context });

  dispatch('SET_STATUS', { groupPending: false });

  if (error || !group) {
    showToast(error ?? 'Could not create group. Try again.', 'error');
    return;
  }

  await _activateGroup(group, member);
  showToast(`Group "${group.name}" created! Code: ${group.code}`, 'success');
}

/**
 * Handles UI_GROUP_JOIN event from groupJoinModal.js.
 *
 * @param {CustomEvent<{ code: string, displayName: string }>} e
 */
async function _onJoinRequested(e) {
  const { code, displayName } = e.detail;

  dispatch('SET_STATUS', { groupPending: true });

  const { group, member, error } = await joinGroup({ code, displayName });

  dispatch('SET_STATUS', { groupPending: false });

  if (error || !group) {
    showToast(error ?? 'Could not join group. Check the code.', 'error');
    return;
  }

  await _activateGroup(group, member);
  showToast(`Joined "${group.name}"! Welcome.`, 'success');
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Common post-join activation:
 *  1. Dispatch GROUP_JOINED to update the store.
 *  2. Fetch existing pins for the group and load them.
 *  3. Subscribe to the group's Realtime channel.
 *  4. Emit GROUP_JOINED event so the UI switches to the group panel.
 *
 * @param {object} group
 * @param {object} member
 */
async function _activateGroup(group, member) {
  // Normalise member fields to camelCase for the store.
  const normMember = {
    id:          member.id,
    groupId:     member.group_id,
    sessionId:   member.session_id,
    displayName: member.display_name,
    scoutPoints: member.scout_points,
  };

  dispatch('GROUP_JOINED', { group, member: normMember });

  // Fetch full members list and push to store so UI can render them.
  const members = await fetchGroupMembers(group.id);
  dispatch('GROUP_MEMBERS_UPDATED', { members });

  // Fetch existing pins.
  const pins = await fetchGroupPins(group.id);
  dispatch('GROUP_PINS_LOADED', { pins });

  // Fetch transit joins for all live pins.
  const livePinIds = pins.filter(p => p.pin_type === 'live' && !p.ended_at).map(p => p.id);
  if (livePinIds.length) {
    const joins = await fetchGroupPinJoins(livePinIds);
    for (const join of joins) {
      dispatch('GROUP_PIN_JOIN_UPSERTED', { join });
    }
  }

  // Open Realtime for this group.
  subscribeToGroupRealtime(group.id);
}

/**
 * Leave the current group — tears down realtime and clears store.
 * Exported so spotCard.js can call it from a "Leave group" button.
 */
export function leaveGroup() {
  unsubscribeFromGroupRealtime();
  dispatch('GROUP_LEFT', {});
  emit(EVENTS.GROUP_LEFT, {});
}

/**
 * Build a shareable group join URL.
 *
 * @param {string} code
 * @returns {string}
 */
export function buildGroupJoinUrl(code) {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('join', code);
  return url.toString();
}
