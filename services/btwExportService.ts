import { Parser } from 'json2csv'
import * as xlsx from 'xlsx'

import { formatBTWPeriodLabel } from '../common/constants/btwPeriods'

import {
  calculateBTWForPeriod,
  getCompanyInfoForBTW,
} from './btwCalculationService'
import { getLogger } from './logger'

const logger = getLogger()

type BTWData = Awaited<ReturnType<typeof calculateBTWForPeriod>>
type CompanyInfo = Awaited<ReturnType<typeof getCompanyInfoForBTW>>

/**
 * BTW Export Service
 * Generates Excel and CSV exports for Dutch BTW reporting
 */

/**
 * Generate BTW export in specified format
 */
async function generateBTWExport(
  tenantId: string,
  periodType: string,
  period: string | number,
  year: number,
  format = 'excel',
  includeDetails = false,
) {
  try {
    logger.info(
      `BTW export genereren voor tenant ${tenantId}, periode: ${periodType} ${period} ${year}, formaat: ${format}`,
    )

    // Calculate BTW data
    const btwData = await calculateBTWForPeriod(
      tenantId,
      periodType,
      period,
      year,
    )
    const companyInfo = await getCompanyInfoForBTW(tenantId)

    const fileName = generateFileName(periodType, period, year, format)

    let fileData
    if (format === 'excel') {
      fileData = await generateExcelExport(btwData, companyInfo, includeDetails)
    } else {
      fileData = await generateCSVExport(btwData, companyInfo)
    }

    logger.info(`BTW export voltooid voor ${btwData.period.label}: ${fileName}`)

    return {
      success: true,
      fileName,
      fileData,
      contentType:
        format === 'excel'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv',
      btwData,
    }
  } catch (error) {
    logger.error(
      `Fout bij genereren BTW export voor periode ${periodType} ${period} ${year}:`,
      error as Record<string, unknown>,
    )
    return {
      success: false,
      message: `Fout bij genereren BTW export: ${(error as Error).message}`,
    }
  }
}

/**
 * Generate Excel export with BTW summary
 */
async function generateExcelExport(
  btwData: BTWData,
  companyInfo: CompanyInfo,
  _includeDetails = false,
): Promise<Buffer> {
  const workbook = xlsx.utils.book_new()

  // Prepare summary data for xlsx
  const summaryData = [
    { Omschrijving: 'BTW-aangifte overzicht', Waarde: '' },
    { Omschrijving: '', Waarde: '' },
    { Omschrijving: `Periode: ${btwData.period.label}`, Waarde: '' },
    {
      Omschrijving: `(${btwData.period.dateRange.start} t/m ${btwData.period.dateRange.end})`,
      Waarde: '',
    },
    { Omschrijving: '', Waarde: '' },
    { Omschrijving: `Bedrijf: ${companyInfo.companyName}`, Waarde: '' },
    { Omschrijving: `KvK: ${companyInfo.kvkNumber}`, Waarde: '' },
    { Omschrijving: `BTW-nummer: ${companyInfo.btwNumber}`, Waarde: '' },
    { Omschrijving: '', Waarde: '' },
    { Omschrijving: '1. Omzet (exclusief btw)', Waarde: '' },
    {
      Omschrijving: '- 1a Hoog tarief (21%)',
      Waarde: formatCurrencyDutch(btwData.omzet.hoogTarief21.excl),
    },
    {
      Omschrijving: '- 1b Laag tarief (9%)',
      Waarde: formatCurrencyDutch(btwData.omzet.laagTarief9.excl),
    },
    {
      Omschrijving: '- 1c Laagste tarief (6%)',
      Waarde: formatCurrencyDutch(btwData.omzet.laagsteTarief6.excl),
    },
    {
      Omschrijving: '- 1d Overige / verlegd',
      Waarde: formatCurrencyDutch(btwData.omzet.overige.excl),
    },
    {
      Omschrijving: 'Subtotaal omzet',
      Waarde: formatCurrencyDutch(btwData.subtotaalOmzet),
    },
    { Omschrijving: '', Waarde: '' },
    { Omschrijving: '2. Te betalen btw', Waarde: '' },
    {
      Omschrijving: '- 1a Hoog (21%)',
      Waarde: formatCurrencyDutch(btwData.omzet.hoogTarief21.btw),
    },
    {
      Omschrijving: '- 1b Laag (9%)',
      Waarde: formatCurrencyDutch(btwData.omzet.laagTarief9.btw),
    },
    {
      Omschrijving: '- 1c Laagste (6%)',
      Waarde: formatCurrencyDutch(btwData.omzet.laagsteTarief6.btw),
    },
    {
      Omschrijving: '- 1d Overige / verlegd',
      Waarde: formatCurrencyDutch(btwData.omzet.overige.btw),
    },
    {
      Omschrijving: 'Subtotaal verschuldigde btw',
      Waarde: formatCurrencyDutch(btwData.verschuldigdeBTW),
    },
    { Omschrijving: '', Waarde: '' },
    { Omschrijving: '3. Voorbelasting (btw op zakelijke kosten)', Waarde: '' },
    {
      Omschrijving: '- 5b Voorbelasting',
      Waarde: formatCurrencyDutch(btwData.voorbelasting),
    },
    { Omschrijving: '', Waarde: '' },
    { Omschrijving: '4. Eindresultaat', Waarde: '' },
    {
      Omschrijving: '- Verschuldigde btw',
      Waarde: formatCurrencyDutch(btwData.verschuldigdeBTW),
    },
    {
      Omschrijving: '- Voorbelasting',
      Waarde: formatCurrencyDutch(btwData.voorbelasting),
    },
    { Omschrijving: '', Waarde: '' },
    {
      Omschrijving:
        btwData.teBetalen >= 0 ? 'Te betalen btw:' : 'Te ontvangen btw:',
      Waarde: formatCurrencyDutch(Math.abs(btwData.teBetalen)),
    },
    { Omschrijving: '', Waarde: '' },
    {
      Omschrijving: `Gegenereerd op: ${new Date().toLocaleDateString('nl-NL')}`,
      Waarde: '',
    },
  ]

  // Create worksheet
  const summarySheet = xlsx.utils.json_to_sheet(summaryData)

  // Set column widths
  summarySheet['!cols'] = [
    { wch: 40 }, // Omschrijving column
    { wch: 20 }, // Waarde column
  ]

  xlsx.utils.book_append_sheet(workbook, summarySheet, 'BTW Aangifte Overzicht')

  // Generate buffer
  const buffer = xlsx.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer
  return buffer
}

/**
 * Generate CSV export with BTW summary
 */
async function generateCSVExport(
  btwData: BTWData,
  companyInfo: CompanyInfo,
): Promise<string> {
  const csvData = [
    {
      Omschrijving: 'BTW Aangifte Overzicht',
      Periode: btwData.period.label,
      Bedrag: '',
    },
    { Omschrijving: '', Periode: '', Bedrag: '' },
    { Omschrijving: 'Bedrijfsgegevens', Periode: '', Bedrag: '' },
    {
      Omschrijving: 'Bedrijfsnaam',
      Periode: companyInfo.companyName,
      Bedrag: '',
    },
    { Omschrijving: 'KvK nummer', Periode: companyInfo.kvkNumber, Bedrag: '' },
    { Omschrijving: 'BTW nummer', Periode: companyInfo.btwNumber, Bedrag: '' },
    { Omschrijving: '', Periode: '', Bedrag: '' },
    { Omschrijving: '1. Omzet (exclusief btw)', Periode: '', Bedrag: '' },
    {
      Omschrijving: '1a Hoog tarief (21%)',
      Periode: '',
      Bedrag: formatCurrencyDutch(btwData.omzet.hoogTarief21.excl),
    },
    {
      Omschrijving: '1b Laag tarief (9%)',
      Periode: '',
      Bedrag: formatCurrencyDutch(btwData.omzet.laagTarief9.excl),
    },
    {
      Omschrijving: '1c Laagste tarief (6%)',
      Periode: '',
      Bedrag: formatCurrencyDutch(btwData.omzet.laagsteTarief6.excl),
    },
    {
      Omschrijving: '1d Overige / verlegd',
      Periode: '',
      Bedrag: formatCurrencyDutch(btwData.omzet.overige.excl),
    },
    {
      Omschrijving: 'Subtotaal omzet',
      Periode: '',
      Bedrag: formatCurrencyDutch(btwData.subtotaalOmzet),
    },
    { Omschrijving: '', Periode: '', Bedrag: '' },
    { Omschrijving: '2. Te betalen btw', Periode: '', Bedrag: '' },
    {
      Omschrijving: '1a Hoog (21%)',
      Periode: '',
      Bedrag: formatCurrencyDutch(btwData.omzet.hoogTarief21.btw),
    },
    {
      Omschrijving: '1b Laag (9%)',
      Periode: '',
      Bedrag: formatCurrencyDutch(btwData.omzet.laagTarief9.btw),
    },
    {
      Omschrijving: '1c Laagste (6%)',
      Periode: '',
      Bedrag: formatCurrencyDutch(btwData.omzet.laagsteTarief6.btw),
    },
    {
      Omschrijving: '1d Overige / verlegd',
      Periode: '',
      Bedrag: formatCurrencyDutch(btwData.omzet.overige.btw),
    },
    {
      Omschrijving: 'Subtotaal verschuldigde btw',
      Periode: '',
      Bedrag: formatCurrencyDutch(btwData.verschuldigdeBTW),
    },
    { Omschrijving: '', Periode: '', Bedrag: '' },
    {
      Omschrijving: '3. Voorbelasting',
      Periode: '',
      Bedrag: formatCurrencyDutch(btwData.voorbelasting),
    },
    { Omschrijving: '', Periode: '', Bedrag: '' },
    {
      Omschrijving:
        btwData.teBetalen >= 0 ? 'Te betalen btw' : 'Te ontvangen btw',
      Periode: '',
      Bedrag: formatCurrencyDutch(Math.abs(btwData.teBetalen)),
    },
  ]

  const fields = ['Omschrijving', 'Periode', 'Bedrag']
  const opts = { fields, delimiter: ';' } // Use semicolon for Dutch CSV
  const parser = new Parser(opts)
  return parser.parse(csvData)
}

/**
 * Format currency in Dutch style
 */
function formatCurrencyDutch(amount: number): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '€ 0,00'
  }

  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Generate filename for BTW export
 */
function generateFileName(
  periodType: string,
  period: string | number,
  year: number,
  format: string,
): string {
  const extension = format === 'excel' ? 'xlsx' : 'csv'
  const periodLabel = formatBTWPeriodLabel(periodType, period, year)
    .replace(/\s+/g, '_')
    .replace(/[^\w\-_]/g, '')

  return `BTW_Aangifte_${periodLabel}.${extension}`
}

export { generateBTWExport, formatCurrencyDutch }
