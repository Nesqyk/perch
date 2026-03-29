/**
 * src/ui/authModal.js
 *
 * Google Sign-In prompt modal.
 *
 * Renders a focused modal when an unauthenticated user tries to perform
 * a write action (claim, report, submit, join group). The modal is:
 *   - Triggered by EVENTS.UI_LOGIN_REQUESTED or directly via showLoginModal().
 *   - Dismissed by clicking the overlay, pressing Escape, or the close button.
 *   - Wired to signInWithGoogle() which triggers the OAuth redirect.
 *
 * The modal reuses the existing #modal-overlay / #modal-box DOM structure
 * to avoid adding another overlay layer.
 */

import { on, EVENTS } from '../core/events.js';
import { signInWithGoogle } from '../api/auth.js';

const OVERLAY_ID = 'modal-overlay';
const BOX_ID = 'modal-box';
const CONTENT_ID = 'modal-content';
const CLOSE_BTN_ID = 'auth-modal-close';
const GOOGLE_BTN_ID = 'auth-modal-google-btn';

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Wire the UI_LOGIN_REQUESTED event listener.
 * Call once from main.js bootstrap.
 *
 * @returns {void}
 */
export function initAuthModal() {
  on(EVENTS.UI_LOGIN_REQUESTED, showLoginModal);
}

// ─── Modal renderer ───────────────────────────────────────────────────────────

/**
 * Render and open the Google Sign-In modal.
 * Replaces the generic #modal-content with the auth card.
 *
 * @returns {void}
 */
export function showLoginModal() {
  const overlay = document.getElementById(OVERLAY_ID);
  const box = document.getElementById(BOX_ID);
  const content = document.getElementById(CONTENT_ID);
  if (!overlay || !box || !content) return;

  box.classList.add('modal-box--auth');
  content.innerHTML = /* html */`
    <div class="auth-modal">
      <div class="auth-modal__header">
        <div class="auth-modal__brand">
          <img src="/logo.svg" alt="Perch" class="auth-modal__logo" width="36" height="36" />
          <div>
            <p class="auth-modal__eyebrow">Perch account</p>
            <h2 class="auth-modal__title">Sign in to keep contributing.</h2>
          </div>
        </div>

        <button
          id="${CLOSE_BTN_ID}"
          class="auth-modal__close"
          type="button"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <p class="auth-modal__desc">
        Use Google to claim spots, report updates, and join your group without creating a separate password.
      </p>

      <ul class="auth-modal__list" aria-label="What signing in unlocks">
        <li>Claim a study spot for yourself or your group.</li>
        <li>Report full areas and suggest corrections.</li>
      </ul>

      <div class="auth-modal__actions">
        <button id="${GOOGLE_BTN_ID}" class="auth-modal__google-btn" type="button">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <p class="auth-modal__microcopy">
          Secure Google sign-in. No extra password.
        </p>
      </div>

      <p class="auth-modal__footer">
        You can still browse the map without signing in.
      </p>
    </div>
  `;

  overlay.hidden = false;
  overlay.addEventListener('click', _onOverlayClick);
  document.addEventListener('keydown', _onKeyDown);

  document.getElementById(GOOGLE_BTN_ID)
    ?.addEventListener('click', _onGoogleSignIn);

  document.getElementById(CLOSE_BTN_ID)
    ?.addEventListener('click', _closeModal);

  document.getElementById(GOOGLE_BTN_ID)?.focus();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _onGoogleSignIn() {
  const btn = document.getElementById(GOOGLE_BTN_ID);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = /* html */`
      <span class="auth-modal__spinner" aria-hidden="true"></span>
      Redirecting...
    `;
  }

  await signInWithGoogle();
}

function _closeModal() {
  const overlay = document.getElementById(OVERLAY_ID);
  const box = document.getElementById(BOX_ID);
  const content = document.getElementById(CONTENT_ID);
  if (!overlay || !box || !content) return;

  overlay.hidden = true;
  overlay.removeEventListener('click', _onOverlayClick);
  document.removeEventListener('keydown', _onKeyDown);
  box.classList.remove('modal-box--auth');
  content.innerHTML = '';
}

/**
 * Close the modal only when the backdrop itself is clicked.
 *
 * @param {MouseEvent} e
 * @returns {void}
 */
function _onOverlayClick(e) {
  if (e.target === e.currentTarget) {
    _closeModal();
  }
}

/**
 * Close the modal with the Escape key for keyboard users.
 *
 * @param {KeyboardEvent} e
 * @returns {void}
 */
function _onKeyDown(e) {
  if (e.key === 'Escape') {
    _closeModal();
  }
}
