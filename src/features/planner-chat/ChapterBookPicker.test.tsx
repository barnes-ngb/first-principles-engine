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
