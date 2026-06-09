import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

import { setAlert } from '../../redux/_actions/alertAction'
import { useAppDispatch } from '../../redux/hooks'

import { QUERY_KEYS } from './queryKeys'

/**
 * Hook to fetch a list of contacts with optional filtering
 */
export function useContacts(queryParams = '') {
  // Format the query string correctly
  const formattedQuery = queryParams
    ? queryParams.startsWith('?')
      ? queryParams.substring(1)
      : queryParams
    : ''
  const url = `/api/contacts${formattedQuery ? `?${formattedQuery}` : ''}`

  return useQuery({
    queryKey: [QUERY_KEYS.CONTACTS.lists, formattedQuery],
    queryFn: async () => {
      const response = await axios.get(url)
      return response.data.data
    },
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook to fetch contacts by type
 */
export function useContactsByType(typeName: string) {
  return useQuery({
    queryKey: QUERY_KEYS.CONTACTS.byType(typeName),
    queryFn: async () => {
      const response = await axios.get(`/api/contacts/type/${typeName}`)
      return response.data.data
    },
    staleTime: 60000, // 1 minute
    enabled: Boolean(typeName), // Only run if typeName exists
  })
}

/**
 * Hook to fetch a single contact by ID
 */
export function useContact(id?: string, options: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.CONTACTS.detail(id ?? ''),
    queryFn: async () => {
      const response = await axios.get(`/api/contact/${id}`)
      return response.data.data
    },
    staleTime: 300000, // 5 minutes
    enabled: Boolean(id), // Only run if id exists (callers may override)
    ...options,
  })
}

/**
 * Hook to create or update a contact
 * Invalidates both the specific contact cache and the contacts list cache
 */
export function useCreateOrUpdateContact() {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (contact: unknown) => {
      const response = await axios.post('/api/contact', contact)
      return response.data.data
    },
    onSuccess: (data) => {
      // Invalidate the specific contact if it exists
      if (data._id) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CONTACTS.detail(data._id),
        })
      }

      // Invalidate all contact lists since they may contain this contact
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.CONTACTS.lists],
      })

      // Invalidate type-specific lists that might include this contact
      if (data.typeName) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CONTACTS.byType(data.typeName),
        })
      }

      // Show success alert - properly dispatching the thunk
      dispatch(setAlert('Het contact is succesvol opgeslagen.', 'success'))
    },
    onError: (error: Error) => {
      console.error('Error updating contact:', error)
      dispatch(
        setAlert(
          'Er is iets misgegaan bij het opslaan van het contact.',
          'danger',
        ),
      )
    },
  })
}

/**
 * Hook to delete a contact
 * Invalidates both the specific contact cache and the contacts list cache
 */
export function useDeleteContact() {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await axios.delete(`/api/contact/${id}`)
      return response.data.data
    },
    onSuccess: (data, variables) => {
      // variables is the id we passed to the mutation
      const contactId = variables

      // Invalidate the specific contact
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CONTACTS.detail(contactId),
      })

      // Invalidate all contact lists
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.CONTACTS.lists],
      })

      // Show success alert - properly dispatching the thunk
      dispatch(setAlert('Het contact is succesvol verwijderd.', 'success'))
    },
    onError: (error: Error) => {
      console.error('Error deleting contact:', error)
      dispatch(
        setAlert(
          'Er is iets misgegaan bij het verwijderen van het contact.',
          'danger',
        ),
      )
    },
  })
}
