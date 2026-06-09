import userEvent from '@testing-library/user-event'
import { confirmAlert } from 'react-confirm-alert'
import { renderWithProviders, screen } from '../../test-utils'
import { useNotesList, useDeleteNote } from '../../hooks/api'

jest.mock('../../hooks/api', () => ({
  useNotesList: jest.fn(),
  useDeleteNote: jest.fn(),
}))
jest.mock('react-confirm-alert', () => ({ confirmAlert: jest.fn() }))

import NotesTable from './NotesTable'

const mockList = (over = {}) =>
  (useNotesList as jest.Mock).mockReturnValue({
    data: { docs: [], totalDocs: 0, limit: 10, page: 1 },
    isLoading: false,
    isError: false,
    error: null,
    ...over,
  })

describe('NotesTable', () => {
  let mutate: jest.Mock
  beforeEach(() => {
    jest.clearAllMocks()
    mutate = jest.fn()
    ;(useDeleteNote as jest.Mock).mockReturnValue({ mutate })
  })

  it('shows the loading indicator while loading', () => {
    mockList({ isLoading: true, data: undefined })
    renderWithProviders(<NotesTable />)
    expect(screen.getByText('Notities worden geladen...')).toBeInTheDocument()
  })

  it('shows the empty state when there are no notes', () => {
    mockList({ data: { docs: [], totalDocs: 0 } })
    renderWithProviders(<NotesTable />)
    expect(screen.getByText('Geen notities gevonden...')).toBeInTheDocument()
  })

  it('renders a row for each note', () => {
    mockList({
      data: {
        docs: [
          { _id: 'n1', description: 'Call the client', noteNumber: 1 },
          { _id: 'n2', description: 'Send the quote', noteNumber: 2 },
        ],
        totalDocs: 2,
      },
    })
    renderWithProviders(<NotesTable />)
    expect(screen.getByText('Call the client')).toBeInTheDocument()
    expect(screen.getByText('Send the quote')).toBeInTheDocument()
  })

  it('deletes a note after confirmation', async () => {
    mockList({
      data: {
        docs: [{ _id: 'n1', description: 'Call the client' }],
        totalDocs: 1,
      },
    })
    renderWithProviders(<NotesTable />)
    await userEvent.click(screen.getAllByTitle('Verwijderen')[0])
    expect(confirmAlert).toHaveBeenCalledTimes(1)
    const { buttons } = (confirmAlert as jest.Mock).mock.calls[0][0]
    buttons.find((b: { label: string }) => b.label === 'Ja').onClick()
    expect(mutate).toHaveBeenCalledWith('n1')
  })
})
