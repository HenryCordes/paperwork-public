import fs from 'fs'
import { resolve } from 'path'

import { Request, Response, NextFunction } from 'express'
import pdf from 'html-pdf'
import _ from 'lodash'
import { stripHtml } from 'string-strip-html'

import asyncHandlers from '../middleware/async'
import { getCurrentTenantId } from '../middleware/tenantHelper'
import Contact from '../models/Contact'
import Email from '../models/Email'
import Invoice from '../models/Invoice'
import Settings from '../models/Settings'
import User from '../models/User'
import pdfTemplate from '../modules/invoice-report'
import { sendEmail as sendMail } from '../services/emailService'
import { createControllerLogger } from '../services/logger/utils'
import exportReadyTemplate from '../templates/exportReadyTemplate'
import passwordResetTemplate from '../templates/passwordResetTemplate'
import vatReturnReminderTemplate from '../templates/vatReturnReminderTemplate'
import welcomeEmailTemplate from '../templates/welcomeEmailTemplate'

// Create a controller-specific logger
const logger = createControllerLogger('emails')

// @Method: GET
// @Route : api/emails
// @Desc  : Get all emails
export const getEmails = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    // Create a request-specific child logger
    const reqLogger = req.logger || logger.child({ operation: 'getEmails' })
    reqLogger.info('Getting all emails', { offset: req.query.offset })

    try {
      const { offset } = req.query
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantEmail = Email.byTenant(tenantId)
      const emails = await tenantEmail.paginate(
        {},
        {
          offset: Number(offset) || 0,
          limit: 10,
          lean: true,
          sort: { emailDate: -1 },
        },
      )

      reqLogger.info('Successfully retrieved emails', {
        count: emails.docs.length,
        total: emails.totalDocs,
      })
      return res.status(200).json({ success: true, data: emails })
    } catch (error) {
      reqLogger.error('Error retrieving emails', {
        error: (error as Error).message,
        stack: (error as Error).stack,
      })
      return next(error)
    }
  },
)

// @Method: POST
// @Route : api/email
// @Desc  : Create a new email
export const createOrUpdateEmail = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    // Create a request-specific child logger
    const reqLogger =
      req.logger || logger.child({ operation: 'createOrUpdateEmail' })

    const data = _.pick(req.body, [
      '_id',
      'owner',
      'emailDate',
      'subject',
      'body',
      'send',
      'invoiceId',
      'invoiceNumber',
      'invoiceInfo',
      'contactId',
      'contactName',
      'contactEmail',
    ])

    // Log the operation with sanitized data (keep the email body out of logs)
    const logData = { ...data }
    if (logData.body)
      logData.body = `${logData.body.substring(0, 50)}... (truncated)`
    reqLogger.info('Creating or updating email', {
      emailId: data._id || 'new',
      data: logData,
    })
    if (
      !data.subject ||
      data.send === undefined ||
      data.send === null ||
      !data.emailDate ||
      !data.body ||
      !data.contactId
    ) {
      return res
        .status(400)
        .json({ success: false, message: 'Please enter all the fields.' })
    }

    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantEmail = Email.byTenant(tenantId)
      let email

      if (data._id && data._id !== '') {
        const filter = { _id: data._id }
        email = await tenantEmail
          .findOneAndUpdate(filter, data, {
            new: true,
          })
          .lean()
          .exec()
      } else {
        const user = await User.findById(req.user?.id).lean().exec()
        data.owner = user!._id
        email = await tenantEmail.create(data)
      }
      res.status(200).json({ success: true, data: email })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: GET
// @Route : api/email/:id
// @Desc  : get a email
export const getEmail = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    // Create a request-specific child logger
    const reqLogger = req.logger || logger.child({ operation: 'getEmail' })
    reqLogger.info('Getting email by ID', { emailId: req.params.id })

    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantEmail = Email.byTenant(tenantId)
      const email = await tenantEmail.findById(req.params.id).lean().exec()

      if (!email) {
        return res
          .status(404)
          .json({ success: false, message: 'Email not found..' })
      }
      res.status(200).json({ success: true, data: email })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: DELETE
// @Route : api/email/:id
// @Desc  : deletes an email
export const deleteEmail = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const reqLogger = req.logger || logger.child({ operation: 'deleteEmail' })
    reqLogger.info('Deleting email by ID', { emailId: req.params.id })
    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantEmail = Email.byTenant(tenantId)
      const email = await tenantEmail
        .findByIdAndDelete(req.params.id)
        .lean()
        .exec()

      if (!email) {
        return res
          .status(404)
          .json({ success: false, message: 'Email not found..' })
      }
      res.status(200).json({ success: true, data: email })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: POST
// @Route : api/email/send
// @Desc  : Create a new email
export const sendEmail = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const reqLogger = req.logger || logger.child({ operation: 'sendEmail' })
    reqLogger.info('Sending email', { offset: req.query.offset })

    const data = _.pick(req.body, [
      '_id',
      'owner',
      'emailDate',
      'subject',
      'body',
      'send',
      'invoiceId',
      'invoiceNumber',
      'invoiceInfo',
      'contactId',
      'contactName',
      'contactEmail',
    ])

    if (
      !data.subject ||
      !data.send ||
      !data.emailDate ||
      !data.body ||
      !data.contactId
    ) {
      return res
        .status(400)
        .json({ success: false, message: 'Please enter all the fields.' })
    }

    try {
      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantEmail = Email.byTenant(tenantId)
      let email
      data.send = true

      if (data._id && data._id !== '') {
        const filter = { _id: data._id }
        email = await tenantEmail
          .findOneAndUpdate(filter, data, {
            new: true,
          })
          .lean()
          .exec()
      } else {
        const user = await User.findById(req.user?.id).lean().exec()
        data.owner = user!._id
        email = await tenantEmail.create(data)
      }

      // The send flow below assumes a resolved email document; hoist the
      // derived text and the resave filter to this scope so both the
      // invoice and no-invoice branches (and their catch handlers) can use
      // them. (Previously these were declared inside the invoice branch only,
      // which made the no-invoice path throw on undefined variables.)
      const emailRecord = email!
      const emailText = stripHtml(emailRecord.body).result
      const resaveFilter = { _id: emailRecord._id }
      type EmailUpdate = Parameters<typeof tenantEmail.findOneAndUpdate>[1]

      if (emailRecord.invoiceId) {
        const invoiceTenantId = getCurrentTenantId() || req.organizationId
        const tenantInvoice = Invoice.byTenant(invoiceTenantId)
        const invoice = await tenantInvoice
          .findById(emailRecord.invoiceId)
          .lean()
          .exec()

        if (!invoice) {
          reqLogger.warn('Invoice not found')
          return res
            .status(404)
            .json({ success: false, message: 'Invoice not found..' })
        }
        const settingsTenantId = getCurrentTenantId() || req.organizationId
        const tenantSettings = Settings.byTenant(settingsTenantId)
        const settings = await tenantSettings.findOne({}).lean().exec()

        if (!settings) {
          reqLogger.warn('Settings not found')
          return res
            .status(404)
            .json({ success: false, message: 'Settings not found..' })
        }

        const contactTenantId = getCurrentTenantId() || req.organizationId
        const tenantContact = Contact.byTenant(contactTenantId)
        const contact = await tenantContact
          .findById(emailRecord.contactId)
          .lean()
          .exec()

        if (!contact) {
          reqLogger.warn('Contact not found')
          return res
            .status(404)
            .json({ success: false, message: 'Contact not found..' })
        }

        const fileName = `factuur_${invoice._id}.pdf`

        // @types/html-pdf models format/options more narrowly than the runtime
        // accepts (lowercase 'letter'), so cast.
        const pdfOptions = {
          format: 'letter',
          border: {
            top: '0.2in',
            right: '0.2in',
            bottom: '0.2in',
            left: '0.2in',
          },
        } as unknown as pdf.CreateOptions

        await pdf
          .create(
            pdfTemplate({
              invoice: invoice,
              settings: settings,
              contact: contact,
            }),
            pdfOptions,
          )
          .toFile(`./tmp/${fileName}`, async (error) => {
            if (error) {
              reqLogger.warn('generatePDF.toFile:  ' + error.message)
              return res
                .status(500)
                .json({ success: false, message: 'Pdf creation error..' })
            } else {
              const absolute = resolve(`./tmp/${fileName}`)
              const attachment = fs.readFileSync(absolute).toString('base64')
              const attachments = [
                {
                  Base64Content: attachment,
                  Filename: fileName,
                  ContentType: 'application/pdf',
                  //   disposition: "attachment",
                },
              ]
              reqLogger.warn(
                '[Email] contact',
                contact as Record<string, unknown>,
              )
              reqLogger.warn(
                '[Email] email',
                emailRecord as Record<string, unknown>,
              )
              try {
                await sendMail({
                  to: {
                    email: emailRecord.contactEmail as string,
                    name: emailRecord.contactName,
                  },
                  from: {
                    email: process.env.EMAIL_FROM as string,
                    name: 'Paperwork',
                  },
                  subject: emailRecord.subject,
                  text: emailText,
                  html: emailRecord.body,
                  attachments: attachments,
                })
              } catch (error) {
                reqLogger.error('Failed to send email with attachment', {
                  error: (error as Error).message,
                  emailId: emailRecord._id,
                  contactEmail: emailRecord.contactEmail,
                })
                emailRecord.send = false
                tenantEmail
                  .findOneAndUpdate(resaveFilter, emailRecord as EmailUpdate, {
                    new: true,
                  })
                  .lean()
                  .exec()
                return res
                  .status(500)
                  .json({ success: false, message: 'Send mail error..' })
              }
            }
          })
      } else {
        try {
          // Use the email service to send the email
          await sendMail({
            to: emailRecord.contactEmail as string,
            from: process.env.EMAIL_FROM as string,
            subject: emailRecord.subject,
            text: emailText,
            html: emailRecord.body,
          })
          emailRecord.send = true
          tenantEmail
            .findOneAndUpdate(resaveFilter, emailRecord as EmailUpdate, {
              new: true,
            })
            .lean()
            .exec()
        } catch (error) {
          reqLogger.error('Failed to send email', {
            error: (error as Error).message,
            emailId: emailRecord._id,
            contactEmail: emailRecord.contactEmail,
          })
          emailRecord.send = false
          tenantEmail
            .findOneAndUpdate(resaveFilter, emailRecord as EmailUpdate, {
              new: true,
            })
            .lean()
            .exec()
          return res
            .status(500)
            .json({ success: false, message: 'Send mail error..' })
        }
      }

      res.status(200).json({ success: true, data: emailRecord })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: POST
// @Route : api/email/test-template
// @Desc  : Send a test email using any template (for testing purposes)
export const sendTestEmail = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const reqLogger = req.logger || logger.child({ operation: 'sendTestEmail' })

    const { templateType } = req.body

    if (!templateType) {
      return res.status(400).json({
        success: false,
        message:
          'templateType is required. Options: vatReminder, passwordReset, welcome, exportReady',
      })
    }

    reqLogger.info('Sending test email', { templateType })

    try {
      const user = await User.findById(req.user?.id).lean().exec()

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: 'User not found' })
      }

      const tenantIdFromOrg = req.organizationId
      const tenantId = getCurrentTenantId(tenantIdFromOrg)
      const tenantSettings = Settings.byTenant(tenantId)
      const settings = await tenantSettings.findOne({}).lean().exec()

      const companyName = settings?.companyName || 'Uw bedrijf'
      let htmlContent: string
      let subject: string
      let testData: Record<string, unknown>

      switch (templateType) {
        case 'vatReminder':
          testData = {
            userName: user.name,
            companyName: companyName,
            periodLabel: req.body.periodLabel || 'Q4 2024',
            deadline: req.body.deadline || '20 januari 2025',
            daysUntilDeadline: req.body.daysUntilDeadline || 5,
            isSecondReminder: req.body.isSecondReminder || false,
            exportUrl: `${process.env.CLIENT_URL}/taxes`,
            loginUrl: `${process.env.CLIENT_URL}/login`,
          }
          htmlContent = vatReturnReminderTemplate(testData)
          subject = `${testData.isSecondReminder ? 'Laatste herinnering' : 'Herinnering'}: BTW Aangifte ${testData.periodLabel}`
          break

        case 'passwordReset':
          testData = {
            name: user.name,
            resetToken: req.body.resetToken || 'ABC123',
            resetUrl: `${process.env.CLIENT_URL}/reset-password`,
            expiryMinutes: req.body.expiryMinutes || 10,
          }
          htmlContent = passwordResetTemplate(testData)
          subject = 'Wachtwoord Reset - Paperwork'
          break

        case 'welcome':
          testData = {
            name: user.name,
            plan: req.body.plan || 'Premium',
            formattedDate:
              req.body.formattedDate || new Date().toLocaleDateString('nl-NL'),
            loginUrl: `${process.env.CLIENT_URL}/login`,
          }
          htmlContent = welcomeEmailTemplate(testData)
          subject = 'Welkom bij Paperwork!'
          break

        case 'exportReady':
          testData = {
            name: user.name,
            exportType: req.body.exportType || 'expense',
            downloadUrl:
              req.body.downloadUrl ||
              `${process.env.CLIENT_URL}/exports/download/test123`,
            expiryHours: req.body.expiryHours || 2,
            companyName: companyName,
          }
          htmlContent = exportReadyTemplate(testData)
          subject = 'Je export is gereed - Paperwork'
          break

        default:
          return res.status(400).json({
            success: false,
            message:
              'Invalid templateType. Options: vatReminder, passwordReset, welcome, exportReady',
          })
      }

      await sendMail({
        to: user.email,
        from: process.env.EMAIL_FROM as string,
        subject: subject,
        html: htmlContent,
      })

      reqLogger.info('Test email sent successfully', {
        recipient: user.email,
        templateType,
      })

      res.status(200).json({
        success: true,
        message: `Test ${templateType} email sent successfully`,
        recipient: user.email,
        templateType,
        data: testData,
      })
    } catch (error) {
      reqLogger.error('Failed to send test email', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        templateType,
      })
      return next(error)
    }
  },
)
