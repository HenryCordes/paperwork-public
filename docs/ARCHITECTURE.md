# Architecture

Read this when working on middleware, services, tenant context, or the database
connection.

## Multi-tenant isolation

The app is multi-tenant: each Organization has an isolated data context.

- Apply the tenant middleware to every model that stores tenant-specific data.
- Resolve the current tenant with `getCurrentTenantId()`. In controllers use:
  `const tenantId = getCurrentTenantId(req.organizationId)`. Never read
  `req.user.tenantId` directly — it may be undefined.
- Always include `tenantId` on organization-scoped models.
- Never bypass tenant filtering except for explicit admin operations.
- Tenant context is carried across async operations with a `cls-hooked`
  namespace (see `middleware/tenantHelper.js`).

## Middleware

- Build reusable middleware for cross-cutting concerns; establish tenant context
  via middleware.
- Chain middleware in a logical order.
- Document middleware behaviour with JSDoc.

## Services

- Extract complex business logic into dedicated service modules; keep
  controllers thin by delegating to services.
- Services are stateless and functional.
- Document service functions with JSDoc.

## Database connection

- Use Mongoose for all MongoDB connections.
- Configure connections in `config/db.js`, loading env vars from
  `config/config.env`. Keep connection parameters in environment variables.
- Use connection pooling; add reconnection logic with exponential backoff.
- Log connection lifecycle events (connected, error, disconnected).
