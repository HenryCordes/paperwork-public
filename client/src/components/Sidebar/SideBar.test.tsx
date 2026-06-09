const mockUseSubscriptionStatus = jest.fn()
jest.mock('../../utils/useSubscriptionStatus', () => ({
  useSubscriptionStatus: () => mockUseSubscriptionStatus(),
}))

import { renderWithProviders, screen } from '../../test-utils'
import SideBar from './SideBar'

describe('SideBar', () => {
  it('renders the company name', () => {
    mockUseSubscriptionStatus.mockReturnValue({
      loading: false,
      hasActiveSubscription: true,
    })
    renderWithProviders(<SideBar companyName="Acme BV" />)
    expect(screen.getByText('Acme BV')).toBeInTheDocument()
  })

  it('shows subscription-gated links when active', () => {
    mockUseSubscriptionStatus.mockReturnValue({
      loading: false,
      hasActiveSubscription: true,
    })
    renderWithProviders(<SideBar />)
    expect(screen.getByRole('link', { name: /Dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard',
    )
  })

  it('hides subscription-gated links when there is no active subscription', () => {
    mockUseSubscriptionStatus.mockReturnValue({
      loading: false,
      hasActiveSubscription: false,
    })
    renderWithProviders(<SideBar />)
    expect(
      screen.queryByRole('link', { name: /Dashboard/i }),
    ).not.toBeInTheDocument()
  })
})
