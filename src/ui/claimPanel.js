/**
 * src/ui/claimPanel.js
 *
 * Renders the "You're Going Here" state panel after a claim is made.
 * Shows the group size, other groups heading to the same spot,
 * remaining capacity, and the Copy Link button for the GC.
 *
 * Listens to EVENTS.CLAIM_UPDATED to re-render if another group claims
 * the same spot while this panel is open.
 */

import { on, off as _off, emit, EVENTS }  from '../core/events.js';
import { getState, dispatch }      from '../core/store.js';
import { calcRemainingCapacity }   from '../utils/capacity.js';
import { getActiveClaimsForSpot }  from '../state/spotState.js';
import { timeAgo, claimExpiresIn } from '../utils/time.js';
import { showToast }               from './toast.js';
import { openModal }               from './modal.js';

// ─── Initialise ──────────────────────────────────────────────────────────────

export function initClaimPanel() {
  on(EVENTS.CLAIM_UPDATED, _onClaimUpdated);
}

// ─── Render ──────────────────────────────────────────────────────────────────

/**
 * Render the post-claim panel into a given container.
 *
 * @param {HTMLElement} container
 * @param {string}      spotId
 */
export function renderClaimPanel(container, spotId) {
  const { spots, claims, myActiveClaim, sharedLink } = getState();
  const spot         = spots.find(s => s.id === spotId);
  if (!spot) return;

  const activeClaims = getActiveClaimsForSpot(spotId, claims);
  const capacity     = calcRemainingCapacity(spot.rough_capacity, activeClaims);

  container.innerHTML = '';
  container.appendChild(_buildClaimCard(spot, activeClaims, capacity, myActiveClaim, sharedLink));
}

function _buildClaimCard(spot, activeClaims, capacity, myActiveClaim, sharedLink) {
  const card       = document.createElement('div');
  card.className   = 'claim-card';

  // ── Confirmation header ──
  const confirm    = document.createElement('div');
  confirm.className = 'claim-confirm';
  confirm.innerHTML = `
    <span class="claim-check">&#10003;</span>
    <div>
      <p class="claim-heading">You're heading here</p>
      <p class="claim-subheading">${spot.name}</p>
      ${myActiveClaim ? `<p class="claim-expiry">${claimExpiresIn(myActiveClaim.expiresAt)}</p>` : ''}
    </div>
  `;
  card.appendChild(confirm);

  // ── Other groups ──
  if (activeClaims.length > 0) {
    const heading    = document.createElement('p');
    heading.className = 'claims-heading';
    heading.textContent = 'Groups heading here:';
    card.appendChild(heading);

    activeClaims.forEach(claim => {
      const isMine  = claim.id === myActiveClaim?.claimId;
      const row     = document.createElement('p');
      row.className = `claim-row ${isMine ? 'claim-row-mine' : ''}`;
      row.textContent = `· ${_groupLabel(claim.group_size_key)}${isMine ? ' (you)' : ''} — ${timeAgo(claim.claimed_at)}`;
      card.appendChild(row);
    });

    const rem       = document.createElement('p');
    rem.className   = 'capacity-remaining';
    rem.textContent = capacity.label;
    card.appendChild(rem);
  }

  // ── Copy link button ──
  const copyBtn        = document.createElement('button');
  copyBtn.type         = 'button';
  copyBtn.className    = 'btn btn-secondary btn-full';
  copyBtn.id           = 'btn-copy-link';
  copyBtn.textContent  = 'Copy Link — Share to GC';
  copyBtn.addEventListener('click', () => _handleCopyLink(sharedLink.url));
  card.appendChild(copyBtn);

  // ── Secondary actions ──
  const actions    = document.createElement('div');
  actions.className = 'spot-actions';

  const reportBtn       = document.createElement('button');
  reportBtn.type        = 'button';
  reportBtn.className   = 'btn btn-danger btn-full';
  reportBtn.textContent = "It's Full";
  reportBtn.addEventListener('click', () => {
    emit(EVENTS.UI_REPORT_REQUESTED, { spotId: spot.id });
  });
  actions.appendChild(reportBtn);

  if (myActiveClaim) {
    const cancelBtn       = document.createElement('button');
    cancelBtn.type        = 'button';
    cancelBtn.className   = 'btn btn-ghost btn-full';
    cancelBtn.textContent = 'Cancel Claim';
    cancelBtn.addEventListener('click', () => _handleCancelClaim(myActiveClaim.claimId, spot.id));
    actions.appendChild(cancelBtn);
  }

  card.appendChild(actions);
  return card;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function _handleCopyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    dispatch('LINK_COPIED', {});
    showToast('Link copied! Paste it in your GC.', 'success');

    // Update button label briefly.
    const btn = document.getElementById('btn-copy-link');
    if (btn) {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Link — Share to GC'; }, 2000);
    }
  } catch {
    showToast('Could not copy — try manually: ' + url, 'error');
  }
}

function _handleCancelClaim(claimId, spotId) {
  openModal({
    title:   'Cancel your claim?',
    body:    'Your group will be removed from this spot. You can claim another.',
    confirm: {
      label:     'Yes, cancel',
      onConfirm: () => emit(EVENTS.UI_CANCEL_CLAIM, { claimId, spotId }),
    },
    cancel: { label: 'Keep it' },
  });
}

// ─── Live update ─────────────────────────────────────────────────────────────

function _onClaimUpdated(e) {
  const { spotId }    = e.detail;
  const { selectedSpotId } = getState();
  if (spotId !== selectedSpotId) return;

  // Re-render if the claim panel is currently visible.
  const container = document.getElementById('panel-content');
  if (container && container.querySelector('.claim-card')) {
    renderClaimPanel(container, spotId);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _groupLabel(key) {
  const map = { solo: '1 person', small: '2–5 ppl', medium: '6–15 ppl', large: '16+ ppl' };
  return map[key] ?? key;
}
