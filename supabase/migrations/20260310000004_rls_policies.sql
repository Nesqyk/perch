-- Migration 004: Row Level Security (RLS) policies
-- Enforces access control on the anon key.
-- Rule of thumb: students can read everything, write only their own rows.

-- ─── Enable RLS on all tables ─────────────────────────────────────────────────

alter table public.spots             enable row level security;
alter table public.spot_submissions  enable row level security;
alter table public.spot_confidence   enable row level security;
alter table public.claims            enable row level security;
alter table public.corrections       enable row level security;
alter table public.schedule_entries  enable row level security;

-- ─── spots ────────────────────────────────────────────────────────────────────
-- Public read. No client writes (admin only via service role).

create policy "spots: public read"
  on public.spots for select
  to anon
  using (is_active = true);

-- ─── spot_confidence ──────────────────────────────────────────────────────────
-- Public read. Written only by the pg_cron function (service role).

create policy "spot_confidence: public read"
  on public.spot_confidence for select
  to anon
  using (true);

-- ─── spot_submissions ────────────────────────────────────────────────────────
-- Students can INSERT (suggest a spot). No read needed from client.

create policy "spot_submissions: anyone can insert"
  on public.spot_submissions for insert
  to anon
  with check (true);

-- ─── claims ──────────────────────────────────────────────────────────────────
-- Public read (to show all active claims on the map).
-- Insert: anyone (session_id is set client-side, no auth token required).
-- Update: only the session that owns the row can cancel it.
-- Delete: not allowed — rows are soft-deleted via cancelled_at.

create policy "claims: public read"
  on public.claims for select
  to anon
  using (true);

create policy "claims: anyone can insert"
  on public.claims for insert
  to anon
  with check (true);

create policy "claims: owner can cancel"
  on public.claims for update
  to anon
  using (session_id = current_setting('request.headers', true)::json->>'x-perch-session')
  with check (session_id = current_setting('request.headers', true)::json->>'x-perch-session');

-- Note: session_id ownership is passed as a custom header (x-perch-session)
-- set on the Supabase client in supabaseClient.js. This is a lightweight
-- alternative to full auth for an anonymous app.
-- Phase 2 will replace this with Supabase Auth anonymous sign-ins.

-- ─── corrections ─────────────────────────────────────────────────────────────
-- Append-only. Anyone can insert. No reads needed from client
-- (corrections only affect the confidence score, which is read via spot_confidence).

create policy "corrections: anyone can insert"
  on public.corrections for insert
  to anon
  with check (true);

-- ─── schedule_entries ────────────────────────────────────────────────────────
-- Public read. Written only by admins via service role (CSV upload).

create policy "schedule_entries: public read"
  on public.schedule_entries for select
  to anon
  using (true);
