# Vite Configuration and Build Process Summary

## Entry Points
Vite is configured to support two distinct HTML entry points, allowing for a single project to serve both the student app and the admin dashboard while sharing the same underlying module structure:
- **Student App**: `index.html` (mounts `src/main.js`)
- **Admin Dashboard**: `admin.html` (mounts `src/admin.js`)

## Build Pipeline
The project uses the standard Vite/Rollup build pipeline:
- **Development**: `npm run dev` starts the Vite HMR server.
- **Production**: `npm run build` generates a minified, optimized bundle in the `dist/` directory.
- **Preview**: `npm run preview` serves the production build locally.

## Environment Variables
- Vite exposes variables prefixed with `VITE_` to the client-side code via `import.meta.env`.
- Key variables include `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_ADMIN_PASSWORD` (used for simple gatekeeping in Phase 1).

## Module System
- The project uses native ES Modules (`"type": "module"` in `package.json`), which Vite resolves and bundles.
- CSS and other assets are imported directly into JS files as side-effects, enabling Vite to manage styles and assets.
