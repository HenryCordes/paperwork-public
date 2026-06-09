jest.mock('../PublicNavigation/PublicNavigation', () => () => (
  <div>public-nav</div>
))
jest.mock('../AuthenticatedNavigation/AuthenticatedNavigation', () => () => (
  <div>authenticated-nav</div>
))

import { renderWithProviders, screen } from '../../test-utils'
import Navigation from './Navigation'

describe('Navigation', () => {
  it('shows the public nav when not authenticated', () => {
    renderWithProviders(<Navigation />, {
      preloadedState: { auth: { isAuthenticated: false } as never },
    })
    expect(screen.getByText('public-nav')).toBeInTheDocument()
    expect(screen.queryByText('authenticated-nav')).not.toBeInTheDocument()
  })

  it('shows the authenticated nav when authenticated', () => {
    renderWithProviders(<Navigation />, {
      preloadedState: { auth: { isAuthenticated: true } as never },
    })
    expect(screen.getByText('authenticated-nav')).toBeInTheDocument()
    expect(screen.queryByText('public-nav')).not.toBeInTheDocument()
  })
})
