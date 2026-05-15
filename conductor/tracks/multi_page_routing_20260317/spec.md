# Track Specification: Multi-Page Application Architecture

## Overview
This track focuses on planning and defining the architecture for expanding Perch into a multi-page application. We will outline the specific content and routing logic for the Dashboard, Profile/Settings, and Group pages. As a key deliverable, we will generate formatted GitHub issues for each page using the standard feature request template.

## Functional Requirements
- **Navigation Architecture**: Define a global Sidebar Menu to handle routing between the new pages on both mobile and desktop.
- **Page Content Definitions**:
  - **Dashboard**: Act as the primary route (hosting the interactive map). Includes quick views of Active Status (current claims/reports) and Group Shortcuts.
  - **Profile & Settings**: A unified page with a tabbed interface. Profile tab for identity management (nickname) and Settings tab for app preferences.
  - **Group Page**: A dedicated space for squad coordination, featuring a Member List and a feed of Active Pins dropped by the group.
- **Issue Generation**: Draft distinct GitHub issues for each component (Navigation, Dashboard, Profile/Settings, Group) using the `.github/ISSUE_TEMPLATE/feature_request.md` format.

## Non-Functional Requirements
- **UX/UI Consistency**: Ensure the new page layouts align with the existing `product-guidelines.md`.
- **Maintainability**: The proposed routing approach should integrate smoothly with the existing vanilla JS structure (e.g., expanding `src/core/router.js`).

## Acceptance Criteria
- A comprehensive architectural plan detailing the content structure for each new page.
- Four complete, separated GitHub issue drafts saved as markdown files within the track directory, ready to be copied into GitHub.
- Navigation flow clearly mapped out.

## Out of Scope
- Actually implementing the new pages and routing logic in the application code (this track focuses purely on planning and issue generation).