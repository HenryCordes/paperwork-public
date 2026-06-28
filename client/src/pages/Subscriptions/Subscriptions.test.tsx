import userEvent from '@testing-library/user-event'

import { renderWithProviders, screen, waitFor } from '../../test-utils'
import {
  useSubscriptionManagement,
  useCreateSubscription,
  useHandleSubscriptionPaymentIssue,
} from '../../hooks/api/useSubscriptions'

jest.mock('../../hooks/api/useSubscriptions')
jest.mock('../../components/Sidebar/SideBar', () => () => (
  <div data-testid="sidebar" />
))
jest.mock('../../components/Footer/Footer', () => () => (
  <div data-testid="footer" />
))

import Subscriptions from './Subscriptions'

type ManagementData = {
  availablePlans?: Array<Record<string, unknown>>
  subscriptions?: Array<Record<string, unknown>>
  activeSubscription?: Record<string, unknown> | null
  isNewUser?: boolean
  paymentOverdue?: boolean
  needsReactivation?: boolean
  hasActiveSubscription?: boolean
}

const mockedManagement = jest.mocked(useSubscriptionManagement)
const mockedCreate = jest.mocked(useCreateSubscription)
const mockedHandleIssue = jest.mocked(useHandleSubscriptionPaymentIssue)

// auth.loading must be false so the component leaves its loading branch.
const authedState = {
  auth: {
    isAuthenticated: true,
    user: { _id: 'user-1', name: 'Jan' },
    token: 'tok',
    error: null,
    loading: false,
  },
}

const setManagement = (data: ManagementData | undefined, isLoading = false) => {
  mockedManagement.mockReturnValue({
    data,
    isLoading,
  } as unknown as ReturnType<typeof useSubscriptionManagement>)
}

const createMutateAsync = jest.fn()
const handleMutateAsync = jest.fn()

const setCreate = (isPending = false) => {
  mockedCreate.mockReturnValue({
    mutateAsync: createMutateAsync,
    isPending,
  } as unknown as ReturnType<typeof useCreateSubscription>)
}

const setHandleIssue = (isPending = false) => {
  mockedHandleIssue.mockReturnValue({
    mutateAsync: handleMutateAsync,
    isPending,
  } as unknown as ReturnType<typeof useHandleSubscriptionPaymentIssue>)
}

const renderPage = (preloadedState: Record<string, unknown> = authedState) =>
  renderWithProviders(<Subscriptions />, {
    preloadedState: preloadedState as never,
  })

const newUserData: ManagementData = {
  isNewUser: true,
  subscriptions: [],
  availablePlans: [
    {
      id: 'plan-essentials',
      name: 'Essentials',
      price: '9.99',
      priceNL: '9,99',
      currency: 'EUR',
      interval: '1 month',
      intervalNL: 'Betaal per maand',
      description: 'Het basispakket',
    },
  ],
}

const paymentIssueData: ManagementData = {
  isNewUser: false,
  subscriptions: [
    {
      _id: 'sub-issue',
      subscriptionStatus: 'payment_issue',
      plan: 'Pro',
      paymentPrice: '19.99',
      paymentCurrency: 'EUR',
      paymentFailCount: 2,
      nextPaymentDate: '2026-01-15',
      subscriptionPayDate: '2025-12-15',
    },
  ],
  availablePlans: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  createMutateAsync.mockResolvedValue({})
  handleMutateAsync.mockResolvedValue({})
  setCreate()
  setHandleIssue()
  setManagement(undefined, true)
})

describe('Subscriptions', () => {
  it('shows the loading placeholder while subscription data is loading', () => {
    setManagement(undefined, true)
    renderPage()
    expect(screen.getByText('Gegevens laden...')).toBeInTheDocument()
  })

  it('renders the management heading and history once data has loaded', () => {
    setManagement({
      isNewUser: false,
      subscriptions: [
        {
          _id: 'sub-1',
          subscriptionStatus: 'active',
          plan: 'Pro',
          paymentPrice: '19.99',
          paymentCurrency: 'EUR',
          subscriptionPayDate: '2026-01-01',
          nextPaymentDate: '2026-02-01',
        },
      ],
      availablePlans: [],
      hasActiveSubscription: true,
    })
    renderPage()

    expect(screen.getByText('Abonnementsbeheer')).toBeInTheDocument()
    expect(screen.getByText('Abonnementsgeschiedenis')).toBeInTheDocument()
    // Active status label is translated and the plan/amount rendered.
    expect(screen.getByText('Actief')).toBeInTheDocument()
    expect(screen.getByText('Pro')).toBeInTheDocument()
    // Dutch price formatting: dot -> comma.
    expect(screen.getByText(/19,99/)).toBeInTheDocument()
    expect(screen.queryByText('Gegevens laden...')).not.toBeInTheDocument()
  })

  it('renders the new-user plan selection with available plans', () => {
    setManagement(newUserData)
    renderPage()

    expect(screen.getByText('Kies een abonnement')).toBeInTheDocument()
    expect(screen.getByText('Essentials')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Selecteer' }),
    ).toBeInTheDocument()
  })

  it('calls createSubscription with the selected plan and userId on Selecteer', async () => {
    const user = userEvent.setup()
    setManagement(newUserData)
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Selecteer' }))

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1))
    expect(createMutateAsync).toHaveBeenCalledWith({
      plan: 'Essentials',
      redirectUrl: window.location.origin + '/subscriptions',
      price: '9.99',
      currency: 'EUR',
      userId: 'user-1',
    })
  })

  it('dispatches a danger alert when create returns no checkout URL', async () => {
    const user = userEvent.setup()
    createMutateAsync.mockResolvedValue({})
    setManagement(newUserData)
    const { store } = renderPage()

    await user.click(screen.getByRole('button', { name: 'Selecteer' }))

    await waitFor(() => {
      const alerts = (
        store.getState() as { alert: Array<{ message?: string }> }
      ).alert
      expect(
        alerts.some((a) =>
          a.message?.includes(
            'Er is een fout opgetreden bij het starten van het abonnement',
          ),
        ),
      ).toBe(true)
    })
  })

  it('renders the payment-issue section and calls the mutation with retry then cancel', async () => {
    const user = userEvent.setup()
    setManagement(paymentIssueData)
    renderPage()

    expect(
      screen.getByText('Betalingsproblemen gedetecteerd'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Opnieuw betalen' }))
    await waitFor(() =>
      expect(handleMutateAsync).toHaveBeenCalledWith({
        subscriptionId: 'sub-issue',
        action: 'retry',
      }),
    )

    await user.click(
      screen.getByRole('button', { name: 'Annuleer abonnement' }),
    )
    await waitFor(() =>
      expect(handleMutateAsync).toHaveBeenCalledWith({
        subscriptionId: 'sub-issue',
        action: 'cancel',
      }),
    )
  })

  it('disables the action buttons while a mutation is pending', () => {
    setHandleIssue(true) // isPaymentProcessing -> processingAction
    setManagement(paymentIssueData)
    renderPage()

    // Both retry and cancel buttons swap to the "Verwerken..." label and disable.
    const processingButtons = screen.getAllByRole('button', {
      name: 'Verwerken...',
    })
    expect(processingButtons).toHaveLength(2)
    processingButtons.forEach((btn) => expect(btn).toBeDisabled())
  })

  it('renders the reactivation section when needsReactivation is set', () => {
    setManagement({
      isNewUser: false,
      needsReactivation: true,
      subscriptions: [
        { _id: 'sub-x', subscriptionStatus: 'canceled', plan: 'Pro' },
      ],
      availablePlans: [
        {
          id: 'plan-pro',
          name: 'Pro',
          price: '19.99',
          currency: 'EUR',
          interval: '1 month',
          description: 'Pro pakket',
        },
      ],
    })
    renderPage()

    expect(screen.getByText('Heractiveer je abonnement')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Heractiveren' }),
    ).toBeInTheDocument()
  })

  it('renders neither action nor history when there is no subscription data', () => {
    setManagement({
      isNewUser: false,
      subscriptions: [],
      availablePlans: [],
    })
    renderPage()

    // Heading still present, but no history table and no action section text.
    expect(screen.getByText('Abonnementsbeheer')).toBeInTheDocument()
    expect(
      screen.queryByText('Abonnementsgeschiedenis'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Kies een abonnement')).not.toBeInTheDocument()
  })
})
