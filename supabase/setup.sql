-- =============================================================================
-- Perch — Full DB Setup Script
-- Paste this entire file into: Supabase Dashboard → SQL Editor → Run
--
-- Safe to run multiple times — all statements use IF NOT EXISTS / ON CONFLICT.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 002: claims, corrections, schedule_entries
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.claims (
  id              uuid        primary key default gen_random_uuid(),
  spot_id         uuid        not null references public.spots (id) on delete cascade,
  session_id      text        not null,
  group_size_key  text        not null
                              check (group_size_key in ('solo', 'small', 'medium', 'large')),
  group_size_min  integer     not null default 1,
  group_size_max  integer,
  claimed_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '30 minutes'),
  cancelled_at    timestamptz
);

create index if not exists claims_spot_id_idx    on public.claims (spot_id);
create index if not exists claims_session_id_idx on public.claims (session_id);
create index if not exists claims_expires_at_idx on public.claims (expires_at);

create table if not exists public.corrections (
  id            uuid        primary key default gen_random_uuid(),
  spot_id       uuid        not null references public.spots (id) on delete cascade,
  session_id    text        not null,
  reason        text        check (reason in ('locked', 'occupied', 'overcrowded', 'event', null)),
  corrected_at  timestamptz not null default now(),
  day_of_week   integer     not null check (day_of_week between 0 and 6),
  hour_of_day   integer     not null check (hour_of_day between 0 and 23)
);

create index if not exists corrections_spot_id_idx  on public.corrections (spot_id);
create index if not exists corrections_day_hour_idx on public.corrections (day_of_week, hour_of_day);

create table if not exists public.schedule_entries (
  id            uuid    primary key default gen_random_uuid(),
  spot_id       uuid    not null references public.spots (id) on delete cascade,
  subject_code  text,
  section       text,
  day_of_week   integer not null check (day_of_week between 0 and 6),
  start_time    time    not null,
  end_time      time    not null,
  constraint    valid_time_range check (end_time > start_time)
);

create index if not exists schedule_spot_day_idx on public.schedule_entries (spot_id, day_of_week);


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 003: spot_confidence table + refresh function
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.spot_confidence (
  spot_id      uuid          primary key references public.spots (id) on delete cascade,
  score        numeric(4, 3) not null default 0.5 check (score between 0.0 and 1.0),
  reason       text,
  valid_until  timestamptz   not null default (now() + interval '15 minutes'),
  updated_at   timestamptz   not null default now()
);

create or replace function public.seed_spot_confidence()
returns trigger language plpgsql as $$
begin
  insert into public.spot_confidence (spot_id, score, reason)
  values (new.id, 0.5, 'Initial — no data yet')
  on conflict (spot_id) do nothing;
  return new;
end;
$$;

drop trigger if exists spots_seed_confidence on public.spots;
create trigger spots_seed_confidence
  after insert on public.spots
  for each row execute function public.seed_spot_confidence();

create or replace function public.refresh_spot_confidence()
returns void language plpgsql as $$
declare
  spot_row         record;
  base_score       numeric;
  correction_count integer;
  final_score      numeric;
  reason_text      text;
  now_time         time;
  now_dow          integer;
begin
  now_time := localtime;
  now_dow  := extract(dow from now())::integer;

  for spot_row in select id from public.spots where is_active = true loop

    select count(*) into correction_count
    from public.schedule_entries
    where spot_id     = spot_row.id
      and day_of_week = now_dow
      and start_time  <= now_time
      and end_time    >  now_time;

    if correction_count > 0 then
      base_score  := 0.10;
      reason_text := 'Class in session';
    else
      base_score  := 0.80;
      reason_text := 'No class scheduled';
    end if;

    select count(*) into correction_count
    from public.corrections
    where spot_id      = spot_row.id
      and corrected_at >= now() - interval '2 hours';

    final_score := greatest(0.05, base_score - (correction_count * 0.15));

    if correction_count > 0 then
      reason_text := reason_text || '; ' || correction_count || ' recent report(s)';
    end if;

    insert into public.spot_confidence (spot_id, score, reason, valid_until, updated_at)
    values (
      spot_row.id,
      round(final_score::numeric, 3),
      reason_text,
      now() + interval '15 minutes',
      now()
    )
    on conflict (spot_id) do update set
      score       = excluded.score,
      reason      = excluded.reason,
      valid_until = excluded.valid_until,
      updated_at  = excluded.updated_at;

  end loop;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 004: RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.spots             enable row level security;
alter table public.spot_submissions  enable row level security;
alter table public.spot_confidence   enable row level security;
alter table public.claims            enable row level security;
alter table public.corrections       enable row level security;
alter table public.schedule_entries  enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'spots' and policyname = 'spots: public read'
  ) then
    create policy "spots: public read" on public.spots for select to anon using (is_active = true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'spot_confidence' and policyname = 'spot_confidence: public read'
  ) then
    create policy "spot_confidence: public read" on public.spot_confidence for select to anon using (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'spot_submissions' and policyname = 'spot_submissions: anyone can insert'
  ) then
    create policy "spot_submissions: anyone can insert" on public.spot_submissions for insert to anon with check (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'claims' and policyname = 'claims: public read'
  ) then
    create policy "claims: public read" on public.claims for select to anon using (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'claims' and policyname = 'claims: anyone can insert'
  ) then
    create policy "claims: anyone can insert" on public.claims for insert to anon with check (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'claims' and policyname = 'claims: owner can cancel'
  ) then
    create policy "claims: owner can cancel"
      on public.claims for update to anon
      using    (session_id = current_setting('request.headers', true)::json->>'x-perch-session')
      with check (session_id = current_setting('request.headers', true)::json->>'x-perch-session');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'corrections' and policyname = 'corrections: anyone can insert'
  ) then
    create policy "corrections: anyone can insert" on public.corrections for insert to anon with check (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'schedule_entries' and policyname = 'schedule_entries: public read'
  ) then
    create policy "schedule_entries: public read" on public.schedule_entries for select to anon using (true);
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 005: pg_cron jobs
-- ─────────────────────────────────────────────────────────────────────────────

select cron.schedule(
  'refresh-spot-confidence',
  '*/15 * * * *',
  $$ select public.refresh_spot_confidence(); $$
) where not exists (
  select 1 from cron.job where jobname = 'refresh-spot-confidence'
);

select cron.schedule(
  'expire-claims',
  '*/5 * * * *',
  $$
    update public.claims
    set    cancelled_at = now()
    where  cancelled_at is null
      and  expires_at   < now();
  $$
) where not exists (
  select 1 from cron.job where jobname = 'expire-claims'
);


-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: 8 CTU Main Campus study spots
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.spots (
  id, name, type, on_campus,
  building, floor, walk_time_min,
  rough_capacity, has_outlets, wifi_strength, noise_baseline, has_food,
  lat, lng, is_active
)
values
  ('a1b2c3d4-0001-4000-8000-000000000001', 'Main Library — Reading Room',    'library',   true, 'Main Library',                                    '2F', 0, 'large',  true,  'strong', 'quiet',    false, 10.29358, 123.88087, true),
  ('a1b2c3d4-0001-4000-8000-000000000002', 'Engineering Building Corridor',  'corridor',  true, 'College of Engineering',                          '1F', 0, 'medium', true,  'ok',     'moderate', false, 10.29341, 123.88072, true),
  ('a1b2c3d4-0001-4000-8000-000000000003', 'IT Building Lobby',              'lobby',     true, 'IT Building',                                     'GF', 0, 'medium', true,  'strong', 'moderate', false, 10.29370, 123.88105, true),
  ('a1b2c3d4-0001-4000-8000-000000000004', 'Admin Building Breezeway',       'corridor',  true, 'Administration Building',                         'GF', 0, 'small',  false, 'weak',   'quiet',    false, 10.29325, 123.88055, true),
  ('a1b2c3d4-0001-4000-8000-000000000005', 'CAFA Atrium',                    'open_area', true, 'College of Arts, Fine Arts and Architecture',     'GF', 0, 'medium', false, 'ok',     'moderate', false, 10.29380, 123.88120, true),
  ('a1b2c3d4-0001-4000-8000-000000000006', 'Canteen Study Corner',           'cafeteria', true, 'Campus Canteen',                                  'GF', 0, 'large',  true,  'ok',     'loud',     true,  10.29310, 123.88095, true),
  ('a1b2c3d4-0001-4000-8000-000000000007', 'Covered Court Bleachers',        'open_area', true, 'Covered Court',                                   'GF', 0, 'large',  false, 'none',   'moderate', false, 10.29300, 123.88075, true),
  ('a1b2c3d4-0001-4000-8000-000000000008', 'Graduate School Lounge',         'lobby',     true, 'Graduate School Building',                        '2F', 0, 'small',  true,  'strong', 'quiet',    false, 10.29395, 123.88060, true)
on conflict (id) do nothing;


-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: confidence scores (override trigger defaults with realistic values)
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.spot_confidence (spot_id, score, reason, valid_until)
values
  ('a1b2c3d4-0001-4000-8000-000000000001', 0.82, 'Library — historically reliable during off-peak hours', now() + interval '7 days'),
  ('a1b2c3d4-0001-4000-8000-000000000002', 0.65, 'Corridor usage varies by class schedule',              now() + interval '7 days'),
  ('a1b2c3d4-0001-4000-8000-000000000003', 0.70, 'IT lobby busy mid-morning, quieter after 3 PM',        now() + interval '7 days'),
  ('a1b2c3d4-0001-4000-8000-000000000004', 0.75, 'Breezeway rarely crowded outside of break times',      now() + interval '7 days'),
  ('a1b2c3d4-0001-4000-8000-000000000005', 0.60, 'Atrium popular during lunch hour',                     now() + interval '7 days'),
  ('a1b2c3d4-0001-4000-8000-000000000006', 0.45, 'Canteen fills quickly during meal breaks',             now() + interval '7 days'),
  ('a1b2c3d4-0001-4000-8000-000000000007', 0.55, 'Covered court availability depends on PE schedule',    now() + interval '7 days'),
  ('a1b2c3d4-0001-4000-8000-000000000008', 0.80, 'Graduate school lounge usually quiet on weekdays',     now() + interval '7 days')
on conflict (spot_id) do update
  set score       = excluded.score,
      reason      = excluded.reason,
      valid_until = excluded.valid_until;


-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: schedule entries
-- day_of_week: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.schedule_entries (spot_id, subject_code, section, day_of_week, start_time, end_time)
values
  ('a1b2c3d4-0001-4000-8000-000000000001', 'LIB101', 'Orientation', 1, '08:00', '10:00'),
  ('a1b2c3d4-0001-4000-8000-000000000001', 'LIB101', 'Orientation', 3, '08:00', '10:00'),
  ('a1b2c3d4-0001-4000-8000-000000000002', 'CE301',  '3CE-A',       2, '09:00', '11:30'),
  ('a1b2c3d4-0001-4000-8000-000000000002', 'CE302',  '3CE-B',       4, '09:00', '11:30'),
  ('a1b2c3d4-0001-4000-8000-000000000003', 'IT401',  '4IT-A',       1, '10:00', '12:00'),
  ('a1b2c3d4-0001-4000-8000-000000000003', 'IT402',  '4IT-B',       3, '10:00', '12:00'),
  ('a1b2c3d4-0001-4000-8000-000000000003', 'IT403',  '4IT-C',       5, '10:00', '12:00'),
  ('a1b2c3d4-0001-4000-8000-000000000007', 'PE101',  '1A-PE',       2, '13:00', '15:00'),
  ('a1b2c3d4-0001-4000-8000-000000000007', 'PE102',  '1B-PE',       4, '13:00', '15:00')
on conflict do nothing;
