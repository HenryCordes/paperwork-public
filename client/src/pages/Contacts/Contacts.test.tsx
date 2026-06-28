import userEvent from '@testing-library/user-event'
import { confirmAlert } from 'react-confirm-alert'
import { renderWithProviders, screen } from '../../test-utils'
import { useContacts, useDeleteContact } from '../../hooks/api'

jest.mock('../../hooks/api', () => ({
  useContacts: jest.fn(),
  useDeleteContact: jest.fn(),
}))
jest.mock('react-confirm-alert', () => ({ confirmAlert: jest.fn() }))
jest.mock('../../components/Sidebar/SideBar', () => () => (
  <div data-testid="sidebar" />
))

import Contacts from './Contacts'

const mockList = (over = {}) =>
  (useContacts as jest.Mock).mockReturnValue({
    data: { docs: [], totalDocs: 0 },
    isLoading: false,
    isError: false,
    error: null,
    ...over,
  })

describe('Contacts page', () => {
  let mutate: jest.Mock
  beforeEach(() => {
    jest.clearAllMocks()
    mutate = jest.fn()
    ;(useDeleteContact as jest.Mock).mockReturnValue({
      mutate,
      isPending: false,
    })
  })

  it('shows the loading indicator while loading', () => {
    mockList({ isLoading: true, data: undefined })
    renderWithProviders(<Contacts />)
    expect(screen.getByText('Laden...')).toBeInTheDocument()
  })

  it('shows the empty state when there are no contacts', () => {
    mockList({ data: { docs: [], totalDocs: 0 } })
    renderWithProviders(<Contacts />)
    expect(screen.getByText('Geen contacten gevonden...')).toBeInTheDocument()
  })

  it('renders a row for each contact', () => {
    mockList({
      data: {
        docs: [
          { _id: 'c1', emailAddress: 'a@example.com', typeName: 'Particulier' },
          { _id: 'c2', emailAddress: 'b@example.com', typeName: 'Bedrijf' },
        ],
        totalDocs: 2,
      },
    })
    renderWithProviders(<Contacts />)
    expect(screen.getByText('a@example.com')).toBeInTheDocument()
    expect(screen.getByText('b@example.com')).toBeInTheDocument()
  })

  it('deletes a contact after confirmation', async () => {
    mockList({
      data: {
        docs: [{ _id: 'c1', emailAddress: 'a@example.com' }],
        totalDocs: 1,
      },
    })
    renderWithProviders(<Contacts />)
    await userEvent.click(screen.getAllByTitle('Verwijderen')[0])
    expect(confirmAlert).toHaveBeenCalledTimes(1)
    const { buttons } = (confirmAlert as jest.Mock).mock.calls[0][0]
    buttons.find((b: { label: string }) => b.label === 'Ja').onClick()
    expect(mutate).toHaveBeenCalledWith('c1')
  })
})
