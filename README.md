<p align="center">
  <img src="./public/github_banner.png" alt="Perch banner" width="100%" />
</p>

<h1 align="center">Perch</h1>

<p align="center"><em>Stop roaming. Start studying.</em></p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue?style=flat-square" alt="version" />
  <img src="https://img.shields.io/badge/built%20with-Vite-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/backend-Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Vanilla%20JS-ES6%20Modules-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="Vanilla JS" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License" />
</p>

---

Perch is a real-time, map-based web app that helps Filipino college students find available study spots the moment their professor moves class online. Open the link in your group chat, see what's free, claim your spot, and share it — no account needed.

## Stack

| | |
|---|---|
| Frontend | Vanilla JS (ES6 modules), HTML5, CSS3 |
| Build | Vite |
| Map | Google Maps JavaScript API |
| Backend | Supabase (PostgreSQL + Realtime) |

## Getting Started

```bash
# 1. Clone
git clone https://github.com/Nesqyk/perch.git && cd perch

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Fill in VITE_GOOGLE_MAPS_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_ADMIN_PASSWORD

# 4. Run
npm run dev
```

Admin panel is available at `/admin`.

## Project Structure

<details>
<summary>Show file tree</summary>

```
src/
├── main.js               # Student app entry point
├── admin.js              # Admin panel entry point
├── core/
│   ├── events.js         # Pub/sub event bus
│   ├── store.js          # Central state + dispatch
│   └── router.js         # URL param read/write
├── map/
│   ├── mapLoader.js      # Google Maps SDK loader
│   ├── mapInit.js        # Map instance
│   ├── pins.js           # Marker CRUD + animations
│   └── mapControls.js    # Zoom + locate-me buttons
├── api/
│   ├── supabaseClient.js
│   ├── spots.js
│   ├── claims.js
│   ├── corrections.js
│   └── realtime.js
├── features/
│   ├── smartSuggestions.js   # F1 — ranked spot suggestions
│   ├── claim.js              # F2 — claim a spot
│   └── reportFull.js         # F3 — report a spot full
├── ui/
│   ├── filterPanel.js
│   ├── spotCard.js
│   ├── claimPanel.js
│   ├── reportPanel.js
│   ├── sidebar.js            # Desktop panel
│   ├── bottomSheet.js        # Mobile swipe sheet
│   ├── toast.js
│   └── modal.js
├── state/
│   └── spotState.js          # Derived spot status helpers
├── utils/
│   ├── session.js
│   ├── confidence.js
│   ├── capacity.js
│   └── time.js
└── styles/
    ├── main.css
    ├── map.css
    ├── sidebar.css
    ├── bottomSheet.css
    ├── spotCard.css
    ├── filters.css
    └── admin.css
```

</details>

## Database Schema

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

## License

[MIT](./LICENSE) © 2026 Nesqyk
