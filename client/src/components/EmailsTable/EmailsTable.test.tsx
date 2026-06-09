import userEvent from '@testing-library/user-event'
import { confirmAlert } from 'react-confirm-alert'
import { renderWithProviders, screen } from '../../test-utils'
import { useEmails, useDeleteEmail } from '../../hooks/api'

jest.mock('../../hooks/api', () => ({
  useEmails: jest.fn(),
  useDeleteEmail: jest.fn(),
}))
jest.mock('react-confirm-alert', () => ({ confirmAlert: jest.fn() }))

import EmailsTable from './EmailsTable'

const mockList = (over = {}) =>
  (useEmails as jest.Mock).mockReturnValue({
    data: { docs: [], totalDocs: 0, limit: 10, offset: 0 },
    isLoading: false,
    isError: false,
    error: null,
    ...over,
  })

describe('EmailsTable', () => {
  let mutate: jest.Mock
  beforeEach(() => {
    jest.clearAllMocks()
    mutate = jest.fn()
    ;(useDeleteEmail as jest.Mock).mockReturnValue({ mutate })
  })

  it('shows the empty state when there are no emails', () => {
    mockList({ data: { docs: [], totalDocs: 0 } })
    renderWithProviders(<EmailsTable />)
    expect(screen.getByText('Geen emails gevonden...')).toBeInTheDocument()
  })

  it('renders a row for each email', () => {
    mockList({
      data: {
        docs: [
          { _id: 'e1', subject: 'Hello there', emailNumber: 1 },
          { _id: 'e2', subject: 'Second mail', emailNumber: 2 },
        ],
        totalDocs: 2,
      },
    })
    renderWithProviders(<EmailsTable />)
    expect(screen.getByText('Hello there')).toBeInTheDocument()
    expect(screen.getByText('Second mail')).toBeInTheDocument()
  })

  it('deletes an email after confirmation', async () => {
    mockList({
      data: { docs: [{ _id: 'e1', subject: 'Hello there' }], totalDocs: 1 },
    })
    renderWithProviders(<EmailsTable />)
    await userEvent.click(screen.getAllByTitle('Verwijderen')[0])
    expect(confirmAlert).toHaveBeenCalledTimes(1)
    const { buttons } = (confirmAlert as jest.Mock).mock.calls[0][0]
    buttons.find((b: { label: string }) => b.label === 'Ja').onClick()
    expect(mutate).toHaveBeenCalledWith('e1')
  })
})
