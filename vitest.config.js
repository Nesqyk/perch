// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run tests in a Node.js-like environment (no browser APIs by default).
    // Individual tests that need window/localStorage use jsdom via the
    // @vitest/browser preset or inline `environment` overrides.
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.js'],
      exclude: [
        'src/main.js',
        'src/admin.js',
        'src/map/**',
        'src/ui/**',
        'src/api/**',
      ],
    },
  },
});
