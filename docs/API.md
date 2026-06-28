# API & Controllers

Read this when adding or changing routes, controllers, or logging. (Client-side
data fetching and caching live in [FRONTEND.md](FRONTEND.md).)

## Controller structure

- Wrap every controller function in `asyncHandlers` so async/await errors are
  caught. Pattern:
  `exports.[actionName] = asyncHandlers(async (req, res, next) => { ... })`.
- Document each endpoint with a comment stating method, route, and description.
- Return standardized JSON: a `success` flag plus `data` or `error`.

## Error handling

- Use try/catch in every async function; pass errors to `next()` server-side.
- Return detailed, client-safe error messages.
- Log server errors with context (see logging below).

## Logging (Pino)

- Use Pino as the logging library via a dependency-injected logger abstraction
  exposing `.child()` for context extension (Winston-compatible).
- Support adjustable log levels.
- Propagate rich context: request/correlation ID, user ID + email,
  tenant/organization ID + name, controller/route, current operation, flow.
- Keep logging cross-cutting — minimal logging code inside each function.
