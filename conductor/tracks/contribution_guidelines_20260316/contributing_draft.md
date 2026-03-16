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
