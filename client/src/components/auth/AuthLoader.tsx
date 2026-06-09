import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { getProfile } from '../../redux/_actions/authAction'
import { useAppDispatch } from '../../redux/hooks'

/**
 * AuthLoader component
 *
 * This component initializes the auth state by loading the user profile
 * when the application starts up, if a valid token exists in localStorage.
 *
 * It solves the issue of user data not being available on direct page loads/refreshes
 * while ensuring we don't make unnecessary API calls.
 */
const AuthLoader = () => {
  const dispatch = useAppDispatch()
  const auth = useSelector((state) => state.auth)

  useEffect(() => {
    // Only fetch profile if we have a token but no user data
    if (localStorage.token && (!auth.user || auth.loading)) {
      dispatch(getProfile())
    }
    // eslint-disable-next-line
  }, [dispatch])

  return null // This is a utility component with no UI
}

export default AuthLoader
