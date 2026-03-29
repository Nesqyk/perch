/**
 * src/ui/notificationsPage.js
 *
 * Route-level notifications placeholder for #/notifications.
 *
 * This is intentionally lightweight for now so the navigation can include the
 * destination before the full inbox/activity system is implemented.
 */

import { BellRing, LogIn, Sparkles } from 'lucide';

import { emit, on, EVENTS } from '../core/events.js';
import { getState } from '../core/store.js';
import { navigateTo } from '../core/router.js';
import { iconSvg } from './icons.js';

const VIEW_ID = 'view-notifications';

/**
 * Initialise the notifications placeholder page.
 *
 * @returns {void}
 */
export function initNotificationsPage() {
  const rerender = () => _renderNotificationsPage();

  on(EVENTS.AUTH_STATE_CHANGED, rerender);
  on(EVENTS.ROUTE_CHANGED, rerender);

  _renderNotificationsPage();
}

function _renderNotificationsPage() {
  const view = document.getElementById(VIEW_ID);
  if (!view) return;

  const { currentUser } = getState();
  view.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'page-shell';
  shell.innerHTML = /* html */`
    <div class="page-shell__header">
      <p class="page-shell__eyebrow">Perch</p>
      <h1 class="page-shell__title">Notifications</h1>
      <p class="page-shell__subtitle">A focused inbox for squad activity, contribution confirmations, and claim reminders is coming next.</p>
    </div>
  `;

  if (!currentUser) {
    shell.appendChild(_buildSignedOutCard());
    view.appendChild(shell);
    return;
  }

  shell.appendChild(_buildPlaceholderCard());
  view.appendChild(shell);
}

function _buildSignedOutCard() {
  const card = document.createElement('section');
  card.className = 'page-card page-card--empty';
  card.innerHTML = /* html */`
    <div class="page-empty__icon">${iconSvg(BellRing, 28)}</div>
    <h2 class="page-empty__title">Sign in to follow your Perch activity.</h2>
    <p class="page-empty__copy">Notifications will track squad movement, map confirmations, and useful reminders tied to your account.</p>
    <div class="settings-page__cta-row">
      <button type="button" class="btn btn-primary" id="notifications-login">${iconSvg(LogIn, 16)} Sign in</button>
      <button type="button" class="btn btn-ghost" id="notifications-map">Back to map</button>
    </div>
  `;

  card.querySelector('#notifications-login')?.addEventListener('click', () => emit(EVENTS.UI_LOGIN_REQUESTED, {}));
  card.querySelector('#notifications-map')?.addEventListener('click', () => navigateTo('/'));
  return card;
}

function _buildPlaceholderCard() {
  const card = document.createElement('section');
  card.className = 'page-card page-card--hero';
  card.innerHTML = /* html */`
    <div class="page-card__eyebrow">Placeholder</div>
    <h2 class="page-card__title">Your inbox is almost ready.</h2>
    <p class="page-card__copy">We will use this page for squad movement, contribution review results, and claim reminders without turning Perch into a noisy chat app.</p>
    <div class="settings-stack">
      <div class="profile-meta">
        <span class="profile-meta__icon">${iconSvg(BellRing, 16)}</span>
        <div>
          <span class="profile-meta__title">Squad updates</span>
          <span class="profile-meta__copy">See when your crew pins a new spot or starts heading somewhere.</span>
        </div>
      </div>
      <div class="profile-meta">
        <span class="profile-meta__icon">${iconSvg(Sparkles, 16)}</span>
        <div>
          <span class="profile-meta__title">Contribution results</span>
          <span class="profile-meta__copy">Track room confirmations, building approvals, and map review changes.</span>
        </div>
      </div>
    </div>
    <div class="settings-page__cta-row">
      <button type="button" class="btn btn-primary" id="notifications-settings">Notification settings</button>
      <button type="button" class="btn btn-ghost" id="notifications-profile">Back to profile</button>
    </div>
  `;

  card.querySelector('#notifications-settings')?.addEventListener('click', () => navigateTo('/settings'));
  card.querySelector('#notifications-profile')?.addEventListener('click', () => navigateTo('/profile'));
  return card;
}
