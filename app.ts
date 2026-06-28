import './config/loadEnv'

import path from 'path'

import cors from 'cors'
import express, {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from 'express'
import sanitize from 'express-mongo-sanitize'
import helmet from 'helmet'
import hpp from 'hpp'
import robots from 'robots.txt'
import xss from 'xss-clean'

import { getLoggerConfig } from './config/logger'
import { getSubscriptionManagement } from './controllers/payments'
import { protect } from './middleware/auth'
import {
  requestLogger,
  responseLogger,
  bindLoggerContext,
} from './middleware/logging'
import { verifySubscriptionActive } from './middleware/subscriptionVerify'
import { bindCurrentNamespace } from './middleware/tenantHelper'
import auth from './routes/auth'
import btwExport from './routes/btwExport'
import contact from './routes/contact'
import contacts from './routes/contacts'
import dashboard from './routes/dashboard'
import document from './routes/document'
import email from './routes/email'
import emails from './routes/emails'
import expense from './routes/expense'
import expenses from './routes/expenses'
import exportRoutes from './routes/export'
import invoice from './routes/invoice'
import invoices from './routes/invoices'
import note from './routes/note'
import notes from './routes/notes'
import notifications from './routes/notifications'
import payments from './routes/payments'
import plans from './routes/plans'
import settings from './routes/settings'
import vatReturnNotifications from './routes/vatReturnNotifications'
import { configureLogger, getLogger } from './services/logger'

// Initialize the application logger
configureLogger(getLoggerConfig())
const logger = getLogger()

// Log application startup
logger.info(
  `Starting Paperwork API in ${process.env.NODE_ENV || 'development'} mode`,
)

//Initialize express app
const app = express()

// Tenant namespace setup - ensures tenant context is maintained across async operations
app.use(bindCurrentNamespace)

// Setup request logging context and middleware
// bindLoggerContext() is typed with the logger's narrow request/response
// interfaces; cast to RequestHandler for app.use().
app.use(bindLoggerContext() as RequestHandler)
app.use(requestLogger())
app.use(responseLogger())

//Nosql injection
app.use(sanitize())

//precautionary security headers
app.use(helmet())

//CrossSiteScripting
app.use(xss())

//http parameter pollution attack
app.use(hpp())

//Json parsing
app.use(express.json())

//Form parsing
app.use(express.urlencoded({ extended: false }))

//CORS
app.use(cors())

app.use(robots(__dirname + '/robots.txt'))

//Folder for uploading files or images from the client
app.use('/uploads', express.static('uploads'))

app.use(express.static(path.join(__dirname, 'client', 'build')))

// JSON parsing middleware
app.use(express.json())

//Routing

// Auth routes (no protection needed)
app.use('/api/auth', auth)

// Create a custom middleware that applies protection except for public paths
const customProtect = (req: Request, res: Response, next: NextFunction) => {
  // Public routes that should always be accessible without authentication
  const publicPaths = [
    // Auth routes
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/send-reset-email',
    '/api/auth/me', // Already has its own protect middleware

    // Mollie webhook - must remain accessible
    '/api/payment/mollie/webhook',

    // Subscription endpoints may need public access
    '/api/subscriptions',
    '/api/subscription',
    '/api/payment/subscription',

    // Plans endpoints are public
    '/api/plans',

    // Document retrieval endpoint should be public
    '/api/document/',
  ]

  // Check if path starts with any of the public paths
  const currentPath = req.originalUrl.split('?')[0] // Remove query parameters

  if (
    publicPaths.some((path) => currentPath.startsWith(path)) ||
    currentPath.includes('/payment/subscription/')
  ) {
    return next()
  }

  // For protected paths, apply the protect middleware
  return protect(req, res, next)
}

// Apply custom authentication and subscription verification middleware to all API routes
// First authenticate the user (with exceptions for public paths)
app.use('/api/', customProtect)

// Then check if they have an active subscription (this middleware also has its own public path checks)
app.use('/api/', verifySubscriptionActive)

// Finally, route to the appropriate controllers
app.use('/api/contacts', contacts)
app.use('/api/contact', contact)
app.use('/api/invoices', invoices)
app.use('/api/invoice', invoice)
app.use('/api/expenses', expenses)
app.use('/api/expense', expense)
app.use('/api/settings', settings)
app.use('/api/payment', payments)
app.use('/api/notes', notes)
app.use('/api/note', note)
app.use('/api/emails', emails)
app.use('/api/email', email)
app.use('/api/document', document)
app.use('/api/plans', plans)
app.use('/api/dashboard', dashboard)
app.use('/api/export', exportRoutes)
app.use('/api/btw-export', btwExport)
app.use('/api/vat-return-notifications', vatReturnNotifications)
app.use('/api/notifications', notifications)

// This special middleware attempts authentication but doesn't block unauthenticated requests
const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Try to authenticate the user, but don't return an error if authentication fails
    protect(req, res, (err?: unknown) => {
      // If there's an error, just continue without authentication
      if (err) {
        logger.debug('Optional auth failed, continuing as unauthenticated', {
          error: err,
          context: 'optionalAuth',
        })
      }
      next()
    })
  } catch (error) {
    // If any error occurs, just continue without authentication
    logger.debug('Optional auth exception, continuing as unauthenticated', {
      error,
      context: 'optionalAuth',
    })
    next()
  }
}

// Use optional authentication for subscriptions endpoint
app.get('/api/subscriptions', optionalAuth, getSubscriptionManagement)

//Redirect all other urls to client(frontend)
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'))
})

export default app
