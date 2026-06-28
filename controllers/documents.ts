import { Readable } from 'stream'

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { Request, Response, NextFunction } from 'express'

import asyncHandlers from '../middleware/async'
import { getCurrentTenantId } from '../middleware/tenantHelper'
import Note from '../models/Note'
import upload from '../services/documentUpload'

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ID as string,
    secretAccessKey: process.env.AWS_SECRET as string,
  },
})

const singleUpload = upload.single('file')

// @Method: POST
// @Route : api/document/:id  (id = path and filename on aws s3 )
// @Desc  : Create a new document
export const createDocument = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('Document upload request:', {
        hasBody: !!req.body,
        bodyKeys: req.body ? Object.keys(req.body) : [],
        hasOrganizationId: !!req.organizationId,
        headers: req.headers,
      })

      // Extract organizationId from multiple possible places
      // iOS apps might send it in the request body or headers
      const orgIdFromBody = req.body && req.body.organizationId
      const orgIdFromHeaders = req.headers['x-organization-id']
      const tenantIdFromOrg =
        req.organizationId || orgIdFromBody || orgIdFromHeaders

      // Set it on the request object for the upload middleware to use
      if (tenantIdFromOrg && !req.organizationId) {
        req.organizationId = tenantIdFromOrg
        console.log('Setting organizationId on request:', tenantIdFromOrg)
      }

      singleUpload(req, res, function (err) {
        if (err) {
          return res.json({
            success: false,
            errors: {
              title: 'Image Upload Error',
              detail: err.message,
              error: err,
            },
          })
        }
        // multer-s3 attaches `key` to the uploaded file at runtime; the base
        // Express.Multer.File type does not model it.
        const file = req.file as unknown as { key: string }
        console.log(file.key)
        const update = { fileLocation: file.key }
        res.status(200).json({ success: true, data: update })
      })
    } catch (error) {
      console.log(error)
      return next(error)
    }
  },
)

// @Method: GET
// @Route : api/document
// @Desc  : get a document
export const getDocument = asyncHandlers(
  async (req: Request, res: Response) => {
    try {
      if (req.params.id === 'undefined') {
        return res.status(404).json({ success: false, message: 'No such key' })
      }
      if (req.params.organizationId === 'undefined') {
        return res.status(404).json({ success: false, message: 'No such key' })
      }

      // This endpoint is special as it takes the organizationId directly from the URL
      // But we'll still try to use the tenant ID fallback pattern for consistency
      let tenantId = getCurrentTenantId(req.params.organizationId as string)
      if (!tenantId) {
        tenantId = req.params.organizationId as string
      }
      const params = {
        Bucket: process.env.AWS_DOCUMENT_BUCKET_NAME,
        Key: `${tenantId}/${req.params.id}`,
      }

      try {
        const getObjectCommand = new GetObjectCommand(params)
        const data = await s3Client.send(getObjectCommand)

        res.setHeader('Content-Length', data.ContentLength!)
        res.setHeader('Content-Type', data.ContentType!)
        res.writeHead(200)
        ;(data.Body as Readable).pipe(res)
      } catch (err) {
        if ((err as Error).name === 'NoSuchKey') {
          return res
            .status(404)
            .json({ success: false, message: 'No such key' })
        }
        console.log(err)
        return res
          .status(500)
          .json({ success: false, message: 'document not found..' })
      }
    } catch (error) {
      res
        .status(500)
        .json({ success: false, message: (error as Error).message })
    }
  },
)

// @Method: GET
// @Route : api/documents
// @Desc  : Get a list of all documents
export const getDocuments = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)

      // Since documents are stored in S3, you might need to list files from the tenant's folder
      // This is a placeholder implementation - you would need to implement S3 listing
      // based on your specific requirements

      return res.status(200).json({
        success: true,
        message:
          'Document listing not fully implemented - tenant documents would be listed here',
        tenantId: tenantId,
      })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: DELETE
// @Route : api/document/:id
// @Desc  : deletes a document
export const deleteDocument = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)

      // Note: Current implementation seems to be using Note model instead of Document
      // You might want to implement an S3 delete operation instead
      const tenantNote = Note.byTenant(tenantId)
      const note = await tenantNote
        .findByIdAndDelete(req.params.id)
        .lean()
        .exec()

      if (!note) {
        return res
          .status(404)
          .json({ success: false, message: 'Document not found..' })
      }
      res.status(200).json({ success: true, data: note })
    } catch (error) {
      return next(error)
    }
  },
)
