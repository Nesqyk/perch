-- supabase/seed.sql
--
-- CTU Main Campus study spot seed data.
-- Coordinates verified against CTU Main Campus, Cebu City (lat ≈ 10.2936, lng ≈ 123.8809).
--
-- Run automatically by: supabase db reset  (local only)
-- For production: psql directly or via Supabase dashboard SQL editor.
--
-- IDs are stable UUIDs so this file is safe to re-run with ON CONFLICT DO NOTHING.

-- ─── Spots ───────────────────────────────────────────────────────────────────

insert into public.spots (
  id, name, type, on_campus,
  building, floor, walk_time_min,
  rough_capacity, has_outlets, wifi_strength, noise_baseline, has_food,
  lat, lng, is_active
)
values
  -- 1. Main Library — 2nd floor reading room, quietest spot on campus
  (
    'a1b2c3d4-0001-4000-8000-000000000001',
    'Main Library — Reading Room',
    'library',
    true, 'Main Library', '2F', 0,
    'large', true, 'strong', 'quiet', false,
    10.29358, 123.88087, true
  ),
  -- 2. Engineering Building — covered study benches along 1F corridor
  (
    'a1b2c3d4-0001-4000-8000-000000000002',
    'Engineering Building Corridor',
    'corridor',
    true, 'College of Engineering', '1F', 0,
    'medium', true, 'ok', 'moderate', false,
    10.29341, 123.88072, true
  ),
  -- 3. IT Building — lobby area with outlets along the walls
  (
    'a1b2c3d4-0001-4000-8000-000000000003',
    'IT Building Lobby',
    'lobby',
    true, 'IT Building', 'GF', 0,
    'medium', true, 'strong', 'moderate', false,
    10.29370, 123.88105, true
  ),
  -- 4. Administration Building — benches in the shaded breezeway
  (
    'a1b2c3d4-0001-4000-8000-000000000004',
    'Admin Building Breezeway',
    'corridor',
    true, 'Administration Building', 'GF', 0,
    'small', false, 'weak', 'quiet', false,
    10.29325, 123.88055, true
  ),
  -- 5. College of Arts — open atrium, natural light, moderate noise
  (
    'a1b2c3d4-0001-4000-8000-000000000005',
    'CAFA Atrium',
    'open_area',
    true, 'College of Arts, Fine Arts and Architecture', 'GF', 0,
    'medium', false, 'ok', 'moderate', false,
    10.29380, 123.88120, true
  ),
  -- 6. Canteen — study corner near the far end, food available
  (
    'a1b2c3d4-0001-4000-8000-000000000006',
    'Canteen Study Corner',
    'cafeteria',
    true, 'Campus Canteen', 'GF', 0,
    'large', true, 'ok', 'loud', true,
    10.29310, 123.88095, true
  ),
  -- 7. Covered Court bleachers — shaded benches, good for group work
  (
    'a1b2c3d4-0001-4000-8000-000000000007',
    'Covered Court Bleachers',
    'open_area',
    true, 'Covered Court', 'GF', 0,
    'large', false, 'none', 'moderate', false,
    10.29300, 123.88075, true
  ),
  -- 8. Graduate School Building — quiet hallway lounge on 2F
  (
    'a1b2c3d4-0001-4000-8000-000000000008',
    'Graduate School Lounge',
    'lobby',
    true, 'Graduate School Building', '2F', 0,
    'small', true, 'strong', 'quiet', false,
    10.29395, 123.88060, true
  )
on conflict (id) do nothing;

-- ─── spot_confidence ─────────────────────────────────────────────────────────
-- Migration 003 auto-inserts a confidence row on spot INSERT via trigger.
-- These values override the trigger defaults with more realistic starting scores.
-- valid_until set 7 days out so scores don't immediately expire.

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
  set score      = excluded.score,
      reason     = excluded.reason,
      valid_until = excluded.valid_until;

-- ─── schedule_entries ─────────────────────────────────────────────────────────
-- Sample class schedule for spots that double as classrooms / reserved spaces.
-- day_of_week: 0 = Sunday … 6 = Saturday (matches JS Date.getDay()).

insert into public.schedule_entries (spot_id, subject_code, section, day_of_week, start_time, end_time)
values
  -- Library reading room: reserved for orientations Mon/Wed mornings
  ('a1b2c3d4-0001-4000-8000-000000000001', 'LIB101', 'Orientation', 1, '08:00', '10:00'),
  ('a1b2c3d4-0001-4000-8000-000000000001', 'LIB101', 'Orientation', 3, '08:00', '10:00'),

  -- Engineering corridor: class traffic Tue/Thu mid-morning
  ('a1b2c3d4-0001-4000-8000-000000000002', 'CE301',  '3CE-A',       2, '09:00', '11:30'),
  ('a1b2c3d4-0001-4000-8000-000000000002', 'CE302',  '3CE-B',       4, '09:00', '11:30'),

  -- IT lobby: packed Mon/Wed/Fri when IT classes run back-to-back
  ('a1b2c3d4-0001-4000-8000-000000000003', 'IT401',  '4IT-A',       1, '10:00', '12:00'),
  ('a1b2c3d4-0001-4000-8000-000000000003', 'IT402',  '4IT-B',       3, '10:00', '12:00'),
  ('a1b2c3d4-0001-4000-8000-000000000003', 'IT403',  '4IT-C',       5, '10:00', '12:00'),

  -- Covered court: PE classes block it Tue/Thu afternoons
  ('a1b2c3d4-0001-4000-8000-000000000007', 'PE101',  '1A-PE',       2, '13:00', '15:00'),
  ('a1b2c3d4-0001-4000-8000-000000000007', 'PE102',  '1B-PE',       4, '13:00', '15:00')
on conflict do nothing;
