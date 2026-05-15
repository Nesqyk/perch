/**
 * src/ui/profileModal.js
 *
 * Modal for setting and updating profile identity fields.
 * Interacts with the settings profile API and the central store.
 */

import { getState, dispatch } from '../core/store.js';
import { updateSettingsProfile } from '../api/settings.js';
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

  const { nickname, settingsProfile } = getState();
  const profile = settingsProfile ?? {};
  const vibes = Array.isArray(profile.study_vibes) ? profile.study_vibes.join(', ') : '';

  content.innerHTML = /* html */`
    <h2 class="modal-title">Your Identity</h2>
    <p class="modal-body">Keep your academic profile accurate for claims, squads, and contributions.</p>
    
    <div class="profile-form">
      <label for="profile-nickname" class="filter-label">Nickname:</label>
      <input type="text" id="profile-nickname" class="input" 
             placeholder="e.g. Jun" maxlength="40" value="${_escapeAttribute(profile.nickname ?? nickname ?? '')}">

      <label for="profile-course" class="filter-label">Course label:</label>
      <input type="text" id="profile-course" class="input"
             placeholder="e.g. BSIT" maxlength="40" value="${_escapeAttribute(profile.course_label ?? '')}">

      <label for="profile-class" class="filter-label">Class label:</label>
      <input type="text" id="profile-class" class="input"
             placeholder="e.g. Class of 2025" maxlength="40" value="${_escapeAttribute(profile.class_label ?? '')}">

      <label for="profile-student-id" class="filter-label">Student ID:</label>
      <input type="text" id="profile-student-id" class="input"
             placeholder="Optional" maxlength="40" value="${_escapeAttribute(profile.student_id ?? '')}">

      <label for="profile-vibes" class="filter-label">Study vibes:</label>
      <input type="text" id="profile-vibes" class="input"
             placeholder="e.g. Lofi, Silent, Group Friendly" maxlength="120" value="${_escapeAttribute(vibes)}">
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
  const course    = content.querySelector('#profile-course');
  const classYear = content.querySelector('#profile-class');
  const studentId = content.querySelector('#profile-student-id');
  const vibesInput = content.querySelector('#profile-vibes');

  saveBtn.addEventListener('click', async () => {
    const newNickname = input.value.trim();
    if (!newNickname) {
      input.focus();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const { profile: updatedProfile, error } = await updateSettingsProfile({
      nickname: newNickname,
      courseLabel: course.value.trim(),
      classLabel: classYear.value.trim(),
      studentId: studentId.value.trim(),
      studyVibes: vibesInput.value.split(',').map((vibe) => vibe.trim()).filter(Boolean),
    });

    if (error) {
      showToast('Failed to save profile', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    } else {
      if (updatedProfile) dispatch('SETTINGS_PROFILE_UPDATED', { profile: updatedProfile });
      showToast('Profile updated!', 'success');
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

function _escapeAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
