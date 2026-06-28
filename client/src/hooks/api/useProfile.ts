import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
} from '@tanstack/react-query'
import axios from 'axios'

import { setAlert } from '../../redux/_actions/alertAction'
import { useAppDispatch } from '../../redux/hooks'
import { ApiError } from '../../redux/types'

import { QUERY_KEYS } from './queryKeys'

/**
 * Custom hook to fetch and cache profile data
 */
export function useProfile() {
  return useQuery({
    queryKey: [QUERY_KEYS.PROFILE],
    queryFn: async () => {
      try {
        const response = await axios.get('/api/auth/profile')
        return response.data.data
      } catch (error) {
        throw new Error(
          'Failed to fetch profile data: ' +
            ((error as ApiError).response?.data?.message ||
              (error as ApiError).message),
        )
      }
    },
    staleTime: 300000, // 5 minutes
    gcTime: 3600000, // 1 hour (v5 rename of cacheTime)
  })
}

/**
 * Custom hook to prefetch profile data
 */
export function prefetchProfile(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: [QUERY_KEYS.PROFILE],
    queryFn: async () => {
      try {
        const response = await axios.get('/api/auth/profile')
        return response.data.data
      } catch (error) {
        throw new Error(
          'Failed to fetch profile data: ' +
            ((error as ApiError).response?.data?.message ||
              (error as ApiError).message),
        )
      }
    },
    staleTime: 300000, // 5 minutes
  })
}

/**
 * Custom hook for updating user profile
 */
export function useUpdateProfile() {
  const dispatch = useAppDispatch()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (userData: unknown) => {
      const config = { headers: { 'Content-Type': 'application/json' } }
      const response = await axios.post(`/api/auth/profile`, userData, config)
      return response.data
    },
    onSuccess: () => {
      // Invalidate profile query to trigger a refetch
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PROFILE] })

      // Show success alert
      dispatch(setAlert('Het profiel is succesvol opgeslagen.', 'info'))
    },
    onError: (error: Error) => {
      console.error('Error updating profile:', error)
      dispatch(
        setAlert(
          'Er is iets misgegaan bij het opslaan van het profiel.',
          'danger',
        ),
      )
    },
  })
}
