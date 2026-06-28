import { renderWithProviders, screen } from '../../test-utils'
import NoContactFound from './NoContactFound'

describe('NoContactFound', () => {
  it('renders the empty-state message and a create link', () => {
    renderWithProviders(<NoContactFound />)
    expect(screen.getByText('Geen contacten gevonden...')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Nieuw contact/i })
    expect(link).toHaveAttribute('href', '/contact/create')
  })
})
