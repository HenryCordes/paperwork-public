/**
 * Logger Service Factory
 * Central factory for creating and managing loggers throughout the application
 */
import LoggerInterface from './adapters/interface'
import PinoAdapter from './adapters/pino-adapter'
import { getContext, extendContext } from './context'

type LogContext = Record<string, unknown>

interface ConfigureOptions {
  adapter?: string
  context?: LogContext
  [key: string]: unknown
}

// Default logger instance
let defaultLogger: LoggerInterface | null = null

/**
 * Configure and create the default application logger
 */
export function configureLogger(
  options: ConfigureOptions = {},
): LoggerInterface {
  const { adapter = 'pino', context = {}, ...adapterOptions } = options

  // Get the appropriate adapter class
  let LoggerAdapter: typeof PinoAdapter
  switch (adapter.toLowerCase()) {
    case 'pino':
      LoggerAdapter = PinoAdapter
      break
    // Add other adapters here as they're implemented
    default:
      LoggerAdapter = PinoAdapter
  }

  // Create the logger with the provided options
  const logger = new LoggerAdapter({
    ...adapterOptions,
    // Add application name and environment to all logs
    base: {
      app: 'paperwork-api',
      env: process.env.NODE_ENV || 'development',
      ...context,
    },
  })

  // Set as the default logger if none exists
  if (!defaultLogger) {
    defaultLogger = logger
  }

  return logger
}

/**
 * Get the default logger instance, creating it if it doesn't exist
 */
export function getLogger(options: ConfigureOptions = {}): LoggerInterface {
  if (!defaultLogger) {
    defaultLogger = configureLogger(options)
  }
  return defaultLogger
}

/**
 * Create a child logger with additional context.
 * Uses any existing context from cls-hooked plus the provided context.
 */
export function createChildLogger(
  additionalContext: LogContext = {},
  options: ConfigureOptions = {},
): LoggerInterface {
  // Get or create the parent logger
  const parentLogger = getLogger(options)

  // Combine the CLS context with the provided context
  const clsContext = getContext()
  const combinedContext = {
    ...clsContext,
    ...additionalContext,
  }

  // Store the updated context in CLS for future logger calls
  extendContext(additionalContext)

  // Create and return the child logger
  return parentLogger.child(combinedContext)
}
