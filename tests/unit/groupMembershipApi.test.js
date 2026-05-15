import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());

function builder(overrides = {}) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
    upsert: vi.fn(),
    ...overrides,
  };
}

vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: {
    from: fromMock,
    auth: {
      getUser: getUserMock,
    },
  },
}));

vi.mock('../../src/api/groupPins.js', () => ({
  fetchGroupPins: vi.fn(async () => []),
  fetchGroupPinJoins: vi.fn(async () => []),
}));

vi.mock('../../src/api/spots.js', () => ({
  signSpotImageUrl: vi.fn(async () => ''),
}));

describe('group membership writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
  });

  it('creates a squad, upserts membership, then fetches the member row separately', async () => {
    const group = { id: 'group-1', name: 'Study Crew' };
    const member = { id: 'member-1', group_id: 'group-1', user_id: 'user-1', role: 'mayor' };
    const groupInsert = builder({
      single: vi.fn().mockResolvedValue({ data: group, error: null }),
    });
    const memberUpsert = builder({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
    const memberFetch = builder({
      single: vi.fn().mockResolvedValue({ data: member, error: null }),
    });

    let groupMemberCall = 0;
    fromMock.mockImplementation((table) => {
      if (table === 'groups') return groupInsert;
      if (table === 'group_members') {
        groupMemberCall += 1;
        return groupMemberCall === 1 ? memberUpsert : memberFetch;
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const { createGroup } = await import('../../src/api/groups.js');
    const result = await createGroup({ name: 'Study Crew', displayName: 'Ty', context: 'campus', campusId: 'campus-1' });

    expect(result).toEqual({ group, member, error: null });
    expect(memberUpsert.upsert).toHaveBeenCalledWith(
      { group_id: 'group-1', display_name: 'Ty', role: 'mayor', user_id: 'user-1' },
      { onConflict: 'group_id,user_id', ignoreDuplicates: false },
    );
    expect(memberFetch.select).toHaveBeenCalled();
    expect(memberFetch.eq).toHaveBeenNthCalledWith(1, 'group_id', 'group-1');
    expect(memberFetch.eq).toHaveBeenNthCalledWith(2, 'user_id', 'user-1');
  });

  it('joins an existing squad by code and refreshes the member row after upsert', async () => {
    const group = { id: 'group-2', code: 'ABCD' };
    const member = { id: 'member-2', group_id: 'group-2', user_id: 'user-1', role: 'member' };
    const groupFetch = builder({
      single: vi.fn().mockResolvedValue({ data: group, error: null }),
    });
    const memberUpsert = builder({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
    const memberFetch = builder({
      single: vi.fn().mockResolvedValue({ data: member, error: null }),
    });

    let groupMemberCall = 0;
    fromMock.mockImplementation((table) => {
      if (table === 'groups') return groupFetch;
      if (table === 'group_members') {
        groupMemberCall += 1;
        return groupMemberCall === 1 ? memberUpsert : memberFetch;
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const { joinGroup } = await import('../../src/api/groups.js');
    const result = await joinGroup({ code: 'abcd', displayName: 'Ty' });

    expect(groupFetch.eq).toHaveBeenCalledWith('code', 'ABCD');
    expect(result).toEqual({ group, member, error: null });
    expect(memberUpsert.upsert).toHaveBeenCalled();
    expect(memberFetch.eq).toHaveBeenNthCalledWith(1, 'group_id', 'group-2');
    expect(memberFetch.eq).toHaveBeenNthCalledWith(2, 'user_id', 'user-1');
  });
});
