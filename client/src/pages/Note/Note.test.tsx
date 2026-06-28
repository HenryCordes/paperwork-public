import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, fireEvent } from '../../test-utils'
import {
  useNote,
  useCreateOrUpdateNote,
  useContactsByType,
} from '../../hooks/api'

jest.mock('../../hooks/api', () => ({
  useNote: jest.fn(),
  useCreateOrUpdateNote: jest.fn(),
  useContactsByType: jest.fn(),
}))
jest.mock('../../components/Sidebar/SideBar', () => () => (
  <div data-testid="sidebar" />
))

import Note from './Note'

describe('Note create form', () => {
  let saveNote: jest.Mock
  beforeEach(() => {
    jest.clearAllMocks()
    window.history.pushState({}, '', '/note/create')
    saveNote = jest.fn()
    ;(useNote as jest.Mock).mockReturnValue({
      data: undefined,
      isError: false,
      error: null,
    })
    ;(useContactsByType as jest.Mock).mockReturnValue({
      data: [{ _id: 'c1', typeName: 'Bedrijf', companyName: 'Acme BV' }],
      isError: false,
      error: null,
    })
    ;(useCreateOrUpdateNote as jest.Mock).mockReturnValue({ mutate: saveNote })
  })

  it('renders the contact options and the save button', () => {
    renderWithProviders(<Note />)
    expect(screen.getByRole('option', { name: 'Acme BV' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Opslaan' })).toBeInTheDocument()
  })

  it('saves the note when the form is valid', async () => {
    renderWithProviders(<Note />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'c1')
    fireEvent.change(screen.getByPlaceholderText('Notitiedatum'), {
      target: { value: '2026-03-01' },
    })
    await userEvent.type(
      screen.getByPlaceholderText('Omschrijving'),
      'Bel de klant',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(saveNote).toHaveBeenCalledTimes(1)
    expect(saveNote.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        contactId: 'c1',
        description: 'Bel de klant',
        noteDate: '2026-03-01',
      }),
    )
  })

  it('does not save when required fields are missing', async () => {
    renderWithProviders(<Note />)
    await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    expect(saveNote).not.toHaveBeenCalled()
  })
})
