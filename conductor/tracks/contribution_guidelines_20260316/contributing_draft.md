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
