import axios from 'axios'
import { createQueryWrapper, renderHook, waitFor } from '../../test-utils'
import {
  useNotesList,
  useNote,
  useCreateOrUpdateNote,
  useDeleteNote,
} from './useNotes'

jest.mock('axios')

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useNotesList', () => {
  it('fetches /api/notes with no params and returns the data', async () => {
    const notes = { docs: [{ _id: 'n1' }], totalDocs: 1, page: 1 }
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: notes } })

    const { result } = renderHook(() => useNotesList(''), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/notes')
    expect(result.current.data).toEqual(notes)
  })

  it('appends a query string to the url', async () => {
    const notes = { docs: [], totalDocs: 0, page: 1 }
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: notes } })

    const { result } = renderHook(() => useNotesList('?offset=10'), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/notes?offset=10')
  })
})

describe('useNote', () => {
  it('fetches /api/note/<id> and returns the data', async () => {
    const note = { _id: 'n1', body: 'Remember this' }
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { data: note } })

    const { result } = renderHook(() => useNote('n1'), {
      wrapper: createQueryWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.get).toHaveBeenCalledWith('/api/note/n1')
    expect(result.current.data).toEqual(note)
  })
})

describe('useCreateOrUpdateNote', () => {
  it('posts to /api/note with the note payload', async () => {
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { data: { _id: 'n1', body: 'Remember this' } },
    })

    const { result } = renderHook(() => useCreateOrUpdateNote(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate({ body: 'Remember this' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.post).toHaveBeenCalledWith('/api/note', {
      body: 'Remember this',
    })
  })
})

describe('useDeleteNote', () => {
  it('deletes /api/notes/<id>', async () => {
    ;(axios.delete as jest.Mock).mockResolvedValue({
      data: { data: { _id: 'n1' } },
    })

    const { result } = renderHook(() => useDeleteNote(), {
      wrapper: createQueryWrapper(),
    })

    result.current.mutate('n1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(axios.delete).toHaveBeenCalledWith('/api/notes/n1')
  })
})
