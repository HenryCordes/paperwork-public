import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen } from '../../test-utils'
import LineItems from './LineItems'

const baseProps = () => ({
  items: [
    { id: '1', description: 'Item A', numberOfItems: 1 },
    { id: '2', description: 'Item B', numberOfItems: 2 },
  ],
  currencyFormatter: (n: number) => `EUR ${n}`,
  addHandler: jest.fn(),
  changeHandler: () => () => {},
  focusHandler: () => {},
  deleteHandler: () => () => {},
  reorderHandler: jest.fn(),
})

describe('LineItems', () => {
  it('renders an add-row button', () => {
    renderWithProviders(<LineItems {...baseProps()} />)
    expect(
      screen.getByRole('button', { name: /Nieuwe regel/i }),
    ).toBeInTheDocument()
  })

  it('calls addHandler when the add-row button is clicked', async () => {
    const props = baseProps()
    renderWithProviders(<LineItems {...props} />)
    await userEvent.click(screen.getByRole('button', { name: /Nieuwe regel/i }))
    expect(props.addHandler).toHaveBeenCalledTimes(1)
  })
})
