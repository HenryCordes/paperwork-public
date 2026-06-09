# Data Model

Read this when creating or changing Mongoose models/schemas. To scaffold a new
model, use the `add-mongoose-model` skill.

- Always apply the tenant middleware to organization-specific schemas, and store
  `tenantId` on them.
- Use descriptive field names that match frontend expectations.
- Define appropriate validation rules in the schema.
- Implement static methods for common operations.
- Resolve tenant via `getCurrentTenantId()`; never `req.user.tenantId` directly.
  See [ARCHITECTURE.md](ARCHITECTURE.md) for the tenant context model.
