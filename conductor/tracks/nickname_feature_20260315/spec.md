# Track Specification: User Nickname Setting

## Overview
This track introduces the ability for users to manually set a nickname. This nickname will be tied to their anonymous session ID in the database and will be used to personalize their experience across the app.

## Functional Requirements
- **Manual Setting:** Users can set or change their nickname via a dedicated UI element (e.g., a "Profile" button or section).
- **Database Persistence:** The nickname will be stored in a new database table or an existing one, linked to their unique `session_id`.
- **Application Integration:**
    - The nickname will act as the default display name when joining or creating groups.
    - Claims will display the nickname of the user who claimed the spot (e.g., "Claimed by Jun").
    - A brief welcome message or indicator in the UI will display the active nickname.

## Non-Functional Requirements
- **Privacy:** The nickname should remain tied only to the anonymous session ID; no formal account creation is required.
- **Performance:** Fetching and displaying the nickname should not noticeably delay app load times.

## Acceptance Criteria
- A user can open a modal/panel to enter and save a nickname.
- The nickname is successfully saved to the Supabase database.
- Upon refreshing the page, the app retrieves and displays the saved nickname.
- When creating or joining a group, the input field for 'Display Name' is pre-filled with the saved nickname.
- Spots claimed by the user show their nickname to other users on the network.

## Out of Scope
- Full user authentication (email/password login).
- Avatars or profile pictures.
