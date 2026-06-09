# Implementation Plan

- [x] 1. Fix Subscription schema

  - Add `paymentFailCount: { type: Number, default: 0 }` field
  - Add `cancelDate: { type: Date }` field
  - Expand `subscriptionStatus` allowed values to include `"payment_issue"` and `"payment_overdue"`
  - _Requirements: 3.1, 3.2, 3.3_

- [ ]\* 1.1 Write unit tests for schema changes

  - Verify new Subscription has `paymentFailCount` defaulting to 0
  - Verify `"payment_issue"` and `"payment_overdue"` are accepted as `subscriptionStatus` values
  - Verify `cancelDate` field persists correctly
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 2. Fix `createMollieSubscription` — customer lookup

  - Replace `mollieClient.customers.all()` with `mollieClient.customers.iterate()`
  - Iterate to find customer by email and break on first match
  - _Requirements: 6.5, 6.6_

- [ ]\* 2.1 Write unit test for customer lookup

  - Mock `mollieClient.customers` and verify `iterate()` is called, not `all()`
  - _Requirements: 6.5_

- [x] 3. Fix `cancelSubscription` — wrong SDK call signature

  - Change `mollieClient.customerSubscriptions.cancel({ customerId, subscriptionId })` to `mollieClient.customerSubscriptions.cancel(subscription.mollieSubscriptionId, { customerId: subscription.customerId })`
  - _Requirements: 6.3_

- [ ]\* 3.1 Write unit test for cancel signature

  - Mock `mollieClient.customerSubscriptions` and verify `cancel` is called with subscription ID as first argument
  - _Requirements: 6.3_

- [x] 4. Fix first-payment webhook handler

  - Remove `startDate: payment.nextPaymentDate` from `customerSubscriptions.create` call (field does not exist on Payment object)
  - Guard `mollieSubscription.nextPaymentDate` access behind a null check
  - Move `subscription.save()` outside the Mollie subscription creation try/catch so it always runs
  - Store `mollieSubscription.nextPaymentDate` on the subscription record when available
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.4_

- [ ]\* 4.1 Write unit test for first-payment webhook with Mollie failure

  - Mock `customerSubscriptions.create` to throw
  - Verify subscription is still saved with correct status and `subscriptionPayDate`
  - _Requirements: 4.4_

- [ ]\* 4.2 Write property test for first-payment status mapping

  - **Property 4: First payment status determines subscription status**
  - **Validates: Requirements 4.3**

- [ ] 5. Fix recurring-payment webhook handler

  - Remove the broken `payment.subscriptionId && sequenceType !== "first"` block (it updates a `.lean()` object and never saves)
  - Ensure the general block's `nextPaymentDate` fetch from Mollie runs for all paid subscription payments (condition: `payment.subscriptionId` is set, not just `subscription.mollieSubscriptionId`)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 5.1 Write property test for recurring paid webhook

  - **Property 1: Recurring paid webhook activates subscription**
  - **Validates: Requirements 1.1, 1.2, 1.3**

- [ ]\* 5.2 Write property test for failed recurring webhook

  - **Property 3: Failed recurring webhook increments failure count**
  - **Validates: Requirements 3.4**

- [x] 6. Fix `getSubscriptionManagement` — remove date-math override

  - Remove the `subscriptions.forEach` block that mutates `subscriptionStatus` based on `subscriptionPayDate` age
  - Derive `paymentOverdue` flag from `activeSubscription.nextPaymentDate < now` instead
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ]\* 6.1 Write property test for subscription management status

  - **Property 2: Subscription management status reflects database**
  - **Validates: Requirements 2.1, 2.2, 2.3**

- [ ]\* 6.2 Write unit test for nextPaymentDate in response

  - Verify `getSubscriptionManagement` returns `nextPaymentDate` from the active subscription
  - _Requirements: 2.4_

- [x] 7. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 8. Write diagnostic script

  - Create `scripts/check-subscriptions.js`
  - Connect to DB and Mollie API using env vars
  - For each Subscription with a `customerId`, fetch Mollie mandate status and subscription status
  - Output a structured report: subscription ID, customer ID, local status, Mollie mandate status, Mollie subscription exists (yes/no)
  - _Requirements: 7.1, 7.2, 7.3_

- [ ] 9. Final Checkpoint — Ensure all tests pass, ask the user if questions arise.
