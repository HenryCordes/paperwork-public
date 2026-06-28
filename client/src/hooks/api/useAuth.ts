import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

import { setAlert } from '../../redux/_actions/alertAction'
import { useAppDispatch } from '../../redux/hooks'
import { ApiError } from '../../redux/types'
import setAuthToken from '../../utils/setAuthToken'

import { QUERY_KEYS } from './queryKeys'

/**
 * Custom hook for user registration
 */
export function useRegister() {
  const dispatch = useAppDispatch()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (userData: unknown) => {
      const config = { headers: { 'Content-Type': 'application/json' } }
      const response = await axios.post('/api/auth/register', userData, config)

      if (response.data && response.data.token) {
        // Save the token in localStorage
        localStorage.setItem('token', response.data.token)

        // Set token to Auth header for subsequent requests
        setAuthToken(response.data.token)
      }

      return response.data
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PROFILE] })

      // Don't need to show success alert here as it's handled in the component workflow
    },
    onError: (error: Error) => {
      console.error('Registration error:', JSON.stringify(error))

      dispatch(
        setAlert(
          (error as ApiError).response?.data?.message ||
            'Registratie is mislukt',
          'danger',
        ),
      )
    },
  })
}

/**
 * Custom hook for creating a subscription
 */
export function useCreateSubscription() {
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (subscriptionData: unknown) => {
      const config = { headers: { 'Content-Type': 'application/json' } }

      // Make sure token is set for authenticated requests
      if (localStorage.token) {
        setAuthToken(localStorage.token)
      }

      const response = await axios.post(
        `/api/payment/mollie/subscription`,
        subscriptionData,
        config,
      )

      return response.data.data
    },
    onSuccess: () => {
      // Success is handled in component as it requires navigation
    },
    onError: (error: Error) => {
      console.error('Subscription creation error:', error)
      dispatch(
        setAlert(
          'Er is iets misgegaan bij het aanmaken van het abonnement.',
          'danger',
        ),
      )
    },
  })
}
