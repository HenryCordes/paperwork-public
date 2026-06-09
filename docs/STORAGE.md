# Document Storage (AWS S3)

Read this when anything touches S3 or file uploads.

- Store documents in S3 with a tenant-based path structure; format keys as
  `${tenantId}/${document-id}`.
- Use signed URLs for document access.
- Handle S3 errors explicitly and translate them to appropriate HTTP responses.
- Upload logic lives in `services/documentUpload.js`; the route is
  `routes/document.js`.
