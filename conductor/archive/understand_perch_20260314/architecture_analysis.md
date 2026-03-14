# Architectural Analysis Summary

## Project Structure
The Perch project follows a modular architecture organized by function:

- **`src/`**: Application source code.
    - **`api/`**: Supabase client and service modules (spots, claims, groups, etc.).
    - **`core/`**: Central logic: Event Bus (`events.js`), Router (`router.js`), and State Store (`store.js`).
    - **`features/`**: Business logic for core features (Claiming, Groups, Suggestions).
    - **`map/`**: Leaflet integration, custom markers, and map controls.
    - **`state/`**: Derived state helpers (e.g., spot status logic).
    - **`ui/`**: Component-based UI (Modals, Panels, Spot Cards, Sidebar).
    - **`utils/`**: Shared utility functions (Time, Session, Capacity).
    - **`styles/`**: Component-specific and global CSS.
    - **`main.js`**: Student app bootstrap and initialization sequence.
    - **`admin.js`**: Admin dashboard entry point and logic.

## Module Dependencies & Communication
- **State Management**: `core/store.js` acts as the single source of truth using a dispatch/subscribe pattern.
- **Event Bus**: `core/events.js` enables decoupled communication between modules via custom events.
- **Service Layer**: `api/` modules abstract Supabase interactions, used by both features and core logic.
- **UI & Logic**: UI components in `ui/` are thin wrappers that dispatch actions to the store and listen for events to update their state.
- **Real-time**: `api/realtime.js` handles Supabase Realtime subscriptions, broadcasting changes through the event bus.
