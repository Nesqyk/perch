# Contribution Guidelines

Welcome to Perch! This document outlines the standards and workflows for both human and AI-assisted contributors.

## Git Workflow & Branching

We use a modified Git Flow strategy to manage our development process.

### Branching Strategy
- **`main`**: The stable production branch. Only merges from `dev` happen here.
- **`dev`**: The integration branch for current development. All features and bug fixes should target this branch.
- **Feature Branches (`feat/...` or `fix/...`)**: Always create a new branch off `dev` for any non-trivial work.
- **Conductor Tracks**: When working on a Conductor track, the AI will often work directly on the branch provided by the user.

### Pull Requests (PRs)
- **Target `dev`**: All PRs for new work should target the `dev` branch.
- **Atomic Changes**: Keep PRs focused on a single logical change. Small, frequent PRs are easier to review.
- **PR Template**: Follow the repository's PR template, ensuring all sections (Summary, Type, Changes, Testing) are completed.
- **Merge Criteria**: PRs must pass all CI checks (Lint, Tests) and receive at least one approval before merging into `dev`.

## Conductor TDD Lifecycle

All technical tasks follow a strict Test-Driven Development (TDD) lifecycle within the Conductor framework.

### 1. Select & Mark In-Progress
- Pick the next sequential task from `plan.md`.
- Change its status from `[ ]` to `[~]`.

### 2. Red Phase: Write Failing Tests
- Create a corresponding test file in `tests/unit/` if it doesn't exist.
- Write unit tests that define the expected behavior.
- **CRITICAL**: Run the tests and confirm they fail. Do not write implementation code yet.

### 3. Green Phase: Implement
- Write the **minimum** amount of code to make the tests pass.
- Run the test suite again to confirm all tests pass.

### 4. Refactor
- Improve the implementation or test code without changing behavior.
- Ensure all tests still pass.

### 5. Verify & Commit
- Check code coverage (Target: >80% for new logic).
- Commit code changes with a clear message.
- Attach a detailed task summary using `git notes`.
- Record the commit hash in `plan.md` and mark as complete `[x]`.

### Phase Completion
Immediately after the last task of a phase is complete, trigger the **Phase Completion Verification Protocol**:
1. Ensure test coverage for all phase changes.
2. Execute automated tests with proactive debugging.
3. Propose and execute a manual verification plan.
4. Create a checkpoint commit and attach an auditable report via Git notes.

## Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) to maintain a clear and readable history.

### Format
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools and libraries such as documentation generation

### Examples
- `feat(ui): add "Find My Spot" button to sidebar`
- `fix(api): resolve RLS error in upsertProfile`
- `docs(plan): mark task 'Create user model' as complete`
- `style(mobile): improve button touch targets`
- `test(api): add unit tests for profile service`
- `chore(conductor): archive completed track 'Find My Spot'`
- `refactor(core): consolidate event emission logic`

## AI-Human Collaboration

Perch is built using AI-assisted development. We leverage AI agents to accelerate implementation while maintaining human oversight for architecture and quality.

### Roles & Responsibilities
- **Human (Architect/Reviewer)**: 
    - Defines the project vision and goals (`product.md`).
    - Approves technical specifications and implementation plans.
    - Performs final code reviews and manual verification.
    - Provides high-level guidance when AI agents are stuck.
- **AI Agent (Implementer)**:
    - Analyzes existing code and documentation.
    - Generates specifications (`spec.md`) and plans (`plan.md`) for user approval.
    - Executes the Conductor TDD workflow (Red/Green/Refactor).
    - Documents changes using Git notes and updated plan files.

### The Feedback Loop
Collaborators should treat interactions with AI agents as an iterative dialogue:
1. **Request**: Clear, specific instruction (e.g., "/conductor:newTrack ...").
2. **Analysis/Planning**: AI proposes a plan; Human reviews and provides feedback (e.g., "Adjust Phase 2 to include...").
3. **Implementation**: AI implements a task; Human reviews the code or automated test results.
4. **Correction**: If AI makes a mistake, the human provides a "course correction" prompt (e.g., "The API should use snake_case for this field...").
5. **Validation**: Human performs manual verification steps provided by the AI.

## Prompt Engineering Guide

Effective communication with AI agents is critical for project success. Follow these principles when prompting for code changes.

### General Best Practices
1. **Be Specific & Concise**: Avoid vague requests. Instead of "Fix the map," say "Update `src/map/pins.js` to change the pulse animation color to emerald green (#22c55e)."
2. **Provide Context**: Use the `@` symbol or explicit file paths to point the AI to relevant files. Refer to `ARCHITECTURE.md` for high-level system understanding.
3. **Define Constraints**: Explicitly state what to avoid (e.g., "Do not use external libraries," "Follow the Purple Ban").
4. **Iterative Refinement**: If the AI's first attempt is incorrect, provide specific feedback on the error rather than repeating the original request.
5. **Use the Conductor Prefix**: For new work, start with `/conductor:setup`, `/conductor:newTrack`, or `/conductor:implement`.

### Perch-Specific Patterns

Use these templates to get the best results for common Perch tasks:

#### 1. Modifying Map Logic
> "Update the Leaflet implementation in `src/map/pins.js`. I want to add a new marker type for 'Study Cafes'. Refer to `src/map/mapInit.js` for coordinate constraints and use the `iconSvg` helper from `src/ui/icons.js` for the new icon."

#### 2. Adding State & Events
> "I need to track 'User Favorites' in the central store. Update `src/core/store.js` to add a `favorites` array to the state and a `TOGGLE_FAVORITE` action. Also, define a `FAVORITES_CHANGED` event in `src/core/events.js`."

#### 3. Database & RLS
> "Create a migration in `supabase/migrations/` to add a `user_favorites` table. Ensure Row Level Security (RLS) is enabled so users can only see their own favorites, identified by the `x-perch-session` header. Refer to `supabase/migrations/20260315000001_user_profiles.sql` for the session header pattern."

## Quality Assurance & Manual Verification

Every implementation must be verified both automatically (tests) and manually to ensure it meets user expectations.

### Automated Testing
- All logic-heavy modules must have unit tests in `tests/unit/`.
- Aim for >80% coverage for new code.
- Run tests using `npm test`.

### Manual Verification Protocols
Before closing a track, follow these standard protocols:

#### Frontend Changes (UI/UX)
1. **Start Dev Server**: `npm run dev`.
2. **Device Testing**: Verify on both Desktop (Chrome/Firefox) and Mobile (Safari/Chrome).
3. **Visual Audit**: Confirm colors, spacing, and icons match `product-guidelines.md`.
4. **Interactive Flow**: Complete the full user journey (e.g., from filter selection to spot navigation).

#### Backend Changes (API/Database)
1. **Migration Integrity**: Confirm the migration runs without errors in the Supabase SQL Editor.
2. **RLS Validation**: Verify that unauthorized sessions cannot access or modify restricted data.
3. **API Contracts**: Use the browser console to call new API functions and verify response shapes.
- **Data Sync**: Confirm that changes in the database are reflected in the UI in real-time.

### Code Review Checklist
Before approving a PR, reviewers (human or AI) must verify:

1. **Architecture**: Does the change respect the unidirectional data flow (Event Bus -> Store -> UI)?
2. **Guidelines**: Does the UI follow `product-guidelines.md` (e.g., Purple Ban)?
3. **Security**: Are RLS policies updated correctly? No secrets in `VITE_` variables?
4. **Efficiency**: Are network calls minimized? Is the Leaflet map rendering performing well?
5. **Maintainability**: Is the code modular? Are variable names clear and consistent?
6. **Tests**: Are unit tests included? Do they pass?
7. **Documentation**: Are complex logic blocks commented? Is the track's `plan.md` updated?

## Additional Resources

To better understand the codebase and our standards, refer to these documents:

- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: High-level system design and module overview.
- **[AGENTS.md](./AGENTS.md)**: Detailed coding standards and developer guide for AI agents.
- **[Product Definition](./conductor/product.md)**: Project vision and core features.
- **[Tech Stack](./conductor/tech-stack.md)**: List of technologies and frameworks used.
- **[Workflow](./conductor/workflow.md)**: Definitive project development lifecycle.

