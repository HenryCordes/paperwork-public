import axios from 'axios'

import setAuthToken from '../../utils/setAuthToken'
import {
  PAYMENT_SUBSCIPTION_UPDATED_SUCCESS,
  PAYMENT_SUBSCIPTION_UPDATED_FAIL,
  PAYMENT_SUBSCIPTION_LOADED_SUCCESS,
  PAYMENT_SUBSCIPTION_LOADED_FAIL,
  PAYMENT_SUBSCIPTION_BY_ORDERID_LOADED_SUCCESS,
  PAYMENT_SUBSCIPTION_BY_ORDERID_LOADED_FAIL,
  PAYMENT_MANAGEMENT_DATA_LOADED_SUCCESS,
  PAYMENT_MANAGEMENT_DATA_LOADED_FAIL,
  PAYMENT_ISSUE_HANDLED_SUCCESS,
  PAYMENT_ISSUE_HANDLED_FAIL,
} from '../paymentTypes'
import { AppDispatch, ApiError } from '../types'

import { setAlert } from './alertAction'

export const createSubscription = (data: unknown) => {
  return async (dispatch: AppDispatch) => {
    try {
      // if (data && data.token){
      //   config = { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.token } };
      // }else{
      const config = { headers: { 'Content-Type': 'application/json' } }
      // }

      const res = await axios.post(
        `/api/payment/mollie/subscription`, // Keep the client URL the same to match what the server expects
        data,
        config,
      )
      dispatch({
        type: PAYMENT_SUBSCIPTION_UPDATED_SUCCESS,
        payload: res.data.data,
      })
      return res.data.data
    } catch (err) {
      const error = err as ApiError
      if (err && error.response && error.response.data) {
        dispatch({
          type: PAYMENT_SUBSCIPTION_UPDATED_FAIL,
          payload: error.response.data.message,
        })
      } else {
        console.log(err)
        dispatch({ type: PAYMENT_SUBSCIPTION_UPDATED_FAIL, payload: err })
      }
      dispatch(
        setAlert(
          'Er is iets misgegaan bij het opslaan van het profiel.',
          'danger',
        ),
      )
    }
  }
}

export const getSubscription = (id: string) => {
  return async (dispatch: AppDispatch) => {
    try {
      const config = { headers: { 'Content-Type': 'application/json' } }
      const res = await axios.get(`/api/payment/subscription${id}`, config)
      dispatch({
        type: PAYMENT_SUBSCIPTION_LOADED_SUCCESS,
        payload: res.data.data,
      })
      return res.data.data
    } catch (err) {
      const error = err as ApiError
      if (err && error.response && error.response.data) {
        dispatch({
          type: PAYMENT_SUBSCIPTION_LOADED_FAIL,
          payload: error.response.data.message,
        })
      } else {
        console.log(err)
        dispatch({ type: PAYMENT_SUBSCIPTION_LOADED_FAIL, payload: err })
      }
      dispatch(
        setAlert(
          'Er is iets misgegaan bij het ophalen van het abonnement.',
          'danger',
        ),
      )
    }
  }
}

export const getSubscriptionByOrderId = (id: string) => {
  return async (dispatch: AppDispatch) => {
    try {
      const config = { headers: { 'Content-Type': 'application/json' } }
      const res = await axios.get(
        `/api/payment/subscription/order/${id}`,
        config,
      )
      dispatch({
        type: PAYMENT_SUBSCIPTION_BY_ORDERID_LOADED_SUCCESS,
        payload: res.data.data,
      })
      return res.data.data
    } catch (err) {
      const error = err as ApiError
      if (err && error.response && error.response.data) {
        dispatch({
          type: PAYMENT_SUBSCIPTION_BY_ORDERID_LOADED_FAIL,
          payload: error.response.data.message,
        })
        return { error: error.response.data.message }
      } else {
        console.log(err)
        dispatch({
          type: PAYMENT_SUBSCIPTION_BY_ORDERID_LOADED_FAIL,
          payload: err,
        })
        if (err && error.message) {
          return { error: error.message }
        }
        return { error: 'error' }
      }
    }
  }
}

// Get subscription management data
export const getSubscriptionManagement = () => {
  return async (dispatch: AppDispatch) => {
    try {
      const config = { headers: { 'Content-Type': 'application/json' } }
      const res = await axios.get('/api/subscriptions', config)
      dispatch({
        type: PAYMENT_MANAGEMENT_DATA_LOADED_SUCCESS,
        payload: res.data.data,
      })
      return res.data.data
    } catch (err) {
      const error = err as ApiError
      if (err && error.response && error.response.data) {
        dispatch({
          type: PAYMENT_MANAGEMENT_DATA_LOADED_FAIL,
          payload: error.response.data.message,
        })
        return { error: error.response.data.message }
      } else {
        console.log(err)
        dispatch({ type: PAYMENT_MANAGEMENT_DATA_LOADED_FAIL, payload: err })
        if (err && error.message) {
          return { error: error.message }
        }
        return { error: 'Error loading subscription data' }
      }
    }
  }
}

// Handle subscription payment issues
export const handleSubscriptionPaymentIssues = (
  subscriptionId: string,
  action: string,
) => {
  return async (dispatch: AppDispatch) => {
    try {
      // Add debug logging to trace the issue
      console.log(
        'Token in localStorage:',
        localStorage.token ? 'Present (masked for security)' : 'Missing',
      )

      // If token is missing or invalid, inform the user
      if (!localStorage.token) {
        dispatch(
          setAlert(
            'Authentication token missing. Please try logging in again.',
            'danger',
          ),
        )
        return { error: 'Authentication token missing' }
      }

      // Set token in axios defaults
      setAuthToken(localStorage.token)
      console.log('Token set in axios defaults')

      // Make direct API call with explicit headers
      console.log(
        'Making API call to handle payment issues for subscription:',
        subscriptionId,
      )
      const config = {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.token}`,
        },
      }

      console.log('Request config:', {
        url: `/api/payment/subscription/handle-payment-issues/${subscriptionId}`,
        method: 'POST',
        headers: 'Content-Type and Authorization headers set',
        data: { action },
      })

      const res = await axios.post(
        `/api/payment/subscription/handle-payment-issues/${subscriptionId}`,
        { action },
        config,
      )
      dispatch({ type: PAYMENT_ISSUE_HANDLED_SUCCESS, payload: res.data.data })
      dispatch(
        setAlert(res.data.message || 'Betaling succesvol verwerkt.', 'success'),
      )
      return res.data.data
    } catch (err) {
      const error = err as ApiError
      if (err && error.response && error.response.data) {
        dispatch({
          type: PAYMENT_ISSUE_HANDLED_FAIL,
          payload: error.response.data.message,
        })
        dispatch(
          setAlert(
            error.response.data.message ||
              'Er is iets misgegaan bij het verwerken van de betaling.',
            'danger',
          ),
        )
        return { error: error.response.data.message }
      } else {
        console.log(err)
        dispatch({ type: PAYMENT_ISSUE_HANDLED_FAIL, payload: err })
        dispatch(
          setAlert(
            'Er is iets misgegaan bij het verwerken van de betaling.',
            'danger',
          ),
        )
        if (err && error.message) {
          return { error: error.message }
        }
        return { error: 'Error processing payment action' }
      }
    }
  }
}
