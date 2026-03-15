# Track Specification: Find My Spot

## Overview
This track implements the "Find My Spot" feature, which helps users quickly identify the best study spot based on their current needs and location. It expands the existing "Smart Suggestions" logic by introducing a dedicated results UI showing the top 3 spots with walk time estimates and navigation shortcuts.

## Functional Requirements
- **Dynamic Ranking**: Improve the `_rankSpots` logic to account for real-time GPS distance (when available) in addition to existing filters (amenities, capacity, confidence).
- **Contextual Awareness**: Ensure the feature works seamlessly in both 'campus' and 'city' view modes.
- **Results UI**: Implement a new view (integrated into the sidebar/bottom sheet) that displays the top 3 ranked spots.
- **Walk Time Integration**: Calculate and display estimated walking time from the user's current location to the suggested spots.
- **Navigation Shortcuts**: Provide a "Navigate" button for each suggestion that pans/zooms the map to the spot and highlights it.
- **Quick Refinements**: Ensure users can easily adjust their needs (e.g., "Must have outlet") directly within the filter panel before triggering the find logic.

## Non-Functional Requirements
- **Performance**: Walk time and ranking calculations should be performed client-side and finish in <200ms.
- **Privacy**: GPS data should be used only for distance calculation and not stored or transmitted.
- **UX**: The transition from filters to results should be smooth and intuitive.

## Acceptance Criteria
- Tapping "Find My Spot" opens a list of the top 3 suggestions.
- Each suggestion shows the spot name, confidence score, and estimated walk time.
- Tapping a suggestion pans the map to the spot and opens its detailed card.
- The logic correctly prioritizes spots based on the current `viewMode` (campus vs city).

## Out of Scope
- Turn-by-turn navigation (external map app handoff is acceptable).
- Real-time traffic data for walk times.
