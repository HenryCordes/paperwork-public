/**
 * Logger Context Manager
 * Manages logging context throughout the request lifecycle
 * using cls-hooked for async context propagation
 */
import { createNamespace, getNamespace } from 'cls-hooked'
import { v4 as uuidv4 } from 'uuid'

type LogContext = Record<string, unknown>

// Create a namespace for the logger context
const LOGGER_NAMESPACE = 'paperwork-logger'
const loggerNamespace = createNamespace(LOGGER_NAMESPACE)

// Keys for storing context values
const CONTEXT_KEY = 'logger:context'
const REQUEST_ID_KEY = 'logger:requestId'

/**
 * Initialize logger context for a request
 */
export function initContext(initialContext: LogContext = {}): LogContext {
  const requestId = (initialContext.requestId as string) || uuidv4()

  return loggerNamespace.run(() => {
    // Store the request ID
    loggerNamespace.set(REQUEST_ID_KEY, requestId)

    // Initialize the context with the request ID and any initial values
    const context = {
      requestId,
      ...initialContext,
    }

    loggerNamespace.set(CONTEXT_KEY, context)
    return context
  })
}

/**
 * Get the current logger context
 */
export function getContext(): LogContext {
  const namespace = getNamespace(LOGGER_NAMESPACE)
  if (!namespace || !namespace.active) {
    return {}
  }

  return namespace.get(CONTEXT_KEY) || {}
}

/**
 * Get the current request ID
 */
export function getRequestId(): string | undefined {
  const namespace = getNamespace(LOGGER_NAMESPACE)
  if (!namespace || !namespace.active) {
    return undefined
  }

  return namespace.get(REQUEST_ID_KEY)
}

/**
 * Extend the current logger context with additional values
 */
export function extendContext(additionalContext: LogContext = {}): LogContext {
  const namespace = getNamespace(LOGGER_NAMESPACE)
  if (!namespace || !namespace.active) {
    return additionalContext
  }

  const currentContext = namespace.get(CONTEXT_KEY) || {}
  const newContext = {
    ...currentContext,
    ...additionalContext,
  }

  namespace.set(CONTEXT_KEY, newContext)
  return newContext
}

/**
 * Run a function with extended logger context
 */
export function withContext<T>(
  fn: () => T,
  additionalContext: LogContext = {},
): T {
  const namespace = getNamespace(LOGGER_NAMESPACE)
  if (!namespace) {
    return fn()
  }

  return namespace.run(() => {
    extendContext(additionalContext)
    return fn()
  })
}

interface LogRequest {
  headers: Record<string, string | undefined>
  method?: string
  originalUrl?: string
  ip?: string
  get(name: string): string | undefined
  user?: { _id?: unknown; id?: unknown; email?: string }
  organizationId?: unknown
  requestId?: string
}

interface LogResponse {
  setHeader(name: string, value: string): void
}

/**
 * Create middleware that binds the logger context to the request
 */
export function bindContext() {
  return (req: LogRequest, res: LogResponse, next: () => void) => {
    // Create a new context for each request
    loggerNamespace.bindEmitter(req)
    loggerNamespace.bindEmitter(res)

    loggerNamespace.run(() => {
      // Generate a request ID if not already present
      const requestId = req.headers['x-request-id'] || uuidv4()
      req.requestId = requestId
      res.setHeader('X-Request-ID', requestId)

      // Initialize the context with request information
      const initialContext: LogContext = {
        requestId,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }

      // Add user and tenant information if available
      if (req.user) {
        initialContext.userId = req.user._id || req.user.id
        initialContext.userEmail = req.user.email
      }

      if (req.organizationId) {
        initialContext.tenantId = req.organizationId
      }

      // Initialize the context
      initContext(initialContext)
      next()
    })
  }
}
