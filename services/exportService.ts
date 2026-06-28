import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Parser } from 'json2csv'

import { PATHS } from '../common/constants/paths'
import Expense from '../models/Expense'
import Invoice from '../models/Invoice'

import { s3Client, bucketName } from './documentUpload'
import { getLogger } from './logger'

const logger = getLogger()

interface ExportSuccess {
  success: true
  fileName: string
  csv: string
  receiptData?: { receiptsDir: string; receipts: ReceiptFile[] }
}
interface ExportFailure {
  success: false
  message: string
}
type ExportResult = ExportSuccess | ExportFailure

/**
 * Export Service for generating CSV exports of financial data
 * Supports:
 * - Expense export with optional receipts as zip
 * - Invoice export
 * - Period filtering
 */

/**
 * Generate CSV export for expenses
 */
async function exportExpenses(
  tenantId: string,
  startDate: Date,
  endDate: Date,
  includeReceipts = false,
): Promise<ExportResult> {
  try {
    // Query expenses in the given date range
    const expenses = await Expense.find({
      tenantId,
      expenseDate: { $gte: startDate, $lte: endDate },
    }).lean()

    if (!expenses.length) {
      return {
        success: false,
        message: 'Geen uitgaven gevonden voor de geselecteerde periode.',
      }
    }

    // Helper for Dutch currency formatting with exactly two decimals
    const formatCurrency = (value: number | undefined | null) => {
      return value
        ? Number(value).toLocaleString('nl-NL', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : '0,00'
    }

    // Helper to generate consistent receipt filenames
    const generateReceiptFilename = (expense: (typeof expenses)[number]) => {
      if (!expense.expenseFile) return ''
      const extension = expense.expenseFile.split('.').pop() || 'jpg'
      return `${expense.expenseNumber || expense._id}.${extension}`
    }

    // Format dates and prepare data for CSV
    const formattedExpenses = expenses.map((expense) => {
      return {
        Nummer: expense.expenseNumber,
        Datum: expense.expenseDate
          ? new Date(expense.expenseDate).toLocaleDateString('nl-NL')
          : '',
        Leverancier: expense.contactName || '',
        Omschrijving: expense.info || '',
        'Bedrag (incl. BTW)': formatCurrency(expense.price),
        'Bedrag (excl. BTW)': formatCurrency(expense.priceWOTaxes),
        'BTW Hoog (21%)': formatCurrency(expense.tax),
        'BTW Laag (9%)': formatCurrency(expense.taxLow),
        Bestand: expense.expenseFile
          ? `receipts/${generateReceiptFilename(expense)}`
          : '',
      }
    })

    // Define CSV fields and options
    const fields = [
      'Nummer',
      'Datum',
      'Leverancier',
      'Omschrijving',
      'Bedrag (incl. BTW)',
      'Bedrag (excl. BTW)',
      'BTW Hoog (21%)',
      'BTW Laag (9%)',
      'Bestand',
    ]

    const opts = { fields }
    const parser = new Parser(opts)
    const csv = parser.parse(formattedExpenses)

    const result: ExportSuccess = {
      success: true,
      fileName: `uitgaven_${formatDateForFilename(
        startDate,
      )}_${formatDateForFilename(endDate)}.csv`,
      csv,
    }

    // Include receipts if requested
    if (includeReceipts) {
      const expensesWithFiles = expenses.filter(
        (expense) => expense.expenseFile,
      )

      if (expensesWithFiles.length > 0) {
        const receiptData = await downloadReceipts(expensesWithFiles, tenantId)
        result.receiptData = receiptData
      }
    }

    return result
  } catch (error) {
    logger.error('Error exporting expenses:', error as Record<string, unknown>)
    return {
      success: false,
      message: `Fout bij exporteren: ${(error as Error).message}`,
    }
  }
}

/**
 * Generate CSV export for invoices
 */
async function exportInvoices(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<ExportResult> {
  try {
    // Query invoices in the given date range
    const invoices = await Invoice.find({
      tenantId,
      invoiceDate: { $gte: startDate, $lte: endDate },
    }).lean()

    if (!invoices.length) {
      return {
        success: false,
        message: 'Geen facturen gevonden voor de geselecteerde periode.',
      }
    }

    // Generate PDF filename for each invoice
    const generateInvoicePdfFilename = (invoice: (typeof invoices)[number]) => {
      return `invoices/${invoice.invoiceNumber || invoice._id}.pdf`
    }

    // Format dates and prepare data for CSV
    const formattedInvoices = invoices.map((invoice) => {
      const priceWithoutTaxes = invoice.priceWithoutTaxes
        ? invoice.priceWithoutTaxes.toFixed(2)
        : 0
      const taxLow = invoice.taxLow ? invoice.taxLow : 0
      const taxLowest = invoice.taxLowest ? invoice.taxLowest : 0
      const tax = invoice.tax ? invoice.tax : 0

      const price = invoice.price
        ? invoice.price.toFixed(2)
        : Number(
            Number(priceWithoutTaxes) +
              Number(tax) +
              Number(taxLow) +
              Number(taxLowest),
          ).toFixed(2)

      return {
        Factuurnummer: `${invoice.invoiceNumber || ''}`,
        Factuurdatum: invoice.invoiceDate
          ? new Date(invoice.invoiceDate).toLocaleDateString('nl-NL')
          : '',
        Betaaldatum: invoice.payDate
          ? new Date(invoice.payDate).toLocaleDateString('nl-NL')
          : '',
        Klant: invoice.contactName || '',
        Status: invoice.state || '',
        Omschrijving: invoice.info || '',
        'Totaalbedrag (incl. BTW)': price ? price : '0.00',
        'Totaalbedrag (excl. BTW)': invoice.priceWithoutTaxes
          ? invoice.priceWithoutTaxes.toFixed(2)
          : '0.00',
        'BTW Hoog (21%)': invoice.tax ? invoice.tax.toFixed(2) : '0.00',
        'BTW Laag (9%)': invoice.taxLow ? invoice.taxLow.toFixed(2) : '0.00',
        'BTW Laagst (6%)': invoice.taxLowest
          ? invoice.taxLowest.toFixed(2)
          : '0.00',
        // PDF path for paid invoices (matching Bestand column in expense exports)
        Factuur:
          invoice.state === 'Betaald'
            ? generateInvoicePdfFilename(invoice)
            : '',
      }
    })

    // Define CSV fields and options
    const fields = [
      'Factuurnummer',
      'Factuurdatum',
      'Betaaldatum',
      'Klant',
      'Status',
      'Omschrijving',
      'Totaalbedrag (incl. BTW)',
      'Totaalbedrag (excl. BTW)',
      'BTW Hoog (21%)',
      'BTW Laag (9%)',
      'BTW Laagst (6%)',
      'Factuur', // Include the PDF path column
    ]

    const opts = { fields }
    const parser = new Parser(opts)
    const csv = parser.parse(formattedInvoices)

    return {
      success: true,
      fileName: `facturen_${formatDateForFilename(
        startDate,
      )}_${formatDateForFilename(endDate)}.csv`,
      csv,
    }
  } catch (error) {
    logger.error(
      `[exportInvoices] Error exporting invoices tenantId: ${tenantId}, startDate: ${startDate}, endDate: ${endDate}`,
      error as Record<string, unknown>,
    )
    return {
      success: false,
      message: `Fout bij exporteren: ${(error as Error).message}`,
    }
  }
}

/**
 * Helper function to format date for filenames (YYYY-MM-DD)
 */
function formatDateForFilename(date: Date): string {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

interface ReceiptFile {
  id: unknown
  path: string
  filename: string
}

interface ExpenseWithFile {
  _id: unknown
  expenseFile?: string | null
  expenseNumber?: number | null
}

/**
 * Download receipts for expenses from S3 into a temp directory.
 */
async function downloadReceipts(
  expenses: ExpenseWithFile[],
  tenantId: string,
): Promise<{ receiptsDir: string; receipts: ReceiptFile[] }> {
  try {
    logger.info(
      `[downloadReceipts] Starting receipt download for ${expenses.length} expenses, tenant: ${tenantId}`,
    )

    const receiptsDir = path.join(
      PATHS.TEMP_DIR,
      `receipts-${tenantId}-${Date.now()}`,
    )

    try {
      if (!fs.existsSync(PATHS.TEMP_DIR)) {
        fs.mkdirSync(PATHS.TEMP_DIR, { recursive: true })
      }

      fs.mkdirSync(receiptsDir, { recursive: true })

      if (!fs.existsSync(receiptsDir)) {
        logger.error(
          `[downloadReceipts] FAILED to create receipt directory: ${receiptsDir}, tenant: ${tenantId}`,
        )
      }
    } catch (err) {
      logger.error(
        `[downloadReceipts] Error creating directory: ${(err as Error).message}, tenant: ${tenantId}`,
      )
    }

    if (!fs.existsSync(receiptsDir)) {
      fs.mkdirSync(receiptsDir, { recursive: true })
    }

    // Download receipts for each expense and store locally
    const receiptPromises = expenses
      .filter((expense) => expense.expenseFile)
      .map(async (expense): Promise<ReceiptFile | null> => {
        const s3Key = expense.expenseFile as string

        logger.info(
          `[downloadReceipts] Attempting to download from S3: ${s3Key}, tenant: ${tenantId}`,
        )
        logger.info(
          `[downloadReceipts] S3 download params: Bucket=${bucketName}, Key=${s3Key}, tenant: ${tenantId}`,
        )

        const extension = s3Key.split('.').pop() || 'jpg'
        const filename = `${expense.expenseNumber || expense._id}.${extension}`
        const targetPath = path.join(receiptsDir, filename)

        try {
          const s3Command = new GetObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
          })

          const s3Response = await s3Client.send(s3Command)

          logger.info(
            `[downloadReceipts] Writing receipt to: ${targetPath}, tenant: ${tenantId}`,
          )
          const writeStream = fs.createWriteStream(targetPath)
          ;(s3Response.Body as Readable).pipe(writeStream)

          return new Promise<ReceiptFile>((resolve, reject) => {
            writeStream.on('finish', () => {
              const fileSize = fs.statSync(targetPath).size
              logger.info(
                `[downloadReceipts] Downloaded from S3 and wrote to disk: ${path.basename(
                  targetPath,
                )}, size: ${fileSize} bytes, path: ${targetPath}, tenant: ${tenantId}`,
              )
              resolve({
                id: expense._id,
                path: targetPath,
                filename: filename,
              })
            })

            writeStream.on('error', (err) => {
              logger.error(
                `[downloadReceipts] Error writing receipt ${expense._id}: ${err.message}, tenant: ${tenantId}`,
              )
              reject(err)
            })
          })
        } catch (error) {
          logger.error(
            `[downloadReceipts] Error downloading receipt ${expense._id}: ${(error as Error).message}, tenant: ${tenantId}`,
          )
          return null
        }
      })

    const downloadedReceipts = await Promise.all(receiptPromises)
    const validReceipts = downloadedReceipts.filter(
      (receipt): receipt is ReceiptFile => Boolean(receipt),
    )

    logger.info(
      `[downloadReceipts] Successfully downloaded ${validReceipts.length} receipts to temp directory, tenant: ${tenantId}`,
    )

    return { receiptsDir, receipts: validReceipts }
  } catch (error) {
    logger.error('[downloadReceipts] Error in downloadReceipts:', {
      error: (error as Error).message,
      tenantId,
    })
    throw error
  }
}

/**
 * Clean up temporary export files
 */
function cleanupTempFile(filePath: string): void {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) {
        logger.error(
          `[cleanupTempFile] Error deleting temporary file ${filePath}:`,
          err as unknown as Record<string, unknown>,
        )
      } else {
        logger.info(`[cleanupTempFile] Temporary file deleted: ${filePath}`)
      }
    })
  }
}

export {
  exportExpenses,
  exportInvoices,
  cleanupTempFile,
  // Exported for unit testing (Phase 3 pure-helper coverage)
  formatDateForFilename,
}
