# Groups Feature Implementation Summary

## Groups Architecture
The Groups feature enables private, collaborative map layers for squads, students, or study groups. It is designed to be completely anonymous and friction-less.

## Core Components
- **Identity**: Groups are identified by a unique 4-character join code (e.g., `K7F2`). Users are identified by their browser's `session_id`.
- **API Services (`api/groups.js`, `api/groupPins.js`)**: Handle raw Supabase operations for groups, members, pins, and joins.
- **Feature Modules (`features/groups.js`, `features/groupPins.js`)**: Orchestrate the flow between UI events, API calls, store updates, and real-time subscriptions.

## Key Workflows

### 1. Creation and Joining
- **Create**: Generates a code, auto-assigns a distinct color from a curated palette, and adds the creator as a member.
- **Join**: Uses the join code to link the current session to the group.
- **Activation**: Upon joining, the app fetches all active pins and joins, and opens a dedicated real-time channel for that specific group.

### 2. Group Pin Lifecycle
- **Live Pins (Beacons)**: 
    - Purpose: Signal "I am here right now".
    - Expiry: 90-minute TTL (Time To Live), managed via `pg_cron`.
    - Manual End: The original pinner can end the beacon early.
- **Saved Pins**:
    - Purpose: Permanent "favorite" or "remembered" spots for the squad.
    - Expiry: Persistent (no `expires_at`).

### 3. Social Mechanics
- **Transit Dots**: Members can tap "I'm heading there" on a live pin. This displays an orbiting dot on the map marker for others to see.
- **Vibe Confirms**: One-tap signals (Free, Filling, Full) that provide high-confidence status updates for a specific pin.
- **Scout Points**: A database trigger awards +1 point to a member whenever someone joins their live beacon, fostering a helpful community.

## Real-time Integration
- **Privacy**: Each group has its own WebSocket channel (`perch-group-<groupId>`). Members only receive updates for the group they are currently in.
- **Reactive UI**: Real-time broadcasts for new pins, status changes, and transit joins are dispatched to the store, which automatically updates the map and UI components.
