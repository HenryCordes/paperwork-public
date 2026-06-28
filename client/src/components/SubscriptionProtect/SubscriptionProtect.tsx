import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSubscriptionStatus } from '../../utils/useSubscriptionStatus'
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner'

/**
 * Route protection component that checks if user has an active subscription
 * Redirects to subscription page if not
 */
const SubscriptionProtect = ({ children }: { children: ReactNode }) => {
  // Use the centralized subscription status hook
  const { loading, hasActiveSubscription } = useSubscriptionStatus()

  // Show loading spinner while checking subscription
  if (loading) {
    return <LoadingSpinner />
  }

  // Redirect to subscription page if no active subscription
  if (!hasActiveSubscription) {
    return <Navigate to="/subscriptions" replace />
  }

  // Render children if subscription is active
  return <>{children}</>
}

export default SubscriptionProtect
