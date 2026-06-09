import { v4 as uuidv4 } from 'uuid'

import { SET_ALERT, REMOVE_ALERT } from '../alertTypes'
import { AppDispatch } from '../types'

export const setAlert =
  (message: string, type: string, timeout = 3000) =>
  (dispatch: AppDispatch) => {
    const id = uuidv4()
    dispatch({ type: SET_ALERT, payload: { message, type, id } })
    setTimeout(() => {
      dispatch({ type: REMOVE_ALERT, payload: id })
    }, timeout)
  }
