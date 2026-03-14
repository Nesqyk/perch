# Supabase Client and API Service Patterns Summary

## Supabase Client Initialization
- **Location**: `src/api/supabaseClient.js`
- **Pattern**: Singleton instance shared across the application.
- **Configuration**:
    - Uses `createClient` from `@supabase/supabase-js`.
    - Credentials (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are injected via Vite environment variables.
    - Real-time is enabled with a custom event rate limit (`eventsPerSecond: 10`).
- **Security**: Relies on the `anon` key and server-side Row Level Security (RLS) policies to enforce data access rules for anonymous users.

## API Service Patterns
- **Organization**: Each module in `src/api/` corresponds to a database table or a logical group of features (e.g., `spots.js`, `claims.js`).
- **Implementation**:
    - Modules export `async` functions that perform CRUD operations.
    - They use the Supabase client's fluent query builder (e.g., `.from('table').select('*').eq(...)`).
    - Functions encapsulate complex query logic (joins, filtering) and provide a clean interface to the rest of the application.
- **Data Transformation**: 
    - Supabase response data is often mapped or flattened to match the application's internal state models.
    - Supabase-specific errors are caught, logged, and handled gracefully, returning sensible defaults (e.g., empty arrays or `null`) to prevent application crashes.
- **State Integration**: API functions are typically called from `main.js` or feature modules, with the results being dispatched to the central store to update the UI.
- **Session Awareness**: Some services (like `claims.js`) use a `sessionId` (stored in `localStorage`) to identify and authorize operations for anonymous users, ensuring that only the creator of a claim can cancel it (enforced via RLS).
