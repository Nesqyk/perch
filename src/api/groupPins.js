/**
 * src/api/groupPins.js
 *
 * Read/write operations for `group_pins`, `group_pin_joins`,
 * and `group_confirmations` tables.
 *
 * Pin lifecycle: scouting → perched → filling → expiring → ended
 * Live pins auto-expire after 90 minutes (set in expires_at on insert).
 * Saved pins have no expires_at and persist until manually deleted.
 */

import { supabase }     from './supabaseClient.js';
import { getSessionId } from '../utils/session.js';

/** Default live pin TTL in minutes. */
const LIVE_PIN_TTL_MIN = 90;

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetch all active pins for a group (live pins not yet ended + saved pins).
 *
 * @param {string} groupId
 * @returns {Promise<object[]>}
 */
export async function fetchGroupPins(groupId) {
  const { data, error } = await supabase
    .from('group_pins')
    .select(`
      id, group_id, spot_id, session_id, pin_type,
      vibe, note, custom_name, pinned_at, expires_at, ended_at
    `)
    .eq('group_id', groupId)
    .or('ended_at.is.null,pin_type.eq.saved')
    .order('pinned_at', { ascending: false });

  if (error) {
    console.error('[groupPins] fetchGroupPins error:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Fetch all transit joins for a set of pin ids.
 *
 * @param {string[]} pinIds
 * @returns {Promise<object[]>}
 */
export async function fetchGroupPinJoins(pinIds) {
  if (!pinIds.length) return [];

  const { data, error } = await supabase
    .from('group_pin_joins')
    .select('id, group_pin_id, session_id, status, joined_at')
    .in('group_pin_id', pinIds)
    .neq('status', 'left');

  if (error) {
    console.error('[groupPins] fetchGroupPinJoins error:', error.message);
    return [];
  }

  return data ?? [];
}

// ─── Drop a pin ───────────────────────────────────────────────────────────────

/**
 * Drop a live pin for a spot inside the current group.
 * Creates a 90-minute expiry by default.
 *
 * @param {{
 *   groupId:    string,
 *   spotId:     string,
 *   vibe?:      'quiet' | 'chill' | 'loud' | 'cramped' | null,
 *   note?:      string | null,
 *   customName?: string | null,
 * }} params
 * @returns {Promise<{ data: object | null, error: string | null }>}
 */
export async function dropLivePin({ groupId, spotId, vibe = null, note = null, customName = null }) {
  const sessionId = getSessionId();
  const expiresAt = new Date(Date.now() + LIVE_PIN_TTL_MIN * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('group_pins')
    .insert({
      group_id:    groupId,
      spot_id:     spotId,
      session_id:  sessionId,
      pin_type:    'live',
      vibe,
      note,
      custom_name: customName,
      expires_at:  expiresAt,
    })
    .select()
    .single();

  if (error) {
    console.error('[groupPins] dropLivePin error:', error.message);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

/**
 * Save a spot permanently for the group (saved pin — no expiry).
 *
 * @param {{
 *   groupId:     string,
 *   spotId:      string,
 *   customName?: string | null,
 *   note?:       string | null,
 * }} params
 * @returns {Promise<{ data: object | null, error: string | null }>}
 */
export async function savePin({ groupId, spotId, customName = null, note = null }) {
  const sessionId = getSessionId();

  const { data, error } = await supabase
    .from('group_pins')
    .insert({
      group_id:    groupId,
      spot_id:     spotId,
      session_id:  sessionId,
      pin_type:    'saved',
      custom_name: customName,
      note,
    })
    .select()
    .single();

  if (error) {
    console.error('[groupPins] savePin error:', error.message);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

// ─── End a pin ────────────────────────────────────────────────────────────────

/**
 * Manually end a live pin (pinner signals "leaving now").
 * Only succeeds if the session_id matches (RLS enforced).
 *
 * @param {string} pinId
 * @returns {Promise<{ error: string | null }>}
 */
export async function endLivePin(pinId) {
  const sessionId = getSessionId();

  const { error } = await supabase
    .from('group_pins')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', pinId)
    .eq('session_id', sessionId);

  if (error) {
    console.error('[groupPins] endLivePin error:', error.message);
    return { error: error.message };
  }

  return { error: null };
}

// ─── Transit join ─────────────────────────────────────────────────────────────

/**
 * Signal "I'm heading to this pin" (transit dot mechanic).
 * Upserts to handle the case where the session already joined.
 *
 * @param {{ pinId: string, status?: 'heading' | 'arrived' | 'left' }} params
 * @returns {Promise<{ data: object | null, error: string | null }>}
 */
export async function joinGroupPin({ pinId, status = 'heading' }) {
  const sessionId = getSessionId();

  const { data, error } = await supabase
    .from('group_pin_joins')
    .upsert(
      { group_pin_id: pinId, session_id: sessionId, status },
      { onConflict: 'group_pin_id,session_id', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) {
    console.error('[groupPins] joinGroupPin error:', error.message);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

// ─── Vibe Confirm ─────────────────────────────────────────────────────────────

/**
 * Submit a Vibe Confirm tap for a live pin.
 *
 * @param {{ pinId: string, vibeStatus: 'free' | 'filling' | 'full' }} params
 * @returns {Promise<{ error: string | null }>}
 */
export async function confirmVibe({ pinId, vibeStatus }) {
  const sessionId = getSessionId();

  const { error } = await supabase
    .from('group_confirmations')
    .insert({ group_pin_id: pinId, session_id: sessionId, vibe_status: vibeStatus });

  if (error) {
    console.error('[groupPins] confirmVibe error:', error.message);
    return { error: error.message };
  }

  return { error: null };
}
