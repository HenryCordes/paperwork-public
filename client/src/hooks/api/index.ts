/**
 * Export all API hooks from a central location
 * This makes importing hooks simpler in components
 */

// Authentication and user hooks
export { useProfile, prefetchProfile } from './useProfile'
export {
  useSubscription,
  hasActiveSubscription,
  prefetchSubscription,
  useSubscriptionManagement,
  useCreateSubscription,
  useHandleSubscriptionPaymentIssue,
} from './useSubscriptions'

// Contacts domain hooks
export {
  useContacts,
  useContactsByType,
  useContact,
  useCreateOrUpdateContact,
  useDeleteContact,
} from './useContacts'

// Emails domain hooks
export {
  useEmails,
  useEmail,
  useCreateOrUpdateEmail,
  useDeleteEmail,
  useSendEmail,
} from './useEmails'

// Invoices domain hooks
export {
  useInvoicesList,
  useInvoice,
  useCreateOrUpdateInvoice,
  useDeleteInvoice,
} from './useInvoices'

// Expenses domain hooks
export {
  useExpensesList,
  useExpense,
  useCreateOrUpdateExpense,
  useDeleteExpense,
  useUploadExpenseReceipt,
} from './useExpenses'

// Notes domain hooks
export {
  useNotesList,
  useNote,
  useCreateOrUpdateNote,
  useDeleteNote,
} from './useNotes'

// Settings domain hooks
export {
  useSettings,
  useCreateOrUpdateSettings,
  useUploadLogo,
} from './useSettings'

// Export domain hooks
export { useExportExpenses, useExportInvoices } from './useExport'

// Centralized query keys
export { QUERY_KEYS } from './queryKeys'
