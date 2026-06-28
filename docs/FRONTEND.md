# Frontend

Read this when working in `client/` — components, pages, routes.

- Separate pages from reusable components; group related functionality in
  dedicated directories.
- Use PascalCase for component names.
- Use protected route components for auth/subscription checks
  (`<PrivateRoute>`, `<SubscriptionProtect>` — see [AUTH_PAYMENTS.md](AUTH_PAYMENTS.md)).
- Functional components with hooks.
- Money is always shown in Dutch format (see AGENTS.md conventions).

## Data fetching & caching

The client caches server data with TanStack Query (`@tanstack/react-query`) — do
not hand-roll fetching/caching in `useEffect`.

- One hook module per domain under `client/src/hooks/api/` (e.g.
  `useInvoices.js`, `useContacts.js`, `useExpenses.js`). Add new server data
  access there following the existing pattern; don't call `fetch`/`axios`
  directly from components.
- The `QueryClientProvider` and default options live in `client/src/index.js`.
- Set a sensible `staleTime` per query instead of refetching on every mount.
- After a mutation, `invalidateQueries` for the affected keys so the UI reflects
  the write.
- Background on the migration to this pattern:
  `client/src/docs/react-query-migration.md`.
