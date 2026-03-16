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
