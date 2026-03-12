-- Migration 005: pg_cron scheduled jobs
-- Two jobs:
--   1. Refresh confidence scores every 15 minutes
--   2. Mark expired claims every 5 minutes

-- ─── Confidence refresh ───────────────────────────────────────────────────────
-- Runs every 15 minutes. Calls the function defined in migration 003.

select cron.schedule(
  'refresh-spot-confidence',          -- job name (unique)
  '*/15 * * * *',                     -- every 15 minutes
  $$ select public.refresh_spot_confidence(); $$
);

-- ─── Claim expiry ─────────────────────────────────────────────────────────────
-- Runs every 5 minutes. Sets cancelled_at on rows past their expires_at.
-- Supabase Realtime broadcasts the UPDATE to all connected clients so pins
-- update live without a page refresh.

select cron.schedule(
  'expire-claims',                    -- job name
  '*/5 * * * *',                      -- every 5 minutes
  $$
    update public.claims
    set    cancelled_at = now()
    where  cancelled_at is null
      and  expires_at   < now();
  $$
);
