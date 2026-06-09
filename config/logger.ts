/**
 * Logger configuration
 * Central configuration for the application logging system
 */

/**
 * Get logger configuration from environment variables
 * with sensible defaults
 */
export function getLoggerConfig() {
  return {
    // General logger configuration
    adapter: process.env.LOG_ADAPTER || 'pino',
    level:
      process.env.LOG_LEVEL ||
      (process.env.NODE_ENV === 'test'
        ? 'silent'
        : process.env.NODE_ENV === 'production'
          ? 'info'
          : 'debug'),
    prettyPrint:
      process.env.LOG_PRETTY === 'true' ||
      process.env.NODE_ENV !== 'production',

    // Application identification
    name: 'paperwork-api',

    // Context included in every log
    base: {
      app: 'paperwork-api',
      env: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '0.0.1',
    },

    // Request logging configuration
    request: {
      // Whether to log request bodies (can be disabled for performance)
      logBody: process.env.LOG_REQUEST_BODY !== 'false',
      // Fields to redact from logged requests
      redactRequestFields: [
        'password',
        'newPassword',
        'confirmPassword',
        'token',
      ],
    },

    // Response logging configuration
    response: {
      // Whether to log response bodies (can be disabled for performance)
      logBody: process.env.LOG_RESPONSE_BODY !== 'false',
      // Fields to redact from logged responses
      redactResponseFields: ['token', 'password'],
    },
  }
}
