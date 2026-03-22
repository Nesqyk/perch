/**
 * src/features/campus.js
 *
 * Feature module — standalone campus add flow.
 *
 * Handles UI_CAMPUS_ADD_REQUESTED events emitted by campusSelector.js,
 * calls ensureCampus(), re-fetches the campus list, dispatches
 * CAMPUSES_LOADED + CAMPUS_SELECTED, and shows appropriate toast feedback.
 *
 * Auth-gated: unauthenticated users are redirected to the login flow.
 * Wired up by main.js at boot via initCampus().
 * All cross-module communication goes through the event bus.
 *
 * viewMode-agnostic: campus add works in both 'campus' and 'city' modes.
 * There is intentionally no viewMode guard here — any authenticated user
 * can create a campus regardless of the current map view.
 */

import { on, emit, EVENTS }    from '../core/events.js';
import { dispatch, getState }  from '../core/store.js';
import { ensureCampus,
         fetchCampuses }       from '../api/campuses.js';
import { showToast }           from '../ui/toast.js';

// ─── Initialise ───────────────────────────────────────────────────────────────

/**
 * Wire up campus-related UI event listeners.
 * Call once from main.js after boot.
 *
 * @returns {void}
 */
export function initCampus() {
  on(EVENTS.UI_CAMPUS_ADD_REQUESTED, _onAddCampusRequested);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * Handles UI_CAMPUS_ADD_REQUESTED event from campusSelector.js.
 *
 * @param {CustomEvent<{ campusName: string, osmResult: object | null }>} e
 */
async function _onAddCampusRequested(e) {
  const { campusName, osmResult = null } = e.detail;
  const { currentUser } = getState();

  if (!currentUser) {
    emit(EVENTS.UI_LOGIN_REQUESTED, {});
    return;
  }

  const name = campusName?.trim();
  if (!name) {
    showToast('Please enter a campus name.', 'error');
    return;
  }

  dispatch('SET_STATUS', { campusPending: true });

  const { campus, created, error } = await ensureCampus(name, osmResult);

  dispatch('SET_STATUS', { campusPending: false });

  if (error || !campus) {
    showToast(error ?? 'Could not add campus. Try again.', 'error');
    return;
  }

  // Re-fetch the full campus list so the selector is always in sync.
  const campuses = await fetchCampuses();
  dispatch('CAMPUSES_LOADED', { campuses });
  dispatch('CAMPUS_SELECTED', { campusId: campus.id });

  showToast(
    created
      ? 'Campus added!'
      : 'Campus already exists — switched to it.',
    'success',
  );
}
