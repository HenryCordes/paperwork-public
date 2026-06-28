/**
 * Logging middleware functions
 * Provides Express middleware for request/response logging and error handling
 */
import {
  Request,
  Response,
  NextFunction,
  RequestHandler,
  ErrorRequestHandler,
} from 'express'

import { createChildLogger } from '../services/logger'
import {
  bindContext,
  getContext,
  extendContext,
} from '../services/logger/context'

/**
 * Middleware to log incoming HTTP requests
 */
function requestLogger(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // Start time for measuring request duration
    req.startTime = Date.now()

    // Extract controller and route information
    const routePath = req.route?.path || req.baseUrl + req.path

    // Only set the controller if not already present in the context
    const existingContext = getContext()
    const controller =
      existingContext.controller || req.route?.stack?.[0]?.name || 'unknown'

    // Create request-specific context
    const requestContext = {
      controller,
      route: routePath,
      operation: `${req.method} ${routePath}`,
      userId: req.user?._id || req.user?.id,
      userEmail: req.user?.email,
      tenantId: req.organizationId,
      params: req.params,
      query: req.query,
    }

    // Extend the current context with request-specific information
    extendContext(requestContext)

    // Create a child logger for this request
    const logger = createChildLogger()

    // Attach logger to request object for use in route handlers
    req.logger = logger

    // Log the incoming request (exclude sensitive fields like passwords)
    const sanitizedBody = { ...req.body }
    if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]'
    if (sanitizedBody.newPassword) sanitizedBody.newPassword = '[REDACTED]'
    if (sanitizedBody.confirmPassword)
      sanitizedBody.confirmPassword = '[REDACTED]'

    logger.info(`${req.method} ${req.originalUrl}`, {
      requestBody: Object.keys(sanitizedBody).length
        ? sanitizedBody
        : undefined,
      remoteAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    next()
  }
}

/**
 * Middleware to log HTTP responses
 */
function responseLogger(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original response methods to intercept them
    const originalSend = res.send.bind(res)
    const originalJson = res.json.bind(res)

    // Intercept response.send
    res.send = function (body?: unknown): Response {
      // Calculate response time
      const responseTime = Date.now() - (req.startTime ?? Date.now())
      res.responseTime = responseTime

      // Set response time header
      res.setHeader('X-Response-Time', `${responseTime}ms`)

      // Get the logger
      const logger = req.logger || createChildLogger()

      // Log the response (only for non-binary responses)
      const isJSON = res.get('Content-Type')?.includes('application/json')
      const responseBody = isJSON
        ? JSON.parse(body as string)
        : typeof body === 'string'
          ? body
          : undefined

      // Create a sanitized version of the response body if it's an object
      let sanitizedBody: Record<string, unknown> | undefined
      if (responseBody && typeof responseBody === 'object') {
        const sb: Record<string, unknown> = { ...responseBody }

        // Remove sensitive fields like tokens or full user objects
        if (sb.token) sb.token = '[REDACTED]'
        if (sb.user && typeof sb.user === 'object') {
          const u = sb.user as {
            _id?: unknown
            id?: unknown
            email?: string
          }
          sb.user = {
            id: u._id || u.id,
            email: u.email,
          }
        }
        sanitizedBody = sb
      }

      // res.user/res.organizationId are not standard; preserved from the
      // original (they resolve to undefined at runtime).
      const resExtra = res as unknown as {
        user?: { _id?: unknown; id?: unknown; email?: string }
        organizationId?: unknown
      }

      // Log the response
      logger.info(`Response ${res.statusCode} sent in ${responseTime}ms`, {
        statusCode: res.statusCode,
        responseTime,
        userId: resExtra.user?._id || resExtra.user?.id,
        userEmail: resExtra.user?.email,
        tenantId: resExtra.organizationId,
        contentLength: typeof body === 'string' ? body.length : 0,
        responseBody: sanitizedBody || undefined,
      })

      // Call the original method
      return originalSend(body)
    } as Response['send']

    // Intercept response.json
    res.json = function (body?: unknown): Response {
      // Convert body to JSON string and pass to send
      return originalJson(body)
    } as Response['json']

    next()
  }
}

/**
 * Error logging middleware
 */
function errorLogger(): ErrorRequestHandler {
  return (
    err: Error & { statusCode?: number; status?: number },
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    // Get the logger (create a new one if not in request)
    const logger = req.logger || createChildLogger()

    // Calculate response time if request start time exists
    let responseTime: number | undefined
    if (req.startTime) {
      responseTime = Date.now() - req.startTime
      res.setHeader('X-Response-Time', `${responseTime}ms`)
    }

    // Get error details
    const statusCode = err.statusCode || err.status || 500
    const message = err.message || 'Internal server error'
    const stack = process.env.NODE_ENV === 'production' ? undefined : err.stack

    // Log the error with context
    logger.error(`Error: ${message}`, {
      error: {
        name: err.name,
        message,
        statusCode,
        stack,
      },
      responseTime,
      statusCode,
    })

    // Pass to next error handler or send response if this is the last one
    if (next) {
      next(err)
    } else {
      res.status(statusCode).json({
        success: false,
        error: message,
      })
    }
  }
}

export {
  requestLogger,
  responseLogger,
  errorLogger,
  bindContext as bindLoggerContext,
}
