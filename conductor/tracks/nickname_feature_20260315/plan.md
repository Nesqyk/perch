# Implementation Plan - User Nickname Setting

## Phase 1: Database and API Layer
- [ ] Task: Create a Supabase migration to add a `user_profiles` table mapping `session_id` to `nickname` with appropriate RLS policies
- [ ] Task: Write tests for a new `api/profile.js` module handling fetching and updating the nickname
- [ ] Task: Implement `src/api/profile.js` with `getProfile` and `upsertProfile` functions
- [ ] Task: Update the `claims` table and API to optionally join or store the nickname
- [ ] Task: Conductor - User Manual Verification 'Database and API Layer' (Protocol in workflow.md)

## Phase 2: State and UI Integration
- [ ] Task: Add `nickname` to the central store state in `src/core/store.js`
- [ ] Task: Create a "Profile" modal UI component (`src/ui/profileModal.js`) for users to set their nickname
- [ ] Task: Add a button to the main UI (e.g., in the filter panel or header) to open the profile modal
- [ ] Task: Fetch the profile on app initialization (`src/main.js`) and update the store
- [ ] Task: Conductor - User Manual Verification 'State and UI Integration' (Protocol in workflow.md)

## Phase 3: Feature Consumption
- [ ] Task: Pre-fill the "Display Name" field in group creation/joining modals using the stored nickname
- [ ] Task: Update `spotCard.js` to display the claimer's nickname instead of "Someone" if available
- [ ] Task: Conductor - User Manual Verification 'Feature Consumption' (Protocol in workflow.md)
