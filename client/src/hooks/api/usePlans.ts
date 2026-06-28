import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

import { setAlert } from '../../redux/_actions/alertAction'
import { useAppDispatch } from '../../redux/hooks'
import { ApiError } from '../../redux/types'

import { QUERY_KEYS } from './queryKeys'

/**
 * Custom hook to fetch and cache available plans
 */
export function usePlans() {
  const dispatch = useAppDispatch()

  return useQuery({
    queryKey: [QUERY_KEYS.PLANS.all],
    queryFn: async () => {
      try {
        const response = await axios.get('/api/plans')

        if (response.data.success) {
          return response.data.data
        } else {
          dispatch(setAlert('Could not load subscription plans', 'danger'))
          return []
        }
      } catch (error) {
        console.error('Error fetching plans:', error)
        dispatch(setAlert('Error loading subscription plans', 'danger'))
        throw new Error(
          'Failed to fetch plans: ' +
            ((error as ApiError).response?.data?.message ||
              (error as ApiError).message),
        )
      }
    },
    staleTime: 300000, // 5 minutes
    gcTime: 3600000, // 1 hour (v5 rename of cacheTime)
  })
}
