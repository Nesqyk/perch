# ESLint and Vitest Setup Summary

## ESLint Configuration
- **Version**: ESLint v9+ (Flat Config).
- **Scope**: Covers all files in `src/` and `tests/`.
- **Environment**: Configured for ES2022 Modules and Browser globals.
- **Key Rules**:
    - `no-undef`: Prevents usage of undeclared variables.
    - `eqeqeq`: Enforces strict equality.
    - `no-var`: Encourages `let`/`const`.
    - `no-unused-vars`: Warns about unused variables (ignoring those starting with `_`).
- **Goal**: Maintain code hygiene and catch common errors during development and CI.

## Vitest Testing Framework
- **Role**: Primary unit testing framework.
- **Environment**: Default `node` environment for speed; logic-heavy tests use `jsdom` where browser APIs are required.
- **Test Discovery**: Automatically includes files matching `tests/unit/**/*.test.js`.
- **Coverage Strategy**:
    - **Provider**: `v8`.
    - **Target**: Focuses on core business logic, utility functions, and state management.
    - **Exclusions**: UI components, direct API calls, and entry points are currently excluded from coverage to focus on deterministic logic.
- **Reporters**: Outputs both human-readable text and `lcov` for CI/CD integration.

## CI/CD Integration
- Both ESLint and Vitest are integrated into the project's scripts (`npm run lint`, `npm test`) for automated validation during pull requests and deployments.
