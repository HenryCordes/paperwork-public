import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test-utils'
import PasswordReset from './PasswordReset'

const okJson = (
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): Pick<Response, 'ok' | 'status' | 'json'> => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  json: () => Promise.resolve(body),
})

describe('PasswordReset', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    global.fetch = jest.fn()
  })
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('renders the step 1 email and reset-code fields + button', () => {
    renderWithProviders(<PasswordReset />)
    expect(
      screen.getByPlaceholderText('Voer je email adres in'),
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Voer de 6-cijferige code in'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Valideer Reset Code' }),
    ).toBeInTheDocument()
  })

  it('advances to step 2 when the reset code validates', async () => {
    const user = userEvent.setup()
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(
      okJson(
        { message: 'Voer een nieuw wachtwoord in' },
        { ok: false, status: 400 },
      ),
    )
    renderWithProviders(<PasswordReset />)
    await user.type(
      screen.getByPlaceholderText('Voer je email adres in'),
      'jan@example.com',
    )
    await user.type(
      screen.getByPlaceholderText('Voer de 6-cijferige code in'),
      'ABC123',
    )
    await user.click(
      screen.getByRole('button', { name: 'Valideer Reset Code' }),
    )
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/reset-password',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(
      await screen.findByPlaceholderText(
        'Nieuw wachtwoord (minimaal 6 karakters)',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Wijzig Wachtwoord' }),
    ).toBeInTheDocument()
  })

  it('shows validation errors and does not fetch when step 1 is empty', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PasswordReset />)
    await user.click(
      screen.getByRole('button', { name: 'Valideer Reset Code' }),
    )
    expect(
      await screen.findByText('Email adres is verplicht'),
    ).toBeInTheDocument()
    expect(screen.getByText('Reset code is verplicht')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  describe('step 2 (set new password)', () => {
    // Drives the step-1 validation that flips the component to step 2.
    // The component treats a 400 whose message mentions "wachtwoord" as a
    // valid token, so we reply with that to land on the password form.
    const advanceToStep2 = async (
      user: ReturnType<typeof userEvent.setup>,
    ): Promise<void> => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(
        okJson(
          { message: 'Voer een nieuw wachtwoord in' },
          { ok: false, status: 400 },
        ),
      )
      await user.type(
        screen.getByPlaceholderText('Voer je email adres in'),
        'jan@example.com',
      )
      await user.type(
        screen.getByPlaceholderText('Voer de 6-cijferige code in'),
        'abc123',
      )
      await user.click(
        screen.getByRole('button', { name: 'Valideer Reset Code' }),
      )
      await screen.findByPlaceholderText(
        'Nieuw wachtwoord (minimaal 6 karakters)',
      )
      // Drop the step-1 fetch so step-2 assertions see only their own call.
      ;(global.fetch as jest.Mock).mockClear()
    }

    // FIXME(step-switch-field-bleed): switching from step 1 to step 2 reuses
    // the same uncontrolled <input> DOM nodes, so the email/token text typed in
    // step 1 stays in the value of the password/confirm fields. The component
    // never resets the form on step change. We clear() before typing so these
    // tests exercise the intended step-2 logic; the bleed itself is pinned by
    // the dedicated characterization test below.
    const enterNewPassword = async (
      user: ReturnType<typeof userEvent.setup>,
      password: string,
      confirm: string,
    ): Promise<void> => {
      const passwordField = screen.getByPlaceholderText(
        'Nieuw wachtwoord (minimaal 6 karakters)',
      )
      const confirmField = screen.getByPlaceholderText(
        'Bevestig je nieuwe wachtwoord',
      )
      await user.clear(passwordField)
      await user.clear(confirmField)
      await user.type(passwordField, password)
      await user.type(confirmField, confirm)
    }

    it('renders the step 2 password fields and confirms the validated email', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PasswordReset />)
      await advanceToStep2(user)

      expect(
        screen.getByPlaceholderText('Nieuw wachtwoord (minimaal 6 karakters)'),
      ).toBeInTheDocument()
      expect(
        screen.getByPlaceholderText('Bevestig je nieuwe wachtwoord'),
      ).toBeInTheDocument()
      expect(screen.getByText('jan@example.com')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Terug naar Reset Code' }),
      ).toBeInTheDocument()
    })

    it('posts the new password with the validated email + uppercased token on submit', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PasswordReset />)
      await advanceToStep2(user)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(
        okJson({ success: true }),
      )

      await enterNewPassword(user, 'newpass123', 'newpass123')
      await user.click(
        screen.getByRole('button', { name: 'Wijzig Wachtwoord' }),
      )

      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [
        string,
        RequestInit,
      ]
      expect(url).toBe('/api/auth/reset-password')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({
        email: 'jan@example.com',
        resetToken: 'ABC123',
        newPassword: 'newpass123',
      })
    })

    it('dispatches the success alert when the reset succeeds', async () => {
      const user = userEvent.setup()
      const { store } = renderWithProviders(<PasswordReset />)
      await advanceToStep2(user)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(
        okJson({ success: true }),
      )

      await enterNewPassword(user, 'newpass123', 'newpass123')
      await user.click(
        screen.getByRole('button', { name: 'Wijzig Wachtwoord' }),
      )

      await waitFor(() =>
        expect(
          store
            .getState()
            .alert.some(
              (a) =>
                a.type === 'success' &&
                a.message?.includes('Wachtwoord succesvol gewijzigd'),
            ),
        ).toBe(true),
      )
    })

    it('blocks submit and shows an inline error when the passwords do not match', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PasswordReset />)
      await advanceToStep2(user)

      await enterNewPassword(user, 'newpass123', 'different123')
      await user.click(
        screen.getByRole('button', { name: 'Wijzig Wachtwoord' }),
      )

      expect(
        await screen.findByText('Wachtwoorden komen niet overeen'),
      ).toBeInTheDocument()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('returns to step 1 and clears the email when the token has expired', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PasswordReset />)
      await advanceToStep2(user)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(
        okJson({ success: false, message: 'Reset code is verlopen' }),
      )

      await enterNewPassword(user, 'newpass123', 'newpass123')
      await user.click(
        screen.getByRole('button', { name: 'Wijzig Wachtwoord' }),
      )

      // Step-1 controls reappear, proving the expired-token branch reset step.
      expect(
        await screen.findByPlaceholderText('Voer je email adres in'),
      ).toBeInTheDocument()
      expect(
        screen.queryByPlaceholderText(
          'Nieuw wachtwoord (minimaal 6 karakters)',
        ),
      ).not.toBeInTheDocument()
    })

    // FIXME(step-switch-field-bleed): the step-1 inputs and step-2 inputs occupy
    // the same positions in the JSX, so React reuses the uncontrolled <input>
    // DOM nodes when `step` flips to 2. The text typed for email/token is never
    // cleared and leaks into the password/confirm fields. This test pins the
    // current (buggy) behavior: without an intervening clear(), typing a new
    // password lands on top of the leftover step-1 value. A fix should reset the
    // form on step change (e.g. react-hook-form `reset()` or keyed remount); when
    // that lands, this test should flip to asserting the fields start empty.
    it('leaks step-1 input text into the step-2 password fields (current behavior)', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PasswordReset />)
      await advanceToStep2(user)

      const passwordField = screen.getByPlaceholderText(
        'Nieuw wachtwoord (minimaal 6 karakters)',
      ) as HTMLInputElement
      const confirmField = screen.getByPlaceholderText(
        'Bevestig je nieuwe wachtwoord',
      ) as HTMLInputElement

      // Step-1 typed 'jan@example.com' into email and 'abc123' into the token.
      expect(passwordField.value).toBe('jan@example.com')
      expect(confirmField.value).toBe('abc123')
    })
  })
})
