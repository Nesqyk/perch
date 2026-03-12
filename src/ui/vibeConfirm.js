/**
 * src/ui/vibeConfirm.js
 *
 * Vibe Confirm — inline one-tap panel that appears below the trigger button.
 * Shows three choices: "Looks free", "Getting full", "It's packed".
 *
 * Usage:
 *   import { renderVibeConfirm } from './vibeConfirm.js';
 *   renderVibeConfirm(pinId, anchorElement);
 *
 * The picker is appended as a sibling after `anchor` and auto-removes
 * itself on selection or on outside click / Esc.
 */

import { emit } from '../core/events.js';
import { GROUP_PIN_EVENTS } from '../features/groupPins.js';

const VIBE_OPTIONS = [
  { status: 'free',    label: 'Looks free',    cls: 'vibe-free'    },
  { status: 'filling', label: 'Getting full',  cls: 'vibe-filling' },
  { status: 'full',    label: "It's packed",   cls: 'vibe-full'    },
];

/**
 * Render an inline Vibe Confirm picker below the anchor element.
 * Removes any existing picker first.
 *
 * @param {string}      pinId    - The group_pins.id to confirm vibe for.
 * @param {HTMLElement} anchor   - The button that triggered the picker.
 */
export function renderVibeConfirm(pinId, anchor) {
  // Remove existing picker if any.
  _dismissPicker();

  const picker = document.createElement('div');
  picker.className  = 'vibe-picker';
  picker.id         = 'vibe-picker';
  picker.setAttribute('role', 'menu');

  VIBE_OPTIONS.forEach(({ status, label, cls }) => {
    const btn = document.createElement('button');
    btn.type       = 'button';
    btn.className  = `vibe-option ${cls}`;
    btn.textContent = label;
    btn.setAttribute('role', 'menuitem');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      emit(GROUP_PIN_EVENTS.VIBE_SUBMITTED, { pinId, vibeStatus: status });
      _dismissPicker();
    });

    picker.appendChild(btn);
  });

  // Insert after anchor.
  anchor.insertAdjacentElement('afterend', picker);

  // Outside click → dismiss.
  requestAnimationFrame(() => {
    document.addEventListener('click', _handleOutsideClick, { once: true });
    document.addEventListener('keydown', _handleEscKey);
  });
}

// ─── Private ──────────────────────────────────────────────────────────────────

function _dismissPicker() {
  const existing = document.getElementById('vibe-picker');
  if (existing) existing.remove();
  document.removeEventListener('keydown', _handleEscKey);
}

function _handleOutsideClick() {
  _dismissPicker();
}

function _handleEscKey(e) {
  if (e.key === 'Escape') _dismissPicker();
}
