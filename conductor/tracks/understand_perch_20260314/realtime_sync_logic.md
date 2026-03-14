# Real-time Subscription Logic Summary

## Real-time Architecture
Perch uses Supabase Realtime (WebSockets) to broadcast database changes to all connected clients, ensuring a live, collaborative map experience without manual refreshing.

## Subscription Strategy
The logic is divided into two main layers:

### 1. Global Sync (`perch-spots` channel)
- **Scope**: All users on the shared link.
- **Events Tracked**:
    - **`claims` (INSERT/UPDATE)**: New reservations or cancellations. Updates the "claimed" status of spots on the map.
    - **`corrections` (INSERT)**: User-reported status changes (e.g., "spot is full").
    - **`spot_confidence` (UPDATE)**: Background score recalculations, ensuring the "availability percentage" is always current.

### 2. Group Coordination (`perch-group-<groupId>` channels)
- **Scope**: Private to members of a specific group.
- **Events Tracked**:
    - **`group_pins` (INSERT/UPDATE)**: New shared markers or beacons dropped by squad mates.
    - **`group_pin_joins` (INSERT/UPDATE)**: Real-time "I'm heading there" or "I've arrived" status updates for group beacons.

## Implementation Details
- **Decoupled Logic**: The `realtime.js` module is purely reactive; it listens for database changes and translates them into application-level actions via `dispatch()`.
- **Duplicate Prevention**: For the local user's own actions, the store applies the change immediately (optimistic UI), while the real-time listener uses `session_id` to ignore the incoming broadcast of that same action.
- **Channel Management**:
    - `subscribeToRealtime()`: Replaces any existing global subscription.
    - `subscribeToGroupRealtime(groupId)`: Dynamically switches to the current group's channel.
    - Cleanup: Explicit `unsubscribe` functions ensure no dangling WebSocket listeners when leaving a group or unloading the page.
