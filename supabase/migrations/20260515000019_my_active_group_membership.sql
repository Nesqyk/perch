-- Load the signed-in user's most recent squad membership after app reload.
-- Keeps group SELECT policies member-scoped while giving the client a narrow
-- bootstrap surface for the current user's own membership.

create or replace function public.my_active_group_membership()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_member public.group_members%rowtype;
  v_group public.groups%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_member
  from public.group_members
  where user_id = v_actor
  order by joined_at desc nulls last
  limit 1;

  if v_member.id is null then
    return jsonb_build_object('group', null, 'member', null);
  end if;

  select *
  into v_group
  from public.groups
  where id = v_member.group_id
  limit 1;

  if v_group.id is null then
    return jsonb_build_object('group', null, 'member', null);
  end if;

  return jsonb_build_object(
    'group', to_jsonb(v_group),
    'member', to_jsonb(v_member)
  );
end;
$$;

create or replace function public.leave_my_group(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  delete from public.group_members
  where group_id = p_group_id
    and user_id = v_actor;

  return true;
end;
$$;

revoke all on function public.my_active_group_membership() from public;
revoke all on function public.my_active_group_membership() from anon;
grant execute on function public.my_active_group_membership() to authenticated;

revoke all on function public.leave_my_group(uuid) from public;
revoke all on function public.leave_my_group(uuid) from anon;
grant execute on function public.leave_my_group(uuid) to authenticated;
