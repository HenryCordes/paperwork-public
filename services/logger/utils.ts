/**
 * Logger utility functions
 * Provides helper functions for common logging patterns
 */
import { extendContext } from './context'

import { createChildLogger } from './index'

type LogContext = Record<string, unknown>

interface BasicLogger {
  info(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
}

const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'key', 'apiKey']

export function redact(source: LogContext): LogContext {
  const sanitized = { ...source }
  SENSITIVE_FIELDS.forEach((field) => {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]'
    }
  })
  return sanitized
}

/**
 * Create a controller logger that includes controller context
 */
export function createControllerLogger(
  controllerName: string,
  additionalContext: LogContext = {},
) {
  return createChildLogger({
    component: 'controller',
    controller: controllerName,
    ...additionalContext,
  })
}

/**
 * Create a model logger that includes model context
 */
export function createModelLogger(
  modelName: string,
  additionalContext: LogContext = {},
) {
  return createChildLogger({
    component: 'model',
    model: modelName,
    ...additionalContext,
  })
}

/**
 * Create a service logger that includes service context
 */
export function createServiceLogger(
  serviceName: string,
  additionalContext: LogContext = {},
) {
  return createChildLogger({
    component: 'service',
    service: serviceName,
    ...additionalContext,
  })
}

/**
 * Log the beginning of an operation with its parameters
 */
export function logOperation(
  logger: BasicLogger,
  operationName: string,
  params: LogContext = {},
): void {
  logger.info(`Operation started: ${operationName}`, {
    operation: operationName,
    params: redact(params),
    flowState: 'start',
  })

  extendContext({
    currentOperation: operationName,
    flowState: 'inProgress',
  })
}

/**
 * Log the successful completion of an operation
 */
export function logOperationSuccess(
  logger: BasicLogger,
  operationName: string,
  result: LogContext = {},
): void {
  logger.info(`Operation completed: ${operationName}`, {
    operation: operationName,
    result: redact(result),
    flowState: 'complete',
  })

  extendContext({
    currentOperation: null,
    flowState: null,
  })
}

/**
 * Log an operation failure
 */
export function logOperationError(
  logger: BasicLogger,
  operationName: string,
  error: Error,
): void {
  logger.error(`Operation failed: ${operationName}`, {
    operation: operationName,
    error: {
      message: error.message,
      name: error.name,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    },
    flowState: 'error',
  })

  extendContext({
    currentOperation: null,
    flowState: null,
  })
}
