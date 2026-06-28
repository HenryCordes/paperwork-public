import { AnyAction } from 'redux'

import { SET_ALERT, REMOVE_ALERT } from '../alertTypes'

interface Alert {
  id: string
  message?: string
  type?: string
}

const initialState: Alert[] = []

const alertReducer = (
  state: Alert[] = initialState,
  action: AnyAction,
): Alert[] => {
  switch (action.type) {
    case SET_ALERT:
      return [...state, action.payload]
    case REMOVE_ALERT:
      return state.filter((alert) => alert.id !== action.payload)
    default:
      return state
  }
}

export default alertReducer
