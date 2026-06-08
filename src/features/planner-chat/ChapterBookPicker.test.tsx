import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ChapterBookPicker from './ChapterBookPicker'
import type { ChapterBook } from '../../core/types'

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'new-book' }),
}))

vi.mock('../../core/firebase/firestore', () => ({
  chapterBooksCollection: vi.fn(),
}))

const NARNIA: ChapterBook = {
  id: 'narnia',
  title: 'The Lion, the Witch and the Wardrobe',
  author: 'C.S. Lewis',
  totalChapters: 17,
  chapters: [],
  createdAt: '2026-01-01',
}

const HOBBIT: ChapterBook = {
  id: 'hobbit',
  title: 'The Hobbit',
  author: 'J.R.R. Tolkien',
  totalChapters: 19,
  chapters: [],
  createdAt: '2026-01-01',
}

describe('ChapterBookPicker — variants', () => {
  it('renders wizard variant with header', () => {
    render(
      <ChapterBookPicker
        chapterBooks={[NARNIA, HOBBIT]}
        selectedBook={null}
        onSelectedBookChange={vi.fn()}
        bookProgress={null}
        variant="wizard"
      />,
    )
    expect(screen.getByText('Read-Aloud This Week')).toBeInTheDocument()
  })

  it('renders compact variant without the wizard header', () => {
    render(
      <ChapterBookPicker
        chapterBooks={[NARNIA, HOBBIT]}
        selectedBook={null}
        onSelectedBookChange={vi.fn()}
        bookProgress={null}
        variant="compact"
      />,
    )
    expect(screen.queryByText('Read-Aloud This Week')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/read-aloud book/i)).toBeInTheDocument()
  })
})

describe('ChapterBookPicker — selection', () => {
  it('calls onSelectedBookChange when a book is picked', () => {
    const onChange = vi.fn()
    render(
      <ChapterBookPicker
        chapterBooks={[NARNIA, HOBBIT]}
        selectedBook={null}
        onSelectedBookChange={onChange}
        bookProgress={null}
        variant="compact"
      />,
    )
    fireEvent.mouseDown(screen.getByLabelText(/read-aloud book/i))
    const listbox = within(screen.getByRole('listbox'))
    fireEvent.click(listbox.getByText(/the hobbit — j\.r\.r\. tolkien/i))
    expect(onChange).toHaveBeenCalledWith(HOBBIT)
  })

  it('calls onSelectedBookChange(null) when "None" is picked', () => {
    const onChange = vi.fn()
    render(
      <ChapterBookPicker
        chapterBooks={[NARNIA]}
        selectedBook={NARNIA}
        onSelectedBookChange={onChange}
        bookProgress={null}
        variant="compact"
      />,
    )
    fireEvent.mouseDown(screen.getByLabelText(/read-aloud book/i))
    const listbox = within(screen.getByRole('listbox'))
    fireEvent.click(listbox.getByText(/none — no read-aloud this week/i))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})

describe('ChapterBookPicker — loading + error + empty states', () => {
  it('shows a loading placeholder when loading=true', () => {
    render(
      <ChapterBookPicker
        chapterBooks={[]}
        selectedBook={null}
        onSelectedBookChange={vi.fn()}
        bookProgress={null}
        variant="compact"
        loading
      />,
    )
    expect(screen.getByText(/loading chapter books/i)).toBeInTheDocument()
  })

  it('falls back to a plain text input on loadError=true', () => {
    const onChange = vi.fn()
    render(
      <ChapterBookPicker
        chapterBooks={[]}
        selectedBook={null}
        onSelectedBookChange={onChange}
        bookProgress={null}
        variant="compact"
        loadError
      />,
    )
    const input = screen.getByLabelText(/read-aloud book/i)
    expect(input.tagName).toBe('INPUT')
    fireEvent.change(input, { target: { value: 'Narnia' } })
    expect(onChange).toHaveBeenCalled()
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(last?.title).toBe('Narnia')
  })

  it('still renders the select on empty library so "Add a new book" stays reachable', () => {
    render(
      <ChapterBookPicker
        chapterBooks={[]}
        selectedBook={null}
        onSelectedBookChange={vi.fn()}
        bookProgress={null}
        variant="compact"
      />,
    )
    fireEvent.mouseDown(screen.getByLabelText(/read-aloud book/i))
    const listbox = within(screen.getByRole('listbox'))
    expect(listbox.getByText(/add a new book/i)).toBeInTheDocument()
  })
})

describe('ChapterBookPicker — look it up', () => {
  const openAddForm = () => {
    fireEvent.mouseDown(screen.getByLabelText(/read-aloud book/i))
    const listbox = within(screen.getByRole('listbox'))
    fireEvent.click(listbox.getByText(/add a new book/i))
  }

  it('hides the "Look it up" button when onLookup is not provided', () => {
    render(
      <ChapterBookPicker
        chapterBooks={[]}
        selectedBook={null}
        onSelectedBookChange={vi.fn()}
        bookProgress={null}
      />,
    )
    openAddForm()
    expect(screen.queryByRole('button', { name: /look it up/i })).not.toBeInTheDocument()
  })

  it('pre-fills the form from a successful lookup', async () => {
    const onLookup = vi.fn().mockResolvedValue({
      title: 'Prince Caspian',
      author: 'C.S. Lewis',
      totalChapters: 15,
      summary: 'A return to Narnia.',
      chapters: [{ number: 1, title: 'The Island', summary: 'They arrive.' }],
      movie: { exists: true, title: 'Prince Caspian (2008)', notes: 'Some scenes differ.' },
    })
    render(
      <ChapterBookPicker
        chapterBooks={[]}
        selectedBook={null}
        onSelectedBookChange={vi.fn()}
        bookProgress={null}
        onLookup={onLookup}
      />,
    )
    openAddForm()
    fireEvent.change(screen.getByLabelText(/^title/i), { target: { value: 'prince caspain' } })
    fireEvent.click(screen.getByRole('button', { name: /look it up/i }))
    expect(onLookup).toHaveBeenCalledWith('prince caspain')
    // Corrected title + author + chapter count fill in (all stay editable).
    expect(await screen.findByDisplayValue('C.S. Lewis')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Prince Caspian')).toBeInTheDocument()
    expect(screen.getByDisplayValue('15')).toBeInTheDocument()
    expect(screen.getByDisplayValue('The Island')).toBeInTheDocument()
  })

  it('shows an error but keeps the form usable when the lookup finds nothing', async () => {
    const onLookup = vi.fn().mockResolvedValue(null)
    render(
      <ChapterBookPicker
        chapterBooks={[]}
        selectedBook={null}
        onSelectedBookChange={vi.fn()}
        bookProgress={null}
        onLookup={onLookup}
      />,
    )
    openAddForm()
    fireEvent.change(screen.getByLabelText(/^title/i), { target: { value: 'Unknown Book' } })
    fireEvent.click(screen.getByRole('button', { name: /look it up/i }))
    expect(await screen.findByText(/couldn't find that book/i)).toBeInTheDocument()
    // The typed title is preserved so Shelly can fill the rest in manually.
    expect(screen.getByDisplayValue('Unknown Book')).toBeInTheDocument()
  })
})
