import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test-utils'
import { register } from '../../redux/_actions/authAction'

jest.mock('../../redux/_actions/authAction', () => ({
  register: jest.fn(),
}))

import Register from './Register'

describe('Register', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest
      .mocked(register)
      .mockReturnValue((() => Promise.resolve({ _id: 'u1' })) as ReturnType<
        typeof register
      >)
  })

  it('renders fields and submit button', () => {
    renderWithProviders(<Register />)
    expect(screen.getByPlaceholderText('Naam')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Bedrijfsnaam')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Registreren' }),
    ).toBeInTheDocument()
  })

  it('dispatches register with the entered user on valid submit', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Register />)
    await user.type(screen.getByPlaceholderText('Naam'), 'Jan Jansen')
    await user.type(screen.getByPlaceholderText('Email'), 'jan@example.com')
    await user.type(screen.getByPlaceholderText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Registreren' }))
    await waitFor(() =>
      expect(register).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Jan Jansen',
          email: 'jan@example.com',
          password: 'secret123',
        }),
      ),
    )
  })

  it('does not call register when required fields are empty', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Register />)
    await user.click(screen.getByRole('button', { name: 'Registreren' }))
    expect(register).not.toHaveBeenCalled()
  })
})
