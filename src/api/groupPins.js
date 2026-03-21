/**
 * src/api/groupPins.js
 *
 * Read/write operations for `group_pins`, `group_pin_joins`,
 * and `group_confirmations` tables.
 */

import { supabase } from './supabaseClient.js';

const LIVE_PIN_TTL_MIN = 90;

export async function fetchGroupPins(groupId) {
  const { data, error } = await supabase
    .from('group_pins')
    .select(`
      id, group_id, spot_id, user_id, display_name, pin_type,
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

export async function fetchGroupPinJoins(pinIds) {
  if (!pinIds.length) return [];
  const { data, error } = await supabase
    .from('group_pin_joins')
    .select('id, group_pin_id, user_id, status, joined_at')
    .in('group_pin_id', pinIds)
    .neq('status', 'left');

  if (error) {
    console.error('[groupPins] fetchGroupPinJoins error:', error.message);
    return [];
  }
  return data ?? [];
}

export async function dropLivePin({ groupId, spotId, vibe = null, note = null, customName = null }) {
  const expiresAt = new Date(Date.now() + LIVE_PIN_TTL_MIN * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('group_pins')
    .insert({
      group_id:    groupId,
      spot_id:     spotId,
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

export async function savePin({ groupId, spotId, customName = null, note = null }) {
  const { data, error } = await supabase
    .from('group_pins')
    .insert({
      group_id:    groupId,
      spot_id:     spotId,
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

export async function endLivePin(pinId) {
  // RLS scopes this to the owning user
  const { error } = await supabase
    .from('group_pins')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', pinId);

  if (error) {
    console.error('[groupPins] endLivePin error:', error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function joinGroupPin({ pinId, status = 'heading' }) {
  const { data, error } = await supabase
    .from('group_pin_joins')
    .upsert(
      { group_pin_id: pinId, status },
      { onConflict: 'group_pin_id,user_id', ignoreDuplicates: false },
    )
    .select()
    .single();

  if (error) {
    console.error('[groupPins] joinGroupPin error:', error.message);
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

export async function confirmVibe({ pinId, vibeStatus }) {
  const { error } = await supabase
    .from('group_confirmations')
    .insert({ group_pin_id: pinId, vibe_status: vibeStatus });

  if (error) {
    console.error('[groupPins] confirmVibe error:', error.message);
    return { error: error.message };
  }
  return { error: null };
}
