# Background Jobs (Bull + Redis)

Read this when adding or changing background processing. To scaffold a new
processor, use the `add-queue-processor` skill.

- Use Bull with Redis for all background job processing.
- Name queues `[domain]-[action]-queue` (e.g. `export-expense-queue`).
- Implement error handling and a retry strategy for every processor.
- Make jobs idempotent to prevent duplicate processing.
- Structure job data consistently with `tenantId` and `userId` for multi-tenant
  context; add job-specific metadata for tracking/debugging.
- Use Bull's event system to monitor job status; log all lifecycle events.
- Processors live in `services/queues/`; the worker entry point is `worker.js`.
