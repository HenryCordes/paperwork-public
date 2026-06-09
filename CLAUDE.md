# CLAUDE.md — Project Context for Claude Code

## Source of truth

All AI agent rules, conventions, and standards live in [AGENTS.md](AGENTS.md).
**Read it first** — it covers the tech stack, the always-apply principles
(multi-tenant isolation, security, error handling, conventions), the
documentation index, the spec-driven workflow, and commit/PR rules. This file
stays thin to avoid duplicating that source of truth.

## Skills & subagents

- **Skills** ([.claude/skills/](.claude/skills)): `add-mongoose-model`,
  `add-queue-processor`, `add-email-template` — recurring scaffolding tasks with
  the project's conventions baked in.
- **Subagents** ([.claude/agents/](.claude/agents)): `tenant-isolation-reviewer`
  — dispatch with the `Agent` tool to review a diff for tenant-leak risk.

## Workflow

Brainstorm -> spec -> implementation plan -> implement, on the
[Superpowers](https://github.com/obra/superpowers) workflow. Specs and plans
live in [specs/](specs).
