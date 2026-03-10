-- supabase/seed.sql
-- Local development seed data.
-- Run automatically by: supabase db reset
-- NOT applied to production.

-- ─── Spots ───────────────────────────────────────────────────────────────────

insert into public.spots (id, name, type, on_campus, building, floor, walk_time_min, rough_capacity, has_outlets, wifi_strength, noise_baseline, has_food, lat, lng)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'USJ-R Library 2F',
    'Library',
    true, 'Main Building', '2F', 0,
    'large', true, 'strong', 'quiet', false,
    10.3157, 123.8854
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Engineering Corridor',
    'Corridor',
    true, 'Engineering Building', '1F', 0,
    'medium', true, 'ok', 'moderate', false,
    10.3155, 123.8851
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'Jollibee Colon',
    'Cafe',
    false, null, null, 8,
    'large', true, 'ok', 'loud', true,
    10.2938, 123.9011
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'CAFA Open Space',
    'Open Area',
    true, 'CAFA Building', 'GF', 0,
    'small', false, 'weak', 'moderate', false,
    10.3160, 123.8857
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    'IT Building Lobby',
    'Lobby',
    true, 'IT Building', 'GF', 0,
    'medium', true, 'strong', 'moderate', false,
    10.3152, 123.8849
  );

-- ─── spot_confidence (seed defaults) ─────────────────────────────────────────
-- The trigger in migration 003 auto-seeds these on spot INSERT.
-- This block is a safety net in case the trigger hasn't fired yet in the
-- local emulator (e.g. during direct seed runs).

insert into public.spot_confidence (spot_id, score, reason)
values
  ('11111111-1111-1111-1111-111111111111', 0.80, 'Seed data — no schedule loaded'),
  ('22222222-2222-2222-2222-222222222222', 0.60, 'Seed data — no schedule loaded'),
  ('33333333-3333-3333-3333-333333333333', 0.70, 'Seed data — no schedule loaded'),
  ('44444444-4444-4444-4444-444444444444', 0.50, 'Seed data — no schedule loaded'),
  ('55555555-5555-5555-5555-555555555555', 0.65, 'Seed data — no schedule loaded')
on conflict (spot_id) do nothing;

-- ─── schedule_entries (sample) ────────────────────────────────────────────────
-- Library 2F: class on Monday 9–11 AM and Tuesday 1–3 PM

insert into public.schedule_entries (spot_id, subject_code, section, day_of_week, start_time, end_time)
values
  ('11111111-1111-1111-1111-111111111111', 'IT301', '3IT-A', 1, '09:00', '11:00'),
  ('11111111-1111-1111-1111-111111111111', 'IT302', '3IT-B', 2, '13:00', '15:00'),
  ('22222222-2222-2222-2222-222222222222', 'CE201', '2CE-A', 3, '08:00', '10:00');
