/**
 * src/api/availability.js
 *
 * Spot availability and WhatsApp watcher operations. Availability changes are
 * persisted through RPCs so the client can report status without broad spot
 * update permissions.
 */

import { supabase } from './supabaseClient.js';

/**
 * Mark a spot available or occupied and queue WhatsApp notifications server-side.
 *
 * @param {{ spotId: string, status: 'available' | 'occupied', note?: string }} params
 * @returns {Promise<{ spot: object | null, error: string | null, smsError: string | null, smsResult: object | null }>}
 */
export async function updateSpotAvailability({ spotId, status, note = '' }) {
  const { data, error } = await supabase.rpc('set_spot_availability', {
    p_spot_id: spotId,
    p_status: status,
    p_note: note,
  });

  if (error) {
    console.error('[availability] updateSpotAvailability error:', error.message);
    return { spot: null, error: error.message, smsError: null, smsResult: null };
  }

  const { data: smsResult, error: smsError } = await supabase.functions.invoke('send-sms-notification', {
    body: { spotId, status },
  });

  if (smsError) {
    console.warn('[availability] send-sms-notification warning:', smsError.message);
  }

  return {
    spot: data,
    error: null,
    smsError: smsError?.message ?? null,
    smsResult: smsResult ?? null,
  };
}

/**
 * Fetch WhatsApp watchers for the current user.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchMySmsWatchers() {
  const { data, error } = await supabase
    .from('spot_watchers')
    .select('id, spot_id, user_id, notify_by_sms, created_at')
    .eq('notify_by_sms', true);

  if (error) {
    console.error('[availability] fetchMySmsWatchers error:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Subscribe the current user to WhatsApp updates for a spot.
 *
 * @param {string} spotId
 * @returns {Promise<{ watcher: object | null, error: string | null }>}
 */
export async function watchSpotForSms(spotId) {
  const { data, error } = await supabase.rpc('watch_spot_sms', {
    p_spot_id: spotId,
    p_notify_by_sms: true,
  });

  if (error) {
    console.error('[availability] watchSpotForSms error:', error.message);
    return { watcher: null, error: error.message };
  }

  return { watcher: data, error: null };
}

/**
 * Remove the current user's WhatsApp watcher for a spot.
 *
 * @param {string} spotId
 * @returns {Promise<{ error: string | null }>}
 */
export async function unwatchSpotForSms(spotId) {
  const { error } = await supabase.rpc('unwatch_spot_sms', {
    p_spot_id: spotId,
  });

  if (error) {
    console.error('[availability] unwatchSpotForSms error:', error.message);
    return { error: error.message };
  }

  return { error: null };
}
