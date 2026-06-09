import { AnyAction } from 'redux'
import { ThunkDispatch } from 'redux-thunk'

// Thunk-aware dispatch: accepts plain actions and thunk action creators.
// State/extra are left as `unknown` until the store is fully typed.
export type AppDispatch = ThunkDispatch<unknown, unknown, AnyAction>

// Loose shape for axios-style errors handled in action catch blocks.
export interface ApiError {
  response?: { data?: { message?: string; [key: string]: unknown } }
  message?: string
}
