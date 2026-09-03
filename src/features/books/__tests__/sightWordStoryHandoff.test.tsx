import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import SightWordDashboard from '../SightWordDashboard'
import CreateSightWordBook from '../CreateSightWordBook'

// UX-142 — "Generate Story from Weak Words" built `?words=a,b,c` while the
// receiving screen reads only `location.state.prefillWords`. The words went
// into the URL and nowhere on the page: a parent who tapped a button promising
// a story from THESE words got a blank words box. One contract — navigation
// state — checked from both ends here.

const navigateMock = vi.fn()
let locationState: unknown = null

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ state: locationState, pathname: '/books/create-story' }),
}))

vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-london', name: 'London', birthdate: '2020-01-01' },
    children: [],
    isChildProfile: false,
  }),
}))

const WEAK_WORDS = ['said', 'come', 'they']

vi.mock('../useSightWordProgress', () => ({
  useSightWordProgress: () => ({
    allProgress: [
      {
        word: 'said',
        masteryLevel: 'practicing',
        correctCount: 1,
        totalEncounters: 4,
        helpRequests: 2,
      },
    ],
    loading: false,
    confirmMastery: vi.fn(),
    getWeakWords: () => WEAK_WORDS,
  }),
}))

const generateStoryMock = vi.fn()
vi.mock('../useStoryGenerator', () => ({
  useStoryGenerator: () => ({ generateStory: generateStoryMock, loading: false, error: null }),
}))

vi.mock('firebase/firestore', () => ({ addDoc: vi.fn() }))
vi.mock('../../../core/firebase/firestore', () => ({ booksCollection: () => ({}) }))

vi.mock('../../../components/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

beforeEach(() => {
  navigateMock.mockReset()
  generateStoryMock.mockReset()
  locationState = null
})

describe('UX-142 — the weak-words button carries the words', () => {
  it('navigates with the words in navigation state, not a query string', async () => {
    const user = userEvent.setup()
    render(<SightWordDashboard />)
    await user.click(screen.getByRole('button', { name: /make a story from these words/i }))

    expect(navigateMock).toHaveBeenCalledTimes(1)
    const [path, options] = navigateMock.mock.calls[0]
    expect(path).toBe('/books/create-story')
    expect(path).not.toContain('?')
    expect(options?.state?.prefillWords).toEqual(WEAK_WORDS)
  })

  it('arrives on a filled form', async () => {
    locationState = { prefillWords: WEAK_WORDS, source: 'dashboard' }
    render(<CreateSightWordBook />)
    await waitFor(() => {
      const box = screen.getByLabelText(/sight words/i) as HTMLInputElement | HTMLTextAreaElement
      expect(box.value).toBe('said, come, they')
    })
  })
})

// UX-117 — the hook now names its failure; this screen has to show it. It used
// to swallow the rejection entirely: the button un-spun and nothing changed.

describe('UX-117 — the screen shows the named failure', () => {
  it('shows the message instead of leaving the screen unchanged', async () => {
    const user = userEvent.setup()
    generateStoryMock.mockRejectedValue(
      new Error('The story came back too long to finish — it ran out of room before the last page. Nothing was lost: your words are still here. Try fewer pages, then tap "Make the story" again.'),
    )
    locationState = { prefillWords: ['the', 'and'] }
    render(<CreateSightWordBook />)

    await user.click(screen.getByRole('button', { name: /make the story/i }))
    await waitFor(() => {
      expect(screen.getByText(/ran out of room/i)).toBeTruthy()
    })
    expect(screen.getByText(/Nothing was lost/i)).toBeTruthy()
  })

  it('shows the honest line above a preview the server measured as too hard', async () => {
    const user = userEvent.setup()
    generateStoryMock.mockResolvedValue({
      title: 'The Castle',
      pages: [
        { pageNumber: 1, text: 'The cat sat.', sightWordsOnPage: ['the'] },
        { pageNumber: 2, text: 'The cat ran to the castle.', sightWordsOnPage: ['the'] },
      ],
      allSightWordsUsed: ['the'],
      missedWords: [],
      readability: {
        passed: false,
        levelSource: 'age',
        hardWords: [{ page: 2, word: 'castle' }],
        hardWordCount: 1,
      },
    })
    locationState = { prefillWords: ['the'] }
    render(<CreateSightWordBook />)

    await user.click(screen.getByRole('button', { name: /make the story/i }))
    await waitFor(() => {
      expect(screen.getByText(/may be above London.s level/)).toBeTruthy()
    })
    // The clause names the hard word itself, not just a count.
    expect(screen.getByText(/1 word may be above London.s level: castle\./)).toBeTruthy()
  })
})

// UX-119 — "Missed words:" repeated whatever the model claimed. FEAT-169
// stopped trusting that claim in the chat and checks the page text instead.

describe('UX-119 — missed words are checked against the pages', () => {
  it('does not repeat a model claim the pages disprove', async () => {
    const user = userEvent.setup()
    generateStoryMock.mockResolvedValue({
      title: 'The Cat',
      pages: [{ pageNumber: 1, text: 'The cat and the dog ran.', sightWordsOnPage: [] }],
      allSightWordsUsed: [],
      // The model says it missed both — the pages hold both.
      missedWords: ['the', 'and'],
      readability: undefined,
    })
    locationState = { prefillWords: ['the', 'and'] }
    render(<CreateSightWordBook />)

    await user.click(screen.getByRole('button', { name: /make the story/i }))
    await waitFor(() => expect(screen.getByText(/Preview: The Cat/)).toBeTruthy())
    expect(screen.queryByText(/Missed words/)).toBeNull()
  })

  it('reports a word the pages really do not hold', async () => {
    const user = userEvent.setup()
    generateStoryMock.mockResolvedValue({
      title: 'The Cat',
      pages: [{ pageNumber: 1, text: 'The cat ran.', sightWordsOnPage: [] }],
      allSightWordsUsed: [],
      // The model claims a clean run; "said" is nowhere on the page.
      missedWords: [],
      readability: undefined,
    })
    locationState = { prefillWords: ['the', 'said'] }
    render(<CreateSightWordBook />)

    await user.click(screen.getByRole('button', { name: /make the story/i }))
    await waitFor(() => expect(screen.getByText(/Missed words: said/)).toBeTruthy())
  })
})
