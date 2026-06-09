import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Footer from '../../components/Footer/Footer'
import { getSubscriptionByOrderId } from '../../redux/_actions/paymentAction'
import { setAlert } from '../../redux/_actions/alertAction'
import { useAppDispatch } from '../../redux/hooks'

declare global {
  interface Window {
    dataLayer: unknown[]
  }
}

const Success = () => {
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  const orderId = query.get('orderId')
  const dispatch = useAppDispatch()

  const sleep = (delay: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, delay))

  let numberOfChecks = 0

  const checkPaymentStatus = (id: string) => {
    dispatch(getSubscriptionByOrderId(id)).then(
      (subscription: {
        paymentState?: string
        paymentPrice?: string | number
        paymentCurrency?: string
        plan?: string
        userId?: string
        error?: unknown
      }) => {
        if (subscription && subscription.paymentState === 'paid') {
          dispatch(setAlert('De betaling is binnengekomen, bedankt!', 'info'))
          // Event snippet for Subscribe conversion page
          window.dataLayer = window.dataLayer || []
          const gtag = (...args: unknown[]) => {
            window.dataLayer.push(args)
          }
          gtag('event', 'conversion', {
            send_to: `${process.env.REACT_APP_CONVERSION_ID}/${process.env.REACT_APP_CONVERSION_EVENT_ID}`,
            value: subscription.paymentPrice,
            currency: subscription.paymentCurrency,
            transaction_id: 'gtm.js',
            order_id: orderId,
            plan: subscription.plan,
            userId: subscription.userId,
          })

          setTimeout(() => {
            window.location.href = location.pathname
          }, 2000)
        } else {
          if (subscription.error) {
            //No need to do anything
          } else {
            if (numberOfChecks < 5) {
              callCheckAfterDelay(id)
            }
            numberOfChecks++
          }
        }
      },
    )
  }

  const callCheckAfterDelay = async (id: string) => {
    await sleep(5000)
    checkPaymentStatus(id)
  }

  useEffect(() => {
    if (orderId) {
      checkPaymentStatus(orderId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  return (
    <div>
      <div className="body-content content-wrapper">
        <div className="jumbotron">
          <img
            className="logohome"
            src="/assets/img/books_64.png"
            alt="paperwork logo"
          />
          <h2 className="brand">Welkom bij paperwork!</h2>
          <p className="lead">Wat fijn dat je hier bent.</p>

          <p>
            Omdat wij het belangrijk vinden dat jij het meeste uit paperwork
            haalt willen wij je te helpen om dat voor elkaar te krijgen. <br />
            Hier volgen een aantal stappen die je helpen zodat alles werkt zoals
            gewenst.
          </p>
          <ul>
            <li>
              <a href="/settings" className="no-styling">
                Instellingen invoeren
              </a>
            </li>
            <li>
              Contacten invoeren (in ieder geval een aantal), dit zijn klanten
              en leveranciers
            </li>
          </ul>
          <p>
            Nadat je de instellingen en een aantal belangrijke klanten hebt
            ingevoerd, kan je facturen, kosten en de overige functionaliteiten
            gaan uitproberen.
            <br /> Veel succes!
          </p>
          <p>
            <a href="/settings" className="btn btn-primary btn-large">
              Stap 1: Vul de instellingen in
            </a>{' '}
            Vul de belangrijkste instellingen in
          </p>
        </div>
      </div>
      <div className="content-centered no-sidebar">
        <Footer />
      </div>
    </div>
  )
}
export default Success
