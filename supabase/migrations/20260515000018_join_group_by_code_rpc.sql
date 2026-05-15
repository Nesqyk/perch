-- Join squads by code without requiring pre-membership SELECT access to groups.
-- This keeps group RLS member-scoped while allowing the intended invite-code flow.

create or replace function public.join_group_by_code(
  p_code text,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_code text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  v_group public.groups%rowtype;
  v_member public.group_members%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if length(v_code) <> 4 then
    raise exception 'Group not found';
  end if;

  select *
  into v_group
  from public.groups
  where upper(code) = v_code
  limit 1;

  if v_group.id is null then
    raise exception 'Group not found';
  end if;

  insert into public.group_members (
    group_id,
    user_id,
    display_name,
    role
  )
  values (
    v_group.id,
    v_actor,
    nullif(trim(coalesce(p_display_name, '')), ''),
    'member'
  )
  on conflict (group_id, user_id)
  do update set
    display_name = coalesce(excluded.display_name, public.group_members.display_name)
  returning * into v_member;

  return jsonb_build_object(
    'group', to_jsonb(v_group),
    'member', to_jsonb(v_member)
  );
end;
$$;

revoke all on function public.join_group_by_code(text, text) from public;
revoke all on function public.join_group_by_code(text, text) from anon;
grant execute on function public.join_group_by_code(text, text) to authenticated;
