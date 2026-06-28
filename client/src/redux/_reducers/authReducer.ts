import { AnyAction } from 'redux'

import setAuthToken from '../../utils/setAuthToken'
import { CLEAR_ERRORS } from '../alertTypes'
import {
  REGISTER_SUCCESS,
  LOGIN_SUCCESS,
  REGISTER_FAIL,
  LOGIN_FAIL,
  LOGOUT,
  AUTH_ERROR,
  USER_LOADED,
  PROFILE_LOADED,
  PROFILE_LOADED_FAIL,
  PROFILE_UPDATED_SUCCESS,
  PROFILE_UPDATED_FAIL,
} from '../authTypes'

interface AuthState {
  isAuthenticated: boolean
  user: unknown
  token: unknown
  error: unknown
  loading: boolean
}

const initState: AuthState = {
  isAuthenticated: localStorage.getItem('token') ? true : false,
  user: null,
  token: localStorage.getItem('token'),
  error: null,
  loading: true,
}

const authReducer = (
  state: AuthState = initState,
  action: AnyAction,
): AuthState => {
  switch (action.type) {
    case USER_LOADED:
      return {
        ...state,
        isAuthenticated: true,
        loading: false,
        user: action.payload,
      }
    case REGISTER_SUCCESS:
      localStorage.setItem('token', action.payload.token)
      setAuthToken(action.payload.token)
      return {
        ...state,
        token: action.payload,
        isAuthenticated: true,
        loading: false,
      }
    case LOGIN_SUCCESS:
      localStorage.setItem('token', action.payload.token)
      setAuthToken(action.payload.token)
      return {
        ...state,
        token: action.payload,
        isAuthenticated: true,
        loading: false,
      }
    case REGISTER_FAIL:
    case AUTH_ERROR:
    case LOGIN_FAIL:
      return {
        ...state,
        isAuthenticated: false,
        error: action.payload,
      }
    case LOGOUT:
      localStorage.removeItem('token')
      return {
        ...state,
        token: null,
        isAuthenticated: false,
        user: null,
        error: action.payload,
      }
    case CLEAR_ERRORS:
      return {
        ...state,
        error: null,
      }
    case PROFILE_LOADED:
      return {
        ...state,
        isAuthenticated: true,
        loading: false,
        user: action.payload.data,
      }
    case PROFILE_LOADED_FAIL:
    case PROFILE_UPDATED_SUCCESS:
    case PROFILE_UPDATED_FAIL:
    default:
      return state
  }
}

export default authReducer
