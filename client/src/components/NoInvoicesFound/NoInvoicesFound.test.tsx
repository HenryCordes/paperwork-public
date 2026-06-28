import { renderWithProviders, screen } from '../../test-utils'
import NoInvoicesFound from './NoInvoicesFound'

describe('NoInvoicesFound', () => {
  it('renders the empty-state message and a create link', () => {
    renderWithProviders(<NoInvoicesFound />)
    expect(screen.getByText('Geen facturen gevonden...')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Nieuwe factuur/i }),
    ).toHaveAttribute('href', '/invoice/create')
  })
})
