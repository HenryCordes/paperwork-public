/**
 * Shared constants for period presets used throughout the application
 * Using these constants ensures consistency between frontend and backend
 */

export const PERIOD_PRESETS = {
  LAST_MONTH: 'last-month',
  LAST_THREE_MONTHS: 'last-3-months',
  LAST_TWELVE_MONTHS: 'last-12-months',
  THIS_YEAR: 'this-year',
  LAST_YEAR: 'last-year',
  CUSTOM: 'custom',
} as const

export const PERIOD_TYPES = {
  DAILY: 'daily',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
} as const
