/**
 * src/features/reportFull.js
 *
 * Feature 3: Report Full ("It's Full").
 *
 * Orchestrates the correction flow:
 *  1. User taps "It's Full" → UI_REPORT_REQUESTED fires (no reason yet)
 *  2. Store immediately tanks local confidence (pessimistic update)
 *  3. API write happens in the background
 *  4. If a reason is provided (second UI_REPORT_REQUESTED with reasonProvided=true),
 *     update the correction record or write a new one with the reason
 *
 * The panel switch (to reportPanel) is handled by sidebar.js / bottomSheet.js
 * which listen to EVENTS.CORRECTION_FILED. This module only handles logic.
 */

import { on, EVENTS }         from '../core/events.js';
import { dispatch }            from '../core/store.js';
import { submitCorrection }    from '../api/corrections.js';
import { showToast }           from '../ui/toast.js';

// ─── Initialise ──────────────────────────────────────────────────────────────

export function initReportFull() {
  on(EVENTS.UI_REPORT_REQUESTED, _onReportRequested);
}

// ─── Handler ─────────────────────────────────────────────────────────────────

async function _onReportRequested(e) {
  const { spotId, reason = null, reasonProvided = false } = e.detail;

  // First tap (no reason yet): apply pessimistic local update immediately
  // and switch panel to show the reason chips + alternatives.
  // The actual DB write happens now (with reason=null) so even if the user
  // skips the reason, the correction is recorded.
  if (!reasonProvided) {
    // Optimistic local update — pin turns red immediately.
    dispatch('CORRECTION_FILED', { spotId });

    dispatch('SET_STATUS', { correctionPending: true });
    const { error } = await submitCorrection({ spotId, reason: null });
    dispatch('SET_STATUS', { correctionPending: false });

    if (error) {
      showToast('Could not record the report — but the map was updated locally.', 'error');
    }

    return;
  }

  // Second call: user picked a reason (or tapped Skip).
  // Write a second correction with the reason for the learning engine.
  // "Skip" sends reason=null which is fine — it still counts as a correction signal.
  if (reason !== null) {
    await submitCorrection({ spotId, reason });
  }
  // If reason is null (Skip chip), do nothing extra — initial correction already written.
}
