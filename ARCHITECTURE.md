# Perch — High-Level Architecture

## Overview
Perch is a real-time, map-based study spot finder. It uses a decoupled, event-driven frontend architecture paired with a reactive Backend-as-a-Service (BaaS) layer.

## System Design

### 1. Unidirectional Data Flow
Perch follows a strict unidirectional data flow pattern to manage state complexity:
- **User Actions**: UI components emit events via the central `Event Bus`.
- **Logic Handling**: `Feature Modules` listen for these events, coordinate with `API Services`, and `dispatch` actions to the `State Store`.
- **State Updates**: The `State Store` mutates the application state and emits change events.
- **UI Reactivity**: `UI Components` and `Map Markers` listen for store events and re-render themselves.

### 2. Backend & Real-time Synchronization
The application relies heavily on **Supabase** for its reactive capabilities:
- **PostgreSQL**: Stores spots, claims, groups, and social data.
- **Realtime (WebSockets)**: Automatically broadcasts database changes to all connected clients.
- **Row Level Security (RLS)**: Enforces data security for anonymous users by matching session IDs in custom headers.
- **Database Automation**: Uses `pg_cron` for auto-expiry of transient data (e.g., 30-minute spot claims).

## Key Modules

### Core Infrastructure (`src/core/`)
- **`store.js`**: Centralized state management using a dispatch/subscribe pattern.
- **`events.js`**: Pub/sub event bus for decoupled module communication.
- **`router.js`**: Syncs application state with URL parameters for shareable links.

### Map & Visualization (`src/map/`)
- **Leaflet.js**: Handles map rendering, custom SVG markers, and coordinate mapping.
- **`pins.js`**: Highly reactive marker manager that syncs map pins with the central store.

### Collaborative Features (`src/features/`)
- **Groups (F4/F5)**: Private coordination layers with "Transit Dots" and "Vibe Confirms."
- **Smart Suggestions (F1)**: Weighted ranking algorithm prioritizing proximity, facilities, and real-time confidence.

## Data Security
Perch is designed for anonymous use. Security is handled via:
- **Session Identification**: A unique `session_id` stored in the user's browser.
- **RLS Policies**: Restrict `UPDATE` operations to the session that created the record.
- **Service Role Restriction**: Administrative actions (e.g., managing spot data) are performed via service-role keys restricted to the admin panel.

## Implementation Details
For detailed coding standards, file structures, and testing strategies, see [AGENTS.md](./AGENTS.md).
