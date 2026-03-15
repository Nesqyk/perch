# Implementation Plan - User Nickname Setting

## Phase 1: Database and API Layer [checkpoint: a513799]
- [x] Task: Create a Supabase migration to add a `user_profiles` table mapping `session_id` to `nickname` with appropriate RLS policies bb1716c
- [x] Task: Write tests for a new `api/profile.js` module handling fetching and updating the nickname 1386957
- [x] Task: Implement `src/api/profile.js` with `getProfile` and `upsertProfile` functions 1386957
- [x] Task: Update the `claims` table and API to optionally join or store the nickname 4bd5c0b
- [x] Task: Conductor - User Manual Verification 'Database and API Layer' (Protocol in workflow.md) a513799

## Phase 2: State and UI Integration [checkpoint: 6743b26]
- [x] Task: Add `nickname` to the central store state in `src/core/store.js` 6694bcf
- [x] Task: Create a "Profile" modal UI component (`src/ui/profileModal.js`) for users to set their nickname cd93642
- [x] Task: Add a button to the main UI (e.g., in the filter panel or header) to open the profile modal 50e2daa
- [x] Task: Fetch the profile on app initialization (`src/main.js`) and update the store 85ff5e7
- [x] Task: Conductor - User Manual Verification 'State and UI Integration' (Protocol in workflow.md) 6743b26

## Phase 3: Feature Consumption
- [ ] Task: Pre-fill the "Display Name" field in group creation/joining modals using the stored nickname
- [ ] Task: Update `spotCard.js` to display the claimer's nickname instead of "Someone" if available
- [ ] Task: Conductor - User Manual Verification 'Feature Consumption' (Protocol in workflow.md)
