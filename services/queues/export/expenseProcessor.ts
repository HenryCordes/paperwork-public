/**
 * Expense Export Queue Processor
 * Handles background processing of expense exports, uploads to S3, and sends
 * email notifications.
 */

import fs from 'fs'
import path from 'path'

import archiver from 'archiver'
import { Job } from 'bull'

import { PATHS } from '../../../common/constants/paths'
import User from '../../../models/User'
import exportReadyTemplate from '../../../templates/exportReadyTemplate'
import documentUpload from '../../documentUpload'
import * as emailService from '../../emailService'
import { exportExpenses, cleanupTempFile } from '../../exportService'
import { getLogger } from '../../logger'

const { uploadFileNonHttp, createSignedDownloadUrl } = documentUpload

const logger = getLogger()

// Default expiry time for export files (in seconds)
const DEFAULT_EXPIRY_SECONDS = 7200 // 2 hours

interface ReceiptData {
  receiptsDir: string
  receipts: { path: string; filename: string }[]
}

/**
 * Process an expense export job
 */
async function processExpenseExport(job: Job) {
  const { tenantId, userId, requestId, data, options } = job.data

  logger.info('Processing expense export job', {
    jobId: job.id,
    tenantId,
    userId,
    requestId,
  })

  try {
    const { startDate, endDate, includeReceipts } = data.filters || {}

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

    logger.info(`Generating expense export for tenant ${tenantId}`, {
      tenantId,
      userId,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      includeReceipts,
    })

    const exportResult = await exportExpenses(
      tenantId,
      parsedStartDate,
      parsedEndDate,
      includeReceipts || false,
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
    const zipFilename = `expense_export_${tenantId}_${dateRangeStr}_${requestId}.zip`
    const zipPath = path.join(tempDir, zipFilename)

    await createExportZip({
      zipPath,
      csvContent: exportResult.csv,
      csvFilename: exportResult.fileName,
      includeReceipts,
      receiptData: exportResult.receiptData,
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
          exportType: 'expense',
          dateRange: dateRangeStr,
          includeReceipts: String(includeReceipts || false),
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
    const result = {
      exportId: requestId,
      file: {
        fileName: zipFilename,
        downloadUrl: downloadUrl,
        contentType: 'application/zip',
        expirySeconds: expirySeconds,
      },
    }

    // Send email notification if email is provided
    if (options.notifyEmail || userId) {
      await job.progress(90)

      // If email not directly provided, get it from user ID
      let recipientEmail = options.notifyEmail
      let name = ''

      if (!recipientEmail && userId) {
        const user = await User.findById(userId)
        if (user && user.email) {
          recipientEmail = user.email
          name = user.name || ''
        }
      }

      if (recipientEmail) {
        // Calculate expiry hours
        const expiryHours = Math.round(expirySeconds / 3600)

        // Generate email content using the template
        const htmlContent = exportReadyTemplate({
          name,
          exportType: 'expense',
          downloadUrl,
          expiryHours,
          companyName: 'Paperwork',
        })

        // Plain text alternative
        const plainText = `Je export van kosten is gereed. Download hier: ${downloadUrl}. De link is geldig voor ${expiryHours} uur.`

        // Send email
        await emailService.sendEmail({
          to: recipientEmail,
          from: {
            email: process.env.EMAIL_FROM || 'noreply@paperwork-app.com',
            name: 'Paperwork',
          },
          subject: 'Je export is gereed',
          text: plainText,
          html: htmlContent,
        })

        logger.info(
          `[processExpenseExport] Export notification email sent to ${recipientEmail}`,
          {
            tenantId,
            userId,
            requestId,
          },
        )
      }
    }

    await job.progress(100)

    logger.info('Export job completed successfully', {
      jobId: job.id,
      tenantId,
      userId,
      requestId,
    })

    return result
  } catch (error) {
    logger.error('Error processing expense export job', {
      jobId: job.id,
      tenantId,
      userId,
      requestId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    })

    throw error
  }
}

/**
 * Format date for filenames (YYYY-MM-DD)
 */
function formatDateForFilename(date: Date): string {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

interface CreateExportZipOptions {
  zipPath: string
  csvContent: string
  csvFilename: string
  includeReceipts?: boolean
  receiptData?: ReceiptData
}

/**
 * Create a ZIP file with export CSV and receipts
 */
async function createExportZip({
  zipPath,
  csvContent,
  csvFilename,
  includeReceipts,
  receiptData,
}: CreateExportZipOptions): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    try {
      // Create a writable stream for the ZIP file
      const output = fs.createWriteStream(zipPath)
      const archive = archiver('zip', {
        zlib: { level: 9 }, // Maximum compression
      })

      // Set up archive events
      output.on('close', () => {
        logger.info(
          `[createExportZip] Export ZIP created: ${zipPath} (${archive.pointer()} bytes)`,
        )
        resolve(zipPath)
      })

      archive.on('error', (err: Error) => {
        logger.error(
          `[createExportZip] Error creating export ZIP:`,
          err as unknown as Record<string, unknown>,
        )
        reject(err)
      })

      // Pipe archive data to the file
      archive.pipe(output)

      // Add CSV file to the root of the ZIP
      archive.append(csvContent, { name: csvFilename })

      if (
        includeReceipts &&
        receiptData &&
        receiptData.receipts &&
        receiptData.receipts.length > 0
      ) {
        if (!receiptData.receiptsDir) {
          logger.error(
            `[createExportZip] CRITICAL ERROR: receiptsDir is missing from receiptData!`,
          )
        } else {
          logger.info(
            `[createExportZip] Receipts directory: ${
              receiptData.receiptsDir
            }, exists: ${fs.existsSync(receiptData.receiptsDir)}`,
          )

          try {
            if (fs.existsSync(receiptData.receiptsDir)) {
              const dirContents = fs.readdirSync(receiptData.receiptsDir)
              logger.info(
                `[createExportZip] Contents of receipts directory (${
                  dirContents.length
                } files): ${JSON.stringify(dirContents)}`,
              )
            }
          } catch (err) {
            logger.error(
              `[createExportZip] Error listing receipts directory: ${(err as Error).message}`,
            )
          }
        }

        // Use the receipts folder name for organizing in the ZIP
        const receiptsFolder = 'receipts'
        let filesAdded = 0

        // Add each receipt directly to the ZIP file
        logger.info(
          `[createExportZip] Starting to process ${receiptData.receipts.length} receipt files for inclusion in ZIP`,
        )
        for (const receipt of receiptData.receipts) {
          const filePath = receipt.path
          const fileName = receipt.filename

          // Verify file exists and has content
          const fileExists = fs.existsSync(filePath)

          if (!fileExists) {
            logger.error(
              `[createExportZip] CRITICAL: Receipt file does not exist: ${filePath}`,
            )
            continue
          }

          try {
            const stats = fs.statSync(filePath)
            logger.info(
              `[createExportZip] File stats: isFile=${stats.isFile()}, size=${
                stats.size
              } bytes, path=${filePath}`,
            )

            if (stats.isFile()) {
              if (stats.size === 0) {
                logger.warn(
                  `[createExportZip] WARNING: Receipt file has zero bytes: ${filePath}`,
                )
              }

              archive.file(filePath, { name: `${receiptsFolder}/${fileName}` })
              filesAdded++
            } else {
              logger.info(
                `[createExportZip] Skipping non-file item: ${filePath}`,
              )
            }
          } catch (err) {
            logger.error(
              `[createExportZip] Error processing receipt file ${filePath}: ${(err as Error).message}`,
            )
          }
        }

        logger.info(
          `[createExportZip] Added ${filesAdded} receipt files to export ZIP`,
        )
      }

      setTimeout(() => {
        try {
          // Clean up receipt files if they exist
          if (includeReceipts && receiptData && receiptData.receiptsDir) {
            logger.info(
              `[createExportZip] Cleaning up receipt files in ${receiptData.receiptsDir}`,
            )
            if (fs.existsSync(receiptData.receiptsDir)) {
              fs.readdirSync(receiptData.receiptsDir).forEach((file) => {
                const filePath = path.join(receiptData.receiptsDir, file)
                if (fs.existsSync(filePath)) {
                  cleanupTempFile(filePath)
                }
              })
              fs.rmdir(receiptData.receiptsDir, (err) => {
                if (err) {
                  logger.error(
                    `[createExportZip] Error removing receipts directory: ${err}`,
                  )
                } else {
                  logger.info(
                    `[createExportZip] Successfully removed receipts directory: ${receiptData.receiptsDir}`,
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

export { processExpenseExport }
