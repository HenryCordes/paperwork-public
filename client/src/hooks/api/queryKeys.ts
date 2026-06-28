/**
 * Centralized query key definitions for React Query
 * This helps maintain consistency and enables easier cache invalidation
 */

// Base keys for each domain
export const QUERY_KEYS = {
  PROFILE: 'profile',
  PLANS: {
    all: 'plans',
  },
  SUBSCRIPTIONS: {
    all: 'subscriptions',
    management: 'subscription-management',
    detail: 'subscription',
    order: (orderId: string) => ['subscription-order', orderId],
  },
  CONTACTS: {
    all: 'contacts',
    lists: 'contacts-list',
    detail: (id: string) => ['contact', id],
    byType: (type: string) => ['contacts', { type }],
  },
  EMAILS: {
    all: 'emails',
    lists: 'emails-list',
    detail: (id: string) => ['email', id],
  },
  INVOICES: {
    all: 'invoices',
    lists: 'invoices-list',
    detail: (id: string) => ['invoice', id],
  },
  EXPENSES: {
    all: 'expenses',
    lists: 'expenses-list',
    detail: (id: string) => ['expense', id],
    receipt: (id: string) => ['expense-receipt', id],
  },
  NOTES: {
    all: 'notes',
    lists: 'notes-list',
    detail: (id: string) => ['note', id],
  },
  SETTINGS: {
    all: 'settings',
    logo: 'settings-logo',
  },
  VAT_NOTIFICATIONS: {
    all: 'vat-notifications',
    preferences: 'vat-notification-preferences',
  },
}
