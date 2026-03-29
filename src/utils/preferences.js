/**
 * src/utils/preferences.js
 *
 * Local user preference helpers for route-level settings pages.
 *
 * These preferences are intentionally client-side only for now so the product
 * can ship a functional settings surface before server-backed preferences are
 * introduced.
 */

const PREFERENCES_KEY = 'perch_user_preferences';

const DEFAULT_PREFERENCES = Object.freeze({
  defaultView: 'campus',
  preferredCampusId: '',
  showGroupPins: true,
  notifyGroupActivity: true,
  notifyClaimExpiry: true,
  notifyContributionStatus: true,
  shareProfileInGroups: true,
});

/**
 * Read the locally persisted user preferences.
 *
 * @returns {{
 *   defaultView: 'campus' | 'city',
 *   preferredCampusId: string,
 *   showGroupPins: boolean,
 *   notifyGroupActivity: boolean,
 *   notifyClaimExpiry: boolean,
 *   notifyContributionStatus: boolean,
 *   shareProfileInGroups: boolean,
 * }}
 */
export function loadUserPreferences() {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };

    const parsed = JSON.parse(raw);
    return _normalizePreferences(parsed);
  } catch (err) {
    console.warn('[preferences] Could not read preferences:', err);
    return { ...DEFAULT_PREFERENCES };
  }
}

/**
 * Persist a partial preference update and return the merged snapshot.
 *
 * @param {Partial<{
 *   defaultView: 'campus' | 'city',
 *   preferredCampusId: string,
 *   showGroupPins: boolean,
 *   notifyGroupActivity: boolean,
 *   notifyClaimExpiry: boolean,
 *   notifyContributionStatus: boolean,
 *   shareProfileInGroups: boolean,
 * }>} updates
 * @returns {{
 *   defaultView: 'campus' | 'city',
 *   preferredCampusId: string,
 *   showGroupPins: boolean,
 *   notifyGroupActivity: boolean,
 *   notifyClaimExpiry: boolean,
 *   notifyContributionStatus: boolean,
 *   shareProfileInGroups: boolean,
 * }}
 */
export function saveUserPreferences(updates) {
  const next = {
    ...loadUserPreferences(),
    ...updates,
  };

  const normalized = _normalizePreferences(next);

  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.warn('[preferences] Could not save preferences:', err);
  }

  return normalized;
}

function _normalizePreferences(value) {
  return {
    defaultView: value?.defaultView === 'city' ? 'city' : 'campus',
    preferredCampusId: typeof value?.preferredCampusId === 'string' ? value.preferredCampusId : '',
    showGroupPins: value?.showGroupPins !== false,
    notifyGroupActivity: value?.notifyGroupActivity !== false,
    notifyClaimExpiry: value?.notifyClaimExpiry !== false,
    notifyContributionStatus: value?.notifyContributionStatus !== false,
    shareProfileInGroups: value?.shareProfileInGroups !== false,
  };
}
