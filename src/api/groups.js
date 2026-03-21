/**
 * src/api/groups.js
 *
 * Read/write operations for `groups` and `group_members` tables.
 *
 * Membership is now driven by Supabase Auth (auth.uid()).
 * The client no longer passes an explicit session or user ID; the DB
 * injects auth.uid() using `default auth.uid()` on insert.
 */

import { supabase } from './supabaseClient.js';

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

/**
 * Create a new group and immediately join it as the creator.
 *
 * @param {{ name: string, displayName: string, context?: string, campusId?: string | null }} params
 * @returns {Promise<{ group: object | null, member: object | null, error: string | null }>}
 */
export async function createGroup({ name, displayName, context = 'campus', campusId = null }) {
  const code  = _randomCode();
  const color = GROUP_COLORS[_nameHash(name) % GROUP_COLORS.length];

  const { data: group, error: gErr } = await supabase
    .from('groups')
    .insert({ name, code, color, context, campus_id: campusId })
    .select()
    .single();

  if (gErr) {
    console.error('[groups] createGroup error:', gErr.message);
    return { group: null, member: null, error: gErr.message };
  }

  const { member, error: mErr } = await _insertMember(group.id, displayName);
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
  const { data: group, error: gErr } = await supabase
    .from('groups')
    .select('id, name, code, color, context, campus_id')
    .eq('code', code.toUpperCase())
    .single();

  if (gErr || !group) {
    console.error('[groups] joinGroup — group not found:', gErr?.message);
    return { group: null, member: null, error: 'Group not found. Check the code and try again.' };
  }

  const { member, error: mErr } = await _insertMember(group.id, displayName);
  if (mErr) return { group: null, member: null, error: mErr };

  return { group, member, error: null };
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
    .select('id, group_id, user_id, display_name, scout_points, joined_at')
    .eq('group_id', groupId)
    .order('joined_at');

  if (error) {
    console.error('[groups] fetchGroupMembers error:', error.message);
    return [];
  }

  return data ?? [];
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
 * @returns {Promise<{ member: object | null, error: string | null }>}
 */
async function _insertMember(groupId, displayName) {
  const { data, error } = await supabase
    .from('group_members')
    .upsert(
      { group_id: groupId, display_name: displayName },
      { onConflict: 'group_id,user_id', ignoreDuplicates: false },
    )
    .select()
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

function _nameHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}
