/**
 * Pino logger adapter
 * Implements the logger interface using Pino
 */
import pino, { LoggerOptions } from 'pino'

interface CreatePinoOptions {
  level?: string
  prettyPrint?: boolean
  name?: string
  [key: string]: unknown
}

/**
 * Creates a configured Pino logger instance
 */
function createPinoLogger(options: CreatePinoOptions = {}) {
  const {
    level = process.env.LOG_LEVEL || 'info',
    prettyPrint = process.env.NODE_ENV !== 'production',
    name = 'paperwork-api',
    ...restOptions
  } = options

  // Configure pretty printing for development
  const transport = prettyPrint
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined

  // Create the base logger instance
  const logger = pino({
    name,
    level,
    transport,
    formatters: {
      level: (label: string) => {
        return { level: label }
      },
    },
    // Additional options for timestamps, etc.
    timestamp: pino.stdTimeFunctions.isoTime,
    ...restOptions,
  } as LoggerOptions)

  return logger
}

export = createPinoLogger
