import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { USER_LOADED, AUTH_ERROR } from '../redux/authTypes'
import axios from 'axios'
import setAuthToken from '../utils/setAuthToken'

// Original used react-router v5 `history` prop — converted to v6 useNavigate.
const Home = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')

  useEffect(() => {
    if (localStorage.token) loadUsers()
    else navigate('/login')
    // eslint-disable-next-line
  }, [])

  const loadUsers = async () => {
    setAuthToken(localStorage.token)
    try {
      const res = await axios.get('/api/auth/me')
      setUsername(res.data.data.name)
      dispatch({ type: USER_LOADED, payload: res.data })
    } catch (err) {
      console.log(err)
      dispatch({ type: AUTH_ERROR, payload: (err as Error).message })
    }
  }

  return (
    <div>
      <h1>Hi {username}! Welcome to Application</h1>
    </div>
  )
}

export default Home
