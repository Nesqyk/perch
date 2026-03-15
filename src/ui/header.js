/**
 * src/ui/header.js
 *
 * Manages header interactions, including the profile button.
 */

import { User } from 'lucide';
import { iconSvg } from './icons.js';
import { openProfileModal } from './profileModal.js';
import { initCampusSelector } from './campusSelector.js';

/**
 * Initialise the header interactions.
 */
export function initHeader() {
  const profileBtn = document.getElementById('profile-btn');
  const iconContainer = document.getElementById('profile-btn-icon');
  const campusContainer = document.getElementById('campus-selector-root');

  if (profileBtn && iconContainer) {
    iconContainer.innerHTML = iconSvg(User, 24);
    profileBtn.addEventListener('click', openProfileModal);
  }

  if (campusContainer) {
    initCampusSelector(campusContainer);
  }
}
