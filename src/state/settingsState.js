/**
 * src/state/settingsState.js
 *
 * Pure helpers for normalising persisted settings dashboard data. These keep
 * defaults, device labels, and active-card selection testable outside the DOM.
 */

export const DEFAULT_SETTINGS = Object.freeze({
  defaultMapView: 'campus',
  preferredStudyEnvironment: 'quiet',
  spotAvailabilityAlerts: true,
  squadUpdates: false,
  smsEnabled: false,
  preferredCampusId: '',
  googleCalendarLinked: false,
});

/**
 * Convert backend settings rows and local fallbacks into UI settings.
 *
 * @param {object | null | undefined} row
 * @param {object} [fallback]
 * @returns {object}
 */
export function normalizeSettings(row, fallback = {}) {
  return {
    defaultMapView: _normalizeMapView(row?.default_map_view ?? fallback.defaultView ?? fallback.defaultMapView),
    preferredStudyEnvironment: row?.preferred_study_environment === 'moderate' ? 'moderate' : 'quiet',
    spotAvailabilityAlerts: row?.spot_availability_alerts ?? fallback.notifyClaimExpiry ?? DEFAULT_SETTINGS.spotAvailabilityAlerts,
    squadUpdates: row?.squad_updates ?? fallback.notifyGroupActivity ?? DEFAULT_SETTINGS.squadUpdates,
    smsEnabled: row?.sms_enabled ?? DEFAULT_SETTINGS.smsEnabled,
    preferredCampusId: row?.preferred_campus_id ?? fallback.preferredCampusId ?? DEFAULT_SETTINGS.preferredCampusId,
    googleCalendarLinked: row?.google_calendar_linked ?? DEFAULT_SETTINGS.googleCalendarLinked,
  };
}

/**
 * Convert settings default view to the existing app view mode.
 *
 * @param {'campus' | 'cafes' | 'city' | string} value
 * @returns {'campus' | 'city'}
 */
export function mapSettingsViewToViewMode(value) {
  return value === 'cafes' || value === 'city' ? 'city' : 'campus';
}

/**
 * Pick the active next session from persisted rows.
 *
 * @param {object[]} sessions
 * @returns {object | null}
 */
export function selectNextSession(sessions = []) {
  return [...sessions]
    .filter(session => session.is_next !== false)
    .sort((a, b) => new Date(a.starts_at ?? 0).getTime() - new Date(b.starts_at ?? 0).getTime())[0] ?? null;
}

/**
 * Pick the active shared note from persisted rows.
 *
 * @param {object[]} notes
 * @returns {object | null}
 */
export function selectActiveSharedNote(notes = []) {
  return [...notes]
    .filter(note => note.is_active !== false)
    .sort((a, b) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())[0] ?? null;
}

/**
 * Derive a stable-enough browser device descriptor for v1 device sync.
 *
 * @param {{ userAgent?: string, platform?: string, maxTouchPoints?: number }} source
 * @returns {{ deviceKey: string, deviceName: string, deviceType: 'phone' | 'tablet' | 'laptop' | 'desktop' }}
 */
export function describeDevice(source = {}) {
  const userAgent = source.userAgent ?? '';
  const platform = source.platform ?? '';
  const text = `${userAgent} ${platform}`.toLowerCase();
  const isPhone = /iphone|android.*mobile|pixel/.test(text);
  const isTablet = /ipad|tablet/.test(text);
  const isChromeOs = /cros|chromebook/.test(text);
  const isMac = /mac/.test(text);
  const isWindows = /win/.test(text);

  let deviceType = 'desktop';
  if (isPhone) deviceType = 'phone';
  else if (isTablet) deviceType = 'tablet';
  else if (isChromeOs || isMac || isWindows) deviceType = 'laptop';

  let deviceName = 'Web Browser';
  if (/pixel 7/i.test(userAgent)) deviceName = 'Pixel 7 Pro';
  else if (/pixel/i.test(userAgent)) deviceName = 'Pixel Phone';
  else if (isChromeOs) deviceName = 'Chromebook';
  else if (isMac) deviceName = 'MacBook';
  else if (isWindows) deviceName = 'Windows Laptop';
  else if (isTablet) deviceName = 'Tablet';
  else if (isPhone) deviceName = 'Phone';

  return {
    deviceKey: _deviceKey(`${platform}|${userAgent}`),
    deviceName,
    deviceType,
  };
}

function _normalizeMapView(value) {
  if (value === 'cafes' || value === 'city') return 'cafes';
  return 'campus';
}

function _deviceKey(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return `web-${hash.toString(16)}`;
}
