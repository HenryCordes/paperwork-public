import { renderWithProviders, screen } from '../../test-utils'
import NoExpensesFound from './NoExpensesFound'

describe('NoExpensesFound', () => {
  it('renders the empty-state message and a create link', () => {
    renderWithProviders(<NoExpensesFound />)
    expect(screen.getByText('Geen kosten gevonden...')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Nieuwe kosten/i }),
    ).toHaveAttribute('href', '/expense/create')
  })
})
