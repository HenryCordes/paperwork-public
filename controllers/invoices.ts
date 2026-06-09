import { resolve } from 'path'

import { Request, Response, NextFunction } from 'express'
import pdf from 'html-pdf'
import _ from 'lodash'

import asyncHandlers from '../middleware/async'
import { getCurrentTenantId } from '../middleware/tenantHelper'
import Contact from '../models/Contact'
import Invoice from '../models/Invoice'
import Settings from '../models/Settings'
import pdfTemplate from '../modules/invoice-report'
import { refreshMonthFromRawData } from '../services/dashboardAggregation'

// @Method: GET
// @Route : api/invoices
// @Desc  : Get all invoices
export const getInvoices = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offset, startDate, endDate, search, contactId } = req.query
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantInvoice = Invoice.byTenant(tenantId)

      // Build query object for filtering
      const query: Record<string, unknown> = {}

      // Add contactId filter if provided
      if (contactId) {
        query.contactId = contactId
      }

      // Add date range filtering if startDate and endDate are provided
      if (startDate && endDate) {
        query.invoiceDate = {
          $gte: new Date(startDate as string),
          $lte: new Date(endDate as string),
        }
      }

      // Add search filtering if search parameter is provided
      if (search) {
        // Build search query - handle numeric and string fields separately
        const searchConditions: Record<string, unknown>[] = []

        // For text fields, use regex search
        searchConditions.push(
          { info: { $regex: search, $options: 'i' } },
          { contactName: { $regex: search, $options: 'i' } },
        )

        // For invoiceNumber, which is numeric, only add if search is a number
        const numberSearch = Number(String(search).trim())
        if (!isNaN(numberSearch)) {
          searchConditions.push({ invoiceNumber: numberSearch })
        }

        // Add conditions to query
        if (searchConditions.length > 0) {
          query.$or = searchConditions
        }
      }

      const invoices = await tenantInvoice.paginate(query, {
        offset: Number(offset) || 0,
        limit: 10,
        lean: true,
        sort: { invoiceDate: -1 },
      })
      return res.status(200).json({ success: true, data: invoices })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: GET
// @Route : api/invoices/list
// @Desc  : Get all invoices
export const getInvoicesList = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantInvoice = Invoice.byTenant(tenantId)
      const invoices = await tenantInvoice
        .find({}, { _id: 1, invoiceNumber: 1, contactId: 1 })
        .lean()
        .exec()
      return res.status(200).json({ success: true, data: invoices })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: GET
// @Route : api/invoice
// @Desc  : get an invoice
export const getInvoice = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantInvoice = Invoice.byTenant(tenantId)
      const invoice = await tenantInvoice.findById(req.params.id).lean().exec()

      if (!invoice) {
        return res
          .status(404)
          .json({ success: false, message: 'Invoice not found..' })
      }
      res.status(200).json({ success: true, data: invoice })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: POST
// @Route : api/invoice
// @Desc  : Updates an invoice, or creates a new invoice
export const createOrUpdateInvoice = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const data = _.pick(req.body, [
      '_id',
      'contactId',
      'contactName',
      'invoiceNumber',
      'invoiceDate',
      'payDate',
      'tax',
      'taxLow',
      'taxLowest',
      'priceWithoutTaxes',
      'priceIncludingTax',
      'price',
      'state',
      'invoiceLines',
    ])

    if (!data.contactId || !data.invoiceDate || !data.payDate) {
      return res
        .status(400)
        .json({ success: false, message: 'Please enter all the fields.' })
    }

    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantInvoice = Invoice.byTenant(tenantId)
      let invoice

      if (data._id && data._id !== '') {
        const filter = { _id: data._id }
        invoice = await tenantInvoice
          .findOneAndUpdate(filter, data, {
            new: true,
          })
          .lean()
          .exec()
      } else {
        invoice = await tenantInvoice.create(data)
      }

      // Refresh entire month's dashboard aggregation to ensure completeness
      try {
        const invoiceDate = new Date(invoice!.invoiceDate)
        const year = invoiceDate.getFullYear()
        const month = invoiceDate.getMonth() + 1
        await refreshMonthFromRawData(tenantId, year, month)
      } catch (aggError) {
        console.error('Failed to refresh dashboard aggregation:', aggError)
      }

      res.status(200).json({ success: true, data: invoice })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: DELETE
// @Route : api/invoice/:id
// @Desc  : deletes an invoice
export const deleteInvoice = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantInvoice = Invoice.byTenant(tenantId)
      const invoice = await tenantInvoice
        .findByIdAndDelete(req.params.id)
        .lean()
        .exec()

      if (!invoice) {
        return res
          .status(404)
          .json({ success: false, message: 'Invoice not found..' })
      }

      // Refresh entire month's dashboard aggregation to ensure completeness
      try {
        const invoiceDate = new Date(invoice.invoiceDate)
        const year = invoiceDate.getFullYear()
        const month = invoiceDate.getMonth() + 1
        await refreshMonthFromRawData(tenantId, year, month)
      } catch (aggError) {
        console.error('Failed to refresh dashboard aggregation:', aggError)
      }

      res.status(200).json({ success: true, data: invoice })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: GET
// @Route : api/invoices/download/:id
// @Desc  : Get generated pdf of an invoice
export const downloadInvoice = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantInvoice = Invoice.byTenant(tenantId)
      const invoice = await tenantInvoice.findById(req.params.id).lean().exec()

      if (!invoice) {
        console.log('Invoice not found')
        return res
          .status(404)
          .json({ success: false, message: 'Invoice not found..' })
      }
      const tenantSettings = Settings.byTenant(tenantId)
      const settings = await tenantSettings.findOne({}).lean().exec()

      if (!settings) {
        console.log('Settings not found')
        return res
          .status(404)
          .json({ success: false, message: 'Settings not found..' })
      }

      const tenantContact = Contact.byTenant(tenantId)
      const contact = await tenantContact
        .findById(invoice.contactId)
        .lean()
        .exec()

      if (!contact) {
        console.log('Contact not found')
        return res
          .status(404)
          .json({ success: false, message: 'Contact not found..' })
      }

      const fileName = `factuur_${invoice._id}.pdf`

      // @types/html-pdf is stricter/narrower than what html-pdf accepts at
      // runtime (lowercase format, childProcessOptions.env), so cast.
      const pdfOptions = {
        format: 'letter',
        border: {
          top: '0.2in',
          right: '0.2in',
          bottom: '0.2in',
          left: '0.2in',
        },
        childProcessOptions: { env: { OPENSSL_CONF: '/dev/null' } },
      } as unknown as pdf.CreateOptions

      pdf
        .create(
          pdfTemplate({
            invoice: invoice,
            settings: settings,
            contact: contact,
          }),
          pdfOptions,
        )
        .toFile(`./tmp/pdf/${fileName}`, (error) => {
          if (error) {
            console.log('generatePDF.toFile:  ' + error.message)
            return res
              .status(500)
              .json({ success: false, message: 'Pdf creation error..' })
          } else {
            const absolute = resolve(`./tmp/pdf/${fileName}`)
            return res.sendFile(absolute)
          }
        })
    } catch (error) {
      return next(error)
    }
  },
)
