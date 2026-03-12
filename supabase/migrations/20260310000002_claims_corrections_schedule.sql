-- Migration 002: Claims, corrections, and schedule entries
-- These are the three write-heavy tables used by students.

-- ─── claims ──────────────────────────────────────────────────────────────────
-- Created when a student taps "I'm Going Here".
-- Auto-expires after 30 minutes via expires_at + pg_cron job.
-- Cancelled via the "Cancel Claim" button (sets cancelled_at).

create table if not exists public.claims (
  id              uuid        primary key default gen_random_uuid(),
  spot_id         uuid        not null references public.spots (id) on delete cascade,
  session_id      text        not null,               -- anonymous token from localStorage
  group_size_key  text        not null
                              check (group_size_key in ('solo', 'small', 'medium', 'large')),
  group_size_min  integer     not null default 1,
  group_size_max  integer,                            -- null for 'large' (16+)
  claimed_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '30 minutes'),
  cancelled_at    timestamptz                         -- null = still active
);

comment on table public.claims is
  'Active and historical spot claims. One per anonymous session at a time (by convention, not DB constraint).';

create index if not exists claims_spot_id_idx       on public.claims (spot_id);
create index if not exists claims_session_id_idx    on public.claims (session_id);
create index if not exists claims_expires_at_idx    on public.claims (expires_at);

-- ─── corrections ─────────────────────────────────────────────────────────────
-- Append-only log of "Report Full" events.
-- Used by the confidence scoring background job to learn from corrections.
-- day_of_week + hour_of_day are denormalised at write time for fast aggregation.

create table if not exists public.corrections (
  id            uuid        primary key default gen_random_uuid(),
  spot_id       uuid        not null references public.spots (id) on delete cascade,
  session_id    text        not null,
  reason        text        check (reason in ('locked', 'occupied', 'overcrowded', 'event', null)),
  corrected_at  timestamptz not null default now(),
  day_of_week   integer     not null check (day_of_week between 0 and 6),
  hour_of_day   integer     not null check (hour_of_day between 0 and 23)
);

comment on table public.corrections is
  'Append-only log of student full-reports. Drives confidence score adjustments.';

create index if not exists corrections_spot_id_idx    on public.corrections (spot_id);
create index if not exists corrections_day_hour_idx   on public.corrections (day_of_week, hour_of_day);

-- ─── schedule_entries ────────────────────────────────────────────────────────
-- Class schedule data for each spot.
-- Uploaded by admins via CSV. Used to compute baseline confidence scores
-- ("this room has a class 1 PM – 3 PM on Tuesdays → low confidence during that window").

create table if not exists public.schedule_entries (
  id            uuid        primary key default gen_random_uuid(),
  spot_id       uuid        not null references public.spots (id) on delete cascade,
  subject_code  text,
  section       text,
  day_of_week   integer     not null check (day_of_week between 0 and 6),
  start_time    time        not null,
  end_time      time        not null,
  constraint    valid_time_range check (end_time > start_time)
);

comment on table public.schedule_entries is
  'Class schedule entries per spot. Uploaded via admin CSV import.';

create index if not exists schedule_spot_day_idx on public.schedule_entries (spot_id, day_of_week);
