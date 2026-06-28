import { renderWithProviders, screen } from '../../test-utils'
import NoNotesFound from './NoNotesFound'

describe('NoNotesFound', () => {
  it('renders the empty-state message and a create link', () => {
    renderWithProviders(<NoNotesFound />)
    expect(screen.getByText('Geen notities gevonden...')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Nieuwe notitie/i }),
    ).toHaveAttribute('href', '/note/create')
  })
})
