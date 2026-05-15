/**
 * tests/unit/authOwnedMapActions.test.js
 *
 * Verifies auth-owned map write payloads and the report failure path.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertMock = vi.fn();
const selectMock = vi.fn();
const singleMock = vi.fn();
const getUserMock = vi.fn();

vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
    },
    from: vi.fn(() => ({
      insert: insertMock,
      select: selectMock,
      single: singleMock,
    })),
  },
}));

describe('auth-owned claim and correction writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    insertMock.mockReturnThis();
    selectMock.mockReturnThis();
    singleMock.mockResolvedValue({ data: { id: 'row-1' }, error: null });
  });

  it('createClaim inserts the authenticated user_id', async () => {
    const { createClaim } = await import('../../src/api/claims.js');

    await createClaim({
      spotId: 'spot-1',
      groupSizeKey: 'small',
      groupSizeMin: 2,
      groupSizeMax: 5,
    });

    expect(insertMock).toHaveBeenCalledWith({
      spot_id: 'spot-1',
      user_id: 'user-1',
      group_size_key: 'small',
      group_size_min: 2,
      group_size_max: 5,
    });
  });

  it('submitCorrection inserts user_id and never sends session_id', async () => {
    const { submitCorrection } = await import('../../src/api/corrections.js');

    await submitCorrection({ spotId: 'spot-1', reason: 'overcrowded' });

    const payload = insertMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      spot_id: 'spot-1',
      user_id: 'user-1',
      reason: 'overcrowded',
    });
    expect(payload).not.toHaveProperty('session_id');
  });
});

describe('report flow failure handling', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('does not dispatch CORRECTION_FILED when the DB write fails', async () => {
    let reportHandler = null;
    const dispatch = vi.fn();

    vi.doMock('../../src/core/events.js', () => ({
      EVENTS: {
        UI_REPORT_REQUESTED: 'ui:reportRequested',
        UI_LOGIN_REQUESTED: 'ui:loginRequested',
      },
      on: vi.fn((_event, handler) => { reportHandler = handler; }),
      emit: vi.fn(),
    }));

    vi.doMock('../../src/core/store.js', () => ({
      dispatch,
      getState: vi.fn(() => ({ currentUser: { id: 'user-1' } })),
    }));

    vi.doMock('../../src/api/corrections.js', () => ({
      submitCorrection: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'new row violates row-level security policy' },
      }),
    }));

    vi.doMock('../../src/ui/toast.js', () => ({
      showToast: vi.fn(),
    }));

    const { initReportFull } = await import('../../src/features/reportFull.js');
    initReportFull();

    await reportHandler({
      detail: {
        spotId: 'spot-1',
        reason: null,
        reasonProvided: true,
      },
    });

    expect(dispatch).not.toHaveBeenCalledWith('CORRECTION_FILED', { spotId: 'spot-1' });
  });
});
