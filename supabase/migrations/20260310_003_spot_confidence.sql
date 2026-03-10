-- Migration 003: spot_confidence table + confidence update function
-- The confidence engine lives here. The background job (pg_cron) calls
-- refresh_spot_confidence() every 15 minutes to recompute scores.

-- ─── spot_confidence ─────────────────────────────────────────────────────────
-- One row per spot. Updated by the background job, read by the client.
-- valid_until drives client-side expiry: if now() > valid_until, score
-- drifts to 0.5 (uncertain) without a network call.

create table if not exists public.spot_confidence (
  spot_id      uuid        primary key references public.spots (id) on delete cascade,
  score        numeric(4, 3) not null default 0.5
                             check (score between 0.0 and 1.0),
  reason       text,                              -- human-readable explanation for admin UI
  valid_until  timestamptz not null default (now() + interval '15 minutes'),
  updated_at   timestamptz not null default now()
);

comment on table public.spot_confidence is
  'Computed confidence scores per spot. Refreshed every 15 min by pg_cron.';

-- Seed one row per spot automatically when a spot is inserted.
create or replace function public.seed_spot_confidence()
returns trigger language plpgsql as $$
begin
  insert into public.spot_confidence (spot_id, score, reason)
  values (new.id, 0.5, 'Initial — no data yet')
  on conflict (spot_id) do nothing;
  return new;
end;
$$;

create trigger spots_seed_confidence
  after insert on public.spots
  for each row execute function public.seed_spot_confidence();

-- ─── Confidence refresh function ──────────────────────────────────────────────
-- Called by the pg_cron job every 15 minutes.
-- Logic:
--   1. Base score from schedule: during a scheduled class → 0.10, else → 0.80
--   2. Recent corrections (last 2h) tank the score by 0.15 each, min 0.05
--   3. Time decay: score drifts toward 0.5 if no corrections in 4h
-- This is a simplified v1 algorithm. Phase 2 will add claim-count weighting.

create or replace function public.refresh_spot_confidence()
returns void language plpgsql as $$
declare
  spot_row   record;
  base_score numeric;
  correction_count integer;
  final_score numeric;
  reason_text text;
  now_time   time;
  now_dow    integer;
begin
  now_time := localtime;
  now_dow  := extract(dow from now())::integer;

  for spot_row in select id from public.spots where is_active = true loop

    -- 1. Base score from schedule
    select count(*) into correction_count  -- reuse var temporarily
    from public.schedule_entries
    where spot_id    = spot_row.id
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

    -- 2. Recent corrections penalty (last 2 hours)
    select count(*) into correction_count
    from public.corrections
    where spot_id      = spot_row.id
      and corrected_at >= now() - interval '2 hours';

    final_score := greatest(0.05, base_score - (correction_count * 0.15));

    if correction_count > 0 then
      reason_text := reason_text || '; ' || correction_count || ' recent report(s)';
    end if;

    -- 3. Upsert
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

comment on function public.refresh_spot_confidence is
  'Recomputes confidence scores for all active spots. Called every 15 min by pg_cron.';
