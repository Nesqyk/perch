/**
 * src/api/supabaseClient.js
 *
 * Singleton Supabase client shared across every api/ module.
 *
 * The anon key is intentionally public — it only grants access
 * to what Row Level Security (RLS) policies allow.
 * Set up RLS rules in the Supabase dashboard to ensure:
 *  - spots:            public SELECT, no INSERT/UPDATE/DELETE from client
 *  - spot_confidence:  public SELECT, no client writes
 *  - claims:           public SELECT; INSERT where session_id = current token;
 *                      UPDATE (cancel) where session_id matches
 *  - corrections:      INSERT only (append-only log)
 *  - spot_submissions: INSERT only from client
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '[supabaseClient] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
    'Copy .env.example to .env and fill in your Supabase project credentials.'
  );
}

/** @type {import('@supabase/supabase-js').SupabaseClient} */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
