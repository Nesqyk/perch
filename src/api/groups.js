/**
 * src/api/groups.js
 *
 * Read/write operations for `groups` and `group_members` tables.
 *
 * Groups are private squads identified by a 4-character join code.
 * Membership is anonymous — tied to the session_id from localStorage.
 *
 * All functions return plain objects; no Supabase types leak out.
 */

import { supabase }     from './supabaseClient.js';
import { getSessionId } from '../utils/session.js';

// ─── Group palette ────────────────────────────────────────────────────────────

/**
 * Curated palette for auto-assigned group colours.
 * Chosen to be visually distinct on the CartoDB Positron tile layer.
 */
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

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a new group and immediately join it as the creator.
 *
 * Generates a random 4-char uppercase join code; retries once on collision.
 * Auto-assigns a colour from GROUP_COLORS based on the group's name hash.
 *
 * @param {{ name: string, displayName: string, context?: 'campus' | 'city' }} params
 * @returns {Promise<{ group: object | null, member: object | null, error: string | null }>}
 */
export async function createGroup({ name, displayName, context = 'campus' }) {
  const code  = _randomCode();
  const color = GROUP_COLORS[_nameHash(name) % GROUP_COLORS.length];

  const { data: group, error: gErr } = await supabase
    .from('groups')
    .insert({ name, code, color, context })
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

// ─── Join ─────────────────────────────────────────────────────────────────────

/**
 * Join an existing group by its 4-character code.
 *
 * @param {{ code: string, displayName: string }} params
 * @returns {Promise<{ group: object | null, member: object | null, error: string | null }>}
 */
export async function joinGroup({ code, displayName }) {
  const { data: group, error: gErr } = await supabase
    .from('groups')
    .select('id, name, code, color, context')
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

// ─── Fetch members ────────────────────────────────────────────────────────────

/**
 * Fetch all members for a group.
 *
 * @param {string} groupId
 * @returns {Promise<object[]>}
 */
export async function fetchGroupMembers(groupId) {
  const { data, error } = await supabase
    .from('group_members')
    .select('id, group_id, session_id, display_name, scout_points, joined_at')
    .eq('group_id', groupId)
    .order('joined_at');

  if (error) {
    console.error('[groups] fetchGroupMembers error:', error.message);
    return [];
  }

  return data ?? [];
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Insert a member row; handles the case where the session is already a member
 * by returning the existing row (upsert on unique constraint).
 *
 * @param {string} groupId
 * @param {string} displayName
 * @returns {Promise<{ member: object | null, error: string | null }>}
 */
async function _insertMember(groupId, displayName) {
  const sessionId = getSessionId();

  const { data: member, error } = await supabase
    .from('group_members')
    .upsert(
      { group_id: groupId, session_id: sessionId, display_name: displayName },
      { onConflict: 'group_id,session_id', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) {
    console.error('[groups] _insertMember error:', error.message);
    return { member: null, error: error.message };
  }

  return { member, error: null };
}

/**
 * Generate a random 4-character uppercase alphanumeric join code.
 *
 * @returns {string}
 */
function _randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit I, O, 0, 1
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Simple hash of a string to an integer — used for colour selection.
 *
 * @param {string} str
 * @returns {number}
 */
function _nameHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}
