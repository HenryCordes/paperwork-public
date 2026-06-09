import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import multer from 'multer'
import multerS3 from 'multer-s3'

import { getCurrentTenantId } from '../middleware/tenantHelper'

import { getLogger } from './logger'

const logger = getLogger()

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ID as string,
    secretAccessKey: process.env.AWS_SECRET as string,
  },
})

const bucketName = process.env.AWS_DOCUMENT_BUCKET_NAME as string
const exportBucketName = process.env.AWS_EXPORT_BUCKET_NAME || bucketName

const upload = multer({
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'image/jpeg' ||
      file.mimetype === 'image/png' ||
      file.mimetype === 'application/pdf'
    ) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type, only JPEG, PNG and pdf are allowed!'))
    }
  },
  storage: multerS3({
    s3: s3Client,
    bucket: bucketName,
    metadata: function (_req, file, cb) {
      cb(null, {
        tenant: getCurrentTenantId() ?? '',
        originalFileName: file.originalname,
      })
    },
    key: function (req, file, cb) {
      // Get tenant ID with multiple fallbacks to ensure a valid folder name
      const reqWithOrg = req as typeof req & {
        organizationId?: string
        body?: { organizationId?: string }
      }
      const tenantIdFromOrg =
        reqWithOrg.organizationId ||
        (reqWithOrg.body && reqWithOrg.body.organizationId)
      const tenantId =
        getCurrentTenantId(tenantIdFromOrg) || tenantIdFromOrg || 'unknown'

      console.log(
        'Document upload - using tenant ID:',
        tenantId,
        'for file:',
        file.originalname,
      )

      cb(null, tenantId + '/' + file.originalname)
    },
  }),
})

interface UploadOptions {
  contentType?: string
  expires?: Date | number | null
  metadata?: Record<string, string>
}

/**
 * Upload a file to S3 programmatically (non-HTTP request based)
 */
async function uploadFileNonHttp(
  fileContent: Buffer | string,
  fileName: string,
  tenantId: string,
  options: UploadOptions = {},
) {
  const {
    contentType = 'application/octet-stream',
    expires = null,
    metadata = {},
  } = options

  // Validate parameters
  if (!fileContent) {
    throw new Error('File content is required')
  }

  if (!fileName) {
    throw new Error('File name is required')
  }

  if (!tenantId) {
    throw new Error('Tenant ID is required')
  }

  try {
    // Prepare S3 params
    const key = `${tenantId}/${fileName}`
    const params: PutObjectCommandInput = {
      Bucket: exportBucketName,
      Key: key,
      Body: fileContent,
      ContentType: contentType,
      Metadata: {
        tenant: tenantId,
        originalFileName: fileName,
        ...metadata,
      },
    }

    // Add expires parameter if provided
    if (expires) {
      // expires can be either a Date object or number of days
      if (expires instanceof Date) {
        params.Expires = expires
      } else if (typeof expires === 'number') {
        params.Expires = new Date(Date.now() + expires * 24 * 60 * 60 * 1000)
      }
    }

    // Upload to S3
    logger.info(`Uploading file ${fileName} for tenant ${tenantId}`, {
      fileName,
      tenantId,
    })
    const command = new PutObjectCommand(params)
    await s3Client.send(command)

    return {
      key,
      bucket: exportBucketName,
      success: true,
    }
  } catch (error) {
    logger.error('Error uploading to S3', {
      fileName,
      tenantId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    })
    throw error
  }
}

/**
 * Create a signed URL for downloading an object from S3
 */
async function createSignedDownloadUrl(
  key: string,
  expiresIn = 7200,
): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: exportBucketName,
      Key: key,
    })

    return await getSignedUrl(s3Client, command, { expiresIn })
  } catch (error) {
    logger.error('Error creating signed URL', {
      key,
      error: (error as Error).message,
      stack: (error as Error).stack,
    })
    throw error
  }
}

// The default export is the multer middleware (used by controllers/documents.js),
// with the helpers actually consumed by exportService and the export processors
// attached as properties. (The former `.upload` self-reference and the
// `exportBucketName` export were unused and have been dropped; exportBucketName
// remains an internal const used by the upload helpers above.)
const documentUpload = upload as typeof upload & {
  uploadFileNonHttp: typeof uploadFileNonHttp
  createSignedDownloadUrl: typeof createSignedDownloadUrl
  s3Client: typeof s3Client
  bucketName: string
}

documentUpload.uploadFileNonHttp = uploadFileNonHttp
documentUpload.createSignedDownloadUrl = createSignedDownloadUrl
documentUpload.s3Client = s3Client
documentUpload.bucketName = bucketName

export = documentUpload
