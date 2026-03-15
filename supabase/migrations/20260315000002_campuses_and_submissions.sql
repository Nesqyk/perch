-- Migration: Campuses + user-submitted spot coordinates
-- Adds a campuses table, campus_id to spots/spot_submissions,
-- and lat/lng to spot_submissions for user-dropped map markers.

-- ─── campuses ─────────────────────────────────────────────────────────────────

create table if not exists public.campuses (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  short_name  text        not null,                          -- e.g. 'CTU Main'
  city        text        not null default 'Cebu City',
  lat         numeric     not null,                          -- map center lat
  lng         numeric     not null,                          -- map center lng
  bounds_sw_lat numeric   not null,                          -- SW corner of campus bounding box
  bounds_sw_lng numeric   not null,
  bounds_ne_lat numeric   not null,                          -- NE corner
  bounds_ne_lng numeric   not null,
  default_zoom  integer   not null default 17,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.campuses is
  'Registered campuses. Each holds map bounding box and center coords for flyToBounds.';

alter table public.campuses enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'campuses' and policyname = 'campuses: public read') then
    create policy "campuses: public read" on public.campuses for select to anon using (is_active = true);
  end if;
end $$;

-- Seed: CTU Main Campus
insert into public.campuses (name, short_name, city, lat, lng, bounds_sw_lat, bounds_sw_lng, bounds_ne_lat, bounds_ne_lng, default_zoom)
values (
  'CTU Main Campus', 'CTU Main', 'Cebu City',
  10.2936, 123.8809,
  10.2916, 123.8789,
  10.2956, 123.8829,
  17
) on conflict do nothing;

-- ─── campus_id on spots ───────────────────────────────────────────────────────
-- nullable for backward compat; existing spots keep null until backfilled.

alter table public.spots
  add column if not exists campus_id uuid references public.campuses (id) on delete set null;

create index if not exists spots_campus_idx on public.spots (campus_id);

comment on column public.spots.campus_id is
  'FK to campuses. null = campus not yet assigned (legacy rows).';

-- ─── lat/lng + campus_id on spot_submissions ─────────────────────────────────
-- Allows user-dropped markers to carry coordinates and a campus association.

alter table public.spot_submissions
  add column if not exists lat        numeric,
  add column if not exists lng        numeric,
  add column if not exists campus_id  uuid references public.campuses (id) on delete set null,
  add column if not exists session_id text;   -- anonymous submitter identifier

comment on column public.spot_submissions.lat is
  'Latitude of the user-dropped map marker.';
comment on column public.spot_submissions.lng is
  'Longitude of the user-dropped map marker.';
comment on column public.spot_submissions.campus_id is
  'Campus the submission belongs to.';
comment on column public.spot_submissions.session_id is
  'Anonymous session identifier of the submitter.';

-- ─── RLS on spot_submissions ──────────────────────────────────────────────────

alter table public.spot_submissions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'spot_submissions' and policyname = 'spot_submissions: public read approved') then
    create policy "spot_submissions: public read approved"
      on public.spot_submissions for select to anon
      using (status = 'approved');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'spot_submissions' and policyname = 'spot_submissions: anyone can insert') then
    create policy "spot_submissions: anyone can insert"
      on public.spot_submissions for insert to anon
      with check (status = 'pending');
  end if;
end $$;
