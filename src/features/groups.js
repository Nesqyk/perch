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
         fetchGroupDashboard,
         updateMyGroupPresence,
         updateGroupCurrentSpot,
         createOrUpdateGroupMeetup,
         createOrUpdateGroupPerk,
         markGroupPerkRedeemed,
         uploadGroupCover,
         uploadMyGroupAvatar }                  from '../api/groups.js';
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
  on(EVENTS.UI_GROUP_PRESENCE_UPDATE, _onPresenceUpdateRequested);
  on(EVENTS.UI_GROUP_CURRENT_SPOT_UPDATE, _onCurrentSpotUpdateRequested);
  on(EVENTS.UI_GROUP_MEETUP_UPDATE, _onMeetupUpdateRequested);
  on(EVENTS.UI_GROUP_PERK_UPDATE, _onPerkUpdateRequested);
  on(EVENTS.UI_GROUP_PERK_REDEEM, _onPerkRedeemRequested);
  on(EVENTS.UI_GROUP_COVER_UPLOAD, _onCoverUploadRequested);
  on(EVENTS.UI_GROUP_AVATAR_UPLOAD, _onAvatarUploadRequested);
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

/**
 * Handles current-member presence edits from the squad roster.
 *
 * @param {CustomEvent<{ memberId: string, focusMode?: string, availabilityStatus?: 'available' | 'busy' }>} e
 */
async function _onPresenceUpdateRequested(e) {
  const { memberId, focusMode, availabilityStatus } = e.detail;
  const { member, error } = await updateMyGroupPresence({ memberId, focusMode, availabilityStatus });

  if (error || !member) {
    showToast(error ?? 'Could not update your status.', 'error');
    return;
  }

  dispatch('GROUP_MEMBER_UPDATED', { member });
  showToast('Squad status updated.', 'success');
}

/**
 * Handles current venue updates from the squad page.
 *
 * @param {CustomEvent<{ groupId: string, spotId: string | null }>} e
 */
async function _onCurrentSpotUpdateRequested(e) {
  const { groupId, spotId } = e.detail;
  const { group, currentSpot, error } = await updateGroupCurrentSpot({ groupId, spotId });

  if (error || !group) {
    showToast(error ?? 'Could not change the squad spot.', 'error');
    return;
  }

  dispatch('GROUP_UPDATED', { group, currentSpot });
  showToast(currentSpot ? `Current venue set to ${currentSpot.name}.` : 'Current venue cleared.', 'success');
}

/**
 * Handles meetup edits.
 *
 * @param {CustomEvent<{ groupId: string, meetupId?: string | null, title: string, startsAt: string, locationLabel?: string | null }>} e
 */
async function _onMeetupUpdateRequested(e) {
  const { meetup, error } = await createOrUpdateGroupMeetup(e.detail);

  if (error || !meetup) {
    showToast(error ?? 'Could not save the meetup.', 'error');
    return;
  }

  dispatch('GROUP_MEETUP_UPDATED', { meetup });
  showToast('Meetup saved.', 'success');
}

/**
 * Handles perk edits.
 *
 * @param {CustomEvent<{ groupId: string, perkId?: string | null, title: string, code: string, isRedeemed?: boolean }>} e
 */
async function _onPerkUpdateRequested(e) {
  const { perk, error } = await createOrUpdateGroupPerk(e.detail);

  if (error || !perk) {
    showToast(error ?? 'Could not save the squad perk.', 'error');
    return;
  }

  dispatch('GROUP_PERK_UPDATED', { perk });
  showToast('Squad perk saved.', 'success');
}

/**
 * Handles marking a perk redeemed.
 *
 * @param {CustomEvent<{ perkId: string }>} e
 */
async function _onPerkRedeemRequested(e) {
  const { perkId } = e.detail;
  const { perk, error } = await markGroupPerkRedeemed(perkId);

  if (error || !perk) {
    showToast(error ?? 'Could not redeem the perk.', 'error');
    return;
  }

  dispatch('GROUP_PERK_UPDATED', { perk: null });
  showToast('Perk marked redeemed.', 'success');
}

/**
 * Handles manager cover image uploads.
 *
 * @param {CustomEvent<{ groupId: string, file: File }>} e
 */
async function _onCoverUploadRequested(e) {
  const { group, error } = await uploadGroupCover(e.detail);

  if (error || !group) {
    showToast(error ?? 'Could not upload the squad image.', 'error');
    return;
  }

  dispatch('GROUP_UPDATED', { group });
  showToast('Squad image updated.', 'success');
}

/**
 * Handles current-member avatar uploads.
 *
 * @param {CustomEvent<{ groupId: string, memberId: string, file: File }>} e
 */
async function _onAvatarUploadRequested(e) {
  const { member, error } = await uploadMyGroupAvatar(e.detail);

  if (error || !member) {
    showToast(error ?? 'Could not upload your avatar.', 'error');
    return;
  }

  dispatch('GROUP_MEMBER_UPDATED', { member });
  showToast('Squad avatar updated.', 'success');
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
    userId:      member.user_id,
    displayName: member.display_name,
    scoutPoints: member.scout_points,
    role:        member.role,
    focusMode:   member.focus_mode,
    availabilityStatus: member.availability_status,
    avatarUrl:   member.avatar_url,
  };

  dispatch('GROUP_JOINED', { group, member: normMember });

  const dashboard = await fetchGroupDashboard(group.id);
  dispatch('GROUP_DASHBOARD_LOADED', dashboard);
  if (dashboard.error) {
    showToast('Joined, but some squad details could not load yet.', 'info');
  }

  const pins = dashboard.pins ?? [];
  dispatch('GROUP_PINS_LOADED', { pins });

  for (const join of dashboard.pinJoins ?? []) {
    dispatch('GROUP_PIN_JOIN_UPSERTED', { join });
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
