import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

import { setAlert } from '../../redux/_actions/alertAction'
import { useAppDispatch } from '../../redux/hooks'

import { QUERY_KEYS } from './queryKeys'

/**
 * Hook to fetch settings
 */
export const useSettings = (options: Record<string, unknown> = {}) => {
  return useQuery({
    queryKey: [QUERY_KEYS.SETTINGS.all],
    queryFn: async () => {
      const response = await axios.get('/api/settings')
      return response.data.data
    },
    staleTime: 300000, // 5 minutes
    gcTime: 600000, // 10 minutes (v5 rename of cacheTime)
    ...options,
  })
}

/**
 * Hook to create or update settings
 */
export const useCreateOrUpdateSettings = () => {
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (data: unknown) => {
      const response = await axios.post('/api/settings', data)
      return response.data.data
    },
    onSuccess: () => {
      // Invalidate settings queries to refresh data
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.SETTINGS.all],
      })

      dispatch(setAlert('Instellingen zijn opgeslagen!', 'success'))
    },
    onError: (error: Error) => {
      dispatch(
        setAlert(`Fout bij opslaan instellingen: ${error.message}`, 'danger'),
      )
    },
  })
}

/**
 * Hook to upload a company logo
 */
export const useUploadLogo = () => {
  const dispatch = useAppDispatch()

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const config = { headers: { 'Content-Type': 'multipart/form-data' } }

      const response = await axios.post('/api/document', formData, config)
      if (response?.data?.data?.fileLocation) {
        return '/api/document/' + response.data.data.fileLocation
      } else {
        throw new Error('Failed to upload logo')
      }
    },
    onError: (error: Error) => {
      const errorMsg =
        (
          error as {
            response?: { data?: { errors?: { detail?: string } } }
          }
        ).response?.data?.errors?.detail ||
        error.message ||
        'Unknown error'
      dispatch(setAlert(`Logo upload mislukt: ${errorMsg}`, 'danger'))
    },
  })
}
