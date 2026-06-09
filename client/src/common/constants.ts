export const STANDARD_PLAN_NAME = 'Essentials'

/**
 * Period preset constants - shared between frontend and backend
 * This ensures consistent period preset values throughout the application
 */

// We're standardizing on the hyphenated format for all period presets
export const PERIOD_PRESETS = {
  LAST_MONTH: 'last-month',
  LAST_THREE_MONTHS: 'last-3-months',
  LAST_TWELVE_MONTHS: 'last-12-months',
  THIS_YEAR: 'this-year',
  LAST_YEAR: 'last-year',
  CUSTOM: 'custom',
}

/**
 * Period type constants for data aggregation
 */
export const PERIOD_TYPES = {
  DAILY: 'daily',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
}

export const EXPORT_FORMATS = {
  XLSX: 'xlsx',
  CSV: 'csv',
}

// Export all constants as a named group
const constants = {
  STANDARD_PLAN_NAME,
  PERIOD_PRESETS,
  PERIOD_TYPES,
  EXPORT_FORMATS,
}

export default constants
