/**
 * src/utils/session.js
 *
 * Anonymous session identity for Perch.
 *
 * No accounts. No logins. Each browser gets a random UUID stored in
 * localStorage that persists across page refreshes but not across devices.
 * This is intentional — the shared GC link coordinates groups without
 * requiring anyone to log in.
 *
 * The session id is attached to every claim and correction write so the
 * database can enforce "only cancel your own claim" via RLS policy without
 * a user account.
 */

import { setSessionHeader } from '../api/supabaseClient.js';

const SESSION_KEY = 'perch_session_id';

/** @type {string | null} */
let _sessionId = null;

/**
 * Return the current session id, creating one if it doesn't exist.
 * @returns {string}
 */
export function getSessionId() {
  if (_sessionId) return _sessionId;

  const stored = localStorage.getItem(SESSION_KEY);
  if (stored) {
    _sessionId = stored;
    return _sessionId;
  }

  _sessionId = _generateId();
  localStorage.setItem(SESSION_KEY, _sessionId);
  return _sessionId;
}

/**
 * Call once from main.js during bootstrap.
 * Ensures the session id is created and cached before any API call needs it.
 */
export function initSession() {
  const sessionId = getSessionId();
  setSessionHeader(sessionId);
}

/**
 * Generate a UUID v4 using the Web Crypto API.
 * Falls back to a Math.random-based version for environments without crypto.
 * @returns {string}
 */
function _generateId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback (extremely rare in 2024+ browsers).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
