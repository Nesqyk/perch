/**
 * tests/unit/settingsApi.test.js
 *
 * Unit tests for settings profile/dashboard persistence paths.
 * Supabase is mocked so idempotent upserts and nickname fallbacks can be
 * verified without network or database access.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => {
  const state = {
    calls: [],
    profileRow: { user_id: 'uid-1', nickname: 'Existing Name' },
    profileNicknameRow: { nickname: 'Existing Name' },
    settingsRow: { user_id: 'uid-1', sms_enabled: false },
    sessionRow: { id: 'session-1', user_id: 'uid-1', is_next: true },
    noteRow: { id: 'note-1', user_id: 'uid-1', is_active: true },
  };

  function resultForMaybeSingle(table, builder) {
    if (table === 'user_profiles' && builder.selectedColumns === 'nickname') {
      return { data: state.profileNicknameRow, error: null };
    }
    if (table === 'user_profiles') return { data: state.profileRow, error: null };
    if (table === 'user_sessions') return { data: state.sessionRow, error: null };
    if (table === 'user_shared_notes') return { data: state.noteRow, error: null };
    return { data: null, error: null };
  }

  function resultForSingle(table, builder) {
    if (builder.writeRow) return { data: { ...builder.writeRow }, error: null };
    if (table === 'user_settings') return { data: state.settingsRow, error: null };
    if (table === 'user_profiles') return { data: state.profileRow, error: null };
    return { data: null, error: null };
  }

  function resultForList(table) {
    if (table === 'user_devices') return { data: [], error: null };
    return { data: [], error: null };
  }

  function createBuilder(table) {
    const builder = {
      selectedColumns: '',
      writeRow: null,
      select: vi.fn((columns) => {
        builder.selectedColumns = columns;
        state.calls.push({ table, method: 'select', columns });
        return builder;
      }),
      eq: vi.fn((column, value) => {
        state.calls.push({ table, method: 'eq', column, value });
        return builder;
      }),
      order: vi.fn((column, options) => {
        state.calls.push({ table, method: 'order', column, options });
        return builder;
      }),
      limit: vi.fn((count) => {
        state.calls.push({ table, method: 'limit', count });
        return builder;
      }),
      upsert: vi.fn((row, options) => {
        builder.writeRow = row;
        state.calls.push({ table, method: 'upsert', row, options });
        return builder;
      }),
      insert: vi.fn((row) => {
        builder.writeRow = row;
        state.calls.push({ table, method: 'insert', row });
        return builder;
      }),
      single: vi.fn(async () => resultForSingle(table, builder)),
      maybeSingle: vi.fn(async () => resultForMaybeSingle(table, builder)),
      then: (resolve, reject) => Promise.resolve(resultForList(table)).then(resolve, reject),
    };

    return builder;
  }

  return {
    state,
    from: vi.fn((table) => createBuilder(table)),
    getUser: vi.fn(),
  };
});

vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: {
    from: supabaseMock.from,
    auth: {
      getUser: supabaseMock.getUser,
    },
  },
}));

import { fetchSettingsDashboard, updateSettingsProfile } from '../../src/api/settings.js';

function mockUser(overrides = {}) {
  return {
    id: 'uid-1',
    email: 'student@example.com',
    user_metadata: {},
    ...overrides,
  };
}

function findCall(table, method) {
  return supabaseMock.state.calls.find((call) => call.table === table && call.method === method);
}

describe('settings API', () => {
  beforeEach(() => {
    supabaseMock.state.calls.length = 0;
    supabaseMock.state.profileRow = { user_id: 'uid-1', nickname: 'Existing Name' };
    supabaseMock.state.profileNicknameRow = { nickname: 'Existing Name' };
    supabaseMock.state.settingsRow = { user_id: 'uid-1', sms_enabled: false };
    supabaseMock.state.sessionRow = { id: 'session-1', user_id: 'uid-1', is_next: true };
    supabaseMock.state.noteRow = { id: 'note-1', user_id: 'uid-1', is_active: true };
    supabaseMock.from.mockClear();
    supabaseMock.getUser.mockReset();
    supabaseMock.getUser.mockResolvedValue({ data: { user: mockUser() }, error: null });
  });

  it('ensures user settings with an idempotent upsert', async () => {
    const result = await fetchSettingsDashboard();
    const upsertCall = findCall('user_settings', 'upsert');
    const insertCall = findCall('user_settings', 'insert');

    expect(result.error).toBeNull();
    expect(upsertCall).toMatchObject({
      row: { user_id: 'uid-1' },
      options: { onConflict: 'user_id', ignoreDuplicates: false },
    });
    expect(insertCall).toBeUndefined();
  });

  it('uses an existing nickname fallback for partial profile updates', async () => {
    await updateSettingsProfile({ phoneE164: '+639171234567' });
    const upsertCall = findCall('user_profiles', 'upsert');

    expect(upsertCall.row).toMatchObject({
      user_id: 'uid-1',
      nickname: 'Existing Name',
      phone_e164: '+639171234567',
    });
  });

  it('preserves explicit nickname updates', async () => {
    await updateSettingsProfile({ nickname: '  Ty  ' });
    const upsertCall = findCall('user_profiles', 'upsert');

    expect(upsertCall.row).toMatchObject({
      user_id: 'uid-1',
      nickname: 'Ty',
    });
  });

  it('falls back to auth metadata when no stored nickname exists', async () => {
    supabaseMock.state.profileNicknameRow = null;
    supabaseMock.getUser.mockResolvedValue({
      data: { user: mockUser({ user_metadata: { full_name: 'Metadata Name' } }) },
      error: null,
    });

    await updateSettingsProfile({ phoneE164: '+639171234567' });
    const upsertCall = findCall('user_profiles', 'upsert');

    expect(upsertCall.row.nickname).toBe('Metadata Name');
  });
});
