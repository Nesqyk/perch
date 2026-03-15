/**
 * src/ui/profileModal.js
 *
 * Modal for setting and updating the user's nickname.
 * Interacts with the profile API and the central store.
 */

import { on, emit, EVENTS } from '../core/events.js';
import { getState, dispatch } from '../core/store.js';
import { upsertProfile } from '../api/profile.js';
import { showToast } from './toast.js';

const OVERLAY_ID = 'profile-modal-overlay';
const CONTENT_ID = 'profile-modal-content';

/**
 * Open the profile modal.
 */
export function openProfileModal() {
  const overlay = document.getElementById(OVERLAY_ID);
  const content = document.getElementById(CONTENT_ID);
  if (!overlay || !content) return;

  const { nickname } = getState();

  content.innerHTML = /* html */`
    <h2 class="modal-title">Your Identity</h2>
    <p class="modal-body">Set a nickname to personalize your claims and group activity.</p>
    
    <div class="profile-form">
      <label for="profile-nickname" class="filter-label">Nickname:</label>
      <input type="text" id="profile-nickname" class="input" 
             placeholder="e.g. Jun" maxlength="20" value="${nickname ?? ''}">
    </div>

    <div class="modal-actions">
      <button id="profile-save-btn" class="btn btn-primary">Save Changes</button>
      <button id="profile-cancel-btn" class="btn btn-ghost">Cancel</button>
    </div>
  `;

  overlay.hidden = false;

  const saveBtn   = content.querySelector('#profile-save-btn');
  const cancelBtn = content.querySelector('#profile-cancel-btn');
  const input     = content.querySelector('#profile-nickname');

  saveBtn.addEventListener('click', async () => {
    const newNickname = input.value.trim();
    if (!newNickname) {
      input.focus();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const { error } = await upsertProfile(newNickname);

    if (error) {
      showToast('Failed to save nickname', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    } else {
      dispatch('SET_NICKNAME', newNickname);
      showToast('Nickname updated!', 'success');
      closeProfileModal();
    }
  });

  cancelBtn.addEventListener('click', closeProfileModal);
  
  overlay.addEventListener('click', _handleOverlayClick);
  document.addEventListener('keydown', _handleKeyDown);

  // Focus the input automatically
  setTimeout(() => input.focus(), 50);
}

/**
 * Close the profile modal.
 */
export function closeProfileModal() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;
  overlay.hidden = true;
  overlay.removeEventListener('click', _handleOverlayClick);
  document.removeEventListener('keydown', _handleKeyDown);
}

function _handleOverlayClick(e) {
  if (e.target.id === OVERLAY_ID) closeProfileModal();
}

function _handleKeyDown(e) {
  if (e.key === 'Escape') closeProfileModal();
}
