import { describe, expect, it } from 'vitest'

import { bookLookupNote } from './bookLookupNote'

const base = { title: 'T', author: 'A', totalChapters: 3 }

describe('bookLookupNote (UX-464)', () => {
  it('is null when every chapter has a title and summaries were not left out', () => {
    expect(bookLookupNote({ ...base, chapters: [1, 2, 3].map((n) => ({ number: n, title: `C${n}` })) })).toBeNull()
  })

  it('names chapters that came back without a title', () => {
    expect(bookLookupNote({ ...base, chapters: [{ number: 1, title: 'C1' }] })).toBe(
      'Found titles for 1 of 3 chapters; the rest will be saved by number.',
    )
    expect(bookLookupNote(base)).toBe('No chapter titles were found; all 3 chapters will be saved by number.')
  })

  it('says when only titles were looked up', () => {
    expect(bookLookupNote({
      ...base,
      chapterSummariesOmitted: true,
      chapters: [1, 2, 3].map((n) => ({ number: n, title: `C${n}` })),
    })).toBe('This is a long book, so only chapter titles were looked up — no chapter summaries.')
  })

  it('says nothing for an unidentified book (no count to compare against)', () => {
    expect(bookLookupNote({ ...base, totalChapters: 0 })).toBeNull()
  })
})
