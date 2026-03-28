/**
 * src/ui/profilePage.js
 *
 * Route-level profile and account summary page rendered into #view-profile.
 *
 * Three render states:
 *   1. Signed out  — empty state with a Sign In prompt.
 *   2. Signed in   — account card (identity + edit nickname), status card
 *                    (auth + group membership), a claim history card, and a
 *                    settings stub card.
 *
 * Re-renders on: AUTH_STATE_CHANGED, NICKNAME_UPDATED, GROUP_JOINED,
 *                GROUP_LEFT, ROUTE_CHANGED.
 */

import { UserRound, LogIn, PencilLine, ShieldCheck, Users, Settings, History, MapPin, ChevronLeft, ChevronRight } from 'lucide';

import { emit, on, EVENTS } from '../core/events.js';
import { getState } from '../core/store.js';
import { navigateTo } from '../core/router.js';
import { fetchClaimHistory } from '../api/claims.js';
import { openProfileModal } from './profileModal.js';
import { iconSvg } from './icons.js';

const VIEW_ID = 'view-profile';

/** @type {number} Number of claim history rows per page. */
const HISTORY_PAGE_SIZE = 20;

/**
 * Initialise the profile page renderer.
 *
 * @returns {void}
 */
export function initProfilePage() {
  const rerender = () => _renderProfilePage();

  on(EVENTS.AUTH_STATE_CHANGED, rerender);
  on(EVENTS.NICKNAME_UPDATED, rerender);
  on(EVENTS.GROUP_JOINED, rerender);
  on(EVENTS.GROUP_LEFT, rerender);
  on(EVENTS.ROUTE_CHANGED, rerender);

  _renderProfilePage();
}

function _renderProfilePage() {
  const view = document.getElementById(VIEW_ID);
  if (!view) return;

  const { currentUser, nickname, group } = getState();
  view.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'page-shell';

  shell.innerHTML = /* html */`
    <div class="page-shell__header">
      <p class="page-shell__eyebrow">Perch</p>
      <h1 class="page-shell__title">Profile</h1>
      <p class="page-shell__subtitle">Account settings, identity, and your current place in the crew.</p>
    </div>
  `;

  if (!currentUser) {
    const empty = document.createElement('section');
    empty.className = 'page-card page-card--empty';
    empty.innerHTML = /* html */`
      <div class="page-empty__icon">${iconSvg(UserRound, 28)}</div>
      <h2 class="page-empty__title">Sign in to personalize Perch.</h2>
      <p class="page-empty__copy">Save a nickname, join groups, and make your claims identifiable to other students.</p>
      <button type="button" class="btn btn-primary" id="profile-page-login">${iconSvg(LogIn, 16)} Sign in</button>
    `;
    empty.querySelector('#profile-page-login')?.addEventListener('click', () => emit(EVENTS.UI_LOGIN_REQUESTED, {}));
    shell.appendChild(empty);
    view.appendChild(shell);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'page-grid page-grid--two';

  const accountCard = document.createElement('section');
  accountCard.className = 'page-card page-card--hero';
  accountCard.innerHTML = /* html */`
    <div class="profile-page__identity">
      <span class="profile-page__avatar">${_initials(nickname || currentUser.email || 'P')}</span>
      <div>
        <div class="page-card__eyebrow">Signed in</div>
        <h2 class="page-card__title">${_escapeHtml(nickname || currentUser.user_metadata?.full_name || 'Perch member')}</h2>
        <p class="page-card__copy">${_escapeHtml(currentUser.email ?? 'No email available')}</p>
      </div>
    </div>
    <div class="profile-page__actions">
      <button type="button" class="btn btn-primary" id="profile-page-edit">${iconSvg(PencilLine, 16)} Edit nickname</button>
      <button type="button" class="btn btn-ghost" id="profile-page-map">Back to map</button>
    </div>
  `;
  accountCard.querySelector('#profile-page-edit')?.addEventListener('click', () => openProfileModal());
  accountCard.querySelector('#profile-page-map')?.addEventListener('click', () => navigateTo('/'));

  const statusCard = document.createElement('section');
  statusCard.className = 'page-card';
  statusCard.innerHTML = /* html */`
    <div class="page-card__eyebrow">Status</div>
    <h3 class="page-card__title page-card__title--sm">Your current setup</h3>
    <div class="profile-page__meta-list">
      <div class="profile-meta">
        <span class="profile-meta__icon">${iconSvg(ShieldCheck, 16)}</span>
        <div>
          <span class="profile-meta__title">Account</span>
          <span class="profile-meta__copy">Authenticated with Google through Supabase.</span>
        </div>
      </div>
      <div class="profile-meta">
        <span class="profile-meta__icon">${iconSvg(Users, 16)}</span>
        <div>
          <span class="profile-meta__title">Group</span>
          <span class="profile-meta__copy">${group ? `Currently in ${_escapeHtml(group.name)}.` : 'Not currently in a study crew.'}</span>
        </div>
      </div>
    </div>
  `;

  grid.appendChild(accountCard);
  grid.appendChild(statusCard);
  shell.appendChild(grid);

  const historyCard = _buildHistoryCard();
  shell.appendChild(historyCard);
  _loadHistoryPage(historyCard, 0);

  shell.appendChild(_buildSettingsCard());

  view.appendChild(shell);
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Build the empty skeleton for the claim history card.
 * Content is filled asynchronously by `_loadHistoryPage`.
 *
 * @returns {HTMLElement}
 */
function _buildHistoryCard() {
  const card = document.createElement('section');
  card.className = 'page-card profile-page__history';
  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Activity</div>
    <h3 class="page-card__title page-card__title--sm">Claim history</h3>
    <div class="claim-history__body">
      <p class="claim-history__loading">Loading&hellip;</p>
    </div>
    <div class="claim-history__footer" hidden></div>
  `;
  return card;
}

/**
 * Fetch one page of claim history and render it into the card.
 * Attaches pagination button listeners if there are more rows.
 *
 * @param {HTMLElement} card   The history card element produced by `_buildHistoryCard`.
 * @param {number}      offset Row offset for the current page (0-indexed).
 * @returns {Promise<void>}
 */
async function _loadHistoryPage(card, offset) {
  const body = card.querySelector('.claim-history__body');
  const footer = card.querySelector('.claim-history__footer');
  if (!body || !footer) return;

  body.innerHTML = /* html */`<p class="claim-history__loading">Loading&hellip;</p>`;
  footer.hidden = true;

  const { data, error } = await fetchClaimHistory({ limit: HISTORY_PAGE_SIZE + 1, offset });

  if (error) {
    body.innerHTML = /* html */`
      <p class="page-empty-inline">Could not load claim history. Please try again later.</p>
    `;
    return;
  }

  const hasMore = data.length > HISTORY_PAGE_SIZE;
  const rows = hasMore ? data.slice(0, HISTORY_PAGE_SIZE) : data;

  if (rows.length === 0 && offset === 0) {
    body.innerHTML = /* html */`
      <div class="claim-history__empty">
        <span class="claim-history__empty-icon">${iconSvg(MapPin, 20)}</span>
        <p>No claims yet &mdash; go <a href="#/" class="link">find a spot</a>!</p>
      </div>
    `;
    return;
  }

  body.innerHTML = /* html */`
    <ol class="claim-history__list">
      ${rows.map(_renderHistoryRow).join('')}
    </ol>
  `;

  // Pagination footer
  const hasPrev = offset > 0;
  if (hasPrev || hasMore) {
    footer.hidden = false;
    footer.innerHTML = /* html */`
      <div class="claim-history__pagination">
        <button type="button" class="btn btn-ghost btn-sm" id="ch-prev" ${hasPrev ? '' : 'disabled'}>
          ${iconSvg(ChevronLeft, 14)} Prev
        </button>
        <span class="claim-history__page-label">
          ${offset / HISTORY_PAGE_SIZE + 1}
        </span>
        <button type="button" class="btn btn-ghost btn-sm" id="ch-next" ${hasMore ? '' : 'disabled'}>
          Next ${iconSvg(ChevronRight, 14)}
        </button>
      </div>
    `;
    footer.querySelector('#ch-prev')?.addEventListener('click', () => _loadHistoryPage(card, offset - HISTORY_PAGE_SIZE));
    footer.querySelector('#ch-next')?.addEventListener('click', () => _loadHistoryPage(card, offset + HISTORY_PAGE_SIZE));
  }
}

/**
 * Render a single claim history row as an HTML string.
 *
 * @param {{
 *   id:             string,
 *   spot_id:        string,
 *   group_size_key: string,
 *   claimed_at:     string,
 *   expires_at:     string,
 *   cancelled_at:   string | null,
 *   spots:          { name: string, building: string | null } | null,
 * }} claim
 * @returns {string}
 */
function _renderHistoryRow(claim) {
  const spotName = _escapeHtml(claim.spots?.name ?? 'Unknown spot');
  const building = claim.spots?.building ? _escapeHtml(claim.spots.building) : null;
  const date = new Date(claim.claimed_at).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const time = new Date(claim.claimed_at).toLocaleTimeString('en-PH', {
    hour: 'numeric', minute: '2-digit',
  });
  const duration = _formatDuration(claim.claimed_at, claim.cancelled_at, claim.expires_at);

  return /* html */`
    <li class="claim-history__row">
      <span class="claim-history__row-icon">${iconSvg(History, 14)}</span>
      <div class="claim-history__row-body">
        <span class="claim-history__row-name">${spotName}</span>
        ${building ? `<span class="claim-history__row-building">${building}</span>` : ''}
      </div>
      <div class="claim-history__row-meta">
        <span class="claim-history__row-date">${date} &middot; ${time}</span>
        <span class="claim-history__row-duration">${duration}</span>
      </div>
    </li>
  `;
}

/**
 * Format how long a claim was held.
 * - If cancelled_at is set: show minutes held.
 * - If expires_at is in the past (and no cancelled_at): "Expired".
 * - If still active: "Active".
 *
 * @param {string}      claimedAt
 * @param {string|null} cancelledAt
 * @param {string}      expiresAt
 * @returns {string}
 */
function _formatDuration(claimedAt, cancelledAt, expiresAt) {
  if (cancelledAt) {
    const mins = Math.round((new Date(cancelledAt) - new Date(claimedAt)) / 60_000);
    return `Held ${mins}m`;
  }
  if (new Date(expiresAt) <= new Date()) return 'Expired';
  return 'Active';
}

/**
 * Build a stub settings card shown below the history card.
 * Individual rows are disabled until each preference is implemented.
 *
 * @returns {HTMLElement}
 */
function _buildSettingsCard() {
  const card = document.createElement('section');
  card.className = 'page-card page-card--subtle profile-page__settings';
  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Settings</div>
    <h3 class="page-card__title page-card__title--sm">App preferences</h3>
    <div class="profile-page__meta-list">
      <div class="profile-meta profile-meta--disabled">
        <span class="profile-meta__icon">${iconSvg(Settings, 14)}</span>
        <div>
          <span class="profile-meta__title">Default view on load</span>
          <span class="profile-meta__copy">Campus map or city view &mdash; <em>coming soon</em></span>
        </div>
      </div>
    </div>
  `;
  return card;
}

function _initials(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
