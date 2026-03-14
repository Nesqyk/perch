# Perch Technical Analysis: State of the Project

## 1. Architecture and Project Structure
Perch is built as a modern, modular Vanilla JavaScript web application (ES6+) managed by Vite. It follows a decoupled, event-driven architecture designed for high responsiveness and collaborative real-time interaction.

### Module Organization (`src/`)
- **`core/`**: The application's "brain," containing the central State Store (`store.js`) using a dispatch/subscribe pattern, a custom Event Bus (`events.js`) for cross-module communication, and a URL Router (`router.js`).
- **`api/`**: Service layer that abstracts Supabase interactions (PostgreSQL, Realtime, and Anonymous Session logic).
- **`features/`**: Encapsulated business logic for core user flows like Spot Claiming, Group Coordination, and Smart Suggestions.
- **`ui/`**: Component-based UI layer (Modals, Panels, Spot Cards) that reacts to store changes and dispatches user actions.
- **`map/`**: Specialized Leaflet.js integration for custom campus/city map rendering and marker management.
- **`utils/` & `state/`**: Shared logic for data formatting, status derivation, and session management.

## 2. Technology Stack
- **Frontend**: Vanilla JS (ES2022), HTML5, CSS3.
- **Map Engine**: Leaflet.js with CartoDB Positron tiles.
- **Backend-as-a-Service**: Supabase (PostgreSQL, Realtime, RLS).
- **Build Tool**: Vite (optimized for speed and multi-entry builds: main app + admin).
- **Testing**: Vitest (Unit testing focused on core business logic).
- **Linting**: ESLint v9+ (Flat config).

## 3. Data Flow and Real-time Synchronization
The application state flows from Supabase through the `api/` layer into the `core/store.js`. 
- **Real-time Sync**: Uses Supabase Realtime (WebSockets) to broadcast spot status changes (claims, corrections, confidence scores) to all clients.
- **Optimistic UI**: The local store updates immediately on user action, while the `realtime.js` module handles incoming broadcasts from other users, using `session_id` to prevent duplicate local processing.
- **Anonymous Sessions**: Users are identified by a persistent `session_id` in `localStorage`, enabling secure, no-account interactions enforced via Row Level Security (RLS) policies.

## 4. Database Schema and Security
The PostgreSQL schema is optimized for availability tracking:
- **Core Tables**: `spots` (locations), `spot_confidence` (availability scores), `schedule_entries` (class times).
- **Social Tables**: `groups`, `group_members`, `group_pins` (Beacons vs. Saved), and `group_pin_joins` (Transit status).
- **Automation**: `pg_cron` handles auto-expiry of claims and beacons; database triggers manage "Scout Points" and initial confidence seeding.
- **Security**: RLS policies ensure that while most data is public-read, updates are strictly restricted to the original creator of a record.

## 5. Key Features Analysis

### F1: Smart Suggestions (Ranking Logic)
Filters and ranks spots based on user needs (outlets, wifi, quiet), group size, and real-time confidence. It prioritizes on-campus locations and applies a "walk penalty" to off-campus results. It is also "schedule-aware," showing availability windows based on class times.

### F2 & F3: Claiming and Reporting
Simple, high-impact interactions allowing users to claim a spot for 30 minutes or report a spot as full/locked. These actions feed back into the global confidence score.

### F4 & F5: Groups and Social Coordination
Private squads share a dedicated map layer with real-time "Transit Dots" (showing who is on the way) and "Vibe Confirms" (high-confidence status updates). A gamified "Scout Points" system encourages group members to scout and share spots.

---
*This summary established the mental model for the Perch project as of March 2026.*
