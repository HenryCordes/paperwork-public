import { createStore, applyMiddleware, compose } from 'redux'
import thunk from 'redux-thunk'
import rootReducers from './_reducers'

// Redux middleware
const middlewares = [thunk]

// Redux DevTools setup
const composeEnhancers =
  (typeof window !== 'undefined' &&
    (
      window as typeof window & {
        __REDUX_DEVTOOLS_EXTENSION_COMPOSE__?: typeof compose
      }
    ).__REDUX_DEVTOOLS_EXTENSION_COMPOSE__) ||
  compose

// Create store with middleware
export const store = createStore(
  rootReducers,
  composeEnhancers(applyMiddleware(...middlewares)),
)
