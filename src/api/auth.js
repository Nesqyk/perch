/**
 * src/api/auth.js
 *
 * Supabase authentication for Perch.
 *
 * Responsibilities:
 *   1. initAuth() — mount the onAuthStateChange listener that syncs Supabase's
 *      session to the store via dispatch('AUTH_STATE_CHANGED').
 *   2. signInWithGoogle() — trigger the Google OAuth redirect flow.
 *   3. signInWithEmailOtp() — send a passwordless email sign-in link.
 *   4. signOut() — sign the user out and clear store auth state.
 *
 * Design constraints:
 *   - This module MUST be initialised before the feature modules so that
 *     currentUser is set before any auth-gated action is attempted.
 *   - Never access supabase.auth.getUser() from feature/UI modules.
 *     Always read currentUser from getState() instead.
 *   - The auth state listener fires once on init with the current session
 *     (or null), covering the case where the user had a persisted session.
 */

import { supabase }         from './supabaseClient.js';
import { dispatch }          from '../core/store.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Mount the Supabase auth state listener.
 * Must be called once from main.js during bootstrap, BEFORE feature modules.
 *
 * The listener fires immediately with the current session and then on every
 * subsequent sign-in / sign-out event.
 *
 * @returns {() => void} Unsubscribe function (optional cleanup).
 */
export function initAuth() {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      dispatch('AUTH_STATE_CHANGED', { user: session?.user ?? null });
    }
  );

  return () => subscription.unsubscribe();
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Initiate the Google OAuth sign-in flow.
 *
 * This triggers a browser redirect to Google. On return, Supabase will
 * handle the OAuth callback and fire the onAuthStateChange listener,
 * which will dispatch AUTH_STATE_CHANGED automatically.
 *
 * @returns {Promise<void>}
 */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Return to the same page the user was on when they clicked login.
      redirectTo: window.location.origin + window.location.pathname + window.location.hash,
      queryParams: {
        access_type: 'offline',
        prompt:      'select_account', // Always show account picker
      },
    },
  });

  if (error) {
    console.error('[auth] signInWithGoogle error:', error.message);
  }
}

/**
 * Send a passwordless email sign-in link / OTP.
 *
 * Supabase handles creating the user when signup is enabled and then fires
 * AUTH_STATE_CHANGED after the user returns through the email link.
 *
 * @param {string} email
 * @returns {Promise<{ error: string | null }>}
 */
export async function signInWithEmailOtp(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return { error: 'Enter a valid email address.' };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: _currentRedirectUrl(),
    },
  });

  if (error) {
    console.error('[auth] signInWithEmailOtp error:', error.message);
    return { error: authErrorMessage(error) };
  }

  return { error: null };
}

/**
 * Sign the current user out.
 *
 * Clears the Supabase session from localStorage and triggers
 * AUTH_STATE_CHANGED with user: null via the listener.
 *
 * @returns {Promise<void>}
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('[auth] signOut error:', error.message);
  }
}

/**
 * Trim and lower-case an email address for auth calls.
 *
 * @param {string} email
 * @returns {string}
 */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * Check whether an email address is syntactically valid enough for sign-in.
 *
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  return EMAIL_RE.test(String(email ?? ''));
}

/**
 * Derive a readable fallback display name from an email address.
 *
 * @param {string | null | undefined} email
 * @returns {string}
 */
export function fallbackNameFromEmail(email) {
  const localPart = normalizeEmail(email).split('@')[0];
  if (!localPart) return 'Perch member';

  return localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Perch member';
}

/**
 * Convert Supabase auth errors into user-facing copy.
 *
 * @param {{ message?: string, status?: number, code?: string } | null | undefined} error
 * @returns {string}
 */
export function authErrorMessage(error) {
  const message = String(error?.message ?? '').toLowerCase();
  const status = Number(error?.status ?? 0);

  if (status === 429 || message.includes('rate limit') || message.includes('too many')) {
    return 'Too many attempts. Please wait a bit before trying again.';
  }
  if (message.includes('invalid') && message.includes('email')) {
    return 'Enter a valid email address.';
  }
  if (message.includes('signup') && (message.includes('disabled') || message.includes('not allowed'))) {
    return 'Email sign-in is not enabled for this project yet.';
  }
  if (message.includes('already registered') || message.includes('identity')) {
    return 'That email is already linked to another sign-in method. Try your existing sign-in option.';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'Could not reach Perch auth. Check your connection and try again.';
  }

  return error?.message || 'Could not send the sign-in link. Please try again.';
}

function _currentRedirectUrl() {
  return window.location.origin + window.location.pathname + window.location.hash;
}
