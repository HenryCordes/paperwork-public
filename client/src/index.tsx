import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createStore, applyMiddleware, compose } from 'redux'
import { Provider } from 'react-redux'
import rootReducers from './redux/_reducers'
import thunk from 'redux-thunk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TagManager from 'react-gtm-module'

const tagManagerArgs = {
  gtmId: process.env.REACT_APP_TAG_MANAGER_ID,
}
const middlewares = [thunk]

const composeEnhancers =
  (
    window as typeof window & {
      __REDUX_DEVTOOLS_EXTENSION_COMPOSE__?: typeof compose
    }
  ).__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose

const store = createStore(
  rootReducers,
  composeEnhancers(applyMiddleware(...middlewares)),
)

// Create a new query client instance with caching configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000, // 1 minute
      gcTime: 300000, // 5 minutes (v5 rename of cacheTime; same as the v5 default)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

// Create a root using the new createRoot API
const root = createRoot(document.getElementById('root')!)

TagManager.initialize(tagManagerArgs)

// Render the app to the root
root.render(
  <Provider store={store}>
    <QueryClientProvider client={queryClient}>
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </QueryClientProvider>
  </Provider>,
)
