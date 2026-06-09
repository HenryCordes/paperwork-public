import { Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test-utils'
import { usePlans } from '../../hooks/api/usePlans'
import { useRegister, useCreateSubscription } from '../../hooks/api/useAuth'

jest.mock('../../hooks/api/usePlans', () => ({ usePlans: jest.fn() }))
jest.mock('../../hooks/api/useAuth', () => ({
  useRegister: jest.fn(),
  useCreateSubscription: jest.fn(),
}))

import Subscribe from './Subscribe'

const plan = {
  id: 'essentials',
  name: 'Essentials',
  price: 9.99,
  currency: 'EUR',
  description: 'Basis',
  interval: '1 month',
}

describe('Subscribe', () => {
  let registerUser: jest.Mock
  let createSubscription: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    registerUser = jest.fn().mockResolvedValue({ success: false })
    createSubscription = jest.fn().mockResolvedValue({})
    ;(usePlans as jest.Mock).mockReturnValue({ data: [plan], isLoading: false })
    ;(useRegister as jest.Mock).mockReturnValue({ mutateAsync: registerUser })
    ;(useCreateSubscription as jest.Mock).mockReturnValue({
      mutateAsync: createSubscription,
    })
  })

  it('renders the form once plans load', () => {
    renderWithProviders(<Subscribe />)
    expect(screen.getByPlaceholderText('Naam')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Bedrijfsnaam')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Wachtwoord')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Schrijf mij in!' }),
    ).toBeInTheDocument()
  })

  it('valid submit calls registerUser with the entered data', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Subscribe />)
    await user.type(screen.getByPlaceholderText('Naam'), 'Jan Jansen')
    await user.type(screen.getByPlaceholderText('Email'), 'jan@example.com')
    await user.type(screen.getByPlaceholderText('Wachtwoord'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Schrijf mij in!' }))
    await waitFor(() =>
      expect(registerUser).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Jan Jansen',
          email: 'jan@example.com',
        }),
      ),
    )
  })

  it('empty submit shows validation errors and does not call registerUser', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Subscribe />)
    await user.click(screen.getByRole('button', { name: 'Schrijf mij in!' }))
    expect(await screen.findByText('Voer je naam in')).toBeInTheDocument()
    expect(screen.getByText('Voer je email in')).toBeInTheDocument()
    expect(registerUser).not.toHaveBeenCalled()
  })
})

const yearlyPlan = {
  id: 'essentials yearly',
  name: 'Essentials Yearly',
  price: 99.99,
  currency: 'EUR',
  description: 'Jaarlijks',
  interval: '12 months',
}

// Reassigning window.location.href triggers a jsdom "navigation not
// implemented" error and cannot be observed, so replace location with a
// plain object whose href we can read after the component sets it.
const stubLocation = () => {
  const original = window.location
  const location = { ...original, href: '', origin: original.origin }
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: location,
  })
  return {
    location,
    restore: () =>
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: original,
      }),
  }
}

const fillForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByPlaceholderText('Naam'), 'Jan Jansen')
  await user.type(screen.getByPlaceholderText('Email'), 'jan@example.com')
  await user.type(screen.getByPlaceholderText('Wachtwoord'), 'secret123')
  await user.click(screen.getByRole('button', { name: 'Schrijf mij in!' }))
}

describe('Subscribe — additional behavior', () => {
  let registerUser: jest.Mock
  let createSubscription: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useRealTimers()
    localStorage.clear()
    registerUser = jest.fn().mockResolvedValue({ success: false })
    createSubscription = jest.fn().mockResolvedValue({})
    ;(usePlans as jest.Mock).mockReturnValue({
      data: [plan, yearlyPlan],
      isLoading: false,
    })
    ;(useRegister as jest.Mock).mockReturnValue({ mutateAsync: registerUser })
    ;(useCreateSubscription as jest.Mock).mockReturnValue({
      mutateAsync: createSubscription,
    })
  })

  describe('plan selection', () => {
    it('shows a loading spinner while plans are loading', () => {
      ;(usePlans as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: true,
      })
      renderWithProviders(<Subscribe />)
      expect(
        screen.getByText('Abonnementsgegevens laden...'),
      ).toBeInTheDocument()
      expect(screen.queryByPlaceholderText('Naam')).not.toBeInTheDocument()
    })

    it('defaults to the monthly essentials plan when no plan route param', async () => {
      renderWithProviders(<Subscribe />)
      expect(await screen.findByText('Essentials')).toBeInTheDocument()
    })

    it('selects the yearly plan when the route param is "year"', async () => {
      renderWithProviders(
        <Routes>
          <Route path="/subscribe/:plan" element={<Subscribe />} />
        </Routes>,
        { initialEntries: ['/subscribe/year'] },
      )
      expect(await screen.findByText('Essentials Yearly')).toBeInTheDocument()
    })

    it('renders the form even when the requested plan is not found', async () => {
      // planParam !== "year" resolves to id "essentials"; remove it so the
      // find() returns undefined and selectedPlan stays null.
      ;(usePlans as jest.Mock).mockReturnValue({
        data: [yearlyPlan],
        isLoading: false,
      })
      renderWithProviders(<Subscribe />)
      // Form still renders; the plan card heading is empty (selectedPlan null).
      expect(await screen.findByPlaceholderText('Naam')).toBeInTheDocument()
      expect(screen.queryByText('Essentials')).not.toBeInTheDocument()
    })
  })

  describe('success path', () => {
    it('creates a subscription with plan data and redirects to the checkout link', async () => {
      const { location, restore } = stubLocation()
      try {
        registerUser.mockResolvedValue({
          success: true,
          userId: 'user-1',
          organizationId: 'org-1',
        })
        createSubscription.mockResolvedValue({
          _links: { checkout: { href: 'https://pay.example/checkout' } },
        })
        const user = userEvent.setup()
        renderWithProviders(<Subscribe />)
        await fillForm(user)

        await waitFor(
          () => expect(createSubscription).toHaveBeenCalledTimes(1),
          { timeout: 3000 },
        )
        const arg = createSubscription.mock.calls[0][0]
        expect(arg).toMatchObject({
          _id: 'user-1',
          organizationId: 'org-1',
          name: 'Jan Jansen',
          email: 'jan@example.com',
          plan: 'Essentials',
          price: 9.99,
          currency: 'EUR',
          description: 'Basis',
          interval: '1 month',
        })
        expect(arg.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)

        await waitFor(
          () => expect(location.href).toBe('https://pay.example/checkout'),
          { timeout: 3000 },
        )
      } finally {
        restore()
      }
    })

    it('falls back to paymentUrl when no checkout link is present', async () => {
      const { location, restore } = stubLocation()
      try {
        registerUser.mockResolvedValue({ success: true, userId: 'u' })
        createSubscription.mockResolvedValue({
          paymentUrl: 'https://pay.example/fallback',
        })
        const user = userEvent.setup()
        renderWithProviders(<Subscribe />)
        await fillForm(user)
        await waitFor(
          () => expect(location.href).toBe('https://pay.example/fallback'),
          { timeout: 3000 },
        )
      } finally {
        restore()
      }
    })

    it('alerts when the subscription response has no payment link', async () => {
      registerUser.mockResolvedValue({ success: true, userId: 'u' })
      createSubscription.mockResolvedValue({ somethingElse: true })
      const user = userEvent.setup()
      const { store } = renderWithProviders(<Subscribe />)
      await fillForm(user)
      await waitFor(
        () =>
          expect(store.getState().alert).toContainEqual(
            expect.objectContaining({
              message:
                'De link naar het betaalgedeelte is niet geldig, hierdoor kunnen we je niet doorverwijzen',
              type: 'danger',
            }),
          ),
        { timeout: 3000 },
      )
    })

    it('alerts when createSubscription rejects', async () => {
      registerUser.mockResolvedValue({ success: true, userId: 'u' })
      createSubscription.mockRejectedValue(new Error('boom'))
      const user = userEvent.setup()
      const { store } = renderWithProviders(<Subscribe />)
      await fillForm(user)
      await waitFor(
        () =>
          expect(store.getState().alert).toContainEqual(
            expect.objectContaining({
              message:
                'Er is iets misgegaan met het doorverwijzen naar het betaalgedeelte',
              type: 'danger',
            }),
          ),
        { timeout: 3000 },
      )
    })

    it('does not create a subscription when registration is unsuccessful', async () => {
      registerUser.mockResolvedValue({ success: false })
      const user = userEvent.setup()
      renderWithProviders(<Subscribe />)
      await fillForm(user)
      await waitFor(() => expect(registerUser).toHaveBeenCalled())
      expect(createSubscription).not.toHaveBeenCalled()
    })
  })

  describe('registration error handling', () => {
    it('alerts the generic message when registration throws without a 409', async () => {
      registerUser.mockRejectedValue(new Error('network down'))
      const user = userEvent.setup()
      const { store } = renderWithProviders(<Subscribe />)
      await fillForm(user)
      await waitFor(() =>
        expect(store.getState().alert).toContainEqual(
          expect.objectContaining({
            message:
              'Er is iets misgegaan bij het registreren. Probeer het nogmaals.',
            type: 'danger',
          }),
        ),
      )
      expect(createSubscription).not.toHaveBeenCalled()
    })

    it('alerts the duplicate-account message on a 409 without an incomplete code', async () => {
      registerUser.mockRejectedValue({
        response: { status: 409, data: { code: 'OTHER' } },
      })
      const user = userEvent.setup()
      const { store } = renderWithProviders(<Subscribe />)
      await fillForm(user)
      await waitFor(() =>
        expect(store.getState().alert).toContainEqual(
          expect.objectContaining({
            message:
              'Er is al een account met dit email adres. Neem contact op met support',
            type: 'danger',
          }),
        ),
      )
    })

    it('uses the server message and redirects to /login on INCOMPLETE_REGISTRATION', async () => {
      const { location, restore } = stubLocation()
      jest.useFakeTimers()
      try {
        registerUser.mockRejectedValue({
          response: {
            status: 409,
            data: {
              code: 'INCOMPLETE_REGISTRATION',
              message: 'Registratie is niet afgerond',
            },
          },
        })
        const user = userEvent.setup({
          advanceTimers: jest.advanceTimersByTime,
        })
        const { store } = renderWithProviders(<Subscribe />)
        await fillForm(user)
        await waitFor(() =>
          expect(store.getState().alert).toContainEqual(
            expect.objectContaining({
              message: 'Registratie is niet afgerond',
              type: 'danger',
            }),
          ),
        )
        expect(location.href).toBe('')
        jest.advanceTimersByTime(4000)
        expect(location.href).toBe('/login')
      } finally {
        jest.useRealTimers()
        restore()
      }
    })

    it('alerts the duplicate-account message when the error message is a 409 string', async () => {
      registerUser.mockRejectedValue({
        message: 'Request failed with status code 409',
      })
      const user = userEvent.setup()
      const { store } = renderWithProviders(<Subscribe />)
      await fillForm(user)
      await waitFor(() =>
        expect(store.getState().alert).toContainEqual(
          expect.objectContaining({
            message:
              'Er is al een account met dit email adres. Neem contact op met support',
            type: 'danger',
          }),
        ),
      )
    })
  })
})
