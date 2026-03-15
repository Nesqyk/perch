# Perch — Database Schema

```mermaid
erDiagram
    campuses {
        uuid id PK
        text name
        text short_name
        text city
        numeric lat
        numeric lng
        numeric bounds_sw_lat
        numeric bounds_sw_lng
        numeric bounds_ne_lat
        numeric bounds_ne_lng
        integer default_zoom
        boolean is_active
        timestamptz created_at
    }

    spots {
        uuid id PK
        uuid campus_id FK
        text name
        text type
        boolean on_campus
        text building
        text floor
        integer walk_time_min
        text rough_capacity
        boolean has_outlets
        text wifi_strength
        text noise_baseline
        boolean has_food
        numeric lat
        numeric lng
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    spot_confidence {
        uuid spot_id PK, FK
        numeric score
        text reason
        timestamptz valid_until
        timestamptz updated_at
    }

    claims {
        uuid id PK
        uuid spot_id FK
        text session_id
        text group_size_key
        integer group_size_min
        integer group_size_max
        timestamptz claimed_at
        timestamptz expires_at
        timestamptz cancelled_at
    }

    corrections {
        uuid id PK
        uuid spot_id FK
        text session_id
        text reason
        timestamptz corrected_at
        integer day_of_week
        integer hour_of_day
    }

    schedule_entries {
        uuid id PK
        uuid spot_id FK
        text subject_code
        text section
        integer day_of_week
        time start_time
        time end_time
    }

    spot_submissions {
        uuid id PK
        uuid campus_id FK
        text spot_name
        text description
        text submitted_by
        text session_id
        text status
        numeric lat
        numeric lng
        timestamptz created_at
    }

    campuses ||--o{ spots : "has spots"
    campuses ||--o{ spot_submissions : "receives submissions"
    spots ||--|| spot_confidence : "has score"
    spots ||--o{ claims : "claimed at"
    spots ||--o{ corrections : "reported at"
    spots ||--o{ schedule_entries : "has schedule"
```

## Notes

- `spot_confidence.spot_id` is both PK and FK — one row per spot, auto-seeded on `spots` INSERT via trigger.
- `claims.cancelled_at` nullable — null + future `expires_at` = active claim.
- `corrections` is append-only (no update columns) — the `refresh_spot_confidence()` fn aggregates them.
- `spot_submissions` has no FK to `spots` — independent until an admin promotes one.
- `rough_capacity`: `small` (~8) | `medium` (~20) | `large` (~40)
- `wifi_strength`: `none` | `weak` | `ok` | `strong`
- `noise_baseline`: `quiet` | `moderate` | `loud`
- `group_size_key`: `solo` | `small` | `medium` | `large`
- `corrections.reason`: `locked` | `occupied` | `overcrowded` | `event`
- `spot_submissions.status`: `pending` | `approved` | `rejected`
- `campuses`: Each row holds map center + bounding box. Used by `mapInit.js` for `flyToBounds`/`maxBounds`.
