/**
 * Pino Adapter
 * Concrete implementation of the logger interface using Pino
 */
import LoggerInterface from './interface'
import createPinoLogger from './pino'

type LogMessage = string | object
type LogContext = Record<string, unknown>

class PinoAdapter extends LoggerInterface {
  private logger: ReturnType<typeof createPinoLogger>

  constructor(options: Record<string, unknown> = {}) {
    super(options)
    this.logger = createPinoLogger(options)
  }

  /** Create a child logger with additional context */
  child(context: LogContext): PinoAdapter {
    const childLogger = new PinoAdapter(this.options)
    childLogger.logger = this.logger.child(context)
    return childLogger
  }

  trace(message: LogMessage, context?: LogContext): void {
    if (context) {
      this.logger.trace(context, message as string)
    } else {
      this.logger.trace(message)
    }
  }

  debug(message: LogMessage, context?: LogContext): void {
    if (context) {
      this.logger.debug(context, message as string)
    } else {
      this.logger.debug(message)
    }
  }

  info(message: LogMessage, context?: LogContext): void {
    if (context) {
      this.logger.info(context, message as string)
    } else {
      this.logger.info(message)
    }
  }

  warn(message: LogMessage, context?: LogContext): void {
    if (context) {
      this.logger.warn(context, message as string)
    } else {
      this.logger.warn(message)
    }
  }

  error(message: LogMessage, context?: LogContext): void {
    if (context) {
      this.logger.error(context, message as string)
    } else {
      this.logger.error(message)
    }
  }

  fatal(message: LogMessage, context?: LogContext): void {
    if (context) {
      this.logger.fatal(context, message as string)
    } else {
      this.logger.fatal(message)
    }
  }
}

export = PinoAdapter
