import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// The line subscribes read-only to one `bookProgress` document. The mock hands
// the test the listener so it can deliver snapshots, and records that nothing
// but `onSnapshot` is ever called (no updateDoc / setDoc exists to call).
let deliver: ((snap: { exists: () => boolean; data: () => unknown }) => void) | null = null
const subscribedIds: string[] = []

vi.mock('firebase/firestore', () => ({
  doc: (_c: unknown, id: string) => ({ id }),
  onSnapshot: (ref: { id: string }, next: typeof deliver) => {
    subscribedIds.push(ref.id)
    deliver = next
    return () => {}
  },
}))
vi.mock('../../core/firebase/firestore', () => ({
  bookProgressCollection: vi.fn(() => ({})),
  bookProgressDocId: (childId: string, bookId: string) => `${childId}_${bookId}`,
}))

import ReadAloudChapterLine from './ReadAloudChapterLine'

const snap = (data: unknown) => ({ exists: () => data !== null, data: () => data })

describe('ReadAloudChapterLine (FEAT-243)', () => {
  it("reads THIS child's bookProgress and follows it when it changes", () => {
    render(<ReadAloudChapterLine familyId="fam" childId="lincoln" childName="Lincoln" chapterBookId="dark-sea" />)
    expect(subscribedIds.at(-1)).toBe('lincoln_dark-sea')

    act(() => deliver!(snap({ totalChapters: 58, lastChapterAnswered: 7 })))
    expect(screen.getByText('Lincoln: chapter 7 of 58')).toBeInTheDocument()

    act(() => deliver!(snap({ totalChapters: 58, lastChapterAnswered: 8 })))
    expect(screen.getByText('Lincoln: chapter 8 of 58')).toBeInTheDocument()
  })

  it('says nothing when there is no record', () => {
    const { container } = render(
      <ReadAloudChapterLine familyId="fam" childId="london" childName="London" chapterBookId="dark-sea" />,
    )
    act(() => deliver!(snap(null)))
    expect(container).toBeEmptyDOMElement()
  })
})
