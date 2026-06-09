import reducer from './alertReducer'
import { SET_ALERT, REMOVE_ALERT } from '../alertTypes'

describe('alertReducer', () => {
  it('returns the initial state (empty array) for an unknown action', () => {
    expect(reducer(undefined, { type: 'UNKNOWN' })).toEqual([])
  })

  it('SET_ALERT appends the payload', () => {
    const next = reducer([], {
      type: SET_ALERT,
      payload: { id: '1', message: 'hi' },
    })
    expect(next).toEqual([{ id: '1', message: 'hi' }])
  })

  it('REMOVE_ALERT removes the alert with the matching id', () => {
    const state = [
      { id: '1', message: 'a' },
      { id: '2', message: 'b' },
    ]
    expect(reducer(state, { type: REMOVE_ALERT, payload: '1' })).toEqual([
      { id: '2', message: 'b' },
    ])
  })

  it('returns the same reference for an unknown action', () => {
    // Frozen at runtime (so a mutating reducer throws) but typed mutable to
    // satisfy the reducer's Alert[] parameter.
    const state = Object.freeze([{ id: '1' }]) as Array<{ id: string }>

    expect(reducer(state, { type: 'NOPE' })).toBe(state)
  })

  it('does not mutate the input state', () => {
    // Frozen at runtime (so a mutating reducer throws) but typed mutable to
    // satisfy the reducer's Alert[] parameter.
    const state = Object.freeze([{ id: '1' }]) as Array<{ id: string }>

    expect(() =>
      reducer(state, { type: SET_ALERT, payload: { id: '2' } }),
    ).not.toThrow()
  })
})
