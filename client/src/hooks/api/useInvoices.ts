import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

import { setAlert } from '../../redux/_actions/alertAction'
import { useAppDispatch } from '../../redux/hooks'

import { QUERY_KEYS } from './queryKeys'

/**
 * Hook to fetch invoices list with optional query parameters
 */
export const useInvoicesList = (queryString = '') => {
  return useQuery({
    queryKey: [QUERY_KEYS.INVOICES.lists, queryString],
    queryFn: async () => {
      const response = await axios.get(`/api/invoices${queryString}`)
      return response.data.data
    },
    staleTime: 60000, // 1 minute
    gcTime: 300000, // 5 minutes (v5 rename of cacheTime)
  })
}

/**
 * Hook to fetch a single invoice by ID
 */
export const useInvoice = (
  id: string,
  options: Record<string, unknown> = {},
) => {
  return useQuery({
    queryKey: QUERY_KEYS.INVOICES.detail(id),
    queryFn: async () => {
      const response = await axios.get(`/api/invoice/${id}`)
      return response.data.data
    },
    staleTime: 300000, // 5 minutes
    gcTime: 300000, // 5 minutes (v5 rename of cacheTime)
    ...options,
  })
}

/**
 * Hook to create or update an invoice
 */
export const useCreateOrUpdateInvoice = () => {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (data: unknown) => {
      const response = await axios.post('/api/invoice', data)
      return response.data.data
    },
    onSuccess: (data) => {
      // Invalidate lists and the specific item if it has an ID
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.INVOICES.lists],
      })

      if (data._id) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.INVOICES.detail(data._id),
        })
      }

      dispatch(setAlert('Factuur is opgeslagen!', 'success'))
    },
    onError: (error: Error) => {
      dispatch(setAlert(`Fout bij opslaan factuur: ${error.message}`, 'danger'))
    },
  })
}

/**
 * Hook to delete an invoice
 */
export const useDeleteInvoice = () => {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await axios.delete(`/api/invoice/${id}`)
      return response.data.data
    },
    onSuccess: () => {
      // Invalidate only the lists, as the detail no longer exists
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.INVOICES.lists],
      })

      dispatch(setAlert('Factuur is verwijderd!', 'success'))
    },
    onError: (error: Error) => {
      dispatch(
        setAlert(`Fout bij verwijderen factuur: ${error.message}`, 'danger'),
      )
    },
  })
}
