-- Migration: Settings dashboard persistence
-- Adds durable account settings, devices, sessions, and shared notes for #/settings.

-- ─── Auth-backed profile fields ─────────────────────────────────────────────

alter table public.user_profiles
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists avatar_url text,
  add column if not exists cover_image_url text,
  add column if not exists school_label text not null default 'CTU Main Campus',
  add column if not exists scholar_label text not null default 'Senior Scholar';

create unique index if not exists user_profiles_user_id_unique
  on public.user_profiles (user_id)
  where user_id is not null;

create index if not exists user_profiles_user_idx on public.user_profiles (user_id);

-- Keep legacy anonymous session support, but add authenticated policies.
drop policy if exists "user_profiles: authenticated read self" on public.user_profiles;
create policy "user_profiles: authenticated read self"
  on public.user_profiles for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_profiles: authenticated insert self" on public.user_profiles;
create policy "user_profiles: authenticated insert self"
  on public.user_profiles for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_profiles: authenticated update self" on public.user_profiles;
create policy "user_profiles: authenticated update self"
  on public.user_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── Settings ───────────────────────────────────────────────────────────────

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  default_map_view text not null default 'campus'
    check (default_map_view in ('campus', 'cafes')),
  preferred_study_environment text not null default 'quiet'
    check (preferred_study_environment in ('quiet', 'moderate')),
  spot_availability_alerts boolean not null default true,
  squad_updates boolean not null default false,
  preferred_campus_id uuid references public.campuses (id) on delete set null,
  google_calendar_linked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings: read self" on public.user_settings;
create policy "user_settings: read self"
  on public.user_settings for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_settings: insert self" on public.user_settings;
create policy "user_settings: insert self"
  on public.user_settings for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_settings: update self" on public.user_settings;
create policy "user_settings: update self"
  on public.user_settings for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── Devices ────────────────────────────────────────────────────────────────

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  device_key text not null,
  device_name text not null,
  device_type text not null default 'desktop'
    check (device_type in ('phone', 'tablet', 'laptop', 'desktop')),
  last_seen_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_devices_user_key_unique unique (user_id, device_key)
);

create index if not exists user_devices_user_idx on public.user_devices (user_id, last_seen_at desc);

alter table public.user_devices enable row level security;

drop policy if exists "user_devices: read self" on public.user_devices;
create policy "user_devices: read self"
  on public.user_devices for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_devices: insert self" on public.user_devices;
create policy "user_devices: insert self"
  on public.user_devices for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_devices: update self" on public.user_devices;
create policy "user_devices: update self"
  on public.user_devices for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── Next sessions ──────────────────────────────────────────────────────────

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null default 'Physics Final Prep',
  starts_at timestamptz not null default (now() + interval '1 day'),
  meet_url text,
  is_next boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_sessions_next_idx on public.user_sessions (user_id, is_next, starts_at);

alter table public.user_sessions enable row level security;

drop policy if exists "user_sessions: read self" on public.user_sessions;
create policy "user_sessions: read self"
  on public.user_sessions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_sessions: write self" on public.user_sessions;
create policy "user_sessions: write self"
  on public.user_sessions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── Shared notes ───────────────────────────────────────────────────────────

create table if not exists public.user_shared_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null default 'Thermodynamics formulas for midterm',
  document_url text,
  provider text not null default 'google_workspace',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_shared_notes_active_idx on public.user_shared_notes (user_id, is_active, updated_at desc);

alter table public.user_shared_notes enable row level security;

drop policy if exists "user_shared_notes: read self" on public.user_shared_notes;
create policy "user_shared_notes: read self"
  on public.user_shared_notes for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_shared_notes: write self" on public.user_shared_notes;
create policy "user_shared_notes: write self"
  on public.user_shared_notes for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── Updated-at triggers ────────────────────────────────────────────────────

drop trigger if exists user_settings_updated_at on public.user_settings;
create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.handle_updated_at();

drop trigger if exists user_devices_updated_at on public.user_devices;
create trigger user_devices_updated_at
  before update on public.user_devices
  for each row execute function public.handle_updated_at();

drop trigger if exists user_sessions_updated_at on public.user_sessions;
create trigger user_sessions_updated_at
  before update on public.user_sessions
  for each row execute function public.handle_updated_at();

drop trigger if exists user_shared_notes_updated_at on public.user_shared_notes;
create trigger user_shared_notes_updated_at
  before update on public.user_shared_notes
  for each row execute function public.handle_updated_at();
