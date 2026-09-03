import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-134 — the "Words to Watch For" page kept any `new` / `practicing` word
 * where `allBookText.includes(word)`, a SUBSTRING test: "a" matched every page,
 * "in" matched *into*, "at" matched *cat*. A child with a long practice list
 * got a vocabulary page of a dozen words the book does not contain as words.
 */

const navigateMock = vi.fn()

/** Flipped per test — the child's `new` / `practicing` words. */
let practiceWords: string[] = []

function progressMap() {
  return new Map(
    practiceWords.map((word) => [
      word,
      { word, masteryLevel: 'practicing' as const, correctCount: 0, totalEncounters: 1, helpRequests: 0 },
    ]),
  )
}

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ bookId: 'book-1' }),
  useSearchParams: () => [new URLSearchParams(''), vi.fn()],
}))

vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-1', name: 'London', birthdate: '2020-01-01' },
    children: [],
    isChildProfile: true,
  }),
}))

vi.mock('../useBook', () => ({
  useBook: () => ({
    book: {
      id: 'book-1',
      childId: 'child-1',
      title: 'The Brave Dog',
      status: 'complete',
      theme: 'adventure',
      coverImageUrl: 'https://img/cover.png',
      // Deliberately no `sightWords`: the page is then built purely from the
      // child's practice list, which is what this rule governs.
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          text: 'The cat went into the barn.',
          images: [],
          layout: 'image-top',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      subjectBuckets: [],
    },
    loading: false,
  }),
}))

vi.mock('../useSightWordProgress', () => ({
  useSightWordProgress: () => ({ progressMap: progressMap(), recordInteraction: vi.fn() }),
}))

vi.mock('../useComprehensionQuestions', () => ({
  useComprehensionQuestions: () => ({ questions: [], loading: false, error: null, generate: vi.fn() }),
}))

vi.mock('firebase/firestore', () => ({ addDoc: vi.fn() }))
vi.mock('../../../core/firebase/firestore', () => ({
  artifactsCollection: () => ({}),
  booksCollection: () => ({}),
  daysCollection: () => ({}),
}))
vi.mock('../../../core/xp/addXpEvent', () => ({ addXpEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../../core/xp/addDiamondEvent', () => ({ addDiamondEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../../components/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('../PrintSettingsDialog', () => ({ default: () => null }))

import BookReaderPage from '../BookReaderPage'

/** The reader's page counter includes the vocabulary page only when it exists. */
function pageCountLabel(): string {
  return document.body.textContent ?? ''
}

beforeEach(() => {
  navigateMock.mockReset()
  practiceWords = []
})

describe('UX-134 — the vocabulary page is built from whole words', () => {
  it('adds no page at all when only substrings match', () => {
    // "in" is inside "into", "at" is inside "cat", "a" is inside "barn" —
    // none of them is a word on this page.
    practiceWords = ['in', 'at', 'a']
    render(<BookReaderPage />)
    // Cover + one content page + back cover = 3. A vocabulary page would make 4.
    expect(pageCountLabel()).toContain('1/3')
  })

  it('adds the page when a practice word really is on it', () => {
    practiceWords = ['barn']
    render(<BookReaderPage />)
    expect(pageCountLabel()).toContain('1/4')
  })

  it('takes the real words and leaves the substring matches behind', () => {
    practiceWords = ['barn', 'in', 'at']
    render(<BookReaderPage />)
    expect(pageCountLabel()).toContain('1/4')
  })
})
