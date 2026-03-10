# Perch — Database Schema

```mermaid
erDiagram
    spots {
        uuid id PK
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
        text spot_name
        text description
        text submitted_by
        text status
        timestamptz created_at
    }

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
