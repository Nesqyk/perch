// eslint.config.js — ESLint flat config (ESLint v9+)
// Rules: catch real bugs without being noisy.
// No Prettier integration (formatting is out-of-scope for CI speed).

export default [
  {
    // Apply to all JS source files.
    files: ['src/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser globals (no eslint-plugin-browser needed in flat config).
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        history: 'readonly',
        crypto: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        CustomEvent: 'readonly',
        EventTarget: 'readonly',
        // Node / Vitest globals (for test files).
        process: 'readonly',
      },
    },
    rules: {
      // ── Possible errors ───────────────────────────────────────────────────
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',

      // ── Best practices ────────────────────────────────────────────────────
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'warn',
      'curly': ['error', 'multi-line'],

      // ── ES module hygiene ─────────────────────────────────────────────────
      'no-duplicate-imports': 'error',
    },
  },
  {
    // Relax console rules for test files.
    files: ['tests/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
];
