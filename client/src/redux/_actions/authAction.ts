import axios from 'axios'

import {
  LOGIN_SUCCESS,
  LOGIN_FAIL,
  REGISTER_FAIL,
  REGISTER_SUCCESS,
  PROFILE_LOADED,
  PROFILE_LOADED_FAIL,
  PROFILE_UPDATED_SUCCESS,
  PROFILE_UPDATED_FAIL,
} from '../authTypes'
import { AppDispatch, ApiError } from '../types'

import { setAlert } from './alertAction'

export const register = (user: unknown) => {
  return async (dispatch: AppDispatch) => {
    const config = { headers: { 'Content-Type': 'application/json' } }
    try {
      const res = await axios.post('/api/auth/register', user, config)
      dispatch({ type: REGISTER_SUCCESS, payload: res.data })
      return res.data
    } catch (err) {
      console.log(err)
      dispatch({
        type: REGISTER_FAIL,
        payload: (err as ApiError).response?.data?.message,
      })
    }
  }
}

export const login = (email: string, password: string) => {
  return async (dispatch: AppDispatch) => {
    try {
      const config = { headers: { 'Content-Type': 'application/json' } }
      const res = await axios.post(
        `/api/auth/login`,
        { email, password },
        config,
      )
      dispatch({ type: LOGIN_SUCCESS, payload: res.data })
      return res.data
    } catch (err) {
      console.log(err)
      dispatch({
        type: LOGIN_FAIL,
        payload: (err as ApiError).response?.data?.message,
      })
    }
  }
}

export const getProfile = () => {
  return async (dispatch: AppDispatch) => {
    try {
      const config = { headers: { 'Content-Type': 'application/json' } }
      const res = await axios.get(`/api/auth/profile`, config)
      dispatch({ type: PROFILE_LOADED, payload: res.data })
      return res.data
    } catch (err) {
      console.log(err)
      dispatch({
        type: PROFILE_LOADED_FAIL,
        payload:
          (err as ApiError).response?.data?.message ||
          (err as ApiError).message,
      })
      dispatch(
        setAlert(
          'Er is iets misgegaan bij het laden van het profiel, probeer het nogmaals.',
          'danger',
        ),
      )
    }
  }
}

export const updateProfile = (user: unknown) => {
  return async (dispatch: AppDispatch) => {
    try {
      const config = { headers: { 'Content-Type': 'application/json' } }
      const res = await axios.post(`/api/auth/profile`, user, config)
      dispatch({ type: PROFILE_UPDATED_SUCCESS, payload: res.data })
      dispatch(setAlert('Het profiel is succesvol opgeslagen.', 'info'))
      return res.data
    } catch (err) {
      console.log(err)
      dispatch({
        type: PROFILE_UPDATED_FAIL,
        payload: (err as ApiError).response?.data?.message,
      })
      dispatch(
        setAlert(
          'Er is iets misgegaan bij het opslaan van het profiel.',
          'danger',
        ),
      )
    }
  }
}
