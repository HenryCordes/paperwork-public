import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen } from '../../test-utils'
import Reset from './Reset'

const okJson = (
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): Pick<Response, 'ok' | 'status' | 'json'> => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  json: () => Promise.resolve(body),
})

describe('Reset', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    global.fetch = jest.fn()
  })
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('renders the email field and submit button', () => {
    renderWithProviders(<Reset />)
    expect(
      screen.getByPlaceholderText('Voer je email adres in'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Wachtwoord wijzigen' }),
    ).toBeInTheDocument()
  })

  it('posts to forgot-password then shows the sent confirmation on success', async () => {
    const user = userEvent.setup()
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        okJson({
          success: true,
          message: 'Verstuurd',
          emailData: { to: 'jan@example.com' },
        }),
      )
      .mockResolvedValueOnce(okJson({}))

    renderWithProviders(<Reset />)
    await user.type(
      screen.getByPlaceholderText('Voer je email adres in'),
      'jan@example.com',
    )
    await user.click(
      screen.getByRole('button', { name: 'Wachtwoord wijzigen' }),
    )

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/forgot-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'jan@example.com' }),
      }),
    )
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/auth/send-reset-email',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(await screen.findByText('Email Verzonden!')).toBeInTheDocument()
  })

  it('shows a validation error and does not fetch when email is empty', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Reset />)
    await user.click(
      screen.getByRole('button', { name: 'Wachtwoord wijzigen' }),
    )
    expect(
      await screen.findByText('Email adres is verplicht'),
    ).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
