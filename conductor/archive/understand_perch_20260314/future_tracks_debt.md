# Future Tracks and Technical Debt Audit

## Technical Debt Findings
During the analysis, the following areas of technical debt and potential improvements were identified:

1.  **Component Inconsistency**: UI components in `src/ui/` use slightly different patterns for rendering and state management. Some are purely functional templates, while others hold internal state.
2.  **Test Coverage Gaps**: Unit tests are currently limited to "pure" logic modules. API services (`src/api/`) and UI components (`src/ui/`) have zero coverage, making refactoring these layers risky.
3.  **Manual Auth Identification**: Identifying users via a custom `x-perch-session` header is a clever Phase 1 workaround but lacks the robustness and built-in features of a formal identity system.
4.  **Optimistic UI Reconciliation**: While optimistic updates are used, the logic for "rolling back" on failure is sparse across the feature modules.
5.  **Map Layer Density**: As the number of spots and group pins increases, the current "render all markers" approach may lead to performance degradation on mobile devices.

## Proposed Next Tracks

### Track 1: UI Component Refactor & Standardization
- **Goal**: Consolidate UI components into a consistent, predictable pattern.
- **Scope**: Define a base "Component" or "Panel" pattern; refactor `filterPanel.js` and `spotCard.js` to adhere to it.

### Track 2: API & Integration Testing Suite
- **Goal**: Increase confidence in the data and network layers.
- **Scope**: Implement integration tests for `src/api/` using mocked Supabase responses; add basic Vitest/jsdom tests for UI components.

### Track 3: Supabase Anonymous Auth Migration
- **Goal**: Move to a formal, Supabase-native identity system.
- **Scope**: Replace the manual `session_id` logic with Supabase Anonymous Authentication; update RLS policies to use `auth.uid()`.

### Track 4: Map Performance & Clustering
- **Goal**: Ensure the map remains fluid as data grows.
- **Scope**: Implement `Leaflet.markercluster` for spot pins; optimize marker SVG rendering.

### Track 5: Enhanced Real-time Error Handling
- **Goal**: Improve the reliability of the WebSocket sync.
- **Scope**: Implement robust reconnection logic, status indicators for "Offline/Syncing," and structured rollback for failed optimistic updates.
