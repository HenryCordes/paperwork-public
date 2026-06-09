# Requirements Document

## Introduction

The application uses Mollie for subscription billing. After a customer completes their first payment, Mollie should automatically charge them every month and send a webhook notification. Currently, customers are locked out after the first billing cycle because of several compounding bugs:

1. `payment.nextPaymentDate` does not exist on the Mollie Payment object — only on the Mollie Subscription object. The code uses this undefined value as the `startDate` when creating the Mollie subscription, so the subscription is created without a valid start date, and `nextPaymentDate` is never stored correctly.
2. The recurring-payment webhook block updates a `.lean()` plain object and never calls `.save()`, so the status update is silently discarded.
3. `getSubscriptionManagement` overrides the database `subscriptionStatus` with a time-based `payment_overdue` calculation that ignores `nextPaymentDate`, locking out users even when Mollie has charged them successfully.
4. `paymentFailCount`, `payment_issue`, and `cancelDate` are used in the controller but not defined in the Mongoose schema, so they silently fail to persist.
5. `customerSubscriptions.cancel` is called with the wrong argument shape.

This spec covers fixing the end-to-end recurring subscription flow: webhook processing, subscription status persistence, and the subscription management query.

## Glossary

- **Subscription**: A record in the `subscriptions` collection that tracks a tenant's billing state.
- **Mollie Subscription**: A recurring payment schedule created in Mollie after the first payment succeeds (`sequenceType: "first"`).
- **Webhook**: An HTTP POST from Mollie to our server notifying us of a payment status change.
- **First Payment**: The initial payment with `sequenceType: "first"` that establishes a mandate and triggers Mollie subscription creation.
- **Recurring Payment**: A subsequent automatic payment with `sequenceType: "recurring"` triggered by the Mollie subscription.
- **Mandate**: Authorization from the customer allowing Mollie to charge them automatically.
- **`subscriptionStatus`**: Field on the Subscription model representing the current billing state (`pending`, `active`, `payment_issue`, `canceled`).
- **`startDate`**: The `YYYY-MM-DD` formatted date field on a Mollie Subscription that determines when the first recurring charge fires. Must be derived from the Mollie Subscription object, not the Payment object.
- **`nextPaymentDate`**: Field on both the Mollie Subscription object and our Subscription model. On the Mollie Subscription it is a `YYYY-MM-DD` string; on our model it is a `Date`. The Payment object does NOT have this field.
- **`subscriptionPayDate`**: Field on the Subscription model storing the date of the last successful payment.
- **Tenant**: An organization in the multi-tenant system, identified by `tenantId`.
- **`getSubscriptionManagement`**: The API endpoint (`GET /api/payment/subscriptions`) that the frontend queries to determine if a user has access.

## Requirements

### Requirement 1

**User Story:** As a subscriber, I want my subscription to remain active after the first billing cycle, so that I am not locked out of the application when Mollie charges me automatically each month.

#### Acceptance Criteria

1. WHEN Mollie sends a webhook for a recurring payment with `status: "paid"`, THE System SHALL update the Subscription record's `subscriptionStatus` to `"active"` and persist the change to the database.
2. WHEN Mollie sends a webhook for a recurring payment with `status: "paid"`, THE System SHALL update the Subscription record's `subscriptionPayDate` to the payment's `createdAt` date and persist the change.
3. WHEN Mollie sends a webhook for a recurring payment with `status: "paid"`, THE System SHALL update the Subscription record's `nextPaymentDate` to the value returned by the Mollie subscription details API and persist the change.
4. WHEN the webhook handler processes a recurring payment, THE System SHALL locate the Subscription record using both `orderId` (from the query parameter) and `customerId` (from the payment object).
5. WHEN the webhook handler saves a recurring payment update, THE System SHALL use a Mongoose save or `findOneAndUpdate` call (not a `.lean()` object mutation) to ensure the changes are persisted.

---

### Requirement 2

**User Story:** As a subscriber, I want the system to determine my access based on the actual payment status stored in the database, so that a correctly processed payment is never overridden by a time-based calculation.

#### Acceptance Criteria

1. WHEN `getSubscriptionManagement` is called, THE System SHALL determine `hasActiveSubscription` solely from the `subscriptionStatus` field stored in the database, without overriding it based on elapsed time since `subscriptionPayDate`.
2. WHEN `getSubscriptionManagement` is called and a Subscription record has `subscriptionStatus: "active"`, THE System SHALL return `hasActiveSubscription: true` regardless of how many days have passed since the last payment.
3. WHEN `getSubscriptionManagement` is called and a Subscription record has `subscriptionStatus` other than `"active"`, THE System SHALL return `hasActiveSubscription: false`.
4. WHEN `getSubscriptionManagement` is called, THE System SHALL return the `nextPaymentDate` from the active Subscription record so the frontend can display it to the user.

---

### Requirement 3

**User Story:** As a developer, I want the Subscription data model to include all fields used by the payment controller, so that payment failure tracking and status values are correctly persisted.

#### Acceptance Criteria

1. WHEN the Subscription schema is defined, THE System SHALL include a `paymentFailCount` field of type `Number` with a default of `0`.
2. WHEN the Subscription schema is defined, THE System SHALL include `"payment_issue"` and `"payment_overdue"` as allowed values for the `subscriptionStatus` field.
3. WHEN the Subscription schema is defined, THE System SHALL include a `cancelDate` field of type `Date` to record when a subscription was canceled.
4. WHEN a recurring payment webhook arrives with `status: "failed"`, THE System SHALL increment `paymentFailCount` and set `subscriptionStatus` to `"payment_issue"` and persist both changes.

---

### Requirement 4

**User Story:** As a developer, I want the first-payment webhook handler to correctly set up the Mollie subscription, so that recurring charges are scheduled reliably.

#### Acceptance Criteria

1. WHEN the first-payment webhook handler creates a Mollie subscription and `mollieSubscription.nextPaymentDate` is available, THE System SHALL set `subscription.nextPaymentDate` to that value before saving.
2. WHEN the first-payment webhook handler attempts to save the subscription after creating the Mollie subscription, THE System SHALL use a non-lean Mongoose document (not a `.lean()` result) so that `subscription.save()` is available.
3. WHEN the first-payment webhook handler sets `subscription.subscriptionStatus`, THE System SHALL set it to `"active"` only if `payment.status === "paid"`, and to `"payment_issue"` otherwise.
4. WHEN the Mollie subscription creation fails during the first-payment webhook, THE System SHALL still update `subscriptionStatus` and `subscriptionPayDate` based on the payment status and save the record.

---

### Requirement 5

**User Story:** As a developer, I want the webhook endpoint to be reachable by Mollie without authentication, and to correctly resolve the tenant context from payment metadata, so that multi-tenant subscription updates work reliably.

#### Acceptance Criteria

1. WHEN Mollie calls the webhook endpoint, THE System SHALL process the request without requiring a JWT token (the route has no `protect` middleware).
2. WHEN the webhook handler resolves the tenant ID, THE System SHALL use `payment.metadata.tenantId` as the primary source and fall back to querying the Subscription collection by `orderId` if metadata is absent.
3. WHEN the webhook handler cannot resolve a tenant ID from metadata or from a subscription lookup, THE System SHALL log a warning and return HTTP 200 to prevent Mollie from retrying indefinitely.

---

### Requirement 6

**User Story:** As a developer, I want all Mollie API calls to use the correct argument shapes defined by the `@mollie/api-client` SDK, so that subscriptions are created and canceled without runtime errors.

#### Acceptance Criteria

1. WHEN the webhook handler creates a Mollie subscription, THE System SHALL derive `startDate` from the Mollie Subscription object's `nextPaymentDate` field (returned after creation), not from the Payment object, because the Payment object does not have a `nextPaymentDate` field.
2. WHEN the webhook handler creates a Mollie subscription and no `startDate` is available, THE System SHALL omit the `startDate` parameter so Mollie uses its default scheduling.
3. WHEN `cancelSubscription` cancels a Mollie subscription, THE System SHALL call `mollieClient.customerSubscriptions.cancel(subscriptionId, { customerId })` with the subscription ID as the first argument and `customerId` inside the parameters object, matching the SDK's `CancelParameters` signature.
4. WHEN the webhook handler creates a Mollie subscription, THE System SHALL store the returned Mollie subscription's `nextPaymentDate` on the local Subscription record.
5. WHEN `createMollieSubscription` looks up an existing Mollie customer by email, THE System SHALL use `mollieClient.customers.iterate()` (an async iterator) instead of `mollieClient.customers.all()`, because `customers.all()` was removed in SDK v4.0.0.
6. WHEN iterating Mollie customers to find a match by email, THE System SHALL iterate through pages using the v4 iterator API and stop as soon as a matching customer is found.

---

### Requirement 7

**User Story:** As a developer, I want a diagnostic script that checks the state of existing subscriptions against Mollie, so that I can identify which customers need manual attention after the bugs are fixed.

#### Acceptance Criteria

1. WHEN a diagnostic script is run, THE System SHALL query all Subscription records that have a `customerId` set and log a summary of their current `subscriptionStatus` and whether a `mollieSubscriptionId` is present.
2. WHEN the diagnostic script processes a Subscription record with a `customerId`, THE System SHALL call the Mollie Mandates API to check if the customer has a valid mandate and include that in the log output.
3. WHEN the diagnostic script completes, THE System SHALL output a structured report listing each subscription ID, customer ID, local status, Mollie mandate status, and whether a Mollie subscription exists.
