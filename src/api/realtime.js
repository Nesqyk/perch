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
 *   claims      INSERT  → new group claimed a spot
 *   claims      UPDATE  → claim cancelled or expired
 *   corrections INSERT  → a spot was reported full
 *   spot_confidence UPDATE → background job updated a confidence score
 *
 * This module only calls dispatch() — it never touches the DOM.
 */

import { supabase }  from './supabaseClient.js';
import { dispatch }  from '../core/store.js';
import { getSessionId } from '../utils/session.js';

/** @type {import('@supabase/supabase-js').RealtimeChannel | null} */
let _channel = null;

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
        console.info('[realtime] Connected to perch-spots channel');
      }
      if (status === 'CHANNEL_ERROR') {
        console.warn('[realtime] Channel error — will attempt reconnect');
      }
    });
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
