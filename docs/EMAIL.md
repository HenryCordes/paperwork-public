# Email

Read this when sending email or adding templates. To scaffold a template, use
the `add-email-template` skill.

- Always send transactional and notification email through
  `services/emailService.js` (Mailjet). Controllers call it as shown in
  `controllers/emails.js`.
- Store templates in `templates/` named `[purposeOfEmail]Template.js`.
- Templates are parameterized functions returning an HTML string.
- Always include a plain-text alternative alongside the HTML.
- Set appropriate subject and from address; include proper error handling.
