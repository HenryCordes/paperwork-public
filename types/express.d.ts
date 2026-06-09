// Augment Express's Request/Response with the custom properties this app
// attaches in its auth, tenant, and logging middleware.
import 'express'

interface RequestLogger {
  info(message: string | object, context?: Record<string, unknown>): void
  error(message: string | object, context?: Record<string, unknown>): void
  warn(message: string | object, context?: Record<string, unknown>): void
  child(context: Record<string, unknown>): RequestLogger
}

interface AuthenticatedUser {
  _id?: unknown
  id?: unknown
  email?: string
  name?: string
  organization?: { toString(): string }
  [key: string]: unknown
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser | null
      organizationId?: string
      requestId?: string
      startTime?: number
      logger?: RequestLogger
    }
    interface Response {
      responseTime?: number
    }
  }
}
