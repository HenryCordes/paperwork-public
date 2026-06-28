import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

import { setAlert } from '../../redux/_actions/alertAction'
import { useAppDispatch } from '../../redux/hooks'
import { ApiError } from '../../redux/types'

import { QUERY_KEYS } from './queryKeys'

/**
 * Hook to fetch VAT notification preferences
 */
export const useVATNotificationPreferences = (
  options: Record<string, unknown> = {},
) => {
  return useQuery({
    queryKey: [QUERY_KEYS.VAT_NOTIFICATIONS.preferences],
    queryFn: async () => {
      const response = await axios.get(
        '/api/vat-return-notifications/preferences',
      )
      return response.data.data
    },
    staleTime: 300000, // 5 minutes
    gcTime: 600000, // 10 minutes (v5 rename of cacheTime)
    ...options,
  })
}

/**
 * Hook to update VAT notification preferences
 */
export const useUpdateVATNotificationPreferences = () => {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (preferences: unknown) => {
      const response = await axios.put(
        '/api/vat-return-notifications/preferences',
        preferences,
      )
      return response.data.data
    },
    onSuccess: () => {
      // Invalidate preferences queries to refresh data
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.VAT_NOTIFICATIONS.preferences],
      })

      dispatch(setAlert('Notificatie voorkeuren zijn opgeslagen!', 'success'))
    },
    onError: (error: Error) => {
      const errorMsg =
        (error as ApiError).response?.data?.message ||
        error.message ||
        'Onbekende fout'
      dispatch(
        setAlert(
          `Fout bij opslaan notificatie voorkeuren: ${errorMsg}`,
          'danger',
        ),
      )
    },
  })
}

/**
 * Hook to update push notification token
 */
export const useUpdatePushNotificationToken = () => {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async ({
      token,
      platform,
    }: {
      token?: string
      platform?: string
    }) => {
      const response = await axios.post(
        '/api/vat-return-notifications/push-token',
        {
          token,
          platform,
        },
      )
      return response.data.data
    },
    onSuccess: () => {
      // Invalidate preferences queries to refresh data
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.VAT_NOTIFICATIONS.preferences],
      })

      dispatch(setAlert('Push notificatie token bijgewerkt!', 'success'))
    },
    onError: (error: Error) => {
      const errorMsg =
        (error as ApiError).response?.data?.message ||
        error.message ||
        'Onbekende fout'
      dispatch(
        setAlert(
          `Fout bij bijwerken push notificatie token: ${errorMsg}`,
          'danger',
        ),
      )
    },
  })
}

/**
 * Hook to disable push notifications
 */
export const useDisablePushNotifications = () => {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async () => {
      const response = await axios.delete(
        '/api/vat-return-notifications/push-token',
      )
      return response.data
    },
    onSuccess: () => {
      // Invalidate preferences queries to refresh data
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.VAT_NOTIFICATIONS.preferences],
      })

      dispatch(setAlert('Push notificaties uitgeschakeld!', 'success'))
    },
    onError: (error: Error) => {
      const errorMsg =
        (error as ApiError).response?.data?.message ||
        error.message ||
        'Onbekende fout'
      dispatch(
        setAlert(
          `Fout bij uitschakelen push notificaties: ${errorMsg}`,
          'danger',
        ),
      )
    },
  })
}
