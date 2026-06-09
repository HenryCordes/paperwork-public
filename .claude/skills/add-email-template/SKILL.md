---
name: add-email-template
description: Use when adding a new email or email template in this project — "add an email", "new email template", "send a notification email", "email the user when X". Enforces the template naming convention, plain-text alternative, and routing through emailService.
---

# Add an email template

Add a parameterized template under `templates/` and send it through
`services/emailService.js`. See [docs/EMAIL.md](../../../docs/EMAIL.md). Read an
existing template and `controllers/emails.js` first, then copy the pattern.

## Checklist

1. Create `templates/<purposeOfEmail>Template.js` exporting a parameterized
   function that returns the HTML string.
2. Provide a plain-text alternative alongside the HTML.
3. Send the email via `services/emailService.js` (Mailjet) — never call the
   mail provider directly from a controller.
4. Set an appropriate subject and from address.
5. Add error handling around the send.
6. If the email is sent from a background job, enqueue it through the email
   queue (see [docs/QUEUES.md](../../../docs/QUEUES.md)) rather than sending
   inline.

## Red flags

- Inline HTML built in a controller instead of a `*Template.js` file.
- HTML with no plain-text alternative.
- Bypassing `emailService.js`.
