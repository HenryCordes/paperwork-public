import { Request, Response, NextFunction } from 'express'

import asyncHandlers from '../middleware/async'
import { getCurrentTenantId } from '../middleware/tenantHelper'
import documentUpload from '../services/documentUpload'
import {
  ExtractionFailedError,
  extractInvoice,
} from '../services/invoiceExtraction/extract'
import { getProviderErrorStatus } from '../services/invoiceExtraction/provider/types'

function isFlagEnabled(): boolean {
  return process.env.LLM_INVOICE_EXTRACTION_ENABLED === 'true'
}

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function matchesDeclaredImageType(buffer: Buffer, mimetype: string): boolean {
  if (mimetype === 'image/jpeg') {
    return buffer.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)
  }
  if (mimetype === 'image/png') {
    return buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
  }
  return false
}

// @Method: POST
// @Route : api/invoices/scan
// @Desc  : Extract structured invoice/receipt fields from an image via LLM
export const scanInvoice = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!isFlagEnabled()) {
      return res.status(503).json({
        success: false,
        message: 'LLM invoice extraction is not enabled',
      })
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: 'No file uploaded' })
    }

    if (!matchesDeclaredImageType(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'File content does not match its declared image type',
      })
    }

    const tenantId = getCurrentTenantId(req.organizationId)
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Tenant information not available',
      })
    }
    const file = req.file

    try {
      const [extractionResult, uploadResult] = await Promise.all([
        extractInvoice({
          buffer: file.buffer,
          mimeType: file.mimetype as 'image/jpeg' | 'image/png',
        }),
        documentUpload.uploadFileNonHttp(
          file.buffer,
          file.originalname,
          tenantId,
          { contentType: file.mimetype },
        ),
      ])

      return res.status(200).json({
        success: true,
        data: {
          fileLocation: uploadResult.key,
          extraction: extractionResult.extraction,
          confidence: extractionResult.confidence,
          validation: extractionResult.validation,
          needsReview: extractionResult.needsReview,
          meta: extractionResult.meta,
        },
      })
    } catch (error) {
      if (error instanceof ExtractionFailedError) {
        return res.status(422).json({
          success: false,
          code: 'EXTRACTION_FAILED',
          message: error.message,
        })
      }

      if (getProviderErrorStatus(error) !== undefined) {
        return res
          .status(502)
          .json({ success: false, message: 'LLM provider error' })
      }

      return next(error)
    }
  },
)
