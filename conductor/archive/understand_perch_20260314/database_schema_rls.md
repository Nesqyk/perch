# Database Schema and RLS Policies Summary

## Database Schema
The project uses a relational schema in PostgreSQL, managed via Supabase:

### Core Tables
- **`spots`**: Study locations with metadata (building, floor, capacity, outlets, etc.).
- **`spot_confidence`**: One-to-one with `spots`; contains a calculated availability score (0-100).
- **`schedule_entries`**: Class schedules for specific spots to predict availability.

### User Interaction Tables
- **`claims`**: Anonymous, short-lived reservations (30 mins) for a spot.
- **`corrections`**: User-reported feedback (e.g., "spot is full") that feeds into the confidence score.
- **`spot_submissions`**: Crowdsourced suggestions for new locations.

### Social/Group Tables
- **`groups`**: Private squads identified by a 4-char join code.
- **`group_members`**: Anonymous membership tracking with "scout points" gamification.
- **`group_pins`**: Shared map markers (Live beacons vs. Saved persistent spots).
- **`group_pin_joins`**: Real-time tracking of members heading to or arrived at a pin.
- **`group_confirmations`**: High-confidence "Vibe Confirms" (Free/Filling/Full) for live pins.

## Row Level Security (RLS)
The app uses RLS to enforce access control on the `anon` key:

- **Public Read**: Most tables allow `SELECT` for all anonymous users to populate the map and UI.
- **Anonymous Write**:
    - **Insert**: Users can suggest spots, report corrections, and create claims/groups without an account.
    - **Update**: Restricted to the owner of the record. Ownership is verified by matching the `session_id` column against a custom `x-perch-session` header provided by the client.
- **Soft Deletes**: Claims and pins are soft-deleted via `cancelled_at` or `ended_at` timestamps.

## Database Automation
- **`pg_cron`**: Scheduled jobs handle the auto-expiry of claims and group beacons.
- **Triggers**: 
    - Automatically seed `spot_confidence` when a new spot is added.
    - Award "scout points" to members when others join their live beacons.
- **Functions**: `refresh_spot_confidence()` (logic-heavy procedure) aggregates corrections and schedules to update scores.
