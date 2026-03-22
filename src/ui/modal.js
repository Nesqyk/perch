/**
 * src/ui/modal.js
 *
 * Generic modal dialog.
 * Used for confirmations (e.g., "Cancel your claim?") and custom-content
 * modals (e.g., the campus picker).
 *
 * Usage:
 *   import { openModal, openModalWithElement, closeModal } from './modal.js';
 *
 *   // Text confirmation:
 *   openModal({
 *     title:   'Cancel claim?',
 *     body:    'Your group will lose this spot.',
 *     confirm: { label: 'Yes, cancel', onConfirm: () => dispatch('...') },
 *     cancel:  { label: 'Keep it' },
 *   });
 *
 *   // Custom DOM content:
 *   openModalWithElement(myElement, {
 *     title:       'Choose campus',
 *     boxClass:    'modal-box--campus',
 *     onClose:     () => { ... },
 *   });
 */

const OVERLAY_ID = 'modal-overlay';
const CONTENT_ID = 'modal-content';

/**
 * @typedef {{
 *   title?:   string,
 *   body?:    string,
 *   confirm?: { label: string, onConfirm: () => void },
 *   cancel?:  { label: string },
 * }} ModalOptions
 */

/**
 * @typedef {{
 *   title?:    string,
 *   boxClass?: string,
 *   onClose?:  () => void,
 * }} ModalElementOptions
 */

/** @type {(() => void) | null} */
let _onCloseCallback = null;

/**
 * Open the modal with the given content.
 *
 * @param {ModalOptions} options
 * @returns {void}
 */
export function openModal({ title, body, confirm, cancel } = {}) {
  const overlay = document.getElementById(OVERLAY_ID);
  const content = document.getElementById(CONTENT_ID);
  if (!overlay || !content) return;

  _onCloseCallback = null;
  content.className = 'modal-box';
  content.innerHTML = '';

  if (title) {
    const h = document.createElement('h2');
    h.className   = 'modal-title';
    h.textContent = title;
    content.appendChild(h);
  }

  if (body) {
    const p = document.createElement('p');
    p.className   = 'modal-body';
    p.textContent = body;
    content.appendChild(p);
  }

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  if (cancel) {
    const btn        = document.createElement('button');
    btn.className    = 'btn btn-ghost';
    btn.textContent  = cancel.label ?? 'Cancel';
    btn.addEventListener('click', closeModal);
    actions.appendChild(btn);
  }

  if (confirm) {
    const btn        = document.createElement('button');
    btn.className    = 'btn btn-primary';
    btn.textContent  = confirm.label ?? 'Confirm';
    btn.addEventListener('click', () => {
      closeModal();
      confirm.onConfirm?.();
    });
    actions.appendChild(btn);
  }

  content.appendChild(actions);

  overlay.hidden = false;
  overlay.addEventListener('click', _handleOverlayClick);
  document.addEventListener('keydown', _handleKeyDown);
}

/**
 * Open the modal with an arbitrary DOM element as the body content.
 * Useful for pickers, forms, or any UI that needs more than text + buttons.
 *
 * @param {HTMLElement}        element  The DOM element to render inside the modal box.
 * @param {ModalElementOptions} opts
 * @returns {void}
 */
export function openModalWithElement(element, { title, boxClass, onClose } = {}) {
  const overlay = document.getElementById(OVERLAY_ID);
  const content = document.getElementById(CONTENT_ID);
  if (!overlay || !content) return;

  _onCloseCallback = onClose ?? null;
  content.className = `modal-box${boxClass ? ` ${boxClass}` : ''}`;
  content.innerHTML = '';

  if (title) {
    const h = document.createElement('h2');
    h.className   = 'modal-title modal-title--padded';
    h.textContent = title;
    content.appendChild(h);
  }

  content.appendChild(element);

  overlay.hidden = false;
  overlay.addEventListener('click', _handleOverlayClick);
  document.addEventListener('keydown', _handleKeyDown);
}

/**
 * Close the modal and clean up listeners.
 *
 * @returns {void}
 */
export function closeModal() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;
  overlay.hidden = true;
  overlay.removeEventListener('click', _handleOverlayClick);
  document.removeEventListener('keydown', _handleKeyDown);
  const cb = _onCloseCallback;
  _onCloseCallback = null;
  cb?.();
}

function _handleOverlayClick(e) {
  if (e.target.id === OVERLAY_ID) closeModal();
}

function _handleKeyDown(e) {
  if (e.key === 'Escape') closeModal();
}
