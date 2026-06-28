import { Request, Response, NextFunction } from 'express'
import _ from 'lodash'
import { Types } from 'mongoose'

import asyncHandlers from '../middleware/async'
import Organization from '../models/Organization'
import Settings from '../models/Settings'
import Subscription from '../models/Subscription'
import User from '../models/User'
import { sendEmail } from '../services/emailService'
import { createControllerLogger } from '../services/logger/utils'
import passwordResetTemplate from '../templates/passwordResetTemplate'

const logger = createControllerLogger('auth')

/**
 * Helper function to check if a user has an active subscription
 */
const checkUserHasActiveSubscription = async (
  userId: unknown,
  organizationId: unknown,
): Promise<boolean> => {
  try {
    const tenantSubscription = Subscription.byTenant(organizationId as string)
    const subscription = await tenantSubscription
      .findOne({
        owner: userId,
        subscriptionStatus: 'active',
      })
      .lean()
      .exec()

    return !!subscription
  } catch (error) {
    logger.error(
      'Error checking subscription status:',
      error as Record<string, unknown>,
    )
    return false
  }
}

// @Method: POST
// @Route : api/auth/register
// @Desc  : Handling the user registration
export const register = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const reqLogger = req.logger || logger.child({ operation: 'register' })
    reqLogger.info('Registering new user', { body: req.body })

    const { name, companyName, email, password, role } = req.body
    let organizationId: unknown

    if (!email || !password || !name) {
      reqLogger.info('Missing required fields: email, wachtwoord, naam', {
        email,
        password,
        name,
      })
      return res
        .status(400)
        .json({ success: false, message: 'Vul alle velden in.' })
    }

    const existingUser = await User.findOne({ email: email }).lean().exec()

    if (existingUser) {
      reqLogger.info('User already exists', { user: existingUser })

      // Check if user has an active subscription
      const hasActiveSubscription = await checkUserHasActiveSubscription(
        existingUser._id,
        existingUser.organization,
      )

      if (!hasActiveSubscription) {
        reqLogger.info(
          'User exists but has no active subscription - incomplete registration',
          {
            userId: existingUser._id,
            organizationId: existingUser.organization,
          },
        )
        return res.status(409).json({
          success: false,
          message:
            'Er bestaat al een account met dit email adres. Log eerst in om je registratie te voltooien.',
          code: 'INCOMPLETE_REGISTRATION',
        })
      } else {
        return res.status(409).json({
          success: false,
          message: 'Gebruiker bestaat al',
        })
      }
    }

    const organizationName = companyName || name

    //TODO: Create workflow that tells user as quickly as possible if a name already exists
    const org = await Organization.findOne({ name: organizationName })
      .lean()
      .exec()

    if (org) {
      reqLogger.info('Organization already exists', { org: org })
      organizationId = org._id
    } else {
      reqLogger.info('Organization not found', {
        organizationName: organizationName,
      })
      const newOrg = await Organization.create({
        name: organizationName,
      })
      reqLogger.info('Organization created', { org: newOrg })
      if (newOrg) {
        organizationId = newOrg._id
      }
    }

    try {
      const tenantSettings = Settings.byTenant(organizationId as string)
      const settings = await tenantSettings
        .findOne({ companyName: organizationName })
        .lean()
        .exec()
      if (!settings) {
        reqLogger.info('Settings not found', { organizationId: organizationId })
        const newSettings = await tenantSettings.create({
          companyName: organizationName,
          street: '',
          houseNumber: '',
          postalCode: '',
          city: '',
          country: 'Nederland',
          phoneNumber: '',
          companyEmail: '',
          taxNumber: '',
          chamberOfCommerceNumber: '',
          bankName: '',
          bankIBAN: '',
          taxPercentage: '21%',
        })
        reqLogger.info('Settings created', { settings: newSettings })
      }

      const user = await User.create({
        name: name,
        companyName: companyName,
        email: email,
        password: password,
        role: role,
        organization: organizationId as Types.ObjectId,
      })
      reqLogger.info('User created', { user: user })

      const token = user.getSignedJwtToken()
      reqLogger.info('Token created', { token: token })

      res.status(200).json({
        success: true,
        token: token,
        userId: user._id,
        organizationId: organizationId,
      })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: POST
// @Route : api/auth/login
// @Desc  : Logging in the user
export const login = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Vul alle velden in.' })
    }

    try {
      const user = await User.findOne({ email: email }).select('+password')

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Combinatie van naam en wachtwoord is niet gevonden',
        })
      }

      const isMatch = await user.verifyPassword(password)

      if (!isMatch) {
        return res.status(404).json({
          success: false,
          message: 'Combinatie van naam en wachtwoord is niet gevonden',
        })
      }

      const token = user.getSignedJwtToken()

      return res.status(200).json({ success: true, token: token })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: GET
// @Route : api/auth/me
// @Desc  : Get the user on load if token available in browser
export const getMe = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await User.findById(req.user?.id)
      return res.status(200).json({ success: true, data: user })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: GET
// @Route : api/auth/profile
// @Desc  : Get the user on load if token available in browser
export const getProfile = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await User.findById(req.user?.id)
      return res.status(200).json({ success: true, data: user })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: POST
// @Route : api/auth/profile
// @Desc  : Updating the User Profile
export const updateProfile = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    // Scope the update to the authenticated user. A body `_id` is intentionally
    // NOT used to resolve the target (it would allow editing another user's
    // profile -- an IDOR, since User is not tenant-scoped).
    const data = _.pick(req.body, ['name', 'companyName', 'email'])
    const { currentPassword, newPassword } = req.body

    if (!data.email || !data.name) {
      return res
        .status(400)
        .json({ success: false, message: 'Vul alle velden in.' })
    }

    try {
      let profile = await User.findById(req.user?.id).select('+password').exec()
      if (!profile) {
        const error: Error & { status?: number } = new Error(
          `User ${req.user?.id} not found`,
        )
        error.status = 404
        throw error
      }
      _.assign(profile, data)
      if (currentPassword && newPassword) {
        const isMatch = await profile.verifyPassword(currentPassword)
        if (isMatch) {
          profile.password = newPassword
        } else {
          return res.status(404).json({
            success: false,
            message: 'Huidige wachtwoord is niet correct.',
          })
        }
      }

      profile = await profile.save()
      return await res.status(200).json({ success: true, data: profile })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: POST
// @Route : api/auth/forgot-password
// @Desc  : Send password reset email
export const forgotPassword = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const reqLogger =
      req.logger || logger.child({ operation: 'forgotPassword' })
    reqLogger.info('Forgot password', { email: req.body.email })
    const { email } = req.body

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is verplicht',
      })
    }

    try {
      // Find user by email
      const user = await User.findOne({ email: email.toLowerCase() })
      reqLogger.info('Forgot password found user', { user: user })
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Geen gebruiker gevonden met dit email adres',
        })
      }

      // Generate reset token
      user.generateResetToken()
      await user.save()

      // Prepare data for the email template
      const userName = user.name
      const resetUrl = `${process.env.CLIENT_URL}/password-reset`
      const expiryMinutes = process.env.RESET_TOKEN_EXPIRY_MINUTES || 10

      // Generate email HTML using the template
      const emailHtml = passwordResetTemplate({
        name: userName,
        resetToken: user.resetToken,
        resetUrl: resetUrl,
        expiryMinutes: expiryMinutes,
      })

      // Return email data for frontend to send
      return res.status(200).json({
        success: true,
        message: 'Reset instructies worden verstuurd naar je email',
        emailData: {
          to: {
            email: user.email,
            name: userName,
          },
          from: {
            email: process.env.EMAIL_FROM || 'noreply@paperwork.app',
            name: 'Paperwork',
          },
          subject: 'Wachtwoord Reset - Paperwork',
          html: emailHtml,
          resetToken: user.resetToken,
          resetUrl: resetUrl,
          expiryDate: user.resetTokenExpiry,
        },
      })
    } catch (error) {
      return next(error)
    }
  },
)

// @Method: POST
// @Route : api/auth/reset-password
// @Desc  : Reset password using token
export const resetPassword = asyncHandlers(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, resetToken, newPassword } = req.body

    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, reset code en nieuw wachtwoord zijn verplicht',
      })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Wachtwoord moet minimaal 6 karakters lang zijn',
      })
    }

    try {
      // Find user by email and include reset token fields
      const user = await User.findOne({ email: email }).select(
        '+resetToken +resetTokenExpiry +password',
      )

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Gebruiker met dit email adres niet gevonden',
        })
      }

      // Validate reset token
      if (!user.validateResetToken(resetToken)) {
        return res.status(400).json({
          success: false,
          message: 'Ongeldige of verlopen reset code',
        })
      }

      // Update password (will be hashed by the pre-save hook)
      user.password = newPassword

      // Clear reset token
      user.clearResetToken()

      // Save user
      await user.save()

      return res.status(200).json({
        success: true,
        message: 'Wachtwoord succesvol gewijzigd',
      })
    } catch (error) {
      return next(error)
    }
  },
)

// @route   POST api/auth/send-reset-email
// @desc    Send password reset email (public endpoint)
// @access  Public
export const sendResetEmail = async (req: Request, res: Response) => {
  try {
    const { to, from, subject, html } = req.body

    // Validate required fields
    if (!to || !to.email || !from || !from.email || !subject || !html) {
      return res.status(400).json({
        success: false,
        message: 'Missing required email fields',
      })
    }

    const request = await sendEmail({
      to: { email: to.email, name: '' },
      from: { email: process.env.EMAIL_FROM as string, name: 'Paperwork' },
      subject: subject,
      html: html,
    })

    res.json({
      success: true,
      message: 'Email succesvol verstuurd',
      // sendEmail now returns only { success }; `body` no longer exists so this
      // resolves to undefined (and is omitted from the JSON), preserving the
      // current runtime response which the client does not read.
      data: (request as { body?: unknown }).body,
    })
  } catch (err) {
    console.error('Send reset email error:', (err as Error).message)
    res.status(500).json({
      success: false,
      message: 'Server error bij versturen email',
    })
  }
}
