/**
 * src/ui/toast.js
 *
 * Lightweight, non-blocking notification toasts.
 * Renders into #toast-container (defined in index.html).
 *
 * Usage:
 *   import { showToast } from './toast.js';
 *   showToast('Link copied!');
 *   showToast('Failed to connect', 'error');
 *
 * Types: 'info' (default) | 'success' | 'error'
 * Auto-dismisses after 3 seconds.
 */

const CONTAINER_ID  = 'toast-container';
const AUTO_HIDE_MS  = 3000;
const ANIMATE_MS    = 300; // matches CSS transition duration

/**
 * Display a toast notification.
 *
 * @param {string} message
 * @param {'info' | 'success' | 'error'} [type='info']
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  const toast      = document.createElement('div');
  toast.className  = `toast toast-${type}`;
  toast.textContent = message;
  toast.setAttribute('role', 'status');

  container.appendChild(toast);

  // Trigger enter animation on next frame.
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  setTimeout(() => _dismiss(toast), AUTO_HIDE_MS);
}

function _dismiss(toast) {
  toast.classList.remove('toast-visible');
  setTimeout(() => toast.remove(), ANIMATE_MS);
}
