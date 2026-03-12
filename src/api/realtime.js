/**
 * src/api/realtime.js
 *
 * Supabase Realtime subscriptions.
 *
 * All clients share the same channel ("perch-spots"). When any client
 * writes a claim or correction, Supabase broadcasts the change to every
 * subscriber — so pins update live across all browsers on the same shared link.
 *
 * Channel events we listen for:
 *   claims            INSERT  → new group claimed a spot
 *   claims            UPDATE  → claim cancelled or expired
 *   corrections       INSERT  → a spot was reported full
 *   spot_confidence   UPDATE  → background job updated a confidence score
 *
 * Group channel ("perch-group-<groupId>") is created dynamically after joining:
 *   group_pins        INSERT/UPDATE → a pin was dropped or ended
 *   group_pin_joins   INSERT/UPDATE → a member signals heading/arrived/left
 *
 * This module only calls dispatch() — it never touches the DOM.
 */

import { supabase }     from './supabaseClient.js';
import { dispatch }     from '../core/store.js';
import { getSessionId } from '../utils/session.js';

/** @type {import('@supabase/supabase-js').RealtimeChannel | null} */
let _channel = null;

/** @type {import('@supabase/supabase-js').RealtimeChannel | null} */
let _groupChannel = null;

/**
 * Subscribe to all real-time spot state changes.
 * Safe to call multiple times — replaces existing subscription.
 */
export function subscribeToRealtime() {
  // Clean up any existing subscription before creating a new one.
  if (_channel) {
    supabase.removeChannel(_channel);
  }

  _channel = supabase
    .channel('perch-spots')

    // ── New claim ─────────────────────────────────────────────────────────
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'claims' },
      (payload) => {
        const claim  = payload.new;
        const isMine = claim.session_id === getSessionId();

        dispatch('CLAIM_ADDED', {
          spotId: claim.spot_id,
          claim,
          isMine,
        });
      }
    )

    // ── Claim cancelled or expired ────────────────────────────────────────
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'claims' },
      (payload) => {
        const claim = payload.new;
        // Only act on rows where cancelled_at was just set.
        if (claim.cancelled_at) {
          dispatch('CLAIM_REMOVED', {
            spotId:  claim.spot_id,
            claimId: claim.id,
          });
        }
      }
    )

    // ── New correction ────────────────────────────────────────────────────
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'corrections' },
      (payload) => {
        const correction = payload.new;
        // Avoid double-applying our own correction (store.js already applied it).
        if (correction.session_id !== getSessionId()) {
          dispatch('CORRECTION_FILED', { spotId: correction.spot_id });
        }
      }
    )

    // ── Confidence score updated by background job ────────────────────────
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'spot_confidence' },
      (payload) => {
        const conf = payload.new;
        dispatch('CONFIDENCE_UPDATED', {
          spotId: conf.spot_id,
          confidence: {
            score:      conf.score,
            reason:     conf.reason,
            validUntil: conf.valid_until,
          },
        });
      }
    )

    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.warn('[realtime] Connected to perch-spots channel');
      }
      if (status === 'CHANNEL_ERROR') {
        console.warn('[realtime] Channel error — will attempt reconnect');
      }
    });
}

/**
 * Subscribe to a group's real-time pin and join events.
 * Creates a dedicated channel per group so members only receive their group's data.
 * Safe to call again — tears down the previous group channel first.
 *
 * @param {string} groupId
 */
export function subscribeToGroupRealtime(groupId) {
  if (_groupChannel) {
    supabase.removeChannel(_groupChannel);
    _groupChannel = null;
  }

  _groupChannel = supabase
    .channel(`perch-group-${groupId}`)

    // ── Group pin inserted (new live or saved pin) ────────────────────────
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_pins', filter: `group_id=eq.${groupId}` },
      (payload) => {
        dispatch('GROUP_PIN_UPSERTED', { pin: payload.new });
      }
    )

    // ── Group pin updated (ended_at set — pin ended) ──────────────────────
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'group_pins', filter: `group_id=eq.${groupId}` },
      (payload) => {
        const pin = payload.new;
        if (pin.ended_at) {
          dispatch('GROUP_PIN_ENDED', { pinId: pin.id });
        } else {
          dispatch('GROUP_PIN_UPSERTED', { pin });
        }
      }
    )

    // ── Transit join inserted or updated ─────────────────────────────────
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_pin_joins' },
      (payload) => {
        dispatch('GROUP_PIN_JOIN_UPSERTED', { join: payload.new });
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'group_pin_joins' },
      (payload) => {
        dispatch('GROUP_PIN_JOIN_UPSERTED', { join: payload.new });
      }
    )

    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.warn(`[realtime] Connected to group channel: ${groupId}`);
      }
      if (status === 'CHANNEL_ERROR') {
        console.warn(`[realtime] Group channel error: ${groupId}`);
      }
    });
}

/**
 * Tear down the group Realtime subscription.
 * Call when the user leaves a group.
 */
export function unsubscribeFromGroupRealtime() {
  if (_groupChannel) {
    supabase.removeChannel(_groupChannel);
    _groupChannel = null;
  }
}

/**
 * Tear down the Realtime subscription.
 * Call this on page unload if needed (mostly for testing/cleanup).
 */
export function unsubscribeFromRealtime() {
  if (_channel) {
    supabase.removeChannel(_channel);
    _channel = null;
  }
}

