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
import { setAlert } from './alertAction'
import {
  createSubscription,
  getSubscription,
  getSubscriptionByOrderId,
  getSubscriptionManagement,
  handleSubscriptionPaymentIssues,
} from './paymentAction'

jest.mock('axios')
jest.mock('../../utils/setAuthToken')
// setAlert is itself a thunk; mock it so dispatched alerts are inspectable as a
// sentinel action object rather than an opaque function.
jest.mock('./alertAction', () => ({
  setAlert: jest.fn(
    (message: string, type: string) =>
      ({ __alert: true, message, type }) as unknown,
  ),
}))

const mockedAxios = axios as jest.Mocked<typeof axios>
const mockedSetAlert = setAlert as jest.MockedFunction<typeof setAlert>
const mockedSetAuthToken = setAuthToken as jest.MockedFunction<
  typeof setAuthToken
>

describe('paymentAction thunks', () => {
  let dispatch: jest.Mock

  beforeEach(() => {
    dispatch = jest.fn()
    jest.clearAllMocks()
    // Silence the module's console.log noise without losing real failures.
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('createSubscription', () => {
    it('posts to the mollie subscription endpoint and dispatches success', async () => {
      const payload = { id: 'sub_1', status: 'active' }
      mockedAxios.post.mockResolvedValueOnce({ data: { data: payload } })

      const result = await createSubscription({ plan: 'pro' })(dispatch)

      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/payment/mollie/subscription',
        { plan: 'pro' },
        { headers: { 'Content-Type': 'application/json' } },
      )
      expect(dispatch).toHaveBeenCalledWith({
        type: PAYMENT_SUBSCIPTION_UPDATED_SUCCESS,
        payload,
      })
      expect(result).toEqual(payload)
      expect(mockedSetAlert).not.toHaveBeenCalled()
    })

    it('dispatches fail with the server message and a danger alert on an API error', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: { data: { message: 'card declined' } },
      })

      const result = await createSubscription({ plan: 'pro' })(dispatch)

      expect(dispatch).toHaveBeenCalledWith({
        type: PAYMENT_SUBSCIPTION_UPDATED_FAIL,
        payload: 'card declined',
      })
      expect(mockedSetAlert).toHaveBeenCalledWith(
        'Er is iets misgegaan bij het opslaan van het profiel.',
        'danger',
      )
      // setAlert's result is dispatched; assert dispatch received it.
      expect(dispatch).toHaveBeenCalledWith(
        mockedSetAlert.mock.results[0].value,
      )
      // No success-path return value when it throws.
      expect(result).toBeUndefined()
    })

    it('dispatches fail with the raw error when no response body is present', async () => {
      const err = new Error('network down')
      mockedAxios.post.mockRejectedValueOnce(err)

      await createSubscription({ plan: 'pro' })(dispatch)

      expect(dispatch).toHaveBeenCalledWith({
        type: PAYMENT_SUBSCIPTION_UPDATED_FAIL,
        payload: err,
      })
      expect(mockedSetAlert).toHaveBeenCalledWith(
        'Er is iets misgegaan bij het opslaan van het profiel.',
        'danger',
      )
    })
  })

  describe('getSubscription', () => {
    it('gets the subscription by id and dispatches success', async () => {
      const payload = { id: 'abc' }
      mockedAxios.get.mockResolvedValueOnce({ data: { data: payload } })

      const result = await getSubscription('abc')(dispatch)

      // FIXME(getSubscription-url): the id is concatenated directly onto
      // `/api/payment/subscription` with no separator, producing
      // `/api/payment/subscriptionabc`. Characterizing current behavior here.
      expect(mockedAxios.get).toHaveBeenCalledWith(
        '/api/payment/subscriptionabc',
        { headers: { 'Content-Type': 'application/json' } },
      )
      expect(dispatch).toHaveBeenCalledWith({
        type: PAYMENT_SUBSCIPTION_LOADED_SUCCESS,
        payload,
      })
      expect(result).toEqual(payload)
    })

    it('dispatches fail and a danger alert on an API error', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: { data: { message: 'not found' } },
      })

      await getSubscription('abc')(dispatch)

      expect(dispatch).toHaveBeenCalledWith({
        type: PAYMENT_SUBSCIPTION_LOADED_FAIL,
        payload: 'not found',
      })
      expect(mockedSetAlert).toHaveBeenCalledWith(
        'Er is iets misgegaan bij het ophalen van het abonnement.',
        'danger',
      )
    })
  })

  describe('getSubscriptionByOrderId', () => {
    it('gets the subscription by order id and dispatches success', async () => {
      const payload = { id: 'order_9' }
      mockedAxios.get.mockResolvedValueOnce({ data: { data: payload } })

      const result = await getSubscriptionByOrderId('order_9')(dispatch)

      expect(mockedAxios.get).toHaveBeenCalledWith(
        '/api/payment/subscription/order/order_9',
        { headers: { 'Content-Type': 'application/json' } },
      )
      expect(dispatch).toHaveBeenCalledWith({
        type: PAYMENT_SUBSCIPTION_BY_ORDERID_LOADED_SUCCESS,
        payload,
      })
      expect(result).toEqual(payload)
    })

    it('returns the server message on an API error (no alert dispatched)', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: { data: { message: 'bad order' } },
      })

      const result = await getSubscriptionByOrderId('order_9')(dispatch)

      expect(dispatch).toHaveBeenCalledWith({
        type: PAYMENT_SUBSCIPTION_BY_ORDERID_LOADED_FAIL,
        payload: 'bad order',
      })
      expect(result).toEqual({ error: 'bad order' })
      expect(mockedSetAlert).not.toHaveBeenCalled()
    })

    it('returns the error message when no response body is present', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('timeout'))

      const result = await getSubscriptionByOrderId('order_9')(dispatch)

      expect(dispatch).toHaveBeenCalledWith({
        type: PAYMENT_SUBSCIPTION_BY_ORDERID_LOADED_FAIL,
        payload: expect.any(Error),
      })
      expect(result).toEqual({ error: 'timeout' })
    })
  })

  describe('getSubscriptionManagement', () => {
    it('gets the subscriptions list and dispatches success', async () => {
      const payload = [{ id: 's1' }, { id: 's2' }]
      mockedAxios.get.mockResolvedValueOnce({ data: { data: payload } })

      const result = await getSubscriptionManagement()(dispatch)

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/subscriptions', {
        headers: { 'Content-Type': 'application/json' },
      })
      expect(dispatch).toHaveBeenCalledWith({
        type: PAYMENT_MANAGEMENT_DATA_LOADED_SUCCESS,
        payload,
      })
      expect(result).toEqual(payload)
    })

    it('returns the server message on an API error (no alert dispatched)', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: { data: { message: 'forbidden' } },
      })

      const result = await getSubscriptionManagement()(dispatch)

      expect(dispatch).toHaveBeenCalledWith({
        type: PAYMENT_MANAGEMENT_DATA_LOADED_FAIL,
        payload: 'forbidden',
      })
      expect(result).toEqual({ error: 'forbidden' })
      expect(mockedSetAlert).not.toHaveBeenCalled()
    })

    it('returns a default error string when error has no message or response', async () => {
      // eslint-disable-next-line no-throw-literal
      mockedAxios.get.mockRejectedValueOnce({})

      const result = await getSubscriptionManagement()(dispatch)

      expect(dispatch).toHaveBeenCalledWith({
        type: PAYMENT_MANAGEMENT_DATA_LOADED_FAIL,
        payload: {},
      })
      expect(result).toEqual({ error: 'Error loading subscription data' })
    })
  })

  describe('handleSubscriptionPaymentIssues', () => {
    const originalToken = Object.getOwnPropertyDescriptor(
      window.localStorage,
      'token',
    )

    afterEach(() => {
      window.localStorage.clear()
      if (originalToken) {
        Object.defineProperty(window.localStorage, 'token', originalToken)
      }
    })

    it('short-circuits with an alert when no auth token is present', async () => {
      window.localStorage.removeItem('token')

      const result = await handleSubscriptionPaymentIssues(
        'sub_1',
        'retry',
      )(dispatch)

      expect(mockedSetAlert).toHaveBeenCalledWith(
        'Authentication token missing. Please try logging in again.',
        'danger',
      )
      expect(result).toEqual({ error: 'Authentication token missing' })
      expect(mockedAxios.post).not.toHaveBeenCalled()
      expect(mockedSetAuthToken).not.toHaveBeenCalled()
    })

    it('sets the auth token, posts the action, and dispatches success + success alert', async () => {
      window.localStorage.setItem('token', 'tok_123')
      mockedAxios.post.mockResolvedValueOnce({
        data: { data: { ok: true }, message: 'Done' },
      })

      const result = await handleSubscriptionPaymentIssues(
        'sub_1',
        'retry',
      )(dispatch)

      expect(mockedSetAuthToken).toHaveBeenCalledWith('tok_123')
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/payment/subscription/handle-payment-issues/sub_1',
        { action: 'retry' },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer tok_123',
          },
        },
      )
      expect(dispatch).toHaveBeenCalledWith({
        type: PAYMENT_ISSUE_HANDLED_SUCCESS,
        payload: { ok: true },
      })
      expect(mockedSetAlert).toHaveBeenCalledWith('Done', 'success')
      expect(result).toEqual({ ok: true })
    })

    it('falls back to a default success message when the response omits one', async () => {
      window.localStorage.setItem('token', 'tok_123')
      mockedAxios.post.mockResolvedValueOnce({ data: { data: { ok: true } } })

      await handleSubscriptionPaymentIssues('sub_1', 'retry')(dispatch)

      expect(mockedSetAlert).toHaveBeenCalledWith(
        'Betaling succesvol verwerkt.',
        'success',
      )
    })

    it('dispatches fail with the server message + danger alert on an API error', async () => {
      window.localStorage.setItem('token', 'tok_123')
      mockedAxios.post.mockRejectedValueOnce({
        response: { data: { message: 'payment rejected' } },
      })

      const result = await handleSubscriptionPaymentIssues(
        'sub_1',
        'retry',
      )(dispatch)

      expect(dispatch).toHaveBeenCalledWith({
        type: PAYMENT_ISSUE_HANDLED_FAIL,
        payload: 'payment rejected',
      })
      expect(mockedSetAlert).toHaveBeenCalledWith('payment rejected', 'danger')
      expect(result).toEqual({ error: 'payment rejected' })
    })

    it('falls back to default message + error string when no response body is present', async () => {
      window.localStorage.setItem('token', 'tok_123')
      mockedAxios.post.mockRejectedValueOnce(new Error('socket hang up'))

      const result = await handleSubscriptionPaymentIssues(
        'sub_1',
        'retry',
      )(dispatch)

      expect(dispatch).toHaveBeenCalledWith({
        type: PAYMENT_ISSUE_HANDLED_FAIL,
        payload: expect.any(Error),
      })
      expect(mockedSetAlert).toHaveBeenCalledWith(
        'Er is iets misgegaan bij het verwerken van de betaling.',
        'danger',
      )
      expect(result).toEqual({ error: 'socket hang up' })
    })
  })
})
