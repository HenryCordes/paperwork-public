---
name: add-queue-processor
description: Use when adding a Bull/Redis background job or queue processor in this project — "add a queue", "background job", "new processor", "process this async". Enforces queue naming, idempotency, retries, and tenant/user context in job data.
---

# Add a queue processor

Scaffold a Bull processor under `services/queues/`. See
[docs/QUEUES.md](../../../docs/QUEUES.md). Read an existing processor first
(e.g. `services/queues/emailQueue.js`) and copy the pattern.

## Checklist

1. Name the queue `[domain]-[action]-queue` (e.g. `export-expense-queue`).
2. Define the processor in `services/queues/`; ensure it is registered for the
   `worker.js` entry point.
3. Make the job idempotent — re-running it must not double-process.
4. Configure a retry strategy and error handling on the processor.
5. Structure job data with `tenantId` and `userId` plus any job-specific
   metadata for tracking/debugging.
6. Subscribe to Bull lifecycle events and log them through the project logger
   with context.
7. Add a test exercising the processor with a fake job payload.

## Red flags

- Job data missing `tenantId`/`userId`.
- No retry/error handling.
- A non-idempotent processor (e.g. unconditionally creating records).
- Queue name not matching `[domain]-[action]-queue`.
