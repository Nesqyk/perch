import { defineConfig } from 'vite';

export default defineConfig({
  // Two entry points: the student-facing app and the admin panel.
  // Both live in the same project and share all src/ modules.
  build: {
    rollupOptions: {
      input: {
        main:  'index.html',
        admin: 'admin.html',
      },
    },
  },

  // Expose only VITE_-prefixed variables to the client bundle.
  // VITE_GOOGLE_MAPS_API_KEY and VITE_SUPABASE_* are safe to expose
  // because they are restricted at the service level (referrer + RLS).
  envPrefix: 'VITE_',
});
