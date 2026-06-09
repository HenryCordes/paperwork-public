import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
} from '@tanstack/react-query'
import axios from 'axios'

import { ApiError } from '../../redux/types'

interface DashboardParams {
  periodType?: string
  periodPreset?: string | null
  startDate?: string | null
  endDate?: string | null
}

/**
 * Custom hook to fetch and cache dashboard data
 */
export function useDashboard({
  periodType = 'monthly',
  periodPreset = null,
  startDate = null,
  endDate = null,
}: DashboardParams) {
  return useQuery({
    queryKey: ['dashboard', { periodType, periodPreset, startDate, endDate }],
    queryFn: async () => {
      try {
        // Build query params
        const params: Record<string, unknown> = { periodType }
        if (periodPreset) params.periodPreset = periodPreset
        if (startDate) params.startDate = startDate
        if (endDate) params.endDate = endDate

        const response = await axios.get('/api/dashboard/stats', { params })
        return response.data.data
      } catch (error) {
        throw new Error(
          'Failed to fetch dashboard data: ' +
            ((error as ApiError).response?.data?.message ||
              (error as ApiError).message),
        )
      }
    },
    staleTime: 0, // Always fetch fresh data - no stale cache issues
    gcTime: 60000, // 1 minute (v5 rename of cacheTime)
  })
}

/**
 * Custom hook to prefetch dashboard data
 */
export function prefetchDashboard(
  queryClient: QueryClient,
  {
    periodType = 'monthly',
    periodPreset = null,
    startDate = null,
    endDate = null,
  }: DashboardParams,
) {
  // Build query params
  const params: Record<string, unknown> = { periodType }
  if (periodPreset) params.periodPreset = periodPreset
  if (startDate) params.startDate = startDate
  if (endDate) params.endDate = endDate

  return queryClient.prefetchQuery({
    queryKey: ['dashboard', { periodType, periodPreset, startDate, endDate }],
    queryFn: async () => {
      try {
        const response = await axios.get('/api/dashboard/stats', { params })
        return response.data.data
      } catch (error) {
        throw new Error(
          'Failed to fetch dashboard data: ' +
            ((error as ApiError).response?.data?.message ||
              (error as ApiError).message),
        )
      }
    },
    staleTime: 300000, // 5 minutes
  })
}

/**
 * Custom hook to regenerate dashboard statistics
 * Automatically invalidates all dashboard queries after successful regeneration
 */
export function useRegenerateDashboard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      periodType,
      date,
      year,
      quarter,
    }: {
      periodType?: string
      date?: string
      year?: number | string
      quarter?: number | string
    }) => {
      const body: Record<string, unknown> = { periodType }
      if (date) body.date = date
      if (year) body.year = year
      if (quarter) body.quarter = quarter

      const response = await axios.post('/api/dashboard/regenerate', body)
      return response.data
    },
    onSuccess: () => {
      // Invalidate all dashboard queries to force refetch with fresh data
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error: Error) => {
      throw new Error(
        'Failed to regenerate dashboard: ' +
          ((error as ApiError).response?.data?.message ||
            (error as ApiError).message),
      )
    },
  })
}
