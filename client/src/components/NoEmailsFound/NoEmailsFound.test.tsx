import { renderWithProviders, screen } from '../../test-utils'
import NoEmailsFound from './NoEmailsFound'

describe('NoEmailsFound', () => {
  it('renders the empty-state message and a create link', () => {
    renderWithProviders(<NoEmailsFound />)
    expect(screen.getByText('Geen emails gevonden...')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nieuwe email/i })).toHaveAttribute(
      'href',
      '/email/create',
    )
  })
})
