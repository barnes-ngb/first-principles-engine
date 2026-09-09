import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Codex round 1 on PR #1817 (UX-324). Making the header chip a real switcher
 * opened a door this area never had: the Books screens carry no `ChildSelector`
 * of their own, so until now a parent could not change child while holding a
 * generated story. `CreateSightWordBook` keeps its story in local state and
 * stamped `childId` / `createdFor` from whoever was active at the moment
 * Finish was tapped — so generate for Lincoln, switch to London, tap Finish,
 * and Lincoln's story (his words, his reading level) was saved into London's
 * books, silently.
 *
 * The write follows the DRAFT, not the header — and the screen says so.
 */

const navigateMock = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ state: null, pathname: '/books/create-story' }),
}))

vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))

const LINCOLN = { id: 'child-lincoln', name: 'Lincoln', birthdate: '2015-09-30' }
const LONDON = { id: 'child-london', name: 'London', birthdate: '2020-02-20' }
const activeRef = { current: LINCOLN }

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: activeRef.current,
    activeChildId: activeRef.current.id,
    children: [LINCOLN, LONDON],
    setActiveChildId: vi.fn(),
    isChildProfile: false,
  }),
}))

vi.mock('../useSightWordProgress', () => ({
  useSightWordProgress: () => ({
    allProgress: [],
    loading: false,
    confirmMastery: vi.fn(),
    getWeakWords: () => [],
  }),
}))

const generateStoryMock = vi.fn()
vi.mock('../useStoryGenerator', () => ({
  useStoryGenerator: () => ({ generateStory: generateStoryMock, loading: false, error: null }),
}))

const addDocMock = vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({
  id: 'book-1',
}))
vi.mock('firebase/firestore', () => ({ addDoc: (...a: unknown[]) => addDocMock(...a) }))
vi.mock('../../../core/firebase/firestore', () => ({ booksCollection: () => ({}) }))
vi.mock('../../../components/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import CreateSightWordBook from '../CreateSightWordBook'

const STORY = {
  title: 'The Cat and the Dog',
  pages: [
    { pageNumber: 1, text: 'The cat sat.', sightWordsOnPage: ['the'] },
    { pageNumber: 2, text: 'The dog ran.', sightWordsOnPage: ['the'] },
  ],
  allSightWordsUsed: ['the'],
}

/** Type the words, generate, and land on the preview — always under Lincoln. */
async function generateForLincoln(user: ReturnType<typeof userEvent.setup>) {
  activeRef.current = LINCOLN
  const { rerender } = render(<CreateSightWordBook />)
  await user.type(screen.getByLabelText(/sight words/i), 'the, cat, dog')
  generateStoryMock.mockResolvedValue(STORY)
  await user.click(screen.getByRole('button', { name: /make the story/i }))
  await screen.findByText(/Preview: The Cat and the Dog/i)
  return rerender
}

beforeEach(() => {
  navigateMock.mockReset()
  generateStoryMock.mockReset()
  addDocMock.mockReset()
  addDocMock.mockResolvedValue({ id: 'book-1' })
  activeRef.current = LINCOLN
})

describe('CreateSightWordBook — a switch does not re-file the story (Codex round 1, UX-324)', () => {
  it('saves the story to the child it was written for, not the header', async () => {
    const user = userEvent.setup()
    const rerender = await generateForLincoln(user)

    // The parent switches child in the header — now reachable on this screen.
    activeRef.current = LONDON
    rerender(<CreateSightWordBook />)

    await user.click(screen.getByRole('button', { name: /finish book/i }))
    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1))

    const written = addDocMock.mock.calls[0][1] as unknown as {
      childId: string
      createdFor: string
    }
    expect(written.childId).toBe(LINCOLN.id)
    expect(written.createdFor).toBe(LINCOLN.id)
  })

  it('says whose story it is BEFORE the tap, not in the receipt after it', async () => {
    const user = userEvent.setup()
    const rerender = await generateForLincoln(user)
    activeRef.current = LONDON
    rerender(<CreateSightWordBook />)

    expect(
      screen.getByText(/written for Lincoln, so it will be saved to Lincoln's books/i),
    ).toBeInTheDocument()
  })

  it('says nothing while the header still agrees with the draft', async () => {
    const user = userEvent.setup()
    await generateForLincoln(user)
    expect(screen.queryByText(/so it will be saved to/i)).not.toBeInTheDocument()
  })

  it('routes "Edit in Book Editor" to the same child', async () => {
    const user = userEvent.setup()
    const rerender = await generateForLincoln(user)
    activeRef.current = LONDON
    rerender(<CreateSightWordBook />)

    await user.click(screen.getByRole('button', { name: /edit in book editor/i }))
    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1))
    const written = addDocMock.mock.calls[0][1] as unknown as {
      childId: string
      createdFor: string
    }
    expect(written.childId).toBe(LINCOLN.id)
    expect(written.createdFor).toBe(LINCOLN.id)
  })

  it('still writes the active child when nothing was switched', async () => {
    const user = userEvent.setup()
    await generateForLincoln(user)
    await user.click(screen.getByRole('button', { name: /finish book/i }))
    await waitFor(() => expect(addDocMock).toHaveBeenCalledTimes(1))
    const written = addDocMock.mock.calls[0][1] as unknown as { childId: string }
    expect(written.childId).toBe(LINCOLN.id)
  })
})
