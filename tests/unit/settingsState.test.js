import { describe, expect, it } from 'vitest';

import {
  describeDevice,
  mapSettingsViewToViewMode,
  normalizeSettings,
  selectActiveSharedNote,
  selectNextSession,
} from '../../src/state/settingsState.js';

describe('settingsState', () => {
  it('normalizes settings rows with local fallbacks', () => {
    expect(normalizeSettings(null, {
      defaultView: 'city',
      preferredCampusId: 'campus-1',
      notifyClaimExpiry: false,
      notifyGroupActivity: true,
    })).toMatchObject({
      defaultMapView: 'cafes',
      preferredCampusId: 'campus-1',
      spotAvailabilityAlerts: false,
      squadUpdates: true,
    });

    expect(normalizeSettings({
      default_map_view: 'campus',
      preferred_study_environment: 'moderate',
      spot_availability_alerts: true,
      squad_updates: false,
      preferred_campus_id: 'campus-2',
      google_calendar_linked: true,
    })).toMatchObject({
      defaultMapView: 'campus',
      preferredStudyEnvironment: 'moderate',
      preferredCampusId: 'campus-2',
      googleCalendarLinked: true,
    });
  });

  it('maps settings view values to existing app view modes', () => {
    expect(mapSettingsViewToViewMode('campus')).toBe('campus');
    expect(mapSettingsViewToViewMode('cafes')).toBe('city');
    expect(mapSettingsViewToViewMode('city')).toBe('city');
  });

  it('selects active next session and note rows', () => {
    expect(selectNextSession([
      { id: 'later', starts_at: '2026-05-12T10:00:00.000Z', is_next: true },
      { id: 'inactive', starts_at: '2026-05-11T08:00:00.000Z', is_next: false },
      { id: 'soon', starts_at: '2026-05-12T09:00:00.000Z', is_next: true },
    ])?.id).toBe('soon');

    expect(selectActiveSharedNote([
      { id: 'old', updated_at: '2026-05-10T00:00:00.000Z', is_active: true },
      { id: 'hidden', updated_at: '2026-05-12T00:00:00.000Z', is_active: false },
      { id: 'new', updated_at: '2026-05-11T00:00:00.000Z', is_active: true },
    ])?.id).toBe('new');
  });

  it('describes common browser devices', () => {
    expect(describeDevice({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit Chrome Mobile',
      platform: 'Linux armv8',
    })).toMatchObject({
      deviceName: 'Pixel 7 Pro',
      deviceType: 'phone',
    });

    expect(describeDevice({
      userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit Chrome',
      platform: 'Linux x86_64',
    })).toMatchObject({
      deviceName: 'Chromebook',
      deviceType: 'laptop',
    });
  });
});
