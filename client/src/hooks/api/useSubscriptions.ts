/**
 * React Query hooks for Subscriptions domain
 * Provides data fetching, mutations, and cache management for subscriptions
 */
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
import setAuthToken from '../../utils/setAuthToken'

import { QUERY_KEYS } from './queryKeys'

interface SubscriptionData {
  hasActiveSubscription?: boolean
  subscription?: { subscriptionStatus: string }
  activeSubscription?: { subscriptionStatus: string }
  subscriptions?: Array<{ subscriptionStatus: string }>
}

/**
 * Hook to fetch subscription management data
 */
export const useSubscriptionManagement = () => {
  const dispatch = useAppDispatch()

  return useQuery({
    queryKey: [QUERY_KEYS.SUBSCRIPTIONS.management],
    queryFn: async () => {
      try {
        const config = { headers: { 'Content-Type': 'application/json' } }
        const response = await axios.get('/api/subscriptions', config)
        return response.data.data || { subscriptions: [] }
      } catch (error) {
        console.error('Error fetching subscription data:', error)
        dispatch(setAlert('Kan abonnementsgegevens niet laden', 'danger'))
        return { subscriptions: [] }
      }
    },
    staleTime: 60000, // 1 minute
  })
}

/**
 * Custom hook to fetch and cache subscription data
 */
export function useSubscription() {
  return useQuery({
    queryKey: [QUERY_KEYS.SUBSCRIPTIONS.detail],
    queryFn: async () => {
      try {
        const response = await axios.get('/api/subscriptions')
        return response.data.data
      } catch (error) {
        throw new Error(
          'Failed to fetch subscription data: ' +
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
 * Helper function to check if the user has an active subscription
 */
export function hasActiveSubscription(
  subscriptionData: SubscriptionData | null | undefined,
) {
  if (!subscriptionData) return false

  // Direct flag
  if (subscriptionData.hasActiveSubscription) {
    return true
  }

  // Via subscription object
  if (
    subscriptionData.subscription &&
    ['active'].includes(subscriptionData.subscription.subscriptionStatus)
  ) {
    return true
  }

  // Via activeSubscription object
  if (
    subscriptionData.activeSubscription &&
    ['active'].includes(subscriptionData.activeSubscription.subscriptionStatus)
  ) {
    return true
  }

  // Via subscriptions array
  if (
    subscriptionData.subscriptions &&
    subscriptionData.subscriptions.length > 0 &&
    subscriptionData.subscriptions.some((sub) =>
      ['active'].includes(sub.subscriptionStatus),
    )
  ) {
    return true
  }

  return false
}

/**
 * Custom hook to prefetch subscription data
 */
export function prefetchSubscription(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      try {
        const response = await axios.get('/api/subscriptions')
        return response.data.data
      } catch (error) {
        throw new Error(
          'Failed to fetch subscription data: ' +
            ((error as ApiError).response?.data?.message ||
              (error as ApiError).message),
        )
      }
    },
    staleTime: 300000, // 5 minutes
  })
}

/**
 * Hook to fetch subscription by order ID
 */
export const useSubscriptionByOrderId = (orderId: string) => {
  return useQuery({
    queryKey: QUERY_KEYS.SUBSCRIPTIONS.order(orderId),
    queryFn: async () => {
      try {
        if (!orderId) return null
        const config = { headers: { 'Content-Type': 'application/json' } }
        const response = await axios.get(
          `/api/payment/subscription/order/${orderId}`,
          config,
        )
        return response.data.data || {}
      } catch (error) {
        console.error('Error fetching subscription by order ID:', error)
        return {}
      }
    },
    enabled: !!orderId,
  })
}

/**
 * Hook to create new subscription
 */
export const useCreateSubscription = () => {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (data: unknown) => {
      const config = { headers: { 'Content-Type': 'application/json' } }
      const response = await axios.post(
        `/api/payment/mollie/subscription`,
        data,
        config,
      )
      return response.data.data || {}
    },
    onSuccess: () => {
      // Invalidate the management query to refetch updated data
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.SUBSCRIPTIONS.management],
      })
    },
    onError: (error: Error) => {
      dispatch(
        setAlert(
          `Fout bij het opslaan van het abonnement: ${
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
 * Hook to handle subscription payment issues
 */
export const useHandleSubscriptionPaymentIssue = () => {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async ({
      subscriptionId,
      action,
    }: {
      subscriptionId?: string
      action?: string
    }) => {
      // If token is missing or invalid, inform the user
      if (!localStorage.token) {
        throw new Error('Authentication token missing')
      }

      // Set token in axios defaults
      setAuthToken(localStorage.token)

      const config = {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.token}`,
        },
      }

      const response = await axios.post(
        `/api/payment/subscription/handle-payment-issues/${subscriptionId}`,
        { action },
        config,
      )

      return response.data.data || {}
    },
    onSuccess: (data, variables) => {
      // Show success message
      dispatch(
        setAlert(data?.message || 'Betaling succesvol verwerkt.', 'success'),
      )

      // Invalidate the management query to refetch updated data
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.SUBSCRIPTIONS.management],
      })

      // Also invalidate the specific subscription if it exists
      if (variables?.subscriptionId) {
        queryClient.invalidateQueries({
          queryKey: [QUERY_KEYS.SUBSCRIPTIONS.detail, variables.subscriptionId],
        })
      }
    },
    onError: (error: Error) => {
      dispatch(
        setAlert(
          `Fout bij het verwerken van de betaling: ${
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
