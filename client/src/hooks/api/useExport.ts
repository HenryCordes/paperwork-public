import { useQuery, useMutation } from '@tanstack/react-query'
import axios from 'axios'

import { ApiError } from '../../redux/types'

/**
 * Hook for handling exports
 */

interface ExportParams {
  format?: string
  includeReceipts?: boolean
  includePdfs?: boolean
  searchQuery?: string
  startDate?: string
  endDate?: string
}

/**
 * Export financial summary as CSV or XLSX
 */
export const useFinancialSummary = (
  { year, format = 'xlsx' }: { year?: string; format?: string },
  options: Record<string, unknown> = {},
) => {
  return useQuery({
    queryKey: ['financialSummary', { year, format }],
    queryFn: async () => {
      try {
        const response = await axios({
          url: `/api/export/summary`,
          method: 'GET',
          params: { year, format },
          responseType: 'blob',
        })
        return response.data
      } catch (error) {
        throw new Error(
          'Failed to export summary: ' +
            ((error as ApiError).response?.data?.message ||
              (error as ApiError).message),
        )
      }
    },
    enabled: !!year,
    ...options,
  })
}

/**
 * Export expenses as CSV
 */
export const useExpensesExport = (
  {
    startDate,
    endDate,
    includeReceipts = false,
  }: { startDate?: string; endDate?: string; includeReceipts?: boolean },
  options: Record<string, unknown> = {},
) => {
  return useQuery({
    queryKey: ['expensesExport', { startDate, endDate, includeReceipts }],
    queryFn: async () => {
      try {
        const response = await axios({
          url: `/api/export/expenses`,
          method: 'GET',
          params: { startDate, endDate, includeReceipts },
        })
        return response.data
      } catch (error) {
        throw new Error(
          'Failed to export expenses: ' +
            ((error as ApiError).response?.data?.message ||
              (error as ApiError).message),
        )
      }
    },
    enabled: !!(startDate && endDate),
    ...options,
  })
}

/**
 * Export invoices as CSV
 */
export const useInvoicesExport = (
  { startDate, endDate }: { startDate?: string; endDate?: string },
  options: Record<string, unknown> = {},
) => {
  return useQuery({
    queryKey: ['invoicesExport', { startDate, endDate }],
    queryFn: async () => {
      try {
        const response = await axios({
          url: `/api/export/invoices`,
          method: 'GET',
          params: { startDate, endDate },
        })
        return response.data
      } catch (error) {
        throw new Error(
          'Failed to export invoices: ' +
            ((error as ApiError).response?.data?.message ||
              (error as ApiError).message),
        )
      }
    },
    enabled: !!(startDate && endDate),
    ...options,
  })
}

/**
 * Mutation hook for exporting expenses with advanced options
 */
export const useExportExpenses = () => {
  return useMutation({
    mutationFn: async (exportOptions: ExportParams) => {
      try {
        const { format, includeReceipts, searchQuery, startDate, endDate } =
          exportOptions

        const response = await axios({
          url: '/api/export/expenses',
          method: 'POST',
          data: {
            format: format || 'csv',
            includeReceipts: includeReceipts || false,
            searchQuery: searchQuery || '',
            startDate,
            endDate,
          },
        })

        return response.data
      } catch (error) {
        throw new Error(
          'Failed to export expenses: ' +
            ((error as ApiError).response?.data?.message ||
              (error as ApiError).message),
        )
      }
    },
  })
}

/**
 * Mutation hook for exporting invoices with advanced options
 */
export const useExportInvoices = () => {
  return useMutation({
    mutationFn: async (exportOptions: ExportParams) => {
      try {
        const { format, includePdfs, searchQuery, startDate, endDate } =
          exportOptions

        const response = await axios({
          url: '/api/export/invoices',
          method: 'POST',
          data: {
            format: format || 'csv',
            includePdfs: includePdfs || false,
            searchQuery: searchQuery || '',
            startDate,
            endDate,
          },
        })

        return response.data
      } catch (error) {
        throw new Error(
          'Failed to export invoices: ' +
            ((error as ApiError).response?.data?.message ||
              (error as ApiError).message),
        )
      }
    },
  })
}
