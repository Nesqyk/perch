-- Migration: Squad dashboard persistence
-- Adds durable metadata for the richer #/group squad dashboard.

-- ─── Groups: dashboard metadata ─────────────────────────────────────────────

alter table public.groups
  add column if not exists campus_id uuid references public.campuses (id) on delete set null,
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists purpose text not null default 'Studying for Finals',
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists current_spot_id uuid references public.spots (id) on delete set null,
  add column if not exists progress_current integer not null default 24,
  add column if not exists progress_target integer not null default 50;

create index if not exists groups_created_by_idx on public.groups (created_by);
create index if not exists groups_current_spot_idx on public.groups (current_spot_id);
create index if not exists groups_campus_idx on public.groups (campus_id);

update public.groups
   set created_by = coalesce(created_by, auth.uid())
 where created_by is null;

-- ─── Group members: roster metadata ─────────────────────────────────────────

alter table public.group_members
  add column if not exists session_id text,
  add column if not exists display_name text,
  add column if not exists scout_points integer not null default 0,
  add column if not exists joined_at timestamptz not null default now(),
  add column if not exists user_id uuid references auth.users (id) on delete cascade default auth.uid(),
  add column if not exists role text not null default 'member'
    check (role in ('mayor', 'member')),
  add column if not exists focus_mode text not null default 'Optimizing SQL',
  add column if not exists availability_status text not null default 'available'
    check (availability_status in ('available', 'busy')),
  add column if not exists avatar_url text;

-- RLS helpers are defined before any group_members UPDATE because a previous
-- failed run may already have installed triggers that call can_manage_group().
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.group_members gm
     where gm.group_id = p_group_id
       and gm.user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.groups g
      left join public.group_members gm
        on gm.group_id = g.id
       and gm.user_id = auth.uid()
     where g.id = p_group_id
       and (
         g.created_by = auth.uid()
         or gm.role = 'mayor'
       )
  );
$$;

alter table public.group_members
  alter column session_id set default coalesce(
    auth.uid()::text,
    current_setting('request.headers', true)::json ->> 'x-perch-session'
  );

update public.group_members
   set session_id = coalesce(session_id, user_id::text, gen_random_uuid()::text),
       display_name = coalesce(display_name, 'Perch member')
 where session_id is null
    or display_name is null;

alter table public.group_members
  alter column session_id set not null,
  alter column display_name set not null;

do $$ begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'group_members_group_user_unique'
       and conrelid = 'public.group_members'::regclass
  ) then
    alter table public.group_members
      add constraint group_members_group_user_unique unique (group_id, user_id);
  end if;
end $$;

create index if not exists group_members_user_idx on public.group_members (user_id);
create index if not exists group_members_role_idx on public.group_members (group_id, role);
create index if not exists group_members_status_idx on public.group_members (group_id, availability_status);

alter table public.group_pins
  add column if not exists user_id uuid references auth.users (id) on delete cascade default auth.uid(),
  add column if not exists session_id text;

alter table public.group_pins
  alter column session_id set default coalesce(
    auth.uid()::text,
    current_setting('request.headers', true)::json ->> 'x-perch-session'
  );

update public.group_pins
   set session_id = coalesce(session_id, user_id::text, gen_random_uuid()::text)
 where session_id is null;

alter table public.group_pins
  alter column session_id set not null;

alter table public.group_pin_joins
  add column if not exists user_id uuid references auth.users (id) on delete cascade default auth.uid(),
  add column if not exists session_id text;

alter table public.group_pin_joins
  alter column session_id set default coalesce(
    auth.uid()::text,
    current_setting('request.headers', true)::json ->> 'x-perch-session'
  );

update public.group_pin_joins
   set session_id = coalesce(session_id, user_id::text, gen_random_uuid()::text)
 where session_id is null;

alter table public.group_pin_joins
  alter column session_id set not null;

alter table public.group_confirmations
  add column if not exists user_id uuid references auth.users (id) on delete cascade default auth.uid(),
  add column if not exists session_id text;

alter table public.group_confirmations
  alter column session_id set default coalesce(
    auth.uid()::text,
    current_setting('request.headers', true)::json ->> 'x-perch-session'
  );

update public.group_confirmations
   set session_id = coalesce(session_id, user_id::text, gen_random_uuid()::text)
 where session_id is null;

alter table public.group_confirmations
  alter column session_id set not null;

do $$ begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'group_pin_joins_group_pin_user_unique'
       and conrelid = 'public.group_pin_joins'::regclass
  ) then
    alter table public.group_pin_joins
      add constraint group_pin_joins_group_pin_user_unique unique (group_pin_id, user_id);
  end if;
end $$;

create index if not exists group_pins_user_idx on public.group_pins (user_id);
create index if not exists group_pin_joins_user_idx on public.group_pin_joins (user_id);
create index if not exists group_confirmations_user_idx on public.group_confirmations (user_id);

create or replace function public.enforce_group_member_presence_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.user_id and not public.can_manage_group(old.group_id) then
    if new.group_id is distinct from old.group_id
      or new.user_id is distinct from old.user_id
      or new.session_id is distinct from old.session_id
      or new.display_name is distinct from old.display_name
      or new.scout_points is distinct from old.scout_points
      or new.role is distinct from old.role
      or new.avatar_url is distinct from old.avatar_url
      or new.joined_at is distinct from old.joined_at then
      raise exception 'members may only update focus and availability';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists group_members_presence_guard on public.group_members;
create trigger group_members_presence_guard
  before update on public.group_members
  for each row execute function public.enforce_group_member_presence_update();

-- Give each existing group one mayor if none exists yet.
with ranked as (
  select
    id,
    row_number() over (partition by group_id order by joined_at asc) as rn
  from public.group_members
)
update public.group_members gm
   set role = 'mayor'
  from ranked r
 where gm.id = r.id
   and r.rn = 1
   and not exists (
     select 1
       from public.group_members existing
      where existing.group_id = gm.group_id
        and existing.role = 'mayor'
   );

-- ─── Meetups ────────────────────────────────────────────────────────────────

create table if not exists public.group_meetups (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null default 'Finals Sprint Session',
  starts_at timestamptz not null default (now() + interval '1 day'),
  location_label text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists group_meetups_group_idx on public.group_meetups (group_id, starts_at);

-- ─── Perks ──────────────────────────────────────────────────────────────────

create table if not exists public.group_perks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null default '15% Discount on Brews',
  code text not null default 'PERCH-BARKADA-15',
  is_redeemed boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists group_perks_group_idx on public.group_perks (group_id, is_redeemed);

-- ─── Updated-at trigger reuse ───────────────────────────────────────────────

drop trigger if exists group_meetups_updated_at on public.group_meetups;
create trigger group_meetups_updated_at
  before update on public.group_meetups
  for each row execute function public.set_updated_at();

drop trigger if exists group_perks_updated_at on public.group_perks;
create trigger group_perks_updated_at
  before update on public.group_perks
  for each row execute function public.set_updated_at();

alter table public.group_meetups enable row level security;
alter table public.group_perks enable row level security;

-- Existing tables get authenticated policies in addition to older anon ones.
drop policy if exists "groups: members read" on public.groups;
create policy "groups: members read"
  on public.groups for select
  to authenticated
  using (public.is_group_member(id) or created_by = auth.uid());

drop policy if exists "groups: authenticated insert" on public.groups;
create policy "groups: authenticated insert"
  on public.groups for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "groups: manager update" on public.groups;
create policy "groups: manager update"
  on public.groups for update
  to authenticated
  using (public.can_manage_group(id))
  with check (public.can_manage_group(id));

drop policy if exists "group_members: members read authenticated" on public.group_members;
create policy "group_members: members read authenticated"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "group_members: authenticated insert self" on public.group_members;
create policy "group_members: authenticated insert self"
  on public.group_members for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "group_members: self presence update" on public.group_members;
create policy "group_members: self presence update"
  on public.group_members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "group_pins: members read authenticated" on public.group_pins;
create policy "group_pins: members read authenticated"
  on public.group_pins for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "group_pins: members insert self" on public.group_pins;
create policy "group_pins: members insert self"
  on public.group_pins for insert
  to authenticated
  with check (public.is_group_member(group_id) and user_id = auth.uid());

drop policy if exists "group_pins: owner update authenticated" on public.group_pins;
create policy "group_pins: owner update authenticated"
  on public.group_pins for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "group_pin_joins: members read authenticated" on public.group_pin_joins;
create policy "group_pin_joins: members read authenticated"
  on public.group_pin_joins for select
  to authenticated
  using (
    exists (
      select 1
        from public.group_pins gp
       where gp.id = group_pin_id
         and public.is_group_member(gp.group_id)
    )
  );

drop policy if exists "group_pin_joins: members upsert self" on public.group_pin_joins;
create policy "group_pin_joins: members upsert self"
  on public.group_pin_joins for all
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
        from public.group_pins gp
       where gp.id = group_pin_id
         and public.is_group_member(gp.group_id)
    )
  );

drop policy if exists "group_confirmations: members read authenticated" on public.group_confirmations;
create policy "group_confirmations: members read authenticated"
  on public.group_confirmations for select
  to authenticated
  using (
    exists (
      select 1
        from public.group_pins gp
       where gp.id = group_pin_id
         and public.is_group_member(gp.group_id)
    )
  );

drop policy if exists "group_confirmations: members insert self" on public.group_confirmations;
create policy "group_confirmations: members insert self"
  on public.group_confirmations for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
        from public.group_pins gp
       where gp.id = group_pin_id
         and public.is_group_member(gp.group_id)
    )
  );

drop policy if exists "group_meetups: members read" on public.group_meetups;
create policy "group_meetups: members read"
  on public.group_meetups for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "group_meetups: manager write" on public.group_meetups;
create policy "group_meetups: manager write"
  on public.group_meetups for all
  to authenticated
  using (public.can_manage_group(group_id))
  with check (public.can_manage_group(group_id));

drop policy if exists "group_perks: members read" on public.group_perks;
create policy "group_perks: members read"
  on public.group_perks for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "group_perks: manager write" on public.group_perks;
create policy "group_perks: manager write"
  on public.group_perks for all
  to authenticated
  using (public.can_manage_group(group_id))
  with check (public.can_manage_group(group_id));
