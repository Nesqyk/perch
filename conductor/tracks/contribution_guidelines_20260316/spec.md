# Track Specification: Contribution and Prompt Engineering Guidelines

## Overview
This track aims to create a comprehensive `CONTRIBUTING.md` in the project root. This document will serve as the definitive guide for both human and AI-assisted collaborators, ensuring consistency in technical execution, effective communication with AI agents, and rigorous quality assurance.

## Functional Requirements
- **Technical Workflow**: 
    - Document the Git branching strategy (`dev` as integration, feature branches for work).
    - Detail the Conductor TDD lifecycle (Red -> Green -> Refactor -> Checkpoint).
    - Provide examples of Conventional Commit messages.
- **AI-Human Collaboration**:
    - Define roles and responsibilities when using AI agents (e.g., human as "Architect", AI as "Implementer").
    - Guidelines for providing feedback and "Red/Green" cycles during implementation.
- **Review & QA Standards**:
    - Explicit steps for manual verification protocols.
    - Code review checklists based on `ARCHITECTURE.md` and `AGENTS.md`.
- **Prompt Engineering Guide**:
    - **General Best Practices**: Clarity, specificity, and constraints.
    - **Perch-Specific Patterns**: How to prompt for Map logic (Leaflet), State Store (dispatch/subscribe), and Database Security (RLS).
    - **Context Management**: Instructions on injecting project documentation into prompts.

## Non-Functional Requirements
- **Format**: Markdown with clear headers, tables, and code blocks.
- **Tone**: Professional, technical, and collaborative.
- **Visibility**: Must be placed in the project root for automatic discovery by platforms like GitHub.

## Acceptance Criteria
- `CONTRIBUTING.md` exists in the project root.
- The document clearly explains how to use the Conductor workflow.
- A dedicated section provides actionable prompt templates/patterns for the Perch codebase.
- Documentation accurately reflects the current `workflow.md` and `ARCHITECTURE.md`.

## Out of Scope
- Modifying the actual `workflow.md` script logic.
- Setting up automated PR templates (unless as a small sub-task).
