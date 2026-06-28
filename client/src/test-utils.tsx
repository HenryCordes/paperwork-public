import { ReactElement, ReactNode } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { createStore, applyMiddleware } from 'redux'
import thunk from 'redux-thunk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import rootReducers from './redux/_reducers'

type RootState = ReturnType<typeof rootReducers>

interface ProviderRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  preloadedState?: Partial<RootState>
  initialEntries?: string[]
}

export const makeStore = (preloadedState?: Partial<RootState>) =>
  createStore(
    rootReducers,
    preloadedState as RootState | undefined,
    applyMiddleware(thunk),
  )

export const renderWithProviders = (
  ui: ReactElement,
  {
    preloadedState,
    initialEntries = ['/'],
    ...options
  }: ProviderRenderOptions = {},
) => {
  const store = makeStore(preloadedState)
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <MemoryRouter
        initialEntries={initialEntries}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        {children}
      </MemoryRouter>
    </Provider>
  )
  return { store, ...render(ui, { wrapper: Wrapper, ...options }) }
}

export const createQueryWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const store = makeStore()
  return ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Provider>
  )
}

// Re-export RTL so tests import everything from one place.
export * from '@testing-library/react'
