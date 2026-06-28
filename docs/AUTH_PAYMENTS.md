# Auth & Payments

Read this when touching login/logout, JWT, subscriptions, or Mollie flows.
These are critical paths — test both flows thoroughly after any change.

## Authentication

- JWT tokens are stored in localStorage and set in auth headers.
- Use `<PrivateRoute>` for routes requiring authentication and
  `<SubscriptionProtect>` for routes requiring a valid subscription.
- Use correct HTTP status codes: 401 for authentication failures, 403 for
  authorization failures.
- All authentication state changes must update UI components correctly.

## Payment / subscription flow

- Keep a clear separation between auth logic and payment-status logic.
- The "payment missed" login/logout flow is a separate critical path from the
  regular login/logout flow; both must keep working in all circumstances.
- Payment status is checked during the authentication flow.
- Failed payments trigger appropriate notifications and UI states.
- Log all authentication and payment state changes for debugging.
- Mollie integration: `routes/payments.js`, `controllers/payments.js`,
  `models/Subscription.js`.
