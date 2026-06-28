import './css/01-bootstrap.css'
import './css/02-bootstrap-theme.css'
import './css/03-eightyshades.css'
import './css/04-site.css'
import './css/05-skins.css'

import setAuthToken from './utils/setAuthToken'
import AuthLoader from './components/auth/AuthLoader'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import PrivateRoute from './components/routing/PrivateRoute'
import SubscriptionProtect from './components/SubscriptionProtect/SubscriptionProtect'
import Home from './pages/Home/Home'
import Login from './components/authentication/Login'
import Register from './components/authentication/Register'
import Alerts from './components/partials/Alerts'
import Navigation from './components/Navigation/Navigation'
import About from './pages/About/About'
import ContactPage from './pages/ContactPage/ContactPage'
import Profile from './pages/Profile/Profile'
import Contacts from './pages/Contacts/Contacts'
import Contact from './pages/Contact/Contact'
import Invoices from './pages/Invoices/Invoices'
import Invoice from './pages/Invoice/Invoice'
import InvoiceDetails from './pages/Invoice/InvoiceDetails'
import Settings from './pages/Settings/Settings'
import Expenses from './pages/Expenses/Expenses'
import Expense from './pages/Expense/Expense'
import Notes from './pages/Notes/Notes'
import Note from './pages/Note/Note'
import Emails from './pages/Emails/Emails'
import Email from './pages/Email/Email'
import Subscribe from './pages/Subscribe/Subscribe'
import Success from './pages/Payments/Success'
import Subscriptions from './pages/Subscriptions/Subscriptions'
import NotFound from './pages/NotFound/NotFound'
import Reset from './components/authentication/Reset'
import PasswordReset from './components/authentication/PasswordReset'
import Dashboard from './pages/Dashboard/Dashboard'
import Taxes from './pages/Taxes/Taxes'

if (localStorage.token) {
  setAuthToken(localStorage.token)
}

function App() {
  return (
    <>
      <Router future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AuthLoader /> {/* Auth state initialization */}
        <Navigation />
        <div className="container">
          <Alerts />
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Home />} />
            <Route path="/register" element={<Register />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset" element={<Reset />} />
            <Route path="/password-reset" element={<PasswordReset />} />
            <Route path="/about" element={<About />} />
            <Route path="/contactus" element={<ContactPage />} />
            <Route path="/subscribe/:plan?" element={<Subscribe />} />

            {/* Routes that only need authentication (no subscription) */}
            <Route
              path="/subscriptions"
              element={
                <PrivateRoute>
                  <Subscriptions />
                </PrivateRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              }
            />
            <Route
              path="/payments/success"
              element={
                <PrivateRoute>
                  <Success />
                </PrivateRoute>
              }
            />

            {/* Routes that require both authentication and an active subscription */}
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Dashboard />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />

            <Route
              path="/contacts"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Contacts />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/contact/create"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Contact />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/contact/edit/:id"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Contact />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/invoices"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Invoices />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/invoice/create/:contactId?"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Invoice />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/invoice/edit/:id"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Invoice />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/invoice/details/:id"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <InvoiceDetails />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/expenses"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Expenses />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/expense/create"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Expense />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/expense/edit/:id"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Expense />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/notes"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Notes />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/note/create"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Note />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/note/edit/:id"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Note />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/emails"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Emails />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/email/create"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Email />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/email/edit/:id"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Email />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/invoice/send/:invoiceId"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Email />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Settings />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />
            <Route
              path="/taxes"
              element={
                <PrivateRoute>
                  <SubscriptionProtect>
                    <Taxes />
                  </SubscriptionProtect>
                </PrivateRoute>
              }
            />

            {/* Catch-all route for 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </Router>
    </>
  )
}

export default App
