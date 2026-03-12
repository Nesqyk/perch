-- Migration 007: Groups, group pins, and social mechanics
-- Tables: groups, group_members, group_pins, group_pin_joins, group_confirmations

-- ─── groups ──────────────────────────────────────────────────────────────────
-- A private squad that shares a map layer and pin history.

create table if not exists public.groups (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  code        text        not null unique,               -- 4-char join code e.g. 'K7F2'
  color       text        not null default '#3b82f6',    -- group hex color for pins
  context     text        not null default 'campus'
                          check (context in ('campus', 'city')),
  created_at  timestamptz not null default now()
);

comment on table public.groups is
  'Private squads. Members join via a 4-character code or share link.';

create index if not exists groups_code_idx on public.groups (code);

-- ─── group_members ────────────────────────────────────────────────────────────
-- Anonymous membership — identified by session_id, no user account needed.

create table if not exists public.group_members (
  id            uuid        primary key default gen_random_uuid(),
  group_id      uuid        not null references public.groups (id) on delete cascade,
  session_id    text        not null,
  display_name  text        not null,
  scout_points  integer     not null default 0,
  joined_at     timestamptz not null default now(),
  constraint    group_members_unique unique (group_id, session_id)
);

comment on table public.group_members is
  'Anonymous group members. One row per session per group.';

create index if not exists group_members_group_idx   on public.group_members (group_id);
create index if not exists group_members_session_idx on public.group_members (session_id);

-- ─── group_pins ───────────────────────────────────────────────────────────────
-- A pin dropped by a group member — either a live beacon or a saved spot.

create table if not exists public.group_pins (
  id           uuid        primary key default gen_random_uuid(),
  group_id     uuid        not null references public.groups (id) on delete cascade,
  spot_id      uuid        not null references public.spots (id) on delete cascade,
  session_id   text        not null,
  pin_type     text        not null default 'live'
                           check (pin_type in ('live', 'saved')),
  vibe         text        check (vibe in ('quiet', 'chill', 'loud', 'cramped')),
  note         text,
  custom_name  text,
  pinned_at    timestamptz not null default now(),
  expires_at   timestamptz,                             -- null for saved pins
  ended_at     timestamptz                              -- set when pinner manually ends live pin
);

comment on table public.group_pins is
  'Pins dropped by group members. live = active beacon, saved = persistent memory.';

create index if not exists group_pins_group_idx on public.group_pins (group_id);
create index if not exists group_pins_spot_idx  on public.group_pins (spot_id);
create index if not exists group_pins_type_idx  on public.group_pins (group_id, pin_type);

-- ─── group_pin_joins ─────────────────────────────────────────────────────────
-- Tracks who is heading to or has arrived at a live group pin.

create table if not exists public.group_pin_joins (
  id           uuid        primary key default gen_random_uuid(),
  group_pin_id uuid        not null references public.group_pins (id) on delete cascade,
  session_id   text        not null,
  status       text        not null default 'heading'
                           check (status in ('heading', 'arrived', 'left')),
  joined_at    timestamptz not null default now(),
  constraint   group_pin_joins_unique unique (group_pin_id, session_id)
);

comment on table public.group_pin_joins is
  'Members heading to or at a live group pin. Powers the transit dot mechanic.';

create index if not exists group_pin_joins_pin_idx     on public.group_pin_joins (group_pin_id);
create index if not exists group_pin_joins_session_idx on public.group_pin_joins (session_id);

-- ─── group_confirmations ─────────────────────────────────────────────────────
-- Vibe Confirm taps — passive one-tap status signals from group members.

create table if not exists public.group_confirmations (
  id           uuid        primary key default gen_random_uuid(),
  group_pin_id uuid        not null references public.group_pins (id) on delete cascade,
  session_id   text        not null,
  vibe_status  text        not null
                           check (vibe_status in ('free', 'filling', 'full')),
  confirmed_at timestamptz not null default now()
);

comment on table public.group_confirmations is
  'One-tap Vibe Confirm signals about a live pin''s current state.';

create index if not exists group_confirmations_pin_idx on public.group_confirmations (group_pin_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.groups              enable row level security;
alter table public.group_members       enable row level security;
alter table public.group_pins          enable row level security;
alter table public.group_pin_joins     enable row level security;
alter table public.group_confirmations enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'groups' and policyname = 'groups: public read') then
    create policy "groups: public read" on public.groups for select to anon using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'groups' and policyname = 'groups: anyone can insert') then
    create policy "groups: anyone can insert" on public.groups for insert to anon with check (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'group_members' and policyname = 'group_members: public read') then
    create policy "group_members: public read" on public.group_members for select to anon using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'group_members' and policyname = 'group_members: anyone can insert') then
    create policy "group_members: anyone can insert" on public.group_members for insert to anon with check (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'group_members' and policyname = 'group_members: owner can update') then
    create policy "group_members: owner can update"
      on public.group_members for update to anon
      using    (session_id = current_setting('request.headers', true)::json->>'x-perch-session')
      with check (session_id = current_setting('request.headers', true)::json->>'x-perch-session');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'group_pins' and policyname = 'group_pins: public read') then
    create policy "group_pins: public read" on public.group_pins for select to anon using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'group_pins' and policyname = 'group_pins: anyone can insert') then
    create policy "group_pins: anyone can insert" on public.group_pins for insert to anon with check (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'group_pins' and policyname = 'group_pins: owner can update') then
    create policy "group_pins: owner can update"
      on public.group_pins for update to anon
      using    (session_id = current_setting('request.headers', true)::json->>'x-perch-session')
      with check (session_id = current_setting('request.headers', true)::json->>'x-perch-session');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'group_pin_joins' and policyname = 'group_pin_joins: public read') then
    create policy "group_pin_joins: public read" on public.group_pin_joins for select to anon using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'group_pin_joins' and policyname = 'group_pin_joins: anyone can insert') then
    create policy "group_pin_joins: anyone can insert" on public.group_pin_joins for insert to anon with check (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'group_pin_joins' and policyname = 'group_pin_joins: owner can update') then
    create policy "group_pin_joins: owner can update"
      on public.group_pin_joins for update to anon
      using    (session_id = current_setting('request.headers', true)::json->>'x-perch-session')
      with check (session_id = current_setting('request.headers', true)::json->>'x-perch-session');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'group_confirmations' and policyname = 'group_confirmations: public read') then
    create policy "group_confirmations: public read" on public.group_confirmations for select to anon using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'group_confirmations' and policyname = 'group_confirmations: anyone can insert') then
    create policy "group_confirmations: anyone can insert" on public.group_confirmations for insert to anon with check (true);
  end if;
end $$;

-- ─── Scout points trigger ─────────────────────────────────────────────────────
-- +1 scout point to the pinner when another member joins their live pin.

create or replace function public.award_scout_point_on_join()
returns trigger language plpgsql as $$
declare
  v_pinner_session text;
  v_group_id       uuid;
begin
  select gp.session_id, gp.group_id
    into v_pinner_session, v_group_id
    from public.group_pins gp
   where gp.id       = new.group_pin_id
     and gp.pin_type = 'live'
     and gp.ended_at is null;

  if found and v_pinner_session != new.session_id then
    update public.group_members
       set scout_points = scout_points + 1
     where group_id   = v_group_id
       and session_id = v_pinner_session;
  end if;

  return new;
end;
$$;

drop trigger if exists group_pin_joins_award_scout on public.group_pin_joins;
create trigger group_pin_joins_award_scout
  after insert on public.group_pin_joins
  for each row execute function public.award_scout_point_on_join();

-- ─── Auto-expire live group pins ──────────────────────────────────────────────

select cron.schedule(
  'expire-group-pins',
  '*/5 * * * *',
  $$
    update public.group_pins
       set ended_at = now()
     where pin_type   = 'live'
       and ended_at   is null
       and expires_at is not null
       and expires_at < now();
  $$
) where not exists (
  select 1 from cron.job where jobname = 'expire-group-pins'
);
