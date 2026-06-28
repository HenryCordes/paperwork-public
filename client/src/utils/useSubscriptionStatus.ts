import { useState, useEffect } from 'react'

import { getSubscriptionManagement } from '../redux/_actions/paymentAction'
import { useAppDispatch } from '../redux/hooks'

/**
 * Custom hook to check if a user has an active subscription
 */
export const useSubscriptionStatus = () => {
  const dispatch = useAppDispatch()
  const [loading, setLoading] = useState(true)
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false)
  const [subscriptionData, setSubscriptionData] = useState<Record<
    string,
    unknown
  > | null>(null)

  useEffect(() => {
    const checkSubscription = async () => {
      try {
        const data = await dispatch(getSubscriptionManagement())

        // Check all possible paths for active subscription
        let active = false

        // 1. Direct hasActiveSubscription flag
        if (data && data.hasActiveSubscription) {
          active = true
        }
        // 2. Via activeSubscription object
        else if (
          data &&
          data.activeSubscription &&
          ['active'].includes(data.activeSubscription.subscriptionStatus)
        ) {
          active = true
        }
        // 3. Via subscription object (old format)
        else if (
          data &&
          data.subscription &&
          ['active'].includes(data.subscription.subscriptionStatus)
        ) {
          active = true
        }
        // 4. Check subscriptions array
        else if (
          data &&
          data.subscriptions &&
          data.subscriptions.length > 0 &&
          data.subscriptions.some((sub: { subscriptionStatus: string }) =>
            ['active'].includes(sub.subscriptionStatus),
          )
        ) {
          active = true
        }

        setHasActiveSubscription(active)
        setSubscriptionData(data)
      } catch (error) {
        console.error('Error checking subscription:', error)
        setHasActiveSubscription(false)
      } finally {
        setLoading(false)
      }
    }

    checkSubscription()
  }, [dispatch])

  return { loading, hasActiveSubscription, subscriptionData }
}
