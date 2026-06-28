/**
 * Logger Interface
 * Defines the common interface that all logger implementations must follow
 */

type LogMessage = string | object
type LogContext = Record<string, unknown>

abstract class LoggerInterface {
  protected options: Record<string, unknown>

  constructor(options: Record<string, unknown> = {}) {
    if (this.constructor === LoggerInterface) {
      throw new Error('Cannot instantiate abstract LoggerInterface directly')
    }
    this.options = options
  }

  /** Create a child logger with additional context */
  abstract child(context: LogContext): LoggerInterface

  /** Log at trace level */
  abstract trace(message: LogMessage, context?: LogContext): void

  /** Log at debug level */
  abstract debug(message: LogMessage, context?: LogContext): void

  /** Log at info level */
  abstract info(message: LogMessage, context?: LogContext): void

  /** Log at warn level */
  abstract warn(message: LogMessage, context?: LogContext): void

  /** Log at error level */
  abstract error(message: LogMessage, context?: LogContext): void

  /** Log at fatal level */
  abstract fatal(message: LogMessage, context?: LogContext): void
}

export = LoggerInterface
