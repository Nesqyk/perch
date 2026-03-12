# AGENTS.md — Perch Codebase Guide

Guidance for agentic coding agents working in this repository.

---

## Commands

```bash
# Dev server
npm run dev

# Production build
npm run build

# Lint all source files
npm run lint

# Run all unit tests (CI mode)
npm test

# Run a single test file
npx vitest run tests/unit/capacity.test.js

# Watch mode (development)
npx vitest tests/unit/capacity.test.js

# Coverage report
npm run test:coverage
```

> **Node memory constraint (WSL):** prefix commands with
> `NODE_OPTIONS="--max-old-space-size=512"` if the process OOMs.

---

## CI Pipeline

Push to `dev` or PR to `main` runs in order:

1. `npm run lint` — ESLint must pass with zero errors
2. `npm test` — all Vitest tests must pass
3. `npm run build` — Vite bundle must compile clean

All three must pass before a PR can be merged. Never push directly to `main`.

---

## Project Structure

```
src/
  core/       events.js, store.js, router.js      # shared infrastructure
  state/      spotState.js                         # pure derivation helpers
  api/        supabaseClient.js, spots.js,
              claims.js, corrections.js, realtime.js
  features/   claim.js, reportFull.js,
              smartSuggestions.js                  # business logic
  ui/         sidebar.js, bottomSheet.js,
              spotCard.js, filterPanel.js,
              claimPanel.js, reportPanel.js,
              toast.js, modal.js
  map/        mapLoader.js, mapInit.js,
              pins.js, mapControls.js
  utils/      session.js, capacity.js,
              confidence.js, time.js
  styles/     main.css (design tokens) + per-component CSS
tests/
  unit/       *.test.js                            # pure logic only
supabase/
  migrations/ *.sql                                # chronological, never edited
  seed.sql
  SCHEMA.md                                        # Mermaid ER diagram
```

---

## Architecture — Unidirectional Data Flow

```
User action
  → UI emits EVENTS.UI_*  (via emit())
    → Feature module handles it, calls API module
      → dispatch(ACTION, payload)
        → store.js mutates _state, emits EVENTS.*
          → UI + map listeners re-render
```

Realtime short-circuit: Supabase Realtime → `realtime.js` → `dispatch()` directly.

**Rules:**
- Sibling modules never import each other. All cross-module communication goes through the event bus (`core/events.js`).
- `getState()` is the only way to read state from outside `store.js`.
- `dispatch()` is the only way to write state.
- Always use `EVENTS.*` constants — never raw event name strings.
- Action names passed to `dispatch()` are `SCREAMING_SNAKE_CASE` string literals.

```js
// Reading
const { spots, filters } = getState();

// Writing
dispatch('CLAIM_ADDED', { spotId, claim, isMine: true });

// Listening
on(EVENTS.SPOTS_LOADED, (e) => { const { spots } = e.detail; });
```

---

## Code Style

### Exports
- **Named exports only.** No default exports anywhere.
- Entry points (`main.js`, `admin.js`) export nothing — pure side-effect bootstraps.
- Private helpers use an underscore prefix and are not exported.
- Exception: `_rankSpots` in `smartSuggestions.js` is exported solely for testing.

### Naming

| Context | Convention | Example |
|---|---|---|
| Functions | `camelCase` | `fetchSpots`, `initMap` |
| Private functions / vars | `_camelCase` | `_onClaimRequested`, `_map` |
| Exported config constants | `SCREAMING_SNAKE_CASE` | `EVENTS`, `PIN_COLORS` |
| DOM references (admin.js) | `$camelCase` | `$loginBtn`, `$gate` |
| Dispatch action strings | `SCREAMING_SNAKE_CASE` | `'SET_FILTERS'`, `'CLAIM_ADDED'` |
| CSS classes | `kebab-case` | `spot-card`, `btn-primary` |
| Source files | `camelCase.js` | `spotCard.js`, `mapInit.js` |
| Test files | `<subject>.test.js` | `capacity.test.js` |

### Imports
Group imports with a blank line between groups, in this order:

1. Third-party packages
2. `core/` modules
3. `utils/` modules
4. `map/` modules
5. `api/` modules
6. `features/` modules
7. `ui/` modules

Use em-dash section comments for in-file navigation:

```js
// ─── Section Name ─────────────────────────────────────────────────────────────
```

### JSDoc
Every exported function requires a JSDoc block with `@param` and `@returns`.
Module-level variables get inline `/** @type {Type} */` annotations.
Every file starts with a file-level block describing its purpose and constraints.

```js
/**
 * Short description.
 *
 * @param {string} spotId
 * @returns {{ remaining: number | null, label: string }}
 */
export function calcRemainingCapacity(spotId) { ... }
```

### Error Handling
- `console.error('[moduleName] message:', err)` — unrecoverable failures, missing env vars.
- `console.warn('[moduleName] message')` — non-fatal issues, unknown dispatch actions.
- `console.info` — sparingly, lifecycle milestones only.
- Wrap every `await` that affects user-visible state in `try/catch`.
- Supabase calls: always destructure `{ data, error }`, early-return on `error`.
- Optimistic updates are allowed — `dispatch()` before the async call resolves, then reconcile on error.
- `console.log` is **not allowed** in `src/` (ESLint will warn; CI will catch it).

### CSS
All design values are CSS custom properties defined in `src/styles/main.css`.
Never hardcode colors, spacing, or font sizes in component stylesheets — reference variables only.

```css
/* Good */
color: var(--color-brand);
padding: var(--space-4);

/* Bad */
color: #3b82f6;
padding: 16px;
```

Pin state colors in CSS (`--pin-free`, `--pin-claimed`, etc.) must stay in sync with
`PIN_COLORS` in `src/map/pins.js`.

### HTML template strings
Use a `/* html */` hint before template literals for editor syntax highlighting:

```js
const markup = /* html */`<div class="spot-card">...</div>`;
```

### Breakpoints
Desktop ≥ 768px (`window.matchMedia('(min-width: 768px)')`).
`sidebar.js` handles desktop; `bottomSheet.js` handles mobile. Only one is active at a time.

---

## Testing

Unit tests live in `tests/unit/`. Only pure logic is tested — no DOM, no network.

Modules under coverage: `src/core/`, `src/state/`, `src/utils/`, `src/features/`.
Excluded from coverage: `src/main.js`, `src/admin.js`, `src/map/`, `src/ui/`, `src/api/`.

When a test imports a module that transitively pulls in `supabaseClient.js`, mock it:

```js
vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: { from: vi.fn(), channel: vi.fn(() => ({ on: vi.fn(), subscribe: vi.fn() })) },
}));
```

Tests that need `localStorage` must declare `@vitest-environment jsdom` at the top and call
`vi.resetModules()` + `localStorage.clear()` in `beforeEach` to reset module-level state.

Use factory functions for fixtures, not inline objects:

```js
function spot(overrides = {}) {
  return { id: 'spot-1', on_campus: true, rough_capacity: 'medium', ...overrides };
}
```

---

## Database Migrations

- Files live in `supabase/migrations/` named `YYYYMMDD_NNN_description.sql`.
- **Never edit an existing migration.** Add a new one.
- Every migration that adds a table must also add RLS policies (see `004_rls_policies.sql`).
- After adding a migration, update `supabase/SCHEMA.md` to keep the Mermaid diagram current.

---

## Environment Variables

| Variable | Required | Used by |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | `supabaseClient.js` |
| `VITE_SUPABASE_ANON_KEY` | Yes | `supabaseClient.js` |
| `VITE_GOOGLE_MAPS_API_KEY` | Yes | `mapLoader.js` |
| `VITE_ADMIN_PASSWORD` | Yes | `admin.js` |

Copy `.env.example` to `.env` and fill in values before running `npm run dev`.
Never commit `.env` — it is gitignored.
