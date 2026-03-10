-- Migration 001: Initial schema
-- Tables: spots, spot_submissions
-- Run: supabase db push (or supabase migration up locally)

-- ─── Extensions ──────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";  -- gen_random_uuid()
create extension if not exists "pg_cron";   -- scheduled jobs

-- ─── spots ───────────────────────────────────────────────────────────────────
-- The core catalogue of study locations, both on and off campus.
-- Managed by admins via the admin panel; read-only for students.

create table if not exists public.spots (
  id               uuid primary key default gen_random_uuid(),
  name             text        not null,
  type             text,                              -- 'library' | 'corridor' | 'cafe' | etc.
  on_campus        boolean     not null default true,
  building         text,                              -- e.g. 'Main Building', null for off-campus
  floor            text,
  walk_time_min    integer     default 0,             -- walking minutes from campus gate
  rough_capacity   text        check (rough_capacity in ('small', 'medium', 'large')),
  has_outlets      boolean     not null default false,
  wifi_strength    text        check (wifi_strength in ('none', 'weak', 'ok', 'strong')),
  noise_baseline   text        check (noise_baseline in ('quiet', 'moderate', 'loud')),
  has_food         boolean     not null default false,
  lat              numeric(10, 7),
  lng              numeric(10, 7),
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.spots is
  'Approved study spots shown on the map. Managed by admins.';

-- ─── spot_submissions ─────────────────────────────────────────────────────────
-- Student-submitted spot suggestions. Reviewed by admins before promotion to spots.

create table if not exists public.spot_submissions (
  id           uuid primary key default gen_random_uuid(),
  spot_name    text        not null,
  description  text,
  submitted_by text,                                  -- optional nickname, not enforced
  status       text        not null default 'pending'
                           check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now()
);

comment on table public.spot_submissions is
  'Student-submitted suggestions for new spots. Reviewed in the admin panel.';

-- ─── updated_at trigger ──────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger spots_updated_at
  before update on public.spots
  for each row execute function public.set_updated_at();
