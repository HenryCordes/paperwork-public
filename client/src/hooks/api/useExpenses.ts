import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

import { setAlert } from '../../redux/_actions/alertAction'
import { useAppDispatch } from '../../redux/hooks'

import { QUERY_KEYS } from './queryKeys'

/**
 * Hook to fetch expenses list with optional query parameters
 */
export const useExpensesList = (queryString = '') => {
  return useQuery({
    queryKey: [QUERY_KEYS.EXPENSES.lists, queryString],
    queryFn: async () => {
      const response = await axios.get(`/api/expenses${queryString}`)
      return response.data.data
    },
    staleTime: 60000, // 1 minute
    gcTime: 300000, // 5 minutes (v5 rename of cacheTime)
    refetchOnWindowFocus: false, // Prevent refetching when window regains focus
    refetchOnMount: false, // Only fetch on initial mount
  })
}

/**
 * Hook to fetch a single expense by ID
 */
export const useExpense = (
  id: string,
  options: Record<string, unknown> = {},
) => {
  return useQuery({
    queryKey: QUERY_KEYS.EXPENSES.detail(id),
    queryFn: async () => {
      const response = await axios.get(`/api/expense/${id}`)
      return response.data.data
    },
    staleTime: 300000, // 5 minutes
    gcTime: 300000, // 5 minutes (v5 rename of cacheTime)
    ...options,
  })
}

/**
 * Hook for creating or updating an expense
 * Handles cache invalidation for both lists and the specific detail
 */
export const useCreateOrUpdateExpense = () => {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (data: unknown) => {
      const response = await axios.post('/api/expense', data)
      return response.data.data
    },
    onSuccess: (data) => {
      // Invalidate lists and the specific item if it has an ID
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.EXPENSES.lists],
      })

      if (data._id) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.EXPENSES.detail(data._id),
        })
      }

      dispatch(setAlert('Uitgave is opgeslagen!', 'success'))
    },
    onError: (error: Error) => {
      dispatch(setAlert(`Fout bij opslaan uitgave: ${error.message}`, 'danger'))
    },
  })
}

/**
 * Hook for deleting an expense
 * Handles cache invalidation for both lists and the specific detail
 */
export const useDeleteExpense = () => {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await axios.delete(`/api/expense/${id}`)
      return response.data.data
    },
    onSuccess: () => {
      // Invalidate only the lists, as the detail no longer exists
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.EXPENSES.lists],
      })

      dispatch(setAlert('Uitgave is verwijderd!', 'success'))
    },
    onError: (error: Error) => {
      dispatch(
        setAlert(`Fout bij verwijderen uitgave: ${error.message}`, 'danger'),
      )
    },
  })
}

/**
 * Hook for uploading expense receipts
 */
export const useUploadExpenseReceipt = () => {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async ({ expense }: { expense: unknown }) => {
      const response = await axios.post(`/api/expense`, expense)
      return response.data.data
    },
    onSuccess: (data) => {
      if (data._id) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.EXPENSES.detail(data._id),
        })
      }

      dispatch(setAlert('Bon koppelen aan uitgave is gelukt!', 'success'))
    },
    onError: (error: Error) => {
      dispatch(
        setAlert(
          `Fout bij koppelen bon aan uitgave: ${error.message}`,
          'danger',
        ),
      )
    },
  })
}
