-- Migration: User Profiles table
-- Adds a table to store nicknames tied to anonymous session IDs.

-- ─── user_profiles ───────────────────────────────────────────────────────────

create table if not exists public.user_profiles (
  session_id  text primary key,
  nickname    text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Enable RLS
alter table public.user_profiles enable row level security;

-- ─── RLS Policies ────────────────────────────────────────────────────────────

-- Everyone can see nicknames (to display who claimed a spot or is in a group).
create policy "user_profiles: public read"
  on public.user_profiles for select
  to anon
  using (true);

-- Users can create or update their own nickname.
-- Identified by the custom x-perch-session header.
create policy "user_profiles: owner can upsert"
  on public.user_profiles for all
  to anon
  using (session_id = current_setting('request.headers', true)::json->>'x-perch-session')
  with check (session_id = current_setting('request.headers', true)::json->>'x-perch-session');

-- ─── Triggers ────────────────────────────────────────────────────────────────

-- Automatically update updated_at on change.
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_user_profile_updated
  before update on public.user_profiles
  for each row execute function public.handle_updated_at();
