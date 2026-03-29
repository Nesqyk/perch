/**
 * src/api/auth.js
 *
 * Supabase Google OAuth authentication for Perch.
 *
 * Responsibilities:
 *   1. initAuth() — mount the onAuthStateChange listener that syncs Supabase's
 *      session to the store via dispatch('AUTH_STATE_CHANGED').
 *   2. signInWithGoogle() — trigger the Google OAuth redirect flow.
 *   3. signOut() — sign the user out and clear store auth state.
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
