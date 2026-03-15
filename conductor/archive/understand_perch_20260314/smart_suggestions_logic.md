# Smart Suggestions Ranking Logic Summary

## Overview
The Smart Suggestions feature (F1) filters and ranks study spots based on user preferences and real-time availability data. It aims to reduce the "roaming time" for students by highlighting the best options immediately.

## Ranking Algorithm
The `_rankSpots` function implements a two-stage process:

### 1. Hard Filtering (`_matchesFilters`)
Spots must meet ALL selected criteria to be included in the results:
- **Location**: If a specific building is selected, only on-campus spots in that building are shown.
- **Facilities**: Checks for specific amenities (`has_outlets`, `wifi_strength`, `noise_baseline`, `has_food`).
- **Capacity**: Ensures the spot's `rough_capacity` can accommodate the selected `groupSize`.

### 2. Weighted Ranking
Filtered spots are sorted using the following priorities:
1.  **On-Campus First**: On-campus spots are prioritized over off-campus locations to minimize travel time.
2.  **Effective Score**: Spots are then sorted by a calculated score (`_effectiveScore`):
    - **Base**: Confidence score from `spot_confidence`.
    - **Defaulting**: Expired or missing confidence data defaults to a neutral `0.5`.
    - **Walk Penalty**: Off-campus spots suffer a penalty of `-0.05` per minute of walk time (`walk_time_min`).

## Visual Feedback
- **Map Integration**: Instead of removing markers, the system sets `data-result-ids` on the map container. CSS then dims markers NOT in the result set, maintaining spatial context while guiding the eye.
- **Schedule Context**: Upon selecting a spot, the system fetches `schedule_entries` and dynamically calculates the availability window (e.g., "No class until 2:00 PM" or "Class in use until 11:30 AM").

## Constants
- **Group Tiers**: Solo (1), Small (2+), Medium (6+), Large (16+).
- **Capacity Tiers**: Small (8), Medium (20), Large (40).
