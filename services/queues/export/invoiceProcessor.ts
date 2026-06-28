/**
 * Invoice Export Queue Processor
 * Handles background processing of invoice exports, uploads to S3, and sends
 * email notifications.
 */

import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'

import { GetObjectCommand } from '@aws-sdk/client-s3'
import archiver from 'archiver'
import { Job } from 'bull'
import pdf from 'html-pdf'

import { PATHS } from '../../../common/constants/paths'
import Contact from '../../../models/Contact'
import Invoice from '../../../models/Invoice'
import Settings from '../../../models/Settings'
import User from '../../../models/User'
import invoiceReport from '../../../modules/invoice-report'
import exportReadyTemplate from '../../../templates/exportReadyTemplate'
import documentUpload from '../../documentUpload'
import * as emailService from '../../emailService'
import { exportInvoices, cleanupTempFile } from '../../exportService'
import { getLogger } from '../../logger'

const { uploadFileNonHttp, createSignedDownloadUrl, s3Client, bucketName } =
  documentUpload

const logger = getLogger()

// Default expiry time for export files (in seconds)
const DEFAULT_EXPIRY_SECONDS = 7200 // 2 hours

interface PdfFile {
  id: unknown
  path: string
  filename: string
}

interface PdfData {
  pdfsDir: string
  pdfs: PdfFile[]
}

/**
 * Process an invoice export job
 */
async function processInvoiceExport(job: Job) {
  const { tenantId, userId, requestId, data, options } = job.data

  logger.info('Processing invoice export job', {
    jobId: job.id,
    tenantId,
    userId,
    requestId,
  })

  try {
    const { startDate, endDate, includePdfs } = data.filters || {}

    await job.progress(10)

    if (!startDate || !endDate) {
      throw new Error('Start and end dates are required')
    }

    const parsedStartDate = new Date(startDate)
    const parsedEndDate = new Date(endDate)
    parsedEndDate.setHours(23, 59, 59, 999) // Include the entire end day

    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
      throw new Error('Invalid date format')
    }

    await job.progress(20)

    logger.info(`Generating invoice export for tenant ${tenantId}`, {
      tenantId,
      userId,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      includePdfs,
    })

    const exportResult = await exportInvoices(
      tenantId,
      parsedStartDate,
      parsedEndDate,
    )

    if (!exportResult.success) {
      throw new Error(exportResult.message || 'Export generation failed')
    }

    await job.progress(40)

    const tempDir = PATHS.TEMP_DIR
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const dateRangeStr = `${formatDateForFilename(
      parsedStartDate,
    )}_to_${formatDateForFilename(parsedEndDate)}`
    const zipFilename = `invoice_export_${tenantId}_${dateRangeStr}_${requestId}.zip`
    const zipPath = path.join(tempDir, zipFilename)

    // If PDFs are included, download them
    let pdfData: PdfData | null = null
    if (includePdfs) {
      const invoices = await Invoice.find({
        tenantId,
        invoiceDate: { $gte: parsedStartDate, $lte: parsedEndDate },
      }).lean()

      // Only proceed with PDFs if there are invoices
      if (invoices && invoices.length > 0) {
        pdfData = await downloadInvoicePdfs(invoices, tenantId)
      }
    }

    await createExportZip({
      zipPath,
      csvContent: exportResult.csv,
      csvFilename: exportResult.fileName,
      includePdfs,
      pdfData,
    })

    await job.progress(60)

    const zipContent = fs.readFileSync(zipPath)

    const expiryDays = 7 // 7 days expiration
    const uploadResult = await uploadFileNonHttp(
      zipContent,
      zipFilename,
      tenantId,
      {
        contentType: 'application/zip',
        expires: expiryDays,
        metadata: {
          exportType: 'invoice',
          dateRange: dateRangeStr,
          includePdfs: String(includePdfs || false),
        },
      },
    )

    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath)
    }

    await job.progress(80)

    // Generate signed URL for the ZIP file
    const expirySeconds = options.expirySeconds || DEFAULT_EXPIRY_SECONDS
    const downloadUrl = await createSignedDownloadUrl(
      uploadResult.key,
      expirySeconds,
    )

    // Prepare result with download link
    const result: {
      exportId: string
      file: { fileName: string; downloadUrl: string; expirySeconds: number }
      notificationEmail?: string
      notificationError?: string
    } = {
      exportId: requestId,
      file: {
        fileName: zipFilename,
        downloadUrl: downloadUrl,
        expirySeconds: expirySeconds,
      },
    }

    // Send email notification if email is provided or we have a user ID
    if (options.notifyEmail || userId) {
      try {
        // If email not directly provided, get it from user ID
        let recipientEmail = options.notifyEmail

        // Attempt to get user email if userId is available and no email provided
        if (!recipientEmail && userId) {
          const user = await User.findById(userId)
          if (user && user.email) {
            recipientEmail = user.email
          }
        }

        // Only proceed if we have a valid email
        if (recipientEmail && recipientEmail.trim().length > 0) {
          // Get user name if available
          let name = 'gebruiker'
          if (userId) {
            try {
              const user = await User.findById(userId)
              if (user && user.name) {
                name = user.name
              }
            } catch (userErr) {
              logger.warn(
                `Could not fetch user name: ${(userErr as Error).message}`,
              )
            }
          }

          // Generate email content using the template
          const htmlContent = exportReadyTemplate({
            name,
            exportType: 'invoice',
            downloadUrl: downloadUrl,
            expiryHours: Math.floor(expirySeconds / 3600),
          })

          await emailService.sendEmail({
            to: recipientEmail,
            from: {
              name: 'Paperwork',
              email: process.env.EMAIL_FROM || 'noreply@paperwork-app.com',
            },
            subject: 'Your Invoice Export is Ready',
            html: htmlContent,
          })

          logger.info(`Notification email sent to ${recipientEmail}`, {
            tenantId,
            userId,
            requestId,
          })

          result.notificationEmail = recipientEmail
        } else {
          logger.warn('No valid email address available for notification', {
            tenantId,
            userId,
            requestId,
            providedEmail: options.notifyEmail,
          })
          result.notificationError = 'No valid email address available'
        }
      } catch (emailError) {
        logger.error('Error sending export notification email', {
          error: (emailError as Error).message,
          tenantId,
          userId,
          requestId,
        })
        result.notificationError = (emailError as Error).message
      }
    }

    await job.progress(100)

    return result
  } catch (error) {
    logger.error('Error processing invoice export job', {
      error: (error as Error).message,
      stack: (error as Error).stack,
      tenantId,
      userId,
      requestId,
    })

    throw error
  }
}

/**
 * Format date for filenames (YYYY-MM-DD)
 */
function formatDateForFilename(date: Date): string {
  return date.toISOString().slice(0, 10)
}

interface CreateExportZipOptions {
  zipPath: string
  csvContent: string
  csvFilename: string
  includePdfs?: boolean
  pdfData?: PdfData | null
}

/**
 * Create a ZIP file with export CSV and invoice PDFs
 */
function createExportZip({
  zipPath,
  csvContent,
  csvFilename,
  includePdfs,
  pdfData,
}: CreateExportZipOptions): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    try {
      // Create write stream for the ZIP file
      const output = fs.createWriteStream(zipPath)
      const archive = archiver('zip', {
        zlib: { level: 9 }, // Highest compression
      })

      // Handle archive events
      output.on('close', function () {
        logger.info(
          `ZIP archive created: ${zipPath}, size: ${archive.pointer()} bytes`,
        )
        resolve(zipPath)
      })

      archive.on('warning', function (err: NodeJS.ErrnoException) {
        if (err.code === 'ENOENT') {
          logger.warn(`Warning creating ZIP archive: ${err.message}`)
        } else {
          reject(err)
        }
      })

      archive.on('error', function (err: Error) {
        logger.error(`Error creating ZIP archive: ${err.message}`)
        reject(err)
      })

      // Pipe archive data to output file
      archive.pipe(output)

      // Add CSV file to archive
      archive.append(csvContent, { name: csvFilename })

      // Add invoice PDFs if requested
      if (includePdfs && pdfData && pdfData.pdfs && pdfData.pdfs.length > 0) {
        logger.info(
          `[createExportZip] Adding ${pdfData.pdfs.length} invoice PDFs to export ZIP`,
        )

        for (const pdfFile of pdfData.pdfs) {
          try {
            const pdfPath = pdfFile.path
            const pdfFilename = pdfFile.filename

            if (fs.existsSync(pdfPath)) {
              logger.info(
                `[createExportZip] Adding PDF ${pdfFilename} to ZIP file in 'invoices' folder, size: ${
                  fs.statSync(pdfPath).size
                } bytes`,
              )

              // Place PDFs in 'invoices' folder within the ZIP
              archive.file(pdfPath, { name: `invoices/${pdfFilename}` })
            } else {
              logger.error(`[createExportZip] PDF file not found: ${pdfPath}`)
            }
          } catch (pdfError) {
            logger.error(
              `[createExportZip] Error adding PDF to ZIP: ${(pdfError as Error).message}`,
            )
          }
        }

        logger.info(
          `[createExportZip] Added ${pdfData.pdfs.length} PDF files to ZIP file in 'invoices' folder`,
        )
      }

      // Clean up PDF files after a delay
      setTimeout(() => {
        try {
          // Clean up PDF files if they exist
          if (includePdfs && pdfData && pdfData.pdfsDir) {
            logger.info(
              `[createExportZip] Cleaning up PDF files in ${pdfData.pdfsDir}`,
            )
            if (fs.existsSync(pdfData.pdfsDir)) {
              fs.readdirSync(pdfData.pdfsDir).forEach((file) => {
                const filePath = path.join(pdfData.pdfsDir, file)
                if (fs.existsSync(filePath)) {
                  cleanupTempFile(filePath)
                }
              })
              fs.rmdir(pdfData.pdfsDir, (err) => {
                if (err) {
                  logger.error(
                    `[createExportZip] Error removing PDFs directory: ${err}`,
                  )
                } else {
                  logger.info(
                    `[createExportZip] Successfully removed PDFs directory: ${pdfData.pdfsDir}`,
                  )
                }
              })
            }
          }
        } catch (cleanupErr) {
          logger.error(`[createExportZip] Error during cleanup: ${cleanupErr}`)
        }
      }, 3000)

      // Finalize the archive
      archive.finalize()
    } catch (error) {
      logger.error(
        '[createExportZip] Error in createExportZip:',
        error as Record<string, unknown>,
      )
      reject(error)
    }
  })
}

/**
 * Download existing invoice PDFs from S3 or generate them on the fly.
 */
async function downloadInvoicePdfs(
  invoices: { state?: string; _id: unknown; [key: string]: unknown }[],
  tenantId: string,
): Promise<PdfData> {
  try {
    logger.info(
      `[downloadInvoicePdfs] Processing PDFs for ${invoices.length} invoices, tenant: ${tenantId}`,
    )

    // Get only 'Betaald' (paid) invoices
    const paidInvoices = invoices.filter(
      (invoice) => invoice.state === 'Betaald',
    )

    logger.info(
      `[downloadInvoicePdfs] Found ${paidInvoices.length} paid invoices for PDF generation, tenant: ${tenantId}`,
    )

    const dirSuffix = Date.now()
    const pdfsDir = path.join(PATHS.TEMP_DIR, `invoices_${dirSuffix}`)

    try {
      if (!fs.existsSync(PATHS.TEMP_DIR)) {
        fs.mkdirSync(PATHS.TEMP_DIR, { recursive: true })
      }

      fs.mkdirSync(pdfsDir, { recursive: true })

      if (!fs.existsSync(pdfsDir)) {
        logger.error(
          `[downloadInvoicePdfs] FAILED to create PDF directory: ${pdfsDir}, tenant: ${tenantId}`,
        )
      }
    } catch (err) {
      logger.error(
        `[downloadInvoicePdfs] Error creating directory: ${(err as Error).message}, tenant: ${tenantId}`,
      )
    }

    if (!fs.existsSync(pdfsDir)) {
      fs.mkdirSync(pdfsDir, { recursive: true })
    }

    // Get tenant settings for PDF generation
    const settings = await Settings.findOne({ tenantId }).lean().exec()

    if (!settings) {
      logger.error(
        `[downloadInvoicePdfs] Settings not found for tenant: ${tenantId}`,
      )
      return { pdfsDir, pdfs: [] } // Continue with export but without PDFs
    }

    // Process PDFs for each paid invoice - first try to download from S3,
    // if not available, generate on the fly.
    const pdfPromises = paidInvoices.map(
      async (invoice): Promise<PdfFile | null> => {
        const filename = `${invoice.invoiceNumber || invoice._id}.pdf`
        const targetPath = path.join(pdfsDir, filename)

        try {
          // First check if document exists in S3
          if (invoice.documentPath) {
            try {
              const s3Key = invoice.documentPath as string

              logger.info(
                `[downloadInvoicePdfs] Attempting to download from S3: ${s3Key}, tenant: ${tenantId}`,
              )

              const s3Command = new GetObjectCommand({
                Bucket: bucketName,
                Key: s3Key,
              })

              const s3Response = await s3Client.send(s3Command)

              logger.info(
                `[downloadInvoicePdfs] Writing existing PDF to: ${targetPath}, tenant: ${tenantId}`,
              )

              const writeStream = fs.createWriteStream(targetPath)
              ;(s3Response.Body as Readable).pipe(writeStream)

              return await new Promise<PdfFile>((resolve, reject) => {
                writeStream.on('finish', () => {
                  const fileSize = fs.statSync(targetPath).size
                  logger.info(
                    `[downloadInvoicePdfs] Downloaded from S3 and wrote to disk: ${path.basename(
                      targetPath,
                    )}, size: ${fileSize} bytes, path: ${targetPath}, tenant: ${tenantId}`,
                  )
                  resolve({
                    id: invoice._id,
                    path: targetPath,
                    filename: filename,
                  })
                })

                writeStream.on('error', (err) => {
                  logger.error(
                    `[downloadInvoicePdfs] Error writing PDF ${invoice._id}: ${err.message}, tenant: ${tenantId}`,
                  )
                  reject(err)
                })
              })
            } catch (s3Error) {
              // If S3 download fails, continue to on-the-fly generation
              logger.info(
                `[downloadInvoicePdfs] Could not download from S3: ${(s3Error as Error).message}, generating PDF on-the-fly, tenant: ${tenantId}`,
              )
            }
          }

          // If we reach here, we need to generate the PDF on the fly
          logger.info(
            `[downloadInvoicePdfs] Generating PDF on-the-fly for invoice ${invoice._id}, tenant: ${tenantId}`,
          )

          // Get contact data for the invoice
          const contact = await Contact.findById(invoice.contactId)
            .lean()
            .exec()
          if (!contact) {
            logger.error(
              `[downloadInvoicePdfs] Contact not found for invoice ${invoice._id}, tenant: ${tenantId}`,
            )
            return null
          }

          // Generate PDF
          const pdfOptions = {
            format: 'letter',
            border: {
              top: '0.2in',
              right: '0.2in',
              bottom: '0.2in',
              left: '0.2in',
            },
            childProcessOptions: { env: { OPENSSL_CONF: '/dev/null' } },
          }

          const htmlContent = invoiceReport({
            invoice,
            settings,
            contact,
          } as unknown as Parameters<typeof invoiceReport>[0])

          // Use the promisified version of pdf.create
          const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
            pdf
              .create(htmlContent, pdfOptions as pdf.CreateOptions)
              .toBuffer((err: Error | null, buffer: Buffer) => {
                if (err) {
                  reject(err)
                  return
                }
                resolve(buffer)
              })
          })

          // Write the generated PDF to disk
          fs.writeFileSync(targetPath, pdfBuffer)

          const fileSize = fs.statSync(targetPath).size
          logger.info(
            `[downloadInvoicePdfs] Generated PDF and wrote to disk: ${path.basename(
              targetPath,
            )}, size: ${fileSize} bytes, path: ${targetPath}, tenant: ${tenantId}`,
          )

          return {
            id: invoice._id,
            path: targetPath,
            filename: filename,
          }
        } catch (error) {
          logger.error(
            `[downloadInvoicePdfs] Error processing PDF for invoice ${invoice._id}: ${(error as Error).message}, tenant: ${tenantId}`,
          )
          return null
        }
      },
    )

    const processedPdfs = await Promise.all(pdfPromises)
    const validPdfs = processedPdfs.filter((item): item is PdfFile =>
      Boolean(item),
    )

    logger.info(
      `[downloadInvoicePdfs] Successfully processed ${validPdfs.length} PDFs to temp directory, tenant: ${tenantId}`,
    )

    return { pdfsDir, pdfs: validPdfs }
  } catch (error) {
    logger.error('[downloadInvoicePdfs] Error in downloadInvoicePdfs:', {
      error: (error as Error).message,
      tenantId,
    })
    throw error
  }
}

export { processInvoiceExport }
