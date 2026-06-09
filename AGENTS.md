# AI Agent Rules

> Read by AI coding assistants (Claude Code, Cursor, Copilot, Windsurf). This is
> the single source of truth for how to work in this project. Tool-specific files
> (`CLAUDE.md`, etc.) redirect here rather than duplicate rules.

## Documentation Index

Load the right doc for the task instead of reading everything:

| Topic | File | When to read |
|-------|------|-------------|
| Architecture & multi-tenancy | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Working on middleware, services, tenant context, or DB connection |
| API & controllers | [docs/API.md](docs/API.md) | Adding/changing routes, controllers, or logging |
| Data model | [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Creating or changing Mongoose models/schemas |
| Background jobs | [docs/QUEUES.md](docs/QUEUES.md) | Adding or changing Bull/Redis queue processors |
| Document storage | [docs/STORAGE.md](docs/STORAGE.md) | Anything touching S3 / file uploads |
| Email | [docs/EMAIL.md](docs/EMAIL.md) | Sending email or adding templates |
| Auth & payments | [docs/AUTH_PAYMENTS.md](docs/AUTH_PAYMENTS.md) | Touching login/logout, JWT, subscriptions, or Mollie flows |
| Frontend | [docs/FRONTEND.md](docs/FRONTEND.md) | Working in `client/` — components, pages, routes, data fetching/caching |
| Deployment | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploy/runtime/Heroku questions |

## Tech Stack

- Backend: Node.js 20+, Express 4, Mongoose 8 / MongoDB 8
- Frontend: React 18, Redux, TanStack Query (`@tanstack/react-query`) (`client/`)
- Jobs: Bull on Redis (`worker.js`, `services/queues/`)
- Integrations: Mollie (payments/subscriptions), Mailjet (email), Firebase Admin (push), AWS S3 (documents)
- Logging: Pino (structured)
- Tests: Jest + Supertest + MongoDB Memory Server
- Package manager: **npm** (not yarn)

## Principles (always apply)

- **Multi-tenant isolation is sacred.** Every organization-scoped model carries
  `tenantId`. Always resolve the tenant via `getCurrentTenantId()`; never read
  `req.user.tenantId` directly (it may be undefined). Standard controller
  pattern: `const tenantId = getCurrentTenantId(req.organizationId)`. Never
  bypass tenant filtering except in explicit admin operations. Detail:
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **Security.** Never expose credentials in client code. Use environment
  variables for configuration. Validate and sanitize all user input. Maintain
  correct CORS policies.
- **Error handling.** Use try/catch in every async function. Pass errors to
  `next()` in server-side code. Return client-safe messages; log server errors
  with context.
- **Conventions.** Show money in Dutch format everywhere (dashboard, lists,
  entity detail, Excel/CSV exports): two decimals, comma as decimal separator,
  period as thousands separator. Use constants, never magic strings, for domain
  values (e.g. `PERIOD_PRESETS`, `PERIOD_TYPES`); keep shared constants in
  dedicated files so frontend and backend use the same canonical values. Check
  for and reuse existing patterns before introducing new ones.

## Workflow (spec-driven)

1. Brainstorm -> 2. Spec -> 3. Implementation plan -> 4. Implement.

Each feature gets its own folder under [specs/](specs) holding its `design.md`
(the spec) and `plan.md` (the implementation plan), e.g.
`specs/2026-06-07-claude-code-agentic-setup/`.

For agentic execution use the Superpowers skills
(`superpowers:executing-plans`, `superpowers:subagent-driven-development`) to
implement plans task-by-task.

## Commit & PR rules

- Never commit to `main`. Branch first; use Conventional Commits with an
  imperative subject and a why-not-what body.
- Run `npm test` before staging.
- Never commit automatically — only on explicit user authorization.
