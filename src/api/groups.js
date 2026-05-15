/**
 * src/api/groups.js
 *
 * Read/write operations for squad dashboard data:
 * `groups`, `group_members`, `group_meetups`, and `group_perks`.
 *
 * Membership is now driven by Supabase Auth (auth.uid()).
 * The client no longer passes an explicit session or user ID; the DB
 * injects auth.uid() using `default auth.uid()` on insert.
 */

import { supabase } from './supabaseClient.js';
import { fetchGroupPins, fetchGroupPinJoins } from './groupPins.js';
import { signSpotImageUrl } from './spots.js';

const GROUP_ASSETS_BUCKET = 'group-assets';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const GROUP_COLORS = [
  '#7c3aed', // violet
  '#db2777', // pink
  '#ea580c', // orange
  '#0891b2', // cyan
  '#16a34a', // green
  '#ca8a04', // amber
  '#dc2626', // red
  '#4f46e5', // indigo
];

const GROUP_SELECT = `
  id,
  name,
  code,
  color,
  context,
  campus_id,
  created_by,
  purpose,
  started_at,
  current_spot_id,
  progress_current,
  progress_target,
  cover_image_path,
  created_at
`;

const MEMBER_SELECT = `
  id,
  group_id,
  user_id,
  display_name,
  scout_points,
  role,
  focus_mode,
  availability_status,
  avatar_url,
  avatar_image_path,
  joined_at
`;

const SPOT_SELECT = `
  id,
  name,
  type,
  campus_id,
  building_id,
  on_campus,
  building,
  floor,
  walk_time_min,
  rough_capacity,
  has_outlets,
  wifi_strength,
  noise_baseline,
  has_food,
  lat,
  lng,
  image_path
`;

/**
 * Create a new group and immediately join it as the creator.
 *
 * @param {{ name: string, displayName: string, context?: string, campusId?: string | null }} params
 * @returns {Promise<{ group: object | null, member: object | null, error: string | null }>}
 */
export async function createGroup({ name, displayName, context = 'campus', campusId = null }) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const userId = authData?.user?.id ?? null;

  if (authError || !userId) {
    console.error('[groups] createGroup auth error:', authError?.message ?? 'Not authenticated.');
    return { group: null, member: null, error: 'Please sign in before creating a squad.' };
  }

  const code  = _randomCode();
  const color = GROUP_COLORS[_nameHash(name) % GROUP_COLORS.length];

  const { data: group, error: gErr } = await supabase
    .from('groups')
    .insert({
      name,
      code,
      color,
      context,
      campus_id: campusId,
      created_by: userId,
      progress_current: 0,
    })
    .select(GROUP_SELECT)
    .single();

  if (gErr) {
    console.error('[groups] createGroup error:', gErr.message);
    return { group: null, member: null, error: gErr.message };
  }

  const { member, error: mErr } = await _insertMember(group.id, displayName, 'mayor', userId);
  if (mErr) return { group: null, member: null, error: mErr };

  return { group, member, error: null };
}

/**
 * Join an existing group by its code.
 *
 * @param {{ code: string, displayName: string }} params
 * @returns {Promise<{ group: object | null, member: object | null, error: string | null }>}
 */
export async function joinGroup({ code, displayName }) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const userId = authData?.user?.id ?? null;

  if (authError || !userId) {
    console.error('[groups] joinGroup auth error:', authError?.message ?? 'Not authenticated.');
    return { group: null, member: null, error: 'Please sign in before joining a squad.' };
  }

  const { data: group, error: gErr } = await supabase
    .from('groups')
    .select(GROUP_SELECT)
    .eq('code', code.toUpperCase())
    .single();

  if (gErr || !group) {
    console.error('[groups] joinGroup — group not found:', gErr?.message);
    return { group: null, member: null, error: 'Group not found. Check the code and try again.' };
  }

  const { member, error: mErr } = await _insertMember(group.id, displayName, 'member', userId);
  if (mErr) return { group: null, member: null, error: mErr };

  return { group, member, error: null };
}

/**
 * Fetch the composed dashboard payload for an active group.
 *
 * @param {string} groupId
 * @returns {Promise<{
 *   group: object | null,
 *   members: object[],
 *   currentSpot: object | null,
 *   meetup: object | null,
 *   perk: object | null,
 *   pins: object[],
 *   pinJoins: object[],
 *   error: string | null
 * }>}
 */
export async function fetchGroupDashboard(groupId) {
  const { data: group, error: groupErr } = await supabase
    .from('groups')
    .select(GROUP_SELECT)
    .eq('id', groupId)
    .single();

  if (groupErr || !group) {
    console.error('[groups] fetchGroupDashboard group error:', groupErr?.message);
    return {
      group: null,
      members: [],
      currentSpot: null,
      meetup: null,
      perk: null,
      pins: [],
      pinJoins: [],
      error: groupErr?.message ?? 'Group not found.',
    };
  }

  const [members, currentSpot, meetup, perk, pins] = await Promise.all([
    fetchGroupMembers(groupId),
    group.current_spot_id ? fetchGroupCurrentSpot(group.current_spot_id) : Promise.resolve(null),
    fetchNextGroupMeetup(groupId),
    fetchActiveGroupPerk(groupId),
    fetchGroupPins(groupId),
  ]);

  const livePinIds = pins.filter(p => p.pin_type === 'live' && !p.ended_at).map(p => p.id);
  const pinJoins = livePinIds.length ? await fetchGroupPinJoins(livePinIds) : [];

  const hydrated = await _hydrateDashboardAssets(group, members);
  return { group: hydrated.group, members: hydrated.members, currentSpot, meetup, perk, pins, pinJoins, error: null };
}

/**
 * Fetch all members for a group.
 *
 * @param {string} groupId
 * @returns {Promise<object[]>}
 */
export async function fetchGroupMembers(groupId) {
  const { data, error } = await supabase
    .from('group_members')
    .select(MEMBER_SELECT)
    .eq('group_id', groupId)
    .order('role')
    .order('joined_at');

  if (error) {
    console.error('[groups] fetchGroupMembers error:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Fetch the spot used as the squad's current venue.
 *
 * @param {string} spotId
 * @returns {Promise<object | null>}
 */
export async function fetchGroupCurrentSpot(spotId) {
  const { data, error } = await supabase
    .from('spots')
    .select(SPOT_SELECT)
    .eq('id', spotId)
    .single();

  if (error) {
    console.error('[groups] fetchGroupCurrentSpot error:', error.message);
    return null;
  }

  return data
    ? { ...data, image_url: await signSpotImageUrl(data.image_path) }
    : null;
}

/**
 * Create a signed URL for a private group asset path.
 *
 * @param {string | null | undefined} path
 * @returns {Promise<string>}
 */
export async function signGroupAssetUrl(path) {
  if (!path) return '';

  const { data, error } = await supabase
    .storage
    .from(GROUP_ASSETS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn('[groups] signGroupAssetUrl error:', error.message);
    return '';
  }

  return data?.signedUrl ?? '';
}

/**
 * Fetch the next upcoming meetup for a group.
 *
 * @param {string} groupId
 * @returns {Promise<object | null>}
 */
export async function fetchNextGroupMeetup(groupId) {
  const { data, error } = await supabase
    .from('group_meetups')
    .select('id, group_id, title, starts_at, location_label, created_by, created_at, updated_at')
    .eq('group_id', groupId)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[groups] fetchNextGroupMeetup error:', error.message);
    return null;
  }

  return data ?? null;
}

/**
 * Fetch the active perk for a group.
 *
 * @param {string} groupId
 * @returns {Promise<object | null>}
 */
export async function fetchActiveGroupPerk(groupId) {
  const { data, error } = await supabase
    .from('group_perks')
    .select('id, group_id, title, code, is_redeemed, created_by, created_at, updated_at')
    .eq('group_id', groupId)
    .eq('is_redeemed', false)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[groups] fetchActiveGroupPerk error:', error.message);
    return null;
  }

  return data ?? null;
}

/**
 * Update the current user's roster presence.
 *
 * @param {{ memberId: string, focusMode?: string, availabilityStatus?: 'available' | 'busy' }} params
 * @returns {Promise<{ member: object | null, error: string | null }>}
 */
export async function updateMyGroupPresence({ memberId, focusMode, availabilityStatus }) {
  const changes = {};
  if (focusMode !== undefined) changes.focus_mode = focusMode;
  if (availabilityStatus !== undefined) changes.availability_status = availabilityStatus;

  const { data, error } = await supabase
    .from('group_members')
    .update(changes)
    .eq('id', memberId)
    .select(MEMBER_SELECT)
    .single();

  if (error) {
    console.error('[groups] updateMyGroupPresence error:', error.message);
    return { member: null, error: error.message };
  }

  return { member: data, error: null };
}

/**
 * Change the group's current venue.
 *
 * @param {{ groupId: string, spotId: string | null }} params
 * @returns {Promise<{ group: object | null, currentSpot: object | null, error: string | null }>}
 */
export async function updateGroupCurrentSpot({ groupId, spotId }) {
  const { data: group, error } = await supabase
    .from('groups')
    .update({ current_spot_id: spotId })
    .eq('id', groupId)
    .select(GROUP_SELECT)
    .single();

  if (error) {
    console.error('[groups] updateGroupCurrentSpot error:', error.message);
    return { group: null, currentSpot: null, error: error.message };
  }

  const currentSpot = group.current_spot_id ? await fetchGroupCurrentSpot(group.current_spot_id) : null;
  return { group, currentSpot, error: null };
}

/**
 * Create or update the group's meetup.
 *
 * @param {{ groupId: string, meetupId?: string | null, title: string, startsAt: string, locationLabel?: string | null }} params
 * @returns {Promise<{ meetup: object | null, error: string | null }>}
 */
export async function upsertGroupMeetup({ groupId, meetupId = null, title, startsAt, locationLabel = null }) {
  const row = {
    group_id: groupId,
    title,
    starts_at: startsAt,
    location_label: locationLabel,
  };

  const query = meetupId
    ? supabase.from('group_meetups').update(row).eq('id', meetupId)
    : supabase.from('group_meetups').insert(row);

  const { data, error } = await query
    .select('id, group_id, title, starts_at, location_label, created_by, created_at, updated_at')
    .single();

  if (error) {
    console.error('[groups] upsertGroupMeetup error:', error.message);
    return { meetup: null, error: error.message };
  }

  return { meetup: data, error: null };
}

/**
 * Create or update the group's meetup.
 *
 * @param {{ groupId: string, meetupId?: string | null, title: string, startsAt: string, locationLabel?: string | null }} params
 * @returns {Promise<{ meetup: object | null, error: string | null }>}
 */
export function createOrUpdateGroupMeetup(params) {
  return upsertGroupMeetup(params);
}

/**
 * Create or update the group's active perk.
 *
 * @param {{ groupId: string, perkId?: string | null, title: string, code: string, isRedeemed?: boolean }} params
 * @returns {Promise<{ perk: object | null, error: string | null }>}
 */
export async function upsertGroupPerk({ groupId, perkId = null, title, code, isRedeemed = false }) {
  const row = {
    group_id: groupId,
    title,
    code,
    is_redeemed: isRedeemed,
  };

  const query = perkId
    ? supabase.from('group_perks').update(row).eq('id', perkId)
    : supabase.from('group_perks').insert(row);

  const { data, error } = await query
    .select('id, group_id, title, code, is_redeemed, created_by, created_at, updated_at')
    .single();

  if (error) {
    console.error('[groups] upsertGroupPerk error:', error.message);
    return { perk: null, error: error.message };
  }

  return { perk: data, error: null };
}

/**
 * Create or update the group's active perk.
 *
 * @param {{ groupId: string, perkId?: string | null, title: string, code: string, isRedeemed?: boolean }} params
 * @returns {Promise<{ perk: object | null, error: string | null }>}
 */
export function createOrUpdateGroupPerk(params) {
  return upsertGroupPerk(params);
}

/**
 * Mark a perk as redeemed.
 *
 * @param {string} perkId
 * @returns {Promise<{ perk: object | null, error: string | null }>}
 */
export async function markGroupPerkRedeemed(perkId) {
  const { data, error } = await supabase
    .from('group_perks')
    .update({ is_redeemed: true })
    .eq('id', perkId)
    .select('id, group_id, title, code, is_redeemed, created_by, created_at, updated_at')
    .single();

  if (error) {
    console.error('[groups] markGroupPerkRedeemed error:', error.message);
    return { perk: null, error: error.message };
  }

  return { perk: data, error: null };
}

/**
 * Upload or replace the active group's cover image.
 *
 * @param {{ groupId: string, file: File }} params
 * @returns {Promise<{ group: object | null, error: string | null }>}
 */
export async function uploadGroupCover({ groupId, file }) {
  const path = `${groupId}/cover/${Date.now()}-${_safeFileName(file.name)}`;
  const { error: uploadError } = await supabase
    .storage
    .from(GROUP_ASSETS_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || 'image/jpeg',
      upsert: true,
    });

  if (uploadError) {
    console.error('[groups] uploadGroupCover upload error:', uploadError.message);
    return { group: null, error: uploadError.message };
  }

  const { data: group, error } = await supabase
    .from('groups')
    .update({ cover_image_path: path })
    .eq('id', groupId)
    .select(GROUP_SELECT)
    .single();

  if (error) {
    console.error('[groups] uploadGroupCover update error:', error.message);
    return { group: null, error: error.message };
  }

  return {
    group: { ...group, cover_image_url: await signGroupAssetUrl(group.cover_image_path) },
    error: null,
  };
}

/**
 * Upload or replace the current user's squad avatar.
 *
 * @param {{ groupId: string, memberId: string, file: File }} params
 * @returns {Promise<{ member: object | null, error: string | null }>}
 */
export async function uploadMyGroupAvatar({ groupId, memberId, file }) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { member: null, error: userError?.message ?? 'Not authenticated.' };
  }

  const path = `${groupId}/members/${user.id}/${Date.now()}-${_safeFileName(file.name)}`;
  const { error: uploadError } = await supabase
    .storage
    .from(GROUP_ASSETS_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || 'image/jpeg',
      upsert: true,
    });

  if (uploadError) {
    console.error('[groups] uploadMyGroupAvatar upload error:', uploadError.message);
    return { member: null, error: uploadError.message };
  }

  const { data: member, error } = await supabase
    .from('group_members')
    .update({ avatar_image_path: path })
    .eq('id', memberId)
    .eq('user_id', user.id)
    .select(MEMBER_SELECT)
    .single();

  if (error) {
    console.error('[groups] uploadMyGroupAvatar update error:', error.message);
    return { member: null, error: error.message };
  }

  return {
    member: { ...member, avatar_image_url: await signGroupAssetUrl(member.avatar_image_path) },
    error: null,
  };
}

/**
 * Upsert a member row for the current user.
 *
 * Uses onConflict targeting the (group_id, user_id) unique constraint so that
 * re-joining an existing group updates display_name rather than erroring or
 * inserting a duplicate.
 *
 * @param {string} groupId
 * @param {string} displayName
 * @param {'mayor' | 'member'} role
 * @returns {Promise<{ member: object | null, error: string | null }>}
 */
async function _insertMember(groupId, displayName, role = 'member', userId = null) {
  const { data, error } = await supabase
    .from('group_members')
    .upsert(
      { group_id: groupId, display_name: displayName, role, user_id: userId },
      { onConflict: 'group_id,user_id', ignoreDuplicates: false },
    )
    .select(MEMBER_SELECT)
    .single();

  if (error) {
    console.error('[groups] _insertMember error:', error.message);
    return { member: null, error: error.message };
  }

  return { member: data, error: null };
}

function _randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function _hydrateDashboardAssets(group, members) {
  const [coverUrl, avatarUrls] = await Promise.all([
    signGroupAssetUrl(group.cover_image_path),
    Promise.all((members ?? []).map(member => signGroupAssetUrl(member.avatar_image_path))),
  ]);

  return {
    group: { ...group, cover_image_url: coverUrl },
    members: (members ?? []).map((member, index) => ({
      ...member,
      avatar_image_url: avatarUrls[index] || '',
    })),
  };
}

function _safeFileName(name) {
  return String(name ?? 'image')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image';
}

function _nameHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}
