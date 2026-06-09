import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test-utils'
import { login, getProfile } from '../../redux/_actions/authAction'

jest.mock('../../redux/_actions/authAction', () => ({
  login: jest.fn(),
  getProfile: jest.fn(),
}))

import Login from './Login'

describe('Login', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest
      .mocked(login)
      .mockReturnValue(() => Promise.resolve({ success: false }))
    jest.mocked(getProfile).mockReturnValue(() => Promise.resolve(undefined))
  })

  it('renders the email/password fields and submit button', () => {
    renderWithProviders(<Login />)
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Wachtwoord')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Aanmelden' }),
    ).toBeInTheDocument()
  })

  it('dispatches login with the entered credentials on valid submit', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Login />)
    await user.type(screen.getByPlaceholderText('Email'), 'jan@example.com')
    await user.type(screen.getByPlaceholderText('Wachtwoord'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Aanmelden' }))
    expect(login).toHaveBeenCalledWith('jan@example.com', 'secret123')
  })

  it('shows validation errors and does not call login when fields are empty', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Login />)
    await user.click(screen.getByRole('button', { name: 'Aanmelden' }))
    expect(
      await screen.findByText('Voer je email adres in'),
    ).toBeInTheDocument()
    expect(screen.getByText('Voer een wachtwoord in')).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it('dispatches getProfile after a successful login', async () => {
    const user = userEvent.setup()
    jest
      .mocked(login)
      .mockReturnValue((() => Promise.resolve({ success: true })) as ReturnType<
        typeof login
      >)
    renderWithProviders(<Login />)
    await user.type(screen.getByPlaceholderText('Email'), 'jan@example.com')
    await user.type(screen.getByPlaceholderText('Wachtwoord'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Aanmelden' }))
    await waitFor(() => expect(getProfile).toHaveBeenCalled())
  })
})
