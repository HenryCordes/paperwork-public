import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux'

import rootReducers from './_reducers'
import { AppDispatch } from './types'

// Root state shape derived from the combined reducers.
export type RootState = ReturnType<typeof rootReducers>

// Thunk-aware dispatch hook (accepts thunk action creators).
export const useAppDispatch = () => useDispatch<AppDispatch>()

// Typed selector hook for reading from the store.
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector

// Augment react-redux's default state so plain `useSelector((state) => ...)`
// calls in components are typed against the store shape without rewiring each
// one to useAppSelector.
declare module 'react-redux' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface DefaultRootState extends RootState {}
}
