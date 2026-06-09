import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen } from '../../test-utils'
import { useContact, useCreateOrUpdateContact } from '../../hooks/api'

jest.mock('../../hooks/api', () => ({
  useContact: jest.fn(),
  useCreateOrUpdateContact: jest.fn(),
}))

import ContactDetails from './ContactDetails'

describe('ContactDetails form', () => {
  let saveContact: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    saveContact = jest.fn().mockResolvedValue({ _id: 'new-contact' })
    ;(useContact as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    })
    ;(useCreateOrUpdateContact as jest.Mock).mockReturnValue({
      mutateAsync: saveContact,
      isPending: false,
    })
  })

  const renderCreate = () =>
    renderWithProviders(<ContactDetails />, {
      initialEntries: ['/contact/create'],
    })

  it('renders the email field and a save button', () => {
    renderCreate()
    expect(screen.getByPlaceholderText('Emailadres')).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Opslaan' }).length,
    ).toBeGreaterThan(0)
  })

  it('saves the contact when the required fields are filled', async () => {
    renderCreate()

    // typeOfContact 'Klant' avoids the Bedrijf/Particulier guard branch.
    const typeOfContactSelect = screen
      .getByRole('option', { name: 'Klant' })
      .closest('select') as HTMLSelectElement
    await userEvent.selectOptions(typeOfContactSelect, 'Klant')

    // typeName drives the RHF validate() rules for the name fields. With
    // 'Bedrijf', lastName/firstName are not required and only companyName is.
    const typeNameSelect = screen
      .getByRole('option', { name: 'Bedrijf' })
      .closest('select') as HTMLSelectElement
    await userEvent.selectOptions(typeNameSelect, 'Bedrijf')

    await userEvent.type(screen.getByPlaceholderText('Bedrijfsnaam'), 'Acme BV')

    // country is registered with required: true and a defaultValue of '',
    // so it must be explicitly selected even though the DOM shows Nederland.
    const countrySelect = screen
      .getAllByRole('option', { name: 'Nederland' })[0]
      .closest('select') as HTMLSelectElement
    await userEvent.selectOptions(countrySelect, 'Nederland')

    await userEvent.type(
      screen.getByPlaceholderText('Emailadres'),
      'klant@example.nl',
    )

    await userEvent.click(screen.getAllByRole('button', { name: 'Opslaan' })[0])

    expect(saveContact).toHaveBeenCalledTimes(1)
    expect(saveContact.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        typeOfContact: 'Klant',
        typeName: 'Bedrijf',
        companyName: 'Acme BV',
        emailAddress: 'klant@example.nl',
        country: 'Nederland',
      }),
    )
  })

  it('does not save when the required email is missing', async () => {
    renderCreate()

    await userEvent.click(screen.getAllByRole('button', { name: 'Opslaan' })[0])

    expect(saveContact).not.toHaveBeenCalled()
  })
})
