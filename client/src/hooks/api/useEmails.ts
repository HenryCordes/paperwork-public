import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

import { setAlert } from '../../redux/_actions/alertAction'
import { useAppDispatch } from '../../redux/hooks'

import { QUERY_KEYS } from './queryKeys'

/**
 * Hook to fetch a list of emails with optional search/filter parameters
 */
export function useEmails(query = '') {
  return useQuery({
    queryKey: query
      ? [QUERY_KEYS.EMAILS.lists, query]
      : [QUERY_KEYS.EMAILS.lists],
    queryFn: async () => {
      const response = await axios.get(`/api/emails${query}`)
      return response.data.data
    },
    staleTime: 60000, // 1 minute
    gcTime: 300000, // 5 minutes (v5 rename of cacheTime)
  })
}

/**
 * Hook to fetch a single email by ID
 */
export function useEmail(id: string, options: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.EMAILS.detail(id),
    queryFn: async () => {
      const response = await axios.get(`/api/email/${id}`)
      return response.data.data
    },
    staleTime: 300000, // 5 minutes
    gcTime: 300000, // 5 minutes (v5 rename of cacheTime)
    ...options,
  })
}

/**
 * Hook to create or update an email
 * Invalidates both the specific email cache and the emails list cache
 */
export function useCreateOrUpdateEmail() {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (email: unknown) => {
      const response = await axios.post('/api/email', email)
      return response.data.data
    },
    onSuccess: (data) => {
      // Invalidate the specific email if it exists
      if (data._id) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.EMAILS.detail(data._id),
        })
      }

      // Invalidate all email lists
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.EMAILS.lists],
      })

      // Show success alert using proper Redux dispatch
      dispatch(setAlert('De email is succesvol opgeslagen.', 'success'))
    },
    onError: (error: Error) => {
      console.error('Error updating email:', error)
      dispatch(
        setAlert(
          'Er is iets misgegaan bij het opslaan van de email.',
          'danger',
        ),
      )
    },
  })
}

/**
 * Hook to delete an email
 * Invalidates both the specific email cache and the emails list cache
 */
export function useDeleteEmail() {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await axios.delete(`/api/email/${id}`)
      return response.data.data
    },
    onSuccess: (data, variables) => {
      // variables is the id we passed to the mutation
      const emailId = variables

      // Invalidate the specific email
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.EMAILS.detail(emailId),
      })

      // Invalidate all email lists
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.EMAILS.lists],
      })

      // Show success alert using proper Redux dispatch
      dispatch(setAlert('De email is succesvol verwijderd.', 'success'))
    },
    onError: (error: Error) => {
      console.error('Error deleting email:', error)
      dispatch(
        setAlert(
          'Er is iets misgegaan bij het verwijderen van de email.',
          'danger',
        ),
      )
    },
  })
}

/**
 * Hook to send an email
 */
export function useSendEmail() {
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (email: unknown) => {
      const response = await axios.post('/api/email/send', email)
      return response.data.data
    },
    onSuccess: () => {
      // Show success alert using proper Redux dispatch
      dispatch(setAlert('De email is succesvol verzonden.', 'success'))
    },
    onError: (error: Error) => {
      console.error('Error sending email:', error)
      dispatch(
        setAlert(
          'Er is iets misgegaan bij het verzenden van de email.',
          'danger',
        ),
      )
    },
  })
}
