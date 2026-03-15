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

/**
 * Update the custom session header.
 * Called during bootstrap after the session ID is ensured.
 *
 * @param {string} sessionId
 */
export function setSessionHeader(sessionId) {
  // Update the internal headers object for the Supabase client.
  // This affects all future REST and Realtime requests.
  supabase.realtime.setAuth(sessionId); // For Realtime
  // For REST, we need to access the underlying fetch or use a middleware pattern if supported.
  // In v2, you can provide a custom fetch or update headers on the fly.
  // But actually, the cleanest way is to use the global config if it supports functions.
  // Since it doesn't, we will use this manual override.
  // @ts-ignore
  supabase.rest.headers['x-perch-session'] = sessionId;
}
