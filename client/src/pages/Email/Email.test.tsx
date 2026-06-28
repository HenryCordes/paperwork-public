import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test-utils'
import {
  useEmail,
  useContactsByType,
  useInvoicesList,
  useCreateOrUpdateEmail,
  useSendEmail,
} from '../../hooks/api'
import { setAlert } from '../../redux/_actions/alertAction'

jest.mock('../../hooks/api')
jest.mock('../../redux/_actions/alertAction', () => ({
  setAlert: jest.fn(),
}))

// SideBar pulls in its own subscription hook; stub it so we test Email in isolation.
jest.mock('../../components/Sidebar/SideBar', () => () => (
  <div data-testid="sidebar" />
))
jest.mock('../../components/Footer/Footer', () => () => (
  <div data-testid="footer" />
))

// The TinyMCE Editor is a heavy 3rd-party component. Replace it with a plain
// textarea that drives the same onEditorChange callback the component reads.
jest.mock('@tinymce/tinymce-react', () => ({
  Editor: ({
    value,
    onEditorChange,
  }: {
    value: string
    onEditorChange: (content: string) => void
  }) => (
    <textarea
      data-testid="body-editor"
      aria-label="Bericht"
      value={value}
      onChange={(e) => onEditorChange(e.target.value)}
    />
  ),
}))

import Email from './Email'

type Mutation = {
  mutate: jest.Mock
  isPending: boolean
  isSuccess: boolean
}

const mockedUseEmail = jest.mocked(useEmail)
const mockedUseContactsByType = jest.mocked(useContactsByType)
const mockedUseInvoicesList = jest.mocked(useInvoicesList)
const mockedUseCreateOrUpdateEmail = jest.mocked(useCreateOrUpdateEmail)
const mockedUseSendEmail = jest.mocked(useSendEmail)
const mockedSetAlert = jest.mocked(setAlert)

const contacts = [
  {
    _id: 'k1',
    typeName: 'Bedrijf',
    companyName: 'Acme BV',
    emailAddress: 'info@acme.test',
  },
  {
    _id: 'k2',
    typeName: 'Particulier',
    firstName: 'Jan',
    lastName: 'Jansen',
    emailAddress: 'jan@example.test',
  },
]

const invoices = [
  { _id: 'inv1', invoiceNumber: 'F-001' },
  { _id: 'inv2', invoiceNumber: 'F-002' },
]

const makeQuery = <T,>(data: T) =>
  ({
    data,
    isLoading: false,
    isError: false,
    error: null,
  }) as unknown as ReturnType<typeof useEmail>

const makeMutation = (overrides: Partial<Mutation> = {}): Mutation => ({
  mutate: jest.fn(),
  isPending: false,
  isSuccess: false,
  ...overrides,
})

let createMutation: Mutation
let sendMutation: Mutation

const setupHooks = (
  opts: {
    email?: Partial<ReturnType<typeof useEmail>>
    create?: Mutation
    send?: Mutation
  } = {},
) => {
  createMutation = opts.create ?? makeMutation()
  sendMutation = opts.send ?? makeMutation()

  mockedUseEmail.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...opts.email,
  } as unknown as ReturnType<typeof useEmail>)
  mockedUseContactsByType.mockReturnValue(
    makeQuery(contacts) as unknown as ReturnType<typeof useContactsByType>,
  )
  mockedUseInvoicesList.mockReturnValue(
    makeQuery({ docs: invoices }) as unknown as ReturnType<
      typeof useInvoicesList
    >,
  )
  mockedUseCreateOrUpdateEmail.mockReturnValue(
    createMutation as unknown as ReturnType<typeof useCreateOrUpdateEmail>,
  )
  mockedUseSendEmail.mockReturnValue(
    sendMutation as unknown as ReturnType<typeof useSendEmail>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  // setAlert is a thunk action-creator; return a no-op thunk so dispatch works.
  mockedSetAlert.mockReturnValue(
    (() => undefined) as ReturnType<typeof setAlert>,
  )
  setupHooks()
})

const renderCreate = () =>
  renderWithProviders(<Email />, { initialEntries: ['/email/create'] })

describe('Email page', () => {
  describe('rendering', () => {
    it('renders the key fields and both action buttons', () => {
      renderCreate()

      expect(screen.getByText('Contact')).toBeInTheDocument()
      expect(screen.getByText('Datum')).toBeInTheDocument()
      expect(screen.getByText('Titel')).toBeInTheDocument()
      expect(screen.getByText('Bericht')).toBeInTheDocument()
      expect(screen.getByText('Verzonden')).toBeInTheDocument()
      expect(screen.getByText('Factuur')).toBeInTheDocument()

      expect(screen.getByPlaceholderText('Titel')).toBeInTheDocument()
      expect(screen.getByTestId('body-editor')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Opslaan' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Opslaan & Versturen' }),
      ).toBeInTheDocument()
    })

    it('populates the contact select from useContactsByType data', () => {
      renderCreate()

      // Company contact shows companyName; particulier shows "last, first".
      expect(
        screen.getByRole('option', { name: 'Acme BV' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('option', { name: 'Jansen, Jan' }),
      ).toBeInTheDocument()
    })

    it('populates the invoice select from useInvoicesList docs', () => {
      renderCreate()

      expect(screen.getByRole('option', { name: 'F-001' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'F-002' })).toBeInTheDocument()
    })
  })

  describe('save (Opslaan)', () => {
    it('calls the create/update mutation with the entered field values', async () => {
      const user = userEvent.setup()
      renderCreate()

      // contactId is the first combobox, invoiceId the third (send is second).
      const [contactSelect, , invoiceSelect] = screen.getAllByRole('combobox')
      await user.selectOptions(contactSelect, 'k1')
      await user.type(screen.getByPlaceholderText('Titel'), 'Hallo')
      await user.type(screen.getByTestId('body-editor'), 'Berichttekst')
      await user.selectOptions(invoiceSelect, 'inv2')

      await user.click(screen.getByRole('button', { name: 'Opslaan' }))

      expect(createMutation.mutate).toHaveBeenCalledTimes(1)
      const payload = createMutation.mutate.mock.calls[0][0]
      expect(payload).toMatchObject({
        contactId: 'k1',
        subject: 'Hallo',
        body: 'Berichttekst',
        invoiceId: 'inv2',
        send: 'false',
      })
      // completeData() resolves the selected contact's display name + email.
      expect(payload).toMatchObject({
        contactName: 'Acme BV',
        contactEmail: 'info@acme.test',
      })
      expect(sendMutation.mutate).not.toHaveBeenCalled()
    })

    it('dispatches setAlert and does not mutate when the body is empty', async () => {
      const user = userEvent.setup()
      renderCreate()

      const [contactSelect] = screen.getAllByRole('combobox')
      await user.selectOptions(contactSelect, 'k1')
      await user.type(screen.getByPlaceholderText('Titel'), 'Hallo')
      // Leave the body editor empty.

      await user.click(screen.getByRole('button', { name: 'Opslaan' }))

      expect(mockedSetAlert).toHaveBeenCalledWith(
        'Emaildatum, titel, bericht en verzonden zijn verplicht, voer deze allemaal in.',
        'danger',
      )
      expect(createMutation.mutate).not.toHaveBeenCalled()
    })
  })

  describe('send (Opslaan & Versturen)', () => {
    it('calls the send mutation with the entered field values', async () => {
      const user = userEvent.setup()
      renderCreate()

      const [contactSelect] = screen.getAllByRole('combobox')
      await user.selectOptions(contactSelect, 'k2')
      await user.type(screen.getByPlaceholderText('Titel'), 'Onderwerp')
      await user.type(screen.getByTestId('body-editor'), 'Inhoud')

      await user.click(
        screen.getByRole('button', { name: 'Opslaan & Versturen' }),
      )

      expect(sendMutation.mutate).toHaveBeenCalledTimes(1)
      const payload = sendMutation.mutate.mock.calls[0][0]
      expect(payload).toMatchObject({
        contactId: 'k2',
        subject: 'Onderwerp',
        body: 'Inhoud',
        send: 'false',
        contactName: 'Jansen, Jan',
        contactEmail: 'jan@example.test',
      })

      // The "Opslaan & Versturen" button has no explicit type, so inside the
      // <form> it would default to submit. But its onClick is sendInvoice =
      // handleSubmit(...), and react-hook-form's handleSubmit calls
      // event.preventDefault(), which suppresses the native form submission.
      // So only the send mutation fires, NOT the form's onSubmit (create).
      expect(createMutation.mutate).not.toHaveBeenCalled()
    })

    it('blocks the send and shows a field validation error when the title is empty', async () => {
      const user = userEvent.setup()
      renderCreate()

      const [contactSelect] = screen.getAllByRole('combobox')
      await user.selectOptions(contactSelect, 'k1')
      await user.type(screen.getByTestId('body-editor'), 'Inhoud')
      // Leave the title empty.

      await user.click(
        screen.getByRole('button', { name: 'Opslaan & Versturen' }),
      )

      // sendInvoice = handleSubmit(...): react-hook-form runs `required`
      // validation first, so with an empty title the callback never runs.
      // The observable result is the field-level error, NOT the setAlert toast
      // (the setAlert "all fields required" branch is only reachable when RHF
      // validation passes but a value is still an empty string, e.g. body).
      expect(await screen.findByText('Voer een titel in')).toBeInTheDocument()
      expect(sendMutation.mutate).not.toHaveBeenCalled()
      expect(mockedSetAlert).not.toHaveBeenCalled()
    })
  })

  describe('state branches', () => {
    it('shows the loading state while the email query is loading (edit mode)', () => {
      setupHooks({ email: { isLoading: true } })
      renderWithProviders(<Email />, { initialEntries: ['/email/abc123'] })

      expect(screen.getByText('Email laden...')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Opslaan' }),
      ).not.toBeInTheDocument()
    })

    it('shows the error state when the email query errors (edit mode)', () => {
      setupHooks({
        email: { isError: true, error: new Error('Boom') },
      })
      renderWithProviders(<Email />, { initialEntries: ['/email/abc123'] })

      expect(
        screen.getByText(/Fout bij het laden van de email:/),
      ).toBeInTheDocument()
      expect(screen.getByText(/Boom/)).toBeInTheDocument()
    })

    it('disables nothing but shows the saving overlay while create is pending', () => {
      setupHooks({ create: makeMutation({ isPending: true }) })
      renderCreate()

      expect(screen.getByText('Email opslaan...')).toBeInTheDocument()
    })

    it('shows the sending overlay while send is pending', () => {
      setupHooks({ send: makeMutation({ isPending: true }) })
      renderCreate()

      expect(screen.getByText('Email versturen...')).toBeInTheDocument()
    })

    it('shows the success message after a save succeeds', () => {
      setupHooks({ create: makeMutation({ isSuccess: true }) })
      renderCreate()

      expect(
        screen.getByText('De email is succesvol opgeslagen.'),
      ).toBeInTheDocument()
    })

    it('renders the empty contact/invoice selects when there is no data', () => {
      mockedUseContactsByType.mockReturnValue(
        makeQuery([]) as unknown as ReturnType<typeof useContactsByType>,
      )
      mockedUseInvoicesList.mockReturnValue(
        makeQuery({ docs: [] }) as unknown as ReturnType<
          typeof useInvoicesList
        >,
      )
      renderCreate()

      // Only the placeholder options remain.
      expect(
        screen.getByRole('option', { name: 'Selecteer een contact...' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('option', { name: 'Selecteer een factuur...' }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('option', { name: 'Acme BV' }),
      ).not.toBeInTheDocument()
    })
  })

  describe('edit mode pre-fill', () => {
    it('pre-fills the form from the loaded email and shows the email number', async () => {
      const dbEmail = {
        _id: 'e1',
        emailNumber: 42,
        emailDate: '2026-01-15',
        subject: 'Bestaande titel',
        body: '<p>Body</p>',
        send: 'true',
        contactId: 'k1',
        invoiceId: 'inv1',
      }
      setupHooks({ email: { data: dbEmail } })
      renderWithProviders(<Email />, { initialEntries: ['/email/e1'] })

      expect(screen.getByText('Nummer')).toBeInTheDocument()
      expect(screen.getByText('42')).toBeInTheDocument()
      await waitFor(() =>
        expect(screen.getByPlaceholderText('Titel')).toHaveValue(
          'Bestaande titel',
        ),
      )
    })
  })
})
