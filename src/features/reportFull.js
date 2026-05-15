/**
 * src/features/reportFull.js
 *
 * Feature 3: Report Full ("It's Full").
 *
 * First click opens the report modal through UI listeners. The map state is
 * only updated after a correction row is written successfully to Supabase.
 */

import { on, emit, EVENTS }      from '../core/events.js';
import { dispatch, getState }    from '../core/store.js';
import { submitCorrection }      from '../api/corrections.js';
import { showToast }             from '../ui/toast.js';

/**
 * Wire the Report Full flow.
 *
 * @returns {void}
 */
export function initReportFull() {
  on(EVENTS.UI_REPORT_REQUESTED, _onReportRequested);
}

/**
 * Handle report requests. The initial request only opens the reason modal in
 * UI controllers; this feature writes once the user chooses a reason or skips.
 *
 * @param {CustomEvent<{ spotId: string, reason?: string | null, reasonProvided?: boolean }>} e
 * @returns {Promise<void>}
 */
async function _onReportRequested(e) {
  const { spotId, reason = null, reasonProvided = false } = e.detail;
  const { currentUser } = getState();

  if (!currentUser) {
    emit(EVENTS.UI_LOGIN_REQUESTED, {});
    return;
  }

  if (!reasonProvided) return;

  dispatch('SET_STATUS', { correctionPending: true });
  const { data, error } = await submitCorrection({ spotId, reason });
  dispatch('SET_STATUS', { correctionPending: false });

  if (error || !data) {
    showToast('Could not record that report. Please sign in again and retry.', 'error');
    return;
  }

  dispatch('CORRECTION_FILED', { spotId });
  showToast('Report recorded. Thanks for keeping the map honest.', 'success');
}
