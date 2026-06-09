import { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'

// In React Router v6, route components are rendered using element prop, not component or render
const PrivateRoute = ({ children }: { children?: ReactNode }) => {
  const state = useSelector((state) => state.auth)
  const location = useLocation()

  // If not authenticated, redirect to login page
  if (!state.isAuthenticated) {
    // Save the attempted URL for redirecting after login
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Return outlet to render child routes or the children directly if provided
  return children ? <>{children}</> : <Outlet />
}

export default PrivateRoute
