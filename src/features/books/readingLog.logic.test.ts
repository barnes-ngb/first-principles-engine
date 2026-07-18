import { describe, expect, it } from 'vitest'

import { buildReadingCompletionContent, buildReadingHoursNotes } from './readingLog.logic'

const book = {
  title: 'The Brave Dog',
  pages: [{}, {}, {}] as never,
  sightWords: ['the', 'dog'],
}

describe('buildReadingCompletionContent (Share artifact)', () => {
  it('non-call path: no audience clause (byte-identical to pre-Story-Call)', () => {
    const content = buildReadingCompletionContent(book, 'London')
    expect(content).toContain('London read "The Brave Dog" — 3 pages')
    expect(content).toContain('Practiced 2 sight words')
    expect(content).toContain('Completed reading on')
    expect(content).not.toContain('video call')
  })

  it('call path: appends the audience clause and keeps everything else', () => {
    const withAudience = buildReadingCompletionContent(book, 'London', 'Mimi')
    expect(withAudience).toContain('Read aloud to Mimi on a video call')
    // Only difference from the un-stamped content is the inserted audience clause.
    const withoutAudience = buildReadingCompletionContent(book, 'London')
    expect(withAudience).toBe(
      withoutAudience.replace(
        '. Completed reading on',
        '. Read aloud to Mimi on a video call. Completed reading on',
      ),
    )
  })

  it('omits the sight-words clause when there are none', () => {
    const content = buildReadingCompletionContent({ ...book, sightWords: [] }, 'London')
    expect(content).not.toContain('sight words')
  })
})

describe('buildReadingHoursNotes', () => {
  it('non-call path: no Story Call suffix (byte-identical)', () => {
    const notes = buildReadingHoursNotes('The Brave Dog', true, 3, 3, 2)
    expect(notes).toBe('Read "The Brave Dog" (3 pages, completed) — 2 sight words')
  })

  it('call path: appends the Story Call clause', () => {
    const notes = buildReadingHoursNotes('The Brave Dog', true, 3, 3, 2, 'Papa')
    expect(notes).toBe(
      'Read "The Brave Dog" (3 pages, completed) — 2 sight words (Story Call — read to Papa)',
    )
  })

  it('partial read still stamps the audience', () => {
    const notes = buildReadingHoursNotes('The Brave Dog', false, 1, 3, 0, 'Someone else')
    expect(notes).toBe('Read "The Brave Dog" (1/3 pages) (Story Call — read to Someone else)')
  })

  it('an undefined audience produces the same note as omitting it', () => {
    expect(buildReadingHoursNotes('B', true, 2, 2, 0, undefined)).toBe(
      buildReadingHoursNotes('B', true, 2, 2, 0),
    )
  })
})
