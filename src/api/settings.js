/**
 * src/api/settings.js
 *
 * Supabase read/write operations for the persisted settings dashboard.
 * All writes are scoped by auth.uid() through RLS; callers send only settings
 * values and v1 device metadata.
 */

import { supabase } from './supabaseClient.js';

const PROFILE_SELECT = `
  user_id,
  nickname,
  avatar_url,
  cover_image_url,
  school_label,
  scholar_label,
  student_id,
  course_label,
  class_label,
  verified_student,
  study_vibes,
  phone_e164,
  phone_country,
  phone_verified_at
`;
const SETTINGS_SELECT = `
  user_id,
  default_map_view,
  preferred_study_environment,
  spot_availability_alerts,
  squad_updates,
  sms_enabled,
  preferred_campus_id,
  google_calendar_linked,
  created_at,
  updated_at
`;
const DEVICE_SELECT = 'id, user_id, device_key, device_name, device_type, last_seen_at, is_active, created_at, updated_at';
const SESSION_SELECT = 'id, user_id, title, starts_at, meet_url, is_next, created_at, updated_at';
const NOTE_SELECT = 'id, user_id, title, document_url, provider, is_active, created_at, updated_at';

/**
 * Fetch all persisted data needed by the settings dashboard.
 *
 * @returns {Promise<{ profile: object | null, settings: object | null, devices: object[], nextSession: object | null, sharedNote: object | null, error: string | null }>}
 */
export async function fetchSettingsDashboard() {
  const user = await _getCurrentUser();
  if (!user) {
    return { profile: null, settings: null, devices: [], nextSession: null, sharedNote: null, error: 'Not authenticated.' };
  }

  const [profile, settings] = await Promise.all([
    _ensureProfile(user),
    _ensureSettings(user.id),
  ]);
  await _ensureDefaultCards(user.id);

  const [devices, nextSession, sharedNote] = await Promise.all([
    fetchUserDevices(),
    fetchNextUserSession(),
    fetchActiveSharedNote(),
  ]);

  return { profile, settings, devices, nextSession, sharedNote, error: null };
}

/**
 * Update account profile fields.
 *
 * @param {{ nickname?: string, schoolLabel?: string, scholarLabel?: string, avatarUrl?: string | null, coverImageUrl?: string | null, studentId?: string, courseLabel?: string, classLabel?: string, studyVibes?: string[], phoneE164?: string | null, phoneCountry?: string | null }} updates
 * @returns {Promise<{ profile: object | null, error: string | null }>}
 */
export async function updateSettingsProfile(updates) {
  const user = await _getCurrentUser();
  if (!user) return { profile: null, error: 'Not authenticated.' };

  const row = {
    user_id: user.id,
  };
  if (updates.nickname !== undefined) row.nickname = updates.nickname;
  if (updates.schoolLabel !== undefined) row.school_label = updates.schoolLabel;
  if (updates.scholarLabel !== undefined) row.scholar_label = updates.scholarLabel;
  if (updates.avatarUrl !== undefined) row.avatar_url = updates.avatarUrl;
  if (updates.coverImageUrl !== undefined) row.cover_image_url = updates.coverImageUrl;
  if (updates.studentId !== undefined) row.student_id = updates.studentId || null;
  if (updates.courseLabel !== undefined) row.course_label = updates.courseLabel || null;
  if (updates.classLabel !== undefined) row.class_label = updates.classLabel || null;
  if (updates.phoneE164 !== undefined) row.phone_e164 = updates.phoneE164 || null;
  if (updates.phone_e164 !== undefined) row.phone_e164 = updates.phone_e164 || null;
  if (updates.phoneCountry !== undefined) row.phone_country = updates.phoneCountry || null;
  if (updates.phone_country !== undefined) row.phone_country = updates.phone_country || null;
  if (updates.studyVibes !== undefined) {
    row.study_vibes = Array.isArray(updates.studyVibes)
      ? updates.studyVibes.map((vibe) => String(vibe).trim()).filter(Boolean).slice(0, 6)
      : [];
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(row, { onConflict: 'user_id', ignoreDuplicates: false })
    .select(PROFILE_SELECT)
    .single();

  if (error) {
    console.error('[settings] updateSettingsProfile error:', error.message);
    return { profile: null, error: error.message };
  }

  return { profile: data, error: null };
}

/**
 * Update persisted user settings.
 *
 * @param {object} updates
 * @returns {Promise<{ settings: object | null, error: string | null }>}
 */
export async function updateUserSettings(updates) {
  const user = await _getCurrentUser();
  if (!user) return { settings: null, error: 'Not authenticated.' };

  const row = _settingsUpdateToRow(updates, user.id);
  const { data, error } = await supabase
    .from('user_settings')
    .upsert(row, { onConflict: 'user_id', ignoreDuplicates: false })
    .select(SETTINGS_SELECT)
    .single();

  if (error) {
    console.error('[settings] updateUserSettings error:', error.message);
    return { settings: null, error: error.message };
  }

  return { settings: data, error: null };
}

/**
 * Toggle persisted Google Calendar linked status.
 *
 * @param {boolean} linked
 * @returns {Promise<{ settings: object | null, error: string | null }>}
 */
export function updateGoogleCalendarLinked(linked) {
  return updateUserSettings({ googleCalendarLinked: linked });
}

/**
 * Upsert a browser/device heartbeat row.
 *
 * @param {{ deviceKey: string, deviceName: string, deviceType: string }} device
 * @returns {Promise<{ device: object | null, error: string | null }>}
 */
export async function upsertUserDevice(device) {
  const user = await _getCurrentUser();
  if (!user) return { device: null, error: 'Not authenticated.' };

  const { data, error } = await supabase
    .from('user_devices')
    .upsert({
      user_id: user.id,
      device_key: device.deviceKey,
      device_name: device.deviceName,
      device_type: device.deviceType,
      last_seen_at: new Date().toISOString(),
      is_active: true,
    }, { onConflict: 'user_id,device_key', ignoreDuplicates: false })
    .select(DEVICE_SELECT)
    .single();

  if (error) {
    console.error('[settings] upsertUserDevice error:', error.message);
    return { device: null, error: error.message };
  }

  return { device: data, error: null };
}

/**
 * Fetch the user's synced devices.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchUserDevices() {
  const { data, error } = await supabase
    .from('user_devices')
    .select(DEVICE_SELECT)
    .eq('is_active', true)
    .order('last_seen_at', { ascending: false })
    .limit(4);

  if (error) {
    console.error('[settings] fetchUserDevices error:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Fetch the user's active next session.
 *
 * @returns {Promise<object | null>}
 */
export async function fetchNextUserSession() {
  const { data, error } = await supabase
    .from('user_sessions')
    .select(SESSION_SELECT)
    .eq('is_next', true)
    .order('starts_at')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[settings] fetchNextUserSession error:', error.message);
    return null;
  }

  return data ?? null;
}

/**
 * Fetch the user's active shared note.
 *
 * @returns {Promise<object | null>}
 */
export async function fetchActiveSharedNote() {
  const { data, error } = await supabase
    .from('user_shared_notes')
    .select(NOTE_SELECT)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[settings] fetchActiveSharedNote error:', error.message);
    return null;
  }

  return data ?? null;
}

async function _getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('[settings] getUser error:', error.message);
    return null;
  }
  return user ?? null;
}

async function _ensureProfile(user) {
  const { data: existing, error: fetchError } = await supabase
    .from('user_profiles')
    .select(PROFILE_SELECT)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchError) {
    console.error('[settings] _ensureProfile fetch error:', fetchError.message);
    return null;
  }
  if (existing) return existing;

  const nickname = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Perch member';
  const avatarUrl = user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({
      user_id: user.id,
      nickname,
      avatar_url: avatarUrl,
      school_label: 'CTU Main Campus',
      scholar_label: 'Senior Scholar',
    }, { onConflict: 'user_id', ignoreDuplicates: false })
    .select(PROFILE_SELECT)
    .single();

  if (error) {
    console.error('[settings] _ensureProfile error:', error.message);
    return null;
  }

  return data;
}

async function _ensureSettings(userId) {
  const { data: existing, error: fetchError } = await supabase
    .from('user_settings')
    .select(SETTINGS_SELECT)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('[settings] _ensureSettings fetch error:', fetchError.message);
    return null;
  }
  if (existing) return existing;

  const { data, error } = await supabase
    .from('user_settings')
    .insert({ user_id: userId })
    .select(SETTINGS_SELECT)
    .single();

  if (error) {
    console.error('[settings] _ensureSettings error:', error.message);
    return null;
  }

  return data;
}

async function _ensureDefaultCards(userId) {
  const [session, note] = await Promise.all([
    fetchNextUserSession(),
    fetchActiveSharedNote(),
  ]);

  const inserts = [];
  if (!session) {
    const startsAt = new Date();
    startsAt.setHours(16, 30, 0, 0);
    inserts.push(
      supabase.from('user_sessions').insert({
        user_id: userId,
        title: 'Physics Final Prep',
        starts_at: startsAt.toISOString(),
        meet_url: '',
        is_next: true,
      }),
    );
  }
  if (!note) {
    inserts.push(
      supabase.from('user_shared_notes').insert({
        user_id: userId,
        title: 'Thermodynamics formulas for midterm',
        document_url: '',
        provider: 'google_workspace',
        is_active: true,
      }),
    );
  }

  const results = await Promise.all(inserts);
  for (const result of results) {
    if (result.error) {
      console.warn('[settings] default card insert failed:', result.error.message);
    }
  }
}

function _settingsUpdateToRow(updates, userId) {
  const row = { user_id: userId };
  if (updates.defaultMapView !== undefined) row.default_map_view = updates.defaultMapView;
  if (updates.default_map_view !== undefined) row.default_map_view = updates.default_map_view;
  if (updates.preferredStudyEnvironment !== undefined) row.preferred_study_environment = updates.preferredStudyEnvironment;
  if (updates.preferred_study_environment !== undefined) row.preferred_study_environment = updates.preferred_study_environment;
  if (updates.spotAvailabilityAlerts !== undefined) row.spot_availability_alerts = updates.spotAvailabilityAlerts;
  if (updates.spot_availability_alerts !== undefined) row.spot_availability_alerts = updates.spot_availability_alerts;
  if (updates.squadUpdates !== undefined) row.squad_updates = updates.squadUpdates;
  if (updates.squad_updates !== undefined) row.squad_updates = updates.squad_updates;
  if (updates.smsEnabled !== undefined) row.sms_enabled = updates.smsEnabled;
  if (updates.sms_enabled !== undefined) row.sms_enabled = updates.sms_enabled;
  if (updates.preferredCampusId !== undefined) row.preferred_campus_id = updates.preferredCampusId || null;
  if (updates.preferred_campus_id !== undefined) row.preferred_campus_id = updates.preferred_campus_id || null;
  if (updates.googleCalendarLinked !== undefined) row.google_calendar_linked = updates.googleCalendarLinked;
  if (updates.google_calendar_linked !== undefined) row.google_calendar_linked = updates.google_calendar_linked;
  return row;
}
