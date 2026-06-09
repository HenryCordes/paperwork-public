jest.mock('current-year', () => ({ __esModule: true, default: () => 2099 }))

import { renderWithProviders, screen } from '../../test-utils'
import Footer from './Footer'

describe('Footer', () => {
  it('renders the copyright line with the current year', () => {
    renderWithProviders(<Footer />)
    expect(screen.getByText(/© 2099 - paperwork/)).toBeInTheDocument()
  })
})
