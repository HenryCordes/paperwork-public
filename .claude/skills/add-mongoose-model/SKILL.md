---
name: add-mongoose-model
description: Use when creating a new Mongoose model or schema in this project — "add a model", "new schema", "create a collection". Enforces multi-tenant isolation (tenant middleware + tenantId), validation, and static methods so a new model cannot silently leak across tenants.
---

# Add a Mongoose model

Scaffold a new model under `models/` following the project's conventions. See
[docs/DATA_MODEL.md](../../../docs/DATA_MODEL.md) and
[docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md).

## Checklist

1. Create `models/<Name>.js` with a Mongoose schema.
2. If the data is organization-scoped (almost always), add a `tenantId` field
   and apply the tenant middleware — match how an existing scoped model does it
   (e.g. `models/Invoice.js`). Read one first and copy the pattern.
3. Use descriptive field names that match what the frontend expects.
4. Define validation rules (required, enum, min/max, ref) in the schema.
5. Add static methods for common queries instead of scattering raw queries in
   controllers.
6. Never query the collection without tenant scoping outside explicit admin
   operations; resolve the tenant via `getCurrentTenantId()`.
7. Add/extend a test under `__tests__/` covering tenant isolation for the model
   (mirror `__tests__/integration/tenant-isolation.test.js`).

## Red flags

- A scoped schema with no `tenantId` / no tenant middleware.
- A static method that queries without the tenant filter.
- Reading `req.user.tenantId` directly anywhere in the flow.
