import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { setAlert } from '../../redux/_actions/alertAction'
import Footer from '../../components/Footer/Footer'
import { useForm } from 'react-hook-form'
import setAuthToken from '../../utils/setAuthToken'
import moment from 'moment'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUser } from '@fortawesome/free-solid-svg-icons'
import { usePlans } from '../../hooks/api/usePlans'
import { useRegister, useCreateSubscription } from '../../hooks/api/useAuth'
import {
  formatDutchPrice,
  translatePlanInterval,
} from '../../utils/stringUtils'
import { useAppDispatch } from '../../redux/hooks'
import { ApiError } from '../../redux/types'

interface SubscribeFormValues {
  email: string
  name: string
  companyName: string
  password: string
  plan?: string
  price?: string | number
  currency?: string
  description?: string
  interval?: string
}

interface Plan {
  id: string
  name: string
  price: number
  currency: string
  description: string
  interval: string
}

const Subscribe = () => {
  const { plan: planParam } = useParams<{ plan?: string }>()
  const dispatch = useAppDispatch()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SubscribeFormValues>()
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState({
    email: '',
    name: '',
    companyName: '',
    password: '',
    plan: '',
    price: '',
    currency: '',
  })

  const { data: plans, isLoading: plansLoading } = usePlans()

  useEffect(() => {
    setLoading(plansLoading)

    if (!plansLoading && plans) {
      console.log('Plans loaded:', plans)

      if (Array.isArray(plans) && plans.length > 0) {
        setAvailablePlans(plans)

        const planId = planParam === 'year' ? 'essentials yearly' : 'essentials'
        const plan = plans.find((p: Plan) => p.id === planId)

        if (plan) {
          setSelectedPlan(plan)
          setCustomer((prev) => ({
            ...prev,
            plan: plan.name,
            price: plan.price,
            currency: plan.currency,
          }))
        } else {
          console.error(`Could not find plan with ID: ${planId}`)
        }
      } else {
        console.error('No valid plans received from API')
        setAvailablePlans([])
      }
    }
  }, [plans, plansLoading, planParam])

  const addPlanToData = (data: Record<string, unknown>) => {
    if (selectedPlan) {
      data.plan = selectedPlan.name
      data.price = selectedPlan.price
      data.currency = selectedPlan.currency
      data.description = selectedPlan.description
      data.interval = selectedPlan.interval
    } else {
      const defaultPlan = availablePlans.find((p) => p.id === 'essentials')
      if (defaultPlan) {
        data.plan = defaultPlan.name
        data.price = defaultPlan.price
        data.currency = defaultPlan.currency
        data.description = defaultPlan.description
        data.interval = defaultPlan.interval
      }
    }
  }

  const sleep = (delay: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, delay))

  const { mutateAsync: registerUser } = useRegister()
  const { mutateAsync: createSubscriptionMutation } = useCreateSubscription()

  const onSubmit = async (data: SubscribeFormValues) => {
    if (data.email === '' || data.name === '') {
      dispatch(setAlert('Naam en email zijn verplicht', 'danger'))
      return
    }

    try {
      setLoading(true)
      const response = await registerUser(data)

      if (response && response.success) {
        const subscriptionData: Record<string, unknown> = {
          _id: response.userId,
          organizationId: response.organizationId,
          ...data,
        }

        addPlanToData(subscriptionData)
        subscriptionData.startDate = moment(new Date()).format('YYYY-MM-DD')

        await handleSubscription(subscriptionData)
      }
    } catch (err) {
      const apiErr = err as ApiError
      console.error('[Subscribe] Registration error:', JSON.stringify(err))
      let message =
        'Er is iets misgegaan bij het registreren. Probeer het nogmaals.'

      if (apiErr.response?.data) {
        const status = (err as { response?: { status?: number } }).response
          ?.status
        if (status === 409) {
          if (apiErr.response?.data?.code === 'INCOMPLETE_REGISTRATION') {
            message = apiErr.response.data.message || message
            setTimeout(() => {
              window.location.href = '/login'
            }, 4000)
          } else {
            message =
              'Er is al een account met dit email adres. Neem contact op met support'
          }
        }
      } else if (apiErr.message === 'Request failed with status code 409') {
        message =
          'Er is al een account met dit email adres. Neem contact op met support'
      }

      dispatch(setAlert(message, 'danger'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubscription = async (data: Record<string, unknown>) => {
    await sleep(500)
    if (localStorage.token) {
      setAuthToken(localStorage.token)
    }
    await sleep(500)
    await createSubscriptionAndShowCheckout(data)
  }

  const createSubscriptionAndShowCheckout = async (
    data: Record<string, unknown>,
  ) => {
    try {
      const subscription = await createSubscriptionMutation(data)

      console.log('Subscription created:', subscription)

      if (
        subscription &&
        (subscription.paymentUrl || subscription._links?.checkout?.href)
      ) {
        window.location.href =
          subscription._links?.checkout?.href || subscription.paymentUrl
      } else {
        dispatch(
          setAlert(
            'De link naar het betaalgedeelte is niet geldig, hierdoor kunnen we je niet doorverwijzen',
            'danger',
          ),
        )
      }
    } catch (error) {
      console.error('[Subscribe] Subscription creation error:', error)
      dispatch(
        setAlert(
          'Er is iets misgegaan met het doorverwijzen naar het betaalgedeelte',
          'danger',
        ),
      )
    }
  }

  return (
    <div className="body-content content-wrapper">
      <div className="col-md-6 offset-md-3">
        {loading ? (
          <div className="text-center p-5">
            <div className="spinner-border text-primary" role="status">
              <span className="sr-only">Laden...</span>
            </div>
            <p className="mt-2">Abonnementsgegevens laden...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="row">
              <div className="subscribe-row">
                <div className="box box-primary">
                  <div className="box-header with-border left-align">
                    <h3 className="box-title">
                      <FontAwesomeIcon icon={faUser} /> Inschrijven
                    </h3>
                  </div>

                  <div className="box-body">
                    <div className="logo-wrapper">
                      <img
                        src={`${window.location.origin}/assets/img/books_64.png`}
                        alt="logo"
                      />
                      <h2>paperwork</h2>
                    </div>

                    <div className="subscription-plans-section">
                      <div className="subscription-plans-container centered">
                        <div
                          key={selectedPlan?.id}
                          className="subscription-plan-card box box-primary"
                        >
                          <h5>{selectedPlan?.name}</h5>
                          <p className="plan-price">
                            {formatDutchPrice(selectedPlan?.price)}{' '}
                            {selectedPlan?.currency}
                          </p>
                          <p className="plan-interval">
                            {translatePlanInterval(selectedPlan?.interval)}
                          </p>
                          <p>{selectedPlan?.description}</p>
                        </div>
                      </div>
                    </div>

                    <div className="form-group required left-align">
                      <label htmlFor="name">Naam</label>
                      <input
                        type="text"
                        className="form-control subscribe-input"
                        placeholder="Naam"
                        autoComplete="name"
                        defaultValue={customer.name}
                        {...register('name', { required: true })}
                        style={{
                          border: errors.name ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.name && (
                        <span className="error">Voer je naam in</span>
                      )}
                    </div>

                    <div className="form-group required left-align">
                      <label htmlFor="email">Email</label>
                      <input
                        type="text"
                        className="form-control subscribe-input"
                        placeholder="Email"
                        autoComplete="email"
                        defaultValue={customer.email}
                        {...register('email', { required: true })}
                        style={{
                          border: errors.email ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.email && (
                        <span className="error">Voer je email in</span>
                      )}
                    </div>

                    <div className="form-group required left-align">
                      <label htmlFor="companyName">Bedrijfsnaam</label>
                      <input
                        type="text"
                        className="form-control subscribe-input"
                        placeholder="Bedrijfsnaam"
                        autoComplete="companyname"
                        defaultValue={customer.companyName}
                        {...register('companyName')}
                        style={{
                          border: errors.companyName ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.companyName && (
                        <span className="error">Voer je bedrijfsnaam in</span>
                      )}
                    </div>

                    <div className="form-group required left-align">
                      <label htmlFor="password">Wachtwoord</label>
                      <input
                        type="password"
                        className="form-control subscribe-input"
                        placeholder="Wachtwoord"
                        minLength={6}
                        autoComplete="current-password"
                        defaultValue={customer.password}
                        {...register('password', { required: true })}
                        style={{
                          border: errors.password ? '2px solid #D0021B' : '',
                        }}
                      />
                      {errors.password && (
                        <span className="error">Voer je wachtwoord in</span>
                      )}
                    </div>
                    <div className="box-footer-nomargin centered">
                      <button
                        id="save"
                        type="submit"
                        className="btn btn-primary"
                      >
                        Schrijf mij in!
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
      <div className="no-sidebar">
        <Footer />
      </div>
    </div>
  )
}
export default Subscribe
