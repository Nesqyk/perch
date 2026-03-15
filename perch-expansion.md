# Perch Expansion Plan

## Overview
Expanding Perch to support multiple campuses with explicit selection, user-submitted map markers via map clicks, open-join group functionality with member visibility, and enhancing the top suggestion UI.

## Project Type
WEB

## Success Criteria
- Users can switch between different campuses via explicit selection (dropdown/modal).
- Users can click on the Leaflet map to drop new markers and submit them, publishing instantly.
- The "Join Group" modal successfully lists active members and provides a shareable link with open-join friction-free capability.
- The top suggestion list UI is enhanced for better readability and a more premium feel.
- The "Near" dropdown functions dynamically based on the explicitly selected campus.

## Tech Stack
- Frontend: Vanilla JS, CSS
- Map: Leaflet
- Backend/DB: Supabase (PostgreSQL, Realtime)

## File Structure
- `src/features/groups.js` (Creates/Manages Groups)
- `src/ui/groupModal.js` (Join Group link & Members list UI)
- `src/ui/campusSelector.js` (UI for explicitly switching campuses)
- `src/ui/submitSpotPanel.js` (UI for user-submitted markers)
- `supabase/migrations/` (New migrations for campuses, group memberships, and user-submitted flags)

## Task Breakdown

### Task 1: Database Schema Expansion
- **Agent**: `database-architect`
- **Skills**: `database-design`
- **Priority**: P0
- **Dependencies**: None
- **Details**: Add `campuses` table. Add `campus_id` to existing spots. Add `is_user_submitted` or similar to `spots`. Add `group_memberships` table for open join links. Create RLS policies.
- **INPUT**: Current Supabase ER diagram/schema
- **OUTPUT**: New SQL migration file (e.g., `005_campus_groups_expansion.sql`)
- **VERIFY**: Migration applies cleanly to Supabase.

### Task 2: Campus Selection & Dynamic Map Bounds
- **Agent**: `frontend-specialist`
- **Skills**: `frontend-design`
- **Priority**: P1
- **Dependencies**: Task 1
- **Details**: Implement explicit campus selection UI. Update `mapInit.js` to use dynamic bounds and map offsets based on the selected campus. Update the "Near" dropdown to populate based on the current campus' known buildings.
- **INPUT**: Campus data via API
- **OUTPUT**: Working campus switcher and dynamic bounds in `mapInit.js`
- **VERIFY**: Switching campus visibly changes the map bounds and reloads local spots.

### Task 3: User-Submitted Markers
- **Agent**: `frontend-specialist`
- **Skills**: `frontend-design`
- **Priority**: P1
- **Dependencies**: Task 1
- **Details**: Capture Leaflet `click` events to open a "Submit Spot" bottom sheet/sidebar. Send coordinates and UI data to Supabase. Utilize existing Realtime infrastructure so the submitted marker instantly appears.
- **INPUT**: Leaflet click coordinates
- **OUTPUT**: `submitSpotPanel.js` UI, `api/spots.js` insert function, mapping hooks.
- **VERIFY**: Clicking map allows submission and instantly adds a marker locally and remotely.

### Task 4: Group Members & Share Link UI
- **Agent**: `frontend-specialist`
- **Skills**: `frontend-design`
- **Priority**: P1
- **Dependencies**: Task 1
- **Details**: Implement the group modal UI. Display active members by querying `group_memberships`. Generate a shareable link (e.g., `?join=GroupID`) that auto-joins the user when clicked.
- **INPUT**: Group ID from the state
- **OUTPUT**: Modal showing members list and copyable join link. Hook in `main.js` to parse join link URL params.
- **VERIFY**: Opening link adds user to group, and modal accurately reflects members to all users.

### Task 5: Top Suggestion List UI Enhancements
- **Agent**: `frontend-specialist`
- **Skills**: `frontend-design`
- **Priority**: P2
- **Dependencies**: None
- **Details**: Redesign the top suggestion list in the sidebar/bottom sheet to be more aesthetically pleasing, fixing layout or text cut-off issues.
- **INPUT**: Existing `smartSuggestions.js` output
- **OUTPUT**: Enhanced CSS and markup in `spotCard.js` / suggestion container.
- **VERIFY**: Suggestion list looks cleaner and handles data properly.

## ✅ Phase X: Verification Placeholder
- [ ] Linting (`npm run lint`)
- [ ] Unit Tests (`npm test`)
- [ ] Build Check (`npm run build`)
- [ ] Security Scan (`python .agent/scripts/checklist.py .`)
- [ ] Visual QA / UX Audit (`python .agent/scripts/ux_audit.py .`)
