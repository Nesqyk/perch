/**
 * src/ui/profilePage.js
 *
 * Route-level profile and account summary page rendered into #view-profile.
 *
 * Three render states:
 *   1. Signed out  — empty state with a Sign In prompt.
 *   2. Signed in   — account card (identity + edit nickname), status card
 *                    (auth + group membership), and a settings stub card.
 *
 * Re-renders on: AUTH_STATE_CHANGED, NICKNAME_UPDATED, GROUP_JOINED,
 *                GROUP_LEFT, ROUTE_CHANGED.
 */

import { UserRound, LogIn, PencilLine, ShieldCheck, Users, Settings } from 'lucide';

import { emit, on, EVENTS } from '../core/events.js';
import { getState } from '../core/store.js';
import { navigateTo } from '../core/router.js';
import { openProfileModal } from './profileModal.js';
import { iconSvg } from './icons.js';

const VIEW_ID = 'view-profile';

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

  shell.appendChild(_buildSettingsCard());

  view.appendChild(shell);
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Build a stub settings card shown below the main identity/status grid.
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
