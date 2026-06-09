import reducer from './authReducer'
import {
  USER_LOADED,
  LOGIN_SUCCESS,
  LOGIN_FAIL,
  LOGOUT,
  PROFILE_LOADED,
} from '../authTypes'
import { CLEAR_ERRORS } from '../alertTypes'
import setAuthToken from '../../utils/setAuthToken'

jest.mock('../../utils/setAuthToken')

const base = {
  isAuthenticated: false,
  user: null,
  token: null,
  error: null,
  loading: true,
}

describe('authReducer', () => {
  beforeEach(() => {
    localStorage.clear()
    jest.clearAllMocks()
  })

  it('USER_LOADED authenticates and sets the user', () => {
    const next = reducer(base, { type: USER_LOADED, payload: { name: 'Jan' } })
    expect(next.isAuthenticated).toBe(true)
    expect(next.loading).toBe(false)
    expect(next.user).toEqual({ name: 'Jan' })
  })

  it('LOGIN_SUCCESS stores the token and calls setAuthToken', () => {
    const next = reducer(base, {
      type: LOGIN_SUCCESS,
      payload: { token: 'jwt-123' },
    })
    expect(next.isAuthenticated).toBe(true)
    expect(localStorage.getItem('token')).toBe('jwt-123')
    expect(setAuthToken).toHaveBeenCalledWith('jwt-123')
  })

  it('LOGIN_FAIL clears auth and records the error', () => {
    const next = reducer(
      { ...base, isAuthenticated: true },
      { type: LOGIN_FAIL, payload: 'bad creds' },
    )
    expect(next.isAuthenticated).toBe(false)
    expect(next.error).toBe('bad creds')
  })

  it('LOGOUT removes the token and resets auth', () => {
    localStorage.setItem('token', 'jwt-123')
    const next = reducer(
      {
        ...base,
        isAuthenticated: true,
        user: { name: 'Jan' },
        token: 'jwt-123',
      },
      { type: LOGOUT },
    )
    expect(localStorage.getItem('token')).toBeNull()
    expect(next.isAuthenticated).toBe(false)
    expect(next.user).toBeNull()
    expect(next.token).toBeNull()
  })

  it('CLEAR_ERRORS nulls the error', () => {
    const next = reducer({ ...base, error: 'x' }, { type: CLEAR_ERRORS })
    expect(next.error).toBeNull()
  })

  it('PROFILE_LOADED sets the user from payload.data', () => {
    const next = reducer(base, {
      type: PROFILE_LOADED,
      payload: { data: { name: 'Piet' } },
    })
    expect(next.user).toEqual({ name: 'Piet' })
    expect(next.isAuthenticated).toBe(true)
  })

  it('returns the same reference for an unknown action', () => {
    const state = Object.freeze({ ...base })
    expect(reducer(state, { type: 'NOPE' })).toBe(state)
  })
})
