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

import { register, login, getProfile, updateProfile } from './authAction'
import { setAlert } from './alertAction'

jest.mock('axios')
jest.mock('../../utils/setAuthToken')

// Mock setAlert so the thunk dispatches an identifiable, inspectable action
// instead of an opaque thunk function. The real setAlert returns a thunk
// (dispatch) => {...} that schedules a setTimeout; mocking it keeps the
// dispatch.mock.calls assertions meaningful and avoids leaking timers.
jest.mock('./alertAction', () => ({
  setAlert: jest.fn((message: string, type: string) => ({
    type: '__MOCK_SET_ALERT__',
    payload: { message, type },
  })),
}))

const mockedPost = axios.post as jest.MockedFunction<typeof axios.post>
const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>
const mockedSetAlert = setAlert as jest.MockedFunction<typeof setAlert>

const jsonConfig = { headers: { 'Content-Type': 'application/json' } }

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  // clearAllMocks wipes the implementation, so re-establish it each test.
  mockedSetAlert.mockImplementation(((message: string, type: string) => ({
    type: '__MOCK_SET_ALERT__',
    payload: { message, type },
  })) as unknown as typeof setAlert)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('register thunk', () => {
  it('posts the user to /api/auth/register and dispatches REGISTER_SUCCESS on success', async () => {
    const user = { email: 'a@b.com', password: 'secret' }
    const responseData = { id: '1', email: 'a@b.com' }
    mockedPost.mockResolvedValueOnce({ data: responseData })
    const dispatch = jest.fn()

    const result = await register(user)(dispatch)

    expect(mockedPost).toHaveBeenCalledWith(
      '/api/auth/register',
      user,
      jsonConfig,
    )
    expect(dispatch).toHaveBeenCalledWith({
      type: REGISTER_SUCCESS,
      payload: responseData,
    })
    expect(result).toEqual(responseData)
  })

  it('dispatches REGISTER_FAIL with the server message on error', async () => {
    mockedPost.mockRejectedValueOnce({
      response: { data: { message: 'Email already in use' } },
    })
    const dispatch = jest.fn()

    const result = await register({ email: 'a@b.com' })(dispatch)

    expect(dispatch).toHaveBeenCalledWith({
      type: REGISTER_FAIL,
      payload: 'Email already in use',
    })
    // Failure path returns undefined (no explicit return in catch).
    expect(result).toBeUndefined()
  })

  it('dispatches REGISTER_FAIL with undefined payload when error has no response message', async () => {
    mockedPost.mockRejectedValueOnce(new Error('Network down'))
    const dispatch = jest.fn()

    await register({})(dispatch)

    expect(dispatch).toHaveBeenCalledWith({
      type: REGISTER_FAIL,
      payload: undefined,
    })
  })
})

describe('login thunk', () => {
  it('posts email and password to /api/auth/login and dispatches LOGIN_SUCCESS on success', async () => {
    const responseData = { token: 'abc123', user: { id: '1' } }
    mockedPost.mockResolvedValueOnce({ data: responseData })
    const dispatch = jest.fn()

    const result = await login('a@b.com', 'secret')(dispatch)

    expect(mockedPost).toHaveBeenCalledWith(
      '/api/auth/login',
      { email: 'a@b.com', password: 'secret' },
      jsonConfig,
    )
    expect(dispatch).toHaveBeenCalledWith({
      type: LOGIN_SUCCESS,
      payload: responseData,
    })
    expect(result).toEqual(responseData)
  })

  it('dispatches LOGIN_FAIL with the server message on invalid credentials', async () => {
    mockedPost.mockRejectedValueOnce({
      response: { data: { message: 'Invalid credentials' } },
    })
    const dispatch = jest.fn()

    const result = await login('a@b.com', 'wrong')(dispatch)

    expect(dispatch).toHaveBeenCalledWith({
      type: LOGIN_FAIL,
      payload: 'Invalid credentials',
    })
    expect(result).toBeUndefined()
  })

  // NOTE: This thunk module does not call setAuthToken or persist a token to
  // localStorage on a successful login. Token storage happens elsewhere
  // (e.g. a reducer/interceptor). Documenting that absence here so a future
  // refactor knows it is not covered by this action.
})

describe('getProfile thunk', () => {
  it('gets /api/auth/profile and dispatches PROFILE_LOADED on success', async () => {
    const responseData = { id: '1', name: 'Jane' }
    mockedGet.mockResolvedValueOnce({ data: responseData })
    const dispatch = jest.fn()

    const result = await getProfile()(dispatch)

    expect(mockedGet).toHaveBeenCalledWith('/api/auth/profile', jsonConfig)
    expect(dispatch).toHaveBeenCalledWith({
      type: PROFILE_LOADED,
      payload: responseData,
    })
    expect(result).toEqual(responseData)
  })

  it('dispatches PROFILE_LOADED_FAIL and a danger alert on error', async () => {
    mockedGet.mockRejectedValueOnce({
      response: { data: { message: 'Unauthorized' } },
    })
    const dispatch = jest.fn()

    await getProfile()(dispatch)

    expect(dispatch).toHaveBeenCalledWith({
      type: PROFILE_LOADED_FAIL,
      payload: 'Unauthorized',
    })
    expect(mockedSetAlert).toHaveBeenCalledWith(
      'Er is iets misgegaan bij het laden van het profiel, probeer het nogmaals.',
      'danger',
    )
    // The alert action object (mocked) is dispatched.
    expect(dispatch).toHaveBeenCalledWith({
      type: '__MOCK_SET_ALERT__',
      payload: {
        message:
          'Er is iets misgegaan bij het laden van het profiel, probeer het nogmaals.',
        type: 'danger',
      },
    })
  })

  it('falls back to err.message for the fail payload when no response message exists', async () => {
    mockedGet.mockRejectedValueOnce(new Error('Network timeout'))
    const dispatch = jest.fn()

    await getProfile()(dispatch)

    expect(dispatch).toHaveBeenCalledWith({
      type: PROFILE_LOADED_FAIL,
      payload: 'Network timeout',
    })
  })
})

describe('updateProfile thunk', () => {
  it('posts the user to /api/auth/profile, dispatches PROFILE_UPDATED_SUCCESS and an info alert', async () => {
    const user = { name: 'Jane', email: 'jane@b.com' }
    const responseData = { id: '1', name: 'Jane' }
    mockedPost.mockResolvedValueOnce({ data: responseData })
    const dispatch = jest.fn()

    const result = await updateProfile(user)(dispatch)

    expect(mockedPost).toHaveBeenCalledWith(
      '/api/auth/profile',
      user,
      jsonConfig,
    )
    expect(dispatch).toHaveBeenCalledWith({
      type: PROFILE_UPDATED_SUCCESS,
      payload: responseData,
    })
    expect(mockedSetAlert).toHaveBeenCalledWith(
      'Het profiel is succesvol opgeslagen.',
      'info',
    )
    expect(result).toEqual(responseData)
  })

  it('dispatches PROFILE_UPDATED_FAIL and a danger alert on error', async () => {
    mockedPost.mockRejectedValueOnce({
      response: { data: { message: 'Validation failed' } },
    })
    const dispatch = jest.fn()

    const result = await updateProfile({})(dispatch)

    expect(dispatch).toHaveBeenCalledWith({
      type: PROFILE_UPDATED_FAIL,
      payload: 'Validation failed',
    })
    expect(mockedSetAlert).toHaveBeenCalledWith(
      'Er is iets misgegaan bij het opslaan van het profiel.',
      'danger',
    )
    expect(result).toBeUndefined()
  })
})
