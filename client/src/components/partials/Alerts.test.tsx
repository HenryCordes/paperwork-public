import { renderWithProviders, screen } from '../../test-utils'
import Alerts from './Alerts'

describe('Alerts', () => {
  it('renders nothing when there are no alerts', () => {
    const { container } = renderWithProviders(<Alerts />, {
      preloadedState: { alert: [] },
    })
    expect(container.querySelectorAll('.alert')).toHaveLength(0)
  })

  it('renders one block per alert with its message and type class', () => {
    renderWithProviders(<Alerts />, {
      preloadedState: {
        alert: [
          { id: '1', message: 'Saved', type: 'success' },
          { id: '2', message: 'Boom', type: 'danger' },
        ],
      },
    })
    expect(screen.getByText('Saved')).toBeInTheDocument()
    const danger = screen.getByText('Boom').closest('.alert')
    expect(danger).toHaveClass('alert-danger')
  })
})
