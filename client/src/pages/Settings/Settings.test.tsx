import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen } from '../../test-utils'
import {
  useSettings,
  useCreateOrUpdateSettings,
  useUploadLogo,
} from '../../hooks/api/useSettings'
import {
  useVATNotificationPreferences,
  useUpdateVATNotificationPreferences,
} from '../../hooks/api/useVATNotificationPreferences'

jest.mock('../../hooks/api/useSettings', () => ({
  useSettings: jest.fn(),
  useCreateOrUpdateSettings: jest.fn(),
  useUploadLogo: jest.fn(),
}))
jest.mock('../../hooks/api/useVATNotificationPreferences', () => ({
  useVATNotificationPreferences: jest.fn(),
  useUpdateVATNotificationPreferences: jest.fn(),
}))
jest.mock('../../components/Sidebar/SideBar', () => () => (
  <div data-testid="sidebar" />
))

import Settings from './Settings'

const fillCompanyFields = async () => {
  await userEvent.type(screen.getByPlaceholderText('Bedrijfsnaam'), 'Acme BV')
  await userEvent.type(screen.getByPlaceholderText('Straat'), 'Hoofdstraat')
  await userEvent.type(screen.getByPlaceholderText('Huisnummer'), '1')
  await userEvent.type(screen.getByPlaceholderText('Postcode'), '1234 AB')
  await userEvent.type(screen.getByPlaceholderText('Plaats'), 'Amsterdam')
  // country is a <select> with a non-empty first option, so it is already set
  await userEvent.type(
    screen.getByPlaceholderText('Telefoonnummer'),
    '0612345678',
  )
  await userEvent.type(
    screen.getByPlaceholderText('Bedrijfsemail'),
    'info@acme.nl',
  )
  await userEvent.type(screen.getByPlaceholderText('BTW nummer'), 'NL0001')
  await userEvent.type(screen.getByPlaceholderText('KvK nummer'), '12345678')
  await userEvent.type(screen.getByPlaceholderText('Bank'), 'ING')
  await userEvent.type(screen.getByPlaceholderText('IBAN'), 'NL00INGB0001')
}

describe('Settings form', () => {
  let saveSettings: jest.Mock
  let saveVatPreferences: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    saveSettings = jest.fn()
    saveVatPreferences = jest.fn().mockResolvedValue({})
    ;(useSettings as jest.Mock).mockReturnValue({
      data: undefined,
      isError: false,
      error: null,
    })
    ;(useCreateOrUpdateSettings as jest.Mock).mockReturnValue({
      mutate: saveSettings,
      isPending: false,
      isError: false,
      error: null,
    })
    ;(useUploadLogo as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
    })
    ;(useVATNotificationPreferences as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    })
    ;(useUpdateVATNotificationPreferences as jest.Mock).mockReturnValue({
      mutateAsync: saveVatPreferences,
      isPending: false,
    })
  })

  it('renders the company settings fields and the save button', () => {
    renderWithProviders(<Settings />)
    expect(screen.getByPlaceholderText('Bedrijfsnaam')).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Opslaan' }).length,
    ).toBeGreaterThan(0)
  })

  it('saves the company settings when the form is valid', async () => {
    renderWithProviders(<Settings />)

    await fillCompanyFields()

    await userEvent.click(screen.getAllByRole('button', { name: 'Opslaan' })[0])

    expect(saveSettings).toHaveBeenCalledTimes(1)
    expect(saveSettings.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        companyName: 'Acme BV',
        companyEmail: 'info@acme.nl',
        country: 'Nederland',
      }),
    )
  })

  it('does not save the company settings when required fields are missing', async () => {
    renderWithProviders(<Settings />)

    await userEvent.click(screen.getAllByRole('button', { name: 'Opslaan' })[0])

    expect(saveSettings).not.toHaveBeenCalled()
  })

  it('saves the VAT notification preferences', async () => {
    renderWithProviders(<Settings />)

    // advanceWarningDays is required; only one number input is visible while the
    // second-reminder toggle is off.
    await userEvent.type(screen.getByRole('spinbutton'), '7')

    await userEvent.click(
      screen.getByRole('button', { name: 'Notificatie Voorkeuren Opslaan' }),
    )

    expect(saveVatPreferences).toHaveBeenCalledTimes(1)
  })

  describe('loading existing settings', () => {
    it('prefills the company fields from the fetched settings', () => {
      ;(useSettings as jest.Mock).mockReturnValue({
        data: {
          _id: 'settings-1',
          companyName: 'Existing Co',
          companyEmail: 'existing@co.nl',
          street: 'Bestaande straat',
        },
        isError: false,
        error: null,
      })

      renderWithProviders(<Settings />)

      expect(screen.getByPlaceholderText('Bedrijfsnaam')).toHaveValue(
        'Existing Co',
      )
      expect(screen.getByPlaceholderText('Bedrijfsemail')).toHaveValue(
        'existing@co.nl',
      )
    })

    it('includes the existing settings id in the save payload', async () => {
      const user = userEvent.setup()
      ;(useSettings as jest.Mock).mockReturnValue({
        data: { _id: 'settings-1' },
        isError: false,
        error: null,
      })

      renderWithProviders(<Settings />)

      await fillCompanyFields()
      await user.click(screen.getAllByRole('button', { name: 'Opslaan' })[0])

      expect(saveSettings).toHaveBeenCalledTimes(1)
      expect(saveSettings.mock.calls[0][0]).toEqual(
        expect.objectContaining({ _id: 'settings-1', companyName: 'Acme BV' }),
      )
    })
  })

  describe('settings load error', () => {
    it('dispatches a danger alert with the error message on render', () => {
      ;(useSettings as jest.Mock).mockReturnValue({
        data: undefined,
        isError: true,
        error: new Error('boom'),
      })

      const { store } = renderWithProviders(<Settings />)

      // The error alert is dispatched on render; assert it is present rather
      // than the exact array (render count can vary -> 1+ identical alerts).
      expect(store.getState().alert).toContainEqual(
        expect.objectContaining({
          type: 'danger',
          message: 'Fout bij het laden van instellingen: boom',
        }),
      )
    })

    it('falls back to "Onbekende fout" when the error has no message', () => {
      ;(useSettings as jest.Mock).mockReturnValue({
        data: undefined,
        isError: true,
        error: null,
      })

      const { store } = renderWithProviders(<Settings />)

      expect(store.getState().alert).toContainEqual(
        expect.objectContaining({
          type: 'danger',
          message: 'Fout bij het laden van instellingen: Onbekende fout',
        }),
      )
    })
  })

  describe('VAT preferences load states', () => {
    it('shows the loading placeholder and hides the VAT form while loading', () => {
      ;(useVATNotificationPreferences as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      })

      renderWithProviders(<Settings />)

      expect(
        screen.getByText('Notificatie voorkeuren laden...'),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', {
          name: 'Notificatie Voorkeuren Opslaan',
        }),
      ).not.toBeInTheDocument()
    })

    it('dispatches a danger alert when VAT preferences fail to load', () => {
      ;(useVATNotificationPreferences as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      })

      const { store } = renderWithProviders(<Settings />)

      expect(store.getState().alert).toContainEqual(
        expect.objectContaining({
          type: 'danger',
          message: 'Fout bij het laden van notificatie voorkeuren',
        }),
      )
    })
  })

  describe('VAT notification preferences form', () => {
    it('maps the quarterly period type to backend booleans and shows a success alert', async () => {
      const user = userEvent.setup()
      const { store } = renderWithProviders(<Settings />)

      await user.type(screen.getByRole('spinbutton'), '7')
      // periodType select defaults to "monthly" (first option); pick quarterly.
      const periodSelect = screen
        .getAllByRole('combobox')
        .find((el) => (el as HTMLSelectElement).value === 'monthly')
      expect(periodSelect).toBeDefined()
      await user.selectOptions(periodSelect as HTMLSelectElement, 'quarterly')

      await user.click(
        screen.getByRole('button', { name: 'Notificatie Voorkeuren Opslaan' }),
      )

      expect(saveVatPreferences).toHaveBeenCalledTimes(1)
      const payload = saveVatPreferences.mock.calls[0][0]
      expect(payload).toEqual(
        expect.objectContaining({
          advanceWarningDays: 7,
          monthlyNotifications: false,
          quarterlyNotifications: true,
          yearlyNotifications: false,
        }),
      )
      // periodType is stripped before sending to the backend.
      expect(payload).not.toHaveProperty('periodType')

      expect(store.getState().alert).toContainEqual(
        expect.objectContaining({
          type: 'success',
          message: 'Notificatie voorkeuren succesvol opgeslagen',
        }),
      )
    })

    it('maps the monthly period type to monthlyNotifications=true', async () => {
      const user = userEvent.setup()
      // periodType select first option is "monthly", so leaving it untouched
      // submits the monthly mapping.
      const vatSelects = () =>
        screen
          .getAllByRole('combobox')
          .find((el) => (el as HTMLSelectElement).value === 'monthly')

      renderWithProviders(<Settings />)

      await user.type(screen.getByRole('spinbutton'), '5')
      const monthlySelect = vatSelects()
      expect(monthlySelect).toBeDefined()

      await user.click(
        screen.getByRole('button', { name: 'Notificatie Voorkeuren Opslaan' }),
      )

      const payload = saveVatPreferences.mock.calls[0][0]
      expect(payload).toEqual(
        expect.objectContaining({
          monthlyNotifications: true,
          quarterlyNotifications: false,
          yearlyNotifications: false,
        }),
      )
    })

    it('reveals the second-reminder field when the toggle is enabled', async () => {
      const user = userEvent.setup()
      renderWithProviders(<Settings />)

      expect(screen.getAllByRole('spinbutton')).toHaveLength(1)

      await user.click(
        screen.getByRole('checkbox', {
          name: /Tweede herinnering inschakelen/,
        }),
      )

      expect(screen.getAllByRole('spinbutton')).toHaveLength(2)
    })

    it('does not submit when the required advanceWarningDays is empty', async () => {
      const user = userEvent.setup()
      renderWithProviders(<Settings />)

      await user.click(
        screen.getByRole('button', { name: 'Notificatie Voorkeuren Opslaan' }),
      )

      expect(await screen.findByText('Voer een waarde in')).toBeInTheDocument()
      expect(saveVatPreferences).not.toHaveBeenCalled()
    })

    it('dispatches a danger alert when the VAT mutation rejects', async () => {
      const user = userEvent.setup()
      saveVatPreferences.mockRejectedValueOnce(new Error('network down'))

      const { store } = renderWithProviders(<Settings />)

      await user.type(screen.getByRole('spinbutton'), '7')
      await user.click(
        screen.getByRole('button', { name: 'Notificatie Voorkeuren Opslaan' }),
      )

      expect(store.getState().alert).toContainEqual(
        expect.objectContaining({
          type: 'danger',
          message: 'Fout bij opslaan notificatie voorkeuren: network down',
        }),
      )
    })

    it('disables the save button and shows "Opslaan..." while the mutation is pending', () => {
      ;(useUpdateVATNotificationPreferences as jest.Mock).mockReturnValue({
        mutateAsync: saveVatPreferences,
        isPending: true,
      })

      renderWithProviders(<Settings />)

      const button = screen.getByRole('button', { name: 'Opslaan...' })
      expect(button).toBeDisabled()
    })
  })

  describe('logo upload', () => {
    beforeAll(() => {
      // jsdom does not implement createObjectURL; the logo preview <img> needs it.
      Object.defineProperty(URL, 'createObjectURL', {
        writable: true,
        value: jest.fn(() => 'blob:preview'),
      })
    })

    it('uploads the selected logo and attaches the returned url to the save payload', async () => {
      const user = userEvent.setup()
      const uploadLogo = jest.fn().mockResolvedValue('/api/document/logo-123')
      ;(useUploadLogo as jest.Mock).mockReturnValue({ mutateAsync: uploadLogo })

      renderWithProviders(<Settings />)

      const file = new File(['png-bytes'], 'logo.png', { type: 'image/png' })
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement
      await user.upload(fileInput, file)

      await fillCompanyFields()
      await user.click(screen.getAllByRole('button', { name: 'Opslaan' })[0])

      expect(uploadLogo).toHaveBeenCalledTimes(1)
      expect(uploadLogo).toHaveBeenCalledWith(file)
      expect(saveSettings).toHaveBeenCalledTimes(1)
      expect(saveSettings.mock.calls[0][0]).toEqual(
        expect.objectContaining({ companyLogo: '/api/document/logo-123' }),
      )
    })

    it('still saves settings when the logo upload fails, without a logo url', async () => {
      const user = userEvent.setup()
      // mutateAsync resolves null; uploadLogo swallows failures and returns null,
      // and onSubmit only sets companyLogo when a url comes back.
      const uploadLogo = jest.fn().mockResolvedValue(null)
      ;(useUploadLogo as jest.Mock).mockReturnValue({ mutateAsync: uploadLogo })

      renderWithProviders(<Settings />)

      const file = new File(['png-bytes'], 'logo.png', { type: 'image/png' })
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement
      await user.upload(fileInput, file)

      await fillCompanyFields()
      await user.click(screen.getAllByRole('button', { name: 'Opslaan' })[0])

      expect(uploadLogo).toHaveBeenCalledTimes(1)
      expect(saveSettings).toHaveBeenCalledTimes(1)
      // companyLogo stays as the registered default ('') rather than a blob url.
      expect(saveSettings.mock.calls[0][0].companyLogo).not.toMatch(/^blob:/)
    })
  })
})
