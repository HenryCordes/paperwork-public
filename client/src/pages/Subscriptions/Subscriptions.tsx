/* eslint-disable no-underscore-dangle */
import { useEffect, useState } from 'react'
import { Row, Col, Button } from 'react-bootstrap'
import { useSelector } from 'react-redux'

import { STANDARD_PLAN_NAME } from '../../common/constants'
import { setAlert } from '../../redux/_actions/alertAction'
import { useAppDispatch } from '../../redux/hooks'
import {
  useSubscriptionManagement,
  useCreateSubscription,
  useHandleSubscriptionPaymentIssue,
} from '../../hooks/api/useSubscriptions'
import {
  formatDutchPrice,
  formatDate,
  translatePlanInterval,
} from '../../utils/stringUtils'
import SideBar from '../../components/Sidebar/SideBar'
import Footer from '../../components/Footer/Footer'

interface Plan {
  id: string
  name?: string
  price?: string | number
  priceNL?: string
  currency?: string
  interval?: string
  intervalNL?: string
  description?: string
}

interface Subscription {
  _id: string
  subscriptionStatus?: string
  plan?: string
  paymentPrice?: string | number
  paymentCurrency?: string
  paymentFailCount?: number
  nextPaymentDate?: string
  subscriptionPayDate?: string
  createdAt?: string
}

interface SubscriptionManagementData {
  availablePlans?: Plan[]
  subscriptions?: Subscription[]
  activeSubscription?: Subscription | null
  isNewUser?: boolean
  paymentOverdue?: boolean
  needsReactivation?: boolean
  hasActiveSubscription?: boolean
}

interface CreateSubscriptionPayload {
  plan: string
  redirectUrl: string
  price?: string | number
  currency?: string
  userId?: string
}

const Subscriptions = () => {
  const dispatch = useAppDispatch()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SubscriptionManagementData | null>(null)
  const [processingAction, setProcessingAction] = useState(false)
  const dbUser = useSelector((state) => state.auth.user)
  const authLoading = useSelector((state) => state.auth.loading)

  const { data: subscriptionData, isLoading: isLoadingSubscription } =
    useSubscriptionManagement()
  const {
    mutateAsync: createSubscriptionMutation,
    isPending: isSubscriptionProcessing,
  } = useCreateSubscription()

  useEffect(() => {
    setLoading(Boolean(authLoading || (dbUser && isLoadingSubscription)))

    // eslint-disable-next-line
  }, [authLoading, dbUser, isLoadingSubscription])

  useEffect(() => {
    if (!isLoadingSubscription && subscriptionData) {
      setData(subscriptionData)
      setLoading(false)
    }
  }, [subscriptionData, isLoadingSubscription])

  const {
    mutateAsync: handlePaymentIssueMutation,
    isPending: isPaymentProcessing,
  } = useHandleSubscriptionPaymentIssue()

  useEffect(() => {
    setProcessingAction(isPaymentProcessing || isSubscriptionProcessing)
  }, [isPaymentProcessing, isSubscriptionProcessing])

  const handlePaymentIssue = async (subscriptionId: string, action: string) => {
    try {
      const result = await handlePaymentIssueMutation({
        subscriptionId,
        action,
      })

      if (action === 'retry' && result?.checkoutUrl) {
        window.location.href = result.checkoutUrl
      }
    } catch (error) {
      console.error('Error handling payment issue:', error)
    }
  }

  const initiateNewSubscription = async (planId: string) => {
    setProcessingAction(true)
    try {
      const selectedPlan = data?.availablePlans?.find((p) => p.id === planId)

      if (!selectedPlan) {
        dispatch(setAlert('Ongeldige abonnementskeuze', 'danger'))
        return
      }

      const subscriptionData: CreateSubscriptionPayload = {
        plan: selectedPlan.name || 'Essentials',
        redirectUrl: window.location.origin + '/subscriptions',
        price: selectedPlan.price,
        currency: selectedPlan.currency,
      }

      const user = dbUser as { _id?: string } | null
      if (user && user._id) {
        subscriptionData.userId = user._id
      }

      const result = await createSubscriptionMutation(subscriptionData)

      if (result && (result.checkoutUrl || result._links?.checkout?.href)) {
        window.location.href =
          result.checkoutUrl || result._links?.checkout?.href
      } else {
        console.error('No checkout URL returned')
        dispatch(
          setAlert(
            'Er is een fout opgetreden bij het starten van het abonnement',
            'danger',
          ),
        )
      }
    } catch (error) {
      console.error('Error initiating subscription:', error)
    } finally {
      setProcessingAction(false)
    }
  }

  const renderSubscriptionPlans = (
    title: string,
    selectedPlan: string | null = null,
  ) => {
    if (!data || !data.availablePlans || data.availablePlans.length === 0)
      return null

    return (
      <div className="subscription-plans-section">
        <h5>{title || 'Beschikbare abonnementen'}</h5>
        <div className="subscription-plans-container">
          {data.availablePlans.map((plan) => {
            if (plan.name?.toLowerCase() === selectedPlan?.toLowerCase()) {
              return null
            }
            return (
              <div key={plan.id} className="subscription-plan-card">
                <h5>{plan.name}</h5>
                <p className="plan-price">
                  {formatDutchPrice(plan.price)} {plan.currency}
                </p>
                <p className="plan-interval">
                  {translatePlanInterval(plan.interval)}
                </p>
                <p>{plan.description}</p>
                <Button
                  variant="primary"
                  onClick={() => initiateNewSubscription(plan.id)}
                  disabled={processingAction}
                  className="subscription-select-btn"
                >
                  Selecteer
                </Button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderActionSection = () => {
    if (!data) return null

    const { isNewUser, paymentOverdue, needsReactivation, activeSubscription } =
      data

    const hasUndefinedSubscription =
      data.subscriptions &&
      data.subscriptions.length > 0 &&
      (!data.subscriptions[0].subscriptionStatus ||
        data.subscriptions[0].subscriptionStatus === 'undefined')

    if (isNewUser || hasUndefinedSubscription) {
      return (
        <div className="subscription-action-section">
          <h4>Kies een abonnement</h4>
          <p>
            {hasUndefinedSubscription
              ? 'Je abonnementsstatus is ongeldig of verlopen. Kies een nieuw abonnement:'
              : 'Je hebt nog geen actief abonnement. Kies uit een van de onderstaande opties:'}
          </p>
          <div className="subscription-plans-container">
            {data.availablePlans?.map((plan) => (
              <div key={plan.id} className="subscription-plan-card">
                <h5>{plan.name}</h5>
                <p className="plan-price">
                  {plan.priceNL} {plan.currency}
                </p>
                <p className="plan-interval">{plan.intervalNL}</p>
                <p>{plan.description}</p>
                <Button
                  variant="primary"
                  onClick={() => initiateNewSubscription(plan.id)}
                  disabled={processingAction}
                  className="subscription-select-btn"
                >
                  Selecteer
                </Button>
              </div>
            ))}
          </div>
        </div>
      )
    }

    const overdueSubscription =
      paymentOverdue &&
      data.subscriptions &&
      data.subscriptions.find(
        (sub) =>
          sub.subscriptionStatus === 'payment_overdue' ||
          (activeSubscription && activeSubscription._id === sub._id),
      )

    if (paymentOverdue && overdueSubscription) {
      return (
        <div className="subscription-action-section payment-required-section">
          <div className="subscription-info">
            <h4>Betaling is te laat</h4>
            <p>
              Je betaling voor het abonnement is te laat.
              {overdueSubscription.nextPaymentDate && (
                <>
                  Je volgende betaling had op{' '}
                  {formatDate(overdueSubscription.nextPaymentDate)} moeten
                  plaatsvinden.
                </>
              )}
              <br />
              <strong>Abonnementstype:</strong>{' '}
              {overdueSubscription.plan || STANDARD_PLAN_NAME}
              <br />
              <strong>Bedrag:</strong>{' '}
              {formatDutchPrice(overdueSubscription.paymentPrice)}{' '}
              {overdueSubscription.paymentCurrency || 'EUR'}/maand
            </p>
          </div>
          <div className="subscription-action-buttons">
            <Button
              variant="primary"
              onClick={() =>
                handlePaymentIssue(overdueSubscription._id, 'retry')
              }
              disabled={processingAction}
            >
              {processingAction ? 'Verwerken...' : 'Betaling doen'}
            </Button>
          </div>

          {renderSubscriptionPlans(
            'Of kies een ander abonnement',
            overdueSubscription.plan,
          )}
        </div>
      )
    }

    if (needsReactivation) {
      return (
        <div className="subscription-action-section reactivation-section">
          <div className="subscription-info">
            <h4>Heractiveer je abonnement</h4>
            <p>
              Je abonnement is geannuleerd. Kies hieronder een abonnement om je
              service te heractiveren.
            </p>
          </div>
          <div className="subscription-plans-container">
            {data.availablePlans?.map((plan) => (
              <div key={plan.id} className="subscription-plan-card">
                <h5>{plan.name}</h5>
                <p className="plan-price">
                  {plan.price} {plan.currency}
                </p>
                <p className="plan-interval">{plan.interval}</p>
                <p>{plan.description}</p>
                <Button
                  variant="primary"
                  onClick={() => initiateNewSubscription(plan.id)}
                  disabled={processingAction}
                  className="subscription-select-btn"
                >
                  Heractiveren
                </Button>
              </div>
            ))}
          </div>
        </div>
      )
    }

    const paymentIssueSubscription =
      data.subscriptions &&
      data.subscriptions.find((sub) =>
        ['payment_issue', 'payment_overdue'].includes(
          sub.subscriptionStatus ?? '',
        ),
      )

    if (paymentIssueSubscription) {
      return (
        <div className="subscription-action-section payment-issue-section">
          <div className="subscription-info">
            <h4>Betalingsproblemen gedetecteerd</h4>
            <p>
              Er zijn problemen met je betalingen. We hebben{' '}
              {paymentIssueSubscription.paymentFailCount || 3} mislukte
              betalingspogingen geregistreerd voor je abonnement.
            </p>
            <p>
              <strong>Abonnementstype:</strong>{' '}
              {paymentIssueSubscription.plan || STANDARD_PLAN_NAME}
              <br />
              <strong>Bedrag:</strong>{' '}
              {formatDutchPrice(paymentIssueSubscription.paymentPrice)}{' '}
              {paymentIssueSubscription.paymentCurrency || 'EUR'}/maand
              <br />
              <strong>Actie vereist:</strong> Je kunt de betaling opnieuw
              proberen of je abonnement annuleren.
            </p>
          </div>
          <div className="subscription-action-buttons">
            <Button
              variant="primary"
              className="retry-payment-button"
              onClick={() =>
                handlePaymentIssue(paymentIssueSubscription._id, 'retry')
              }
              disabled={processingAction}
            >
              {processingAction ? 'Verwerken...' : 'Opnieuw betalen'}
            </Button>
            <Button
              variant="outline-danger"
              onClick={() =>
                handlePaymentIssue(paymentIssueSubscription._id, 'cancel')
              }
              disabled={processingAction}
            >
              {processingAction ? 'Verwerken...' : 'Annuleer abonnement'}
            </Button>
          </div>

          {renderSubscriptionPlans(
            'Of kies een ander abonnement',
            paymentIssueSubscription.plan,
          )}
        </div>
      )
    }

    const hasOverduePayment =
      data.subscriptions &&
      data.subscriptions.some(
        (sub) => sub.subscriptionStatus === 'payment_overdue',
      )

    if (hasOverduePayment) {
      const renewSubscription = data.subscriptions?.find(
        (sub) => sub.subscriptionStatus === 'payment_overdue',
      )
      if (!renewSubscription) return null

      return (
        <div className="subscription-action-section payment-required-section">
          <div className="subscription-info">
            <h4>Vernieuw je abonnement</h4>
            <p>
              Je abonnement is verlopen en vereist een betaling om verder te
              gaan.
              <br />
              <strong>Laatste betaling:</strong>{' '}
              {formatDate(
                renewSubscription.subscriptionPayDate ||
                  renewSubscription.createdAt,
              )}
              <br />
              <strong>Abonnementstype:</strong>{' '}
              {renewSubscription.plan || STANDARD_PLAN_NAME}
              <br />
              <strong>Bedrag:</strong>{' '}
              {formatDutchPrice(renewSubscription.paymentPrice)}{' '}
              {renewSubscription.paymentCurrency || 'EUR'}/maand
            </p>
          </div>
          <div className="subscription-action-buttons">
            <Button
              className="renewal-button"
              variant="primary"
              onClick={() =>
                initiateNewSubscription(
                  renewSubscription.plan || STANDARD_PLAN_NAME,
                )
              }
              disabled={processingAction}
            >
              {processingAction ? 'Verwerken...' : 'Verleng abonnement'}
            </Button>
          </div>
        </div>
      )
    }

    return null
  }

  const renderSubscriptionHistory = () => {
    if (!data || !data.subscriptions || data.subscriptions.length === 0)
      return null

    return (
      <div className="subscription-history">
        <h4>Abonnementsgeschiedenis</h4>
        <table className="table onelinertable table-hover">
          <thead>
            <tr>
              <th>Status</th>
              <th>Type</th>
              <th>Bedrag</th>
              <th>Laatste betaling</th>
              <th>Volgende betaling</th>
            </tr>
          </thead>
          <tbody>
            {data.subscriptions.map((sub) => (
              <tr key={sub._id}>
                <td className={`subscription-status-${sub.subscriptionStatus}`}>
                  {getStatusLabel(sub.subscriptionStatus)}
                </td>
                <td>{sub.plan || STANDARD_PLAN_NAME}</td>
                <td>
                  {formatDutchPrice(sub.paymentPrice)}{' '}
                  {sub.paymentCurrency || 'EUR'}
                </td>
                <td>{formatDate(sub.subscriptionPayDate)}</td>
                <td>{formatDate(sub.nextPaymentDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const getStatusLabel = (status?: string) => {
    if (!status || status === '') {
      return 'Onbekend'
    }
    const statusLabels: Record<string, string> = {
      active: 'Actief',
      pending: 'In behandeling',
      canceled: 'Geannuleerd',
      payment_issue: 'Betalingsproblemen',
      payment_overdue: 'Betaling vereist',
    }
    return statusLabels[status] || status
  }

  if (loading) {
    return (
      <div>
        <SideBar />
        <div className="body-content content-wrapper">
          <div className="content-loading">
            <p>Gegevens laden...</p>
          </div>
          <Footer />
        </div>
      </div>
    )
  }

  return (
    <div>
      <SideBar />
      <div className="body-content content-wrapper">
        <h2 className="icon-credit-card short" title="Abonnement">
          {' '}
        </h2>
        <Row>
          <Col md={12}>
            <div className="box box-primary">
              <div className="box-header with-border">
                <h3 className="box-title">Abonnementsbeheer</h3>
              </div>
              <div className="box-body">
                {renderActionSection()}
                {renderSubscriptionHistory()}
              </div>
            </div>
          </Col>
        </Row>
        <Footer />
      </div>
    </div>
  )
}

export default Subscriptions
