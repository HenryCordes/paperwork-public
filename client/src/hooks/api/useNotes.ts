/**
 * React Query hooks for Notes domain
 * Provides data fetching, mutations, and cache management for notes
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

import { setAlert } from '../../redux/_actions/alertAction'
import { useAppDispatch } from '../../redux/hooks'
import { ApiError } from '../../redux/types'

import { QUERY_KEYS } from './queryKeys'

/**
 * Hook to fetch a paginated list of notes
 * Supports pagination via offset parameter
 */
export const useNotesList = (query = '') => {
  const queryKey = [QUERY_KEYS.NOTES.lists, query]

  return useQuery({
    queryKey: queryKey,
    queryFn: async () => {
      try {
        const response = await axios.get(`/api/notes${query}`)
        // Ensure we return the full response data structure or an empty object with docs array
        return response.data.data || { docs: [], totalDocs: 0, page: 1 }
      } catch (error) {
        console.error('Error fetching notes:', error)
        // Return an empty result structure instead of undefined
        return { docs: [], totalDocs: 0, page: 1 }
      }
    },
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook to fetch a single note by ID
 */
export const useNote = (
  noteId: string,
  options: Record<string, unknown> = {},
) => {
  return useQuery({
    queryKey: QUERY_KEYS.NOTES.detail(noteId),
    queryFn: async () => {
      try {
        if (!noteId) return null
        const response = await axios.get(`/api/note/${noteId}`)
        return response.data.data || {}
      } catch (error) {
        console.error('Error fetching note:', error)
        return {} // Return empty object instead of undefined
      }
    },
    enabled: !!noteId,
    ...options,
  })
}

/**
 * Hook to create or update a note
 * Invalidates relevant queries after mutation
 */
export const useCreateOrUpdateNote = () => {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (noteData: unknown) => {
      const response = await axios.post('/api/note', noteData)
      dispatch(setAlert('Notitie succesvol aangemaakt!', 'success'))

      return response.data.data || {} // Return empty object instead of undefined
    },
    onSuccess: (data) => {
      // Invalidate the list query to refetch updated data
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTES.lists] })

      // Invalidate the specific note query if it exists
      if (data._id) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.NOTES.detail(data._id),
        })
      }
    },
    onError: (error: Error) => {
      dispatch(
        setAlert(
          `Fout bij het opslaan van notitie: ${
            (error as ApiError)?.response?.data?.message ||
            error.message ||
            'Onbekende fout'
          }`,
          'danger',
        ),
      )
    },
  })
}

/**
 * Hook to delete a note
 * Invalidates relevant queries after deletion
 */
export const useDeleteNote = () => {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (noteId: string) => {
      const response = await axios.delete(`/api/notes/${noteId}`)
      dispatch(setAlert('Notitie succesvol verwijderd!', 'success'))
      return response.data || {} // Return empty object instead of undefined
    },
    onSuccess: () => {
      // Invalidate the list query to refetch updated data
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTES.lists] })
    },
    onError: (error: Error) => {
      dispatch(
        setAlert(
          `Fout bij het verwijderen van notitie: ${
            (error as ApiError)?.response?.data?.message ||
            error.message ||
            'Onbekende fout'
          }`,
          'danger',
        ),
      )
    },
  })
}

/**
 * Hook to fetch notes by contact type
 */
export const useContactsByType = (typeName: string) => {
  return useQuery({
    queryKey: QUERY_KEYS.CONTACTS.byType(typeName),
    queryFn: async () => {
      try {
        if (!typeName) return []
        const response = await axios.get(`/api/contacts/types/${typeName}`)
        return response.data || []
      } catch (error) {
        console.error('Error fetching contacts by type:', error)
        return [] // Return empty array instead of undefined
      }
    },
    enabled: !!typeName,
    staleTime: 300000, // 5 minutes
  })
}
