/**
 * src/ui/imageUploadField.js
 *
 * Reusable image-picker control for spot photo uploads.
 *
 * The field owns preview URL cleanup and client-side validation. Callers read
 * the selected File via getFile() before uploading through api/spots.js.
 */

import { ImagePlus, X } from 'lucide';

import { iconSvg } from './icons.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Build an optional image upload field.
 *
 * @param {{ idPrefix: string, label?: string }} options
 * @returns {{
 *   element: HTMLElement,
 *   getFile: () => File | null,
 *   clear: () => void,
 *   setError: (message: string) => void
 * }}
 */
export function createImageUploadField({ idPrefix, label = 'Spot photo (optional)' }) {
  let selectedFile = null;
  let previewUrl = '';

  const field = document.createElement('div');
  field.className = 'image-upload-field';
  field.innerHTML = /* html */`
    <label class="image-upload-field__label" for="${_escapeAttr(idPrefix)}-image-input">${_escapeHtml(label)}</label>
    <label class="image-upload-field__dropzone" for="${_escapeAttr(idPrefix)}-image-input">
      <span class="image-upload-field__icon">${iconSvg(ImagePlus, 22)}</span>
      <span class="image-upload-field__copy">
        <strong>Add a real photo</strong>
        <span>JPEG, PNG, or WebP under 5 MB</span>
      </span>
      <img class="image-upload-field__preview" alt="" hidden>
    </label>
    <input id="${_escapeAttr(idPrefix)}-image-input" class="image-upload-field__input" type="file" accept="image/jpeg,image/png,image/webp">
    <div class="image-upload-field__meta">
      <span class="image-upload-field__file" aria-live="polite"></span>
      <button type="button" class="image-upload-field__remove" hidden>${iconSvg(X, 14)} Remove</button>
    </div>
    <p class="image-upload-field__error" hidden></p>
  `;

  const input = /** @type {HTMLInputElement | null} */(field.querySelector('input'));
  const dropzone = /** @type {HTMLElement | null} */(field.querySelector('.image-upload-field__dropzone'));
  const preview = /** @type {HTMLImageElement | null} */(field.querySelector('.image-upload-field__preview'));
  const fileText = /** @type {HTMLElement | null} */(field.querySelector('.image-upload-field__file'));
  const removeBtn = /** @type {HTMLButtonElement | null} */(field.querySelector('.image-upload-field__remove'));
  const errorEl = /** @type {HTMLElement | null} */(field.querySelector('.image-upload-field__error'));

  function clear() {
    selectedFile = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    if (input) input.value = '';
    if (preview) {
      preview.src = '';
      preview.hidden = true;
    }
    if (fileText) fileText.textContent = '';
    if (removeBtn) removeBtn.hidden = true;
    dropzone?.classList.remove('image-upload-field__dropzone--has-image');
    setError('');
  }

  function setError(message) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
    dropzone?.classList.toggle('image-upload-field__dropzone--error', Boolean(message));
  }

  input?.addEventListener('change', () => {
    const file = input.files?.[0] ?? null;
    if (!file) {
      clear();
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      clear();
      setError('Choose a JPEG, PNG, or WebP image.');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      clear();
      setError('Choose an image under 5 MB.');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    selectedFile = file;
    previewUrl = URL.createObjectURL(file);
    if (preview) {
      preview.src = previewUrl;
      preview.hidden = false;
    }
    if (fileText) fileText.textContent = file.name;
    if (removeBtn) removeBtn.hidden = false;
    dropzone?.classList.add('image-upload-field__dropzone--has-image');
    setError('');
  });

  removeBtn?.addEventListener('click', clear);

  return {
    element: field,
    getFile: () => selectedFile,
    clear,
    setError,
  };
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _escapeAttr(value) {
  return _escapeHtml(value);
}
