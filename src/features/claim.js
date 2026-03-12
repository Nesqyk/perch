/**
 * src/features/claim.js
 *
 * Feature 2: Claim a Spot ("I'm Going Here").
 *
 * Orchestrates the full claim flow:
 *  1. User taps "I'm Going Here" → UI_CLAIM_REQUESTED fires
 *  2. This module shows a group size picker if one isn't already set
 *  3. Writes the claim to Supabase
 *  4. Dispatches CLAIM_ADDED with isMine=true so the store generates the share link
 *  5. Handles cancel via UI_CANCEL_CLAIM
 *
 * All UI rendering is delegated to claimPanel.js.
 * This module only handles business logic and API calls.
 */

import { on, EVENTS }        from '../core/events.js';
import { getState, dispatch } from '../core/store.js';
import { createClaim, cancelClaim } from '../api/claims.js';
import { GROUP_SIZE_CONFIG }  from '../utils/capacity.js';
import { showToast }          from '../ui/toast.js';
import { openModal as _openModal }          from '../ui/modal.js';

// ─── Initialise ──────────────────────────────────────────────────────────────

export function initClaim() {
  on(EVENTS.UI_CLAIM_REQUESTED, _onClaimRequested);
  on(EVENTS.UI_CANCEL_CLAIM,    _onCancelClaim);
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function _onClaimRequested(e) {
  const { spotId } = e.detail;
  const { filters, myActiveClaim } = getState();

  // Prevent double-claims.
  if (myActiveClaim) {
    showToast('You already have an active claim. Cancel it first.');
    return;
  }

  // If a group size is already set in filters, claim immediately.
  // Otherwise, ask for group size via a lightweight modal.
  const groupSizeKey = filters.groupSize;

  if (groupSizeKey) {
    await _executeClaim(spotId, groupSizeKey);
  } else {
    _promptGroupSize(spotId);
  }
}

async function _onCancelClaim(e) {
  const { claimId, spotId } = e.detail;

  dispatch('SET_STATUS', { claimPending: true });
  const { error } = await cancelClaim(claimId);
  dispatch('SET_STATUS', { claimPending: false });

  if (error) {
    showToast('Could not cancel — please try again.', 'error');
    return;
  }

  // Optimistic update — Realtime will confirm shortly.
  dispatch('CLAIM_REMOVED', { spotId, claimId });
  showToast('Claim cancelled.');
}

// ─── Claim execution ─────────────────────────────────────────────────────────

async function _executeClaim(spotId, groupSizeKey) {
  const config = GROUP_SIZE_CONFIG[groupSizeKey];
  if (!config) return;

  dispatch('SET_STATUS', { claimPending: true });

  const { data, error } = await createClaim({
    spotId,
    groupSizeKey:  config.key,
    groupSizeMin:  config.min,
    groupSizeMax:  config.max,
  });

  dispatch('SET_STATUS', { claimPending: false });

  if (error || !data) {
    showToast('Could not claim spot — please try again.', 'error');
    return;
  }

  // Optimistic + confirmed update. Realtime INSERT will also fire and
  // be deduplicated by the session_id check in realtime.js.
  dispatch('CLAIM_ADDED', {
    spotId,
    claim:  data,
    isMine: true,
  });
}

// ─── Group size picker ────────────────────────────────────────────────────────

/**
 * Show a modal with group size buttons so the user can pick before claiming.
 * Keeps the flow within the modal — no separate panel navigation needed.
 *
 * @param {string} spotId
 */
function _promptGroupSize(spotId) {
  // Build modal content manually since openModal() handles generic cases.
  const content   = document.createElement('div');
  content.className = 'group-size-picker';

  const heading    = document.createElement('p');
  heading.className = 'modal-title';
  heading.textContent = 'How many in your group?';
  content.appendChild(heading);

  const grid       = document.createElement('div');
  grid.className   = 'group-size-grid';

  Object.values(GROUP_SIZE_CONFIG).forEach(({ key, label }) => {
    const btn        = document.createElement('button');
    btn.type         = 'button';
    btn.className    = 'btn btn-secondary';
    btn.textContent  = label;
    btn.addEventListener('click', async () => {
      // Close modal by dispatching filter update, then claim.
      dispatch('SET_FILTERS', { groupSize: key });
      // Close the modal overlay before async work.
      document.getElementById('modal-overlay').hidden = true;
      await _executeClaim(spotId, key);
    });
    grid.appendChild(btn);
  });

  content.appendChild(grid);

  // Inject directly into the modal box instead of using the string API.
  const modalContent = document.getElementById('modal-content');
  const overlay      = document.getElementById('modal-overlay');
  if (modalContent && overlay) {
    modalContent.innerHTML = '';
    modalContent.appendChild(content);
    overlay.hidden = false;
  }
}
