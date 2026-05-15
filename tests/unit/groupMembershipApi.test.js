import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());

function builder(overrides = {}) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    upsert: vi.fn(),
    ...overrides,
  };
}

vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
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
    rpcMock.mockResolvedValue({ data: null, error: { message: 'RPC not mocked' } });
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
    rpcMock.mockResolvedValue({
      data: { group, member },
      error: null,
    });

    const { joinGroup } = await import('../../src/api/groups.js');
    const result = await joinGroup({ code: ' ab-cd ', displayName: 'Ty' });

    expect(result).toEqual({ group, member, error: null });
    expect(rpcMock).toHaveBeenCalledWith('join_group_by_code', {
      p_code: 'ABCD',
      p_display_name: 'Ty',
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('fetches my active squad membership through the bootstrap RPC and loads its dashboard', async () => {
    const group = { id: 'group-3', code: 'EFGH' };
    const member = { id: 'member-3', group_id: 'group-3', user_id: 'user-1', role: 'member' };
    const members = [member];
    const groupFetch = builder({
      single: vi.fn().mockResolvedValue({ data: group, error: null }),
    });
    const membersFetch = builder();
    membersFetch.order
      .mockReturnValueOnce(membersFetch)
      .mockResolvedValueOnce({ data: members, error: null });
    const meetupFetch = builder({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const perkFetch = builder({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    rpcMock.mockResolvedValue({
      data: { group, member },
      error: null,
    });

    let membersCall = 0;
    fromMock.mockImplementation((table) => {
      if (table === 'groups') return groupFetch;
      if (table === 'group_members') {
        membersCall += 1;
        return membersFetch;
      }
      if (table === 'group_meetups') return meetupFetch;
      if (table === 'group_perks') return perkFetch;
      throw new Error(`unexpected table: ${table}`);
    });

    const { fetchMyActiveGroupMembership } = await import('../../src/api/groups.js');
    const result = await fetchMyActiveGroupMembership();

    expect(rpcMock).toHaveBeenCalledWith('my_active_group_membership');
    expect(result.group).toEqual(group);
    expect(result.member).toEqual(member);
    expect(result.dashboard?.members).toEqual([{ ...member, avatar_image_url: '' }]);
    expect(result.error).toBeNull();
  });

  it('persistently leaves my current squad through RPC', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });

    const { leaveMyGroup } = await import('../../src/api/groups.js');
    const result = await leaveMyGroup('group-4');

    expect(result).toEqual({ error: null });
    expect(rpcMock).toHaveBeenCalledWith('leave_my_group', {
      p_group_id: 'group-4',
    });
  });
});
