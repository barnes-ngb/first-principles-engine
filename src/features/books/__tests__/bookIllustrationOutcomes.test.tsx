import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '../../../core/types'
import type { IllustrationProgress } from '../useBookIllustrator'

type BookRef = { family: string; id: string }
type ImageResult = { url: string; storagePath: string } | null

const state = vi.hoisted(() => ({
  generateImage: vi.fn<() => Promise<ImageResult>>(),
  chat: vi.fn(),
  record: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  remaining: Infinity,
  docs: new Map<string, Book>(),
  progressMap: new Map(),
  familyId: 'family-1',
  childId: 'child-1',
  bookId: 'book-1',
  navigate: vi.fn(),
}))

vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({ generateImage: state.generateImage, chat: state.chat }),
}))
vi.mock('../../../core/firebase/firestore', () => ({
  booksCollection: (family: string) => ({ family }),
}))
vi.mock('firebase/firestore', () => ({
  doc: (collection: { family: string }, id: string) => ({ ...collection, id }),
  getDoc: (...args: unknown[]) => state.getDoc(...args),
  setDoc: (...args: unknown[]) => state.setDoc(...args),
  addDoc: vi.fn(async () => ({ id: 'book-new' })),
}))
vi.mock('../useBookArtQuota', () => ({
  useBookArtQuota: () => ({ remaining: state.remaining, recordGeneration: state.record, limit: 25 }),
  recordBookArtGeneration: (record: () => unknown) => { void record() },
}))
vi.mock('../useSightWordProgress', () => ({
  useSightWordProgress: () => ({ progressMap: state.progressMap, loading: false }),
}))
vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => state.familyId }))
vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({ activeChild: { id: state.childId, name: 'Child', birthdate: '2016-01-01' }, isChildProfile: false }),
}))
vi.mock('../../../core/profile/useProfile', () => ({ useProfile: () => ({ profile: 'parents' }) }))
vi.mock('../../../core/hooks/useTTS', () => ({
  useTTS: () => ({ cancel: () => {}, speak: () => {}, speakQueue: () => {}, isSpeaking: false, isSupported: false }),
}))
vi.mock('../../../components/VoiceInput', () => ({
  default: (props: { onTranscript: (text: string) => void }) => (
    <button onClick={() => props.onTranscript('make it blue')}>voice-submit</button>
  ),
}))
vi.mock('react-router-dom', () => ({
  useNavigate: () => state.navigate,
  useParams: () => ({ bookId: state.bookId }),
}))

import { useBookIllustrator } from '../useBookIllustrator'
import { useBookGenerateChat } from '../useBookGenerateChat'
import { useBookReview } from '../useBookReview'
import BookGenerateChat from '../BookGenerateChat'
import BookReviewChat from '../BookReviewChat'

function makeBook(id = 'book-1', childId = 'child-1'): Book {
  const date = '2026-09-16T00:00:00.000Z'
  return {
    id, childId, title: `Synthetic ${id}`, status: 'draft', createdAt: date, updatedAt: date,
    subjectBuckets: ['LanguageArts'], bookType: 'generated', source: 'ai-generated',
    pages: [1, 2, 3].map((n) => ({
      id: `p${n}`, pageNumber: n, text: `Page ${n} story`,
      images: [{ id: `i${n}`, type: 'ai-generated', url: `old-${n}`, prompt: `scene ${n}` }],
      layout: 'image-top', createdAt: date, updatedAt: date,
    })),
    reviewState: {
      generateChatState: 'in-progress', clarificationPhase: 'ready', pendingIdea: 'a story',
      illustrationStyle: 'storybook', chatHistory: [],
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const options = {
  familyId: 'family-1', childId: 'child-1', childName: 'Child', childAge: 10,
  resumeBookId: 'book-1', initialPageCount: 6, defaultIllustrationStyle: 'storybook',
}
const illustrateOptions = {
  familyId: 'family-1', bookId: 'book-1', style: 'storybook',
  pages: [1, 2, 3].map((pageNumber) => ({ pageNumber, sceneDescription: `scene ${pageNumber}` })),
}

beforeEach(() => {
  vi.resetAllMocks()
  state.familyId = 'family-1'
  state.childId = 'child-1'
  state.bookId = 'book-1'
  state.remaining = Infinity
  state.docs.clear()
  state.docs.set('family-1/book-1', makeBook())
  state.getDoc.mockImplementation(async (ref: BookRef) => ({
    id: ref.id,
    exists: () => state.docs.has(`${ref.family}/${ref.id}`),
    data: () => structuredClone(state.docs.get(`${ref.family}/${ref.id}`)),
  }))
  state.setDoc.mockImplementation(async (ref: BookRef, data: Book) => {
    state.docs.set(`${ref.family}/${ref.id}`, structuredClone(data))
  })
  state.generateImage.mockResolvedValue({ url: 'new-image', storagePath: 'synthetic' })
  state.chat.mockResolvedValue({ message: JSON.stringify({
    newText: 'New words', newSceneDescription: 'blue scene', regenerateImage: 'yes',
  }) })
})
afterEach(cleanup)

describe('book picture outcomes through actual hooks and consumers', () => {
  it('reports a null page in result and progress while preserving successful pages and quota count', async () => {
    state.generateImage.mockResolvedValueOnce({ url: 'new-1', storagePath: 'one' })
      .mockResolvedValueOnce(null).mockResolvedValueOnce({ url: 'new-3', storagePath: 'three' })
    const ticks: IllustrationProgress[] = []
    const { result } = renderHook(() => useBookIllustrator())
    const outcome = await result.current.illustrate({ ...illustrateOptions, onProgress: p => ticks.push(p) })
    expect(outcome.failedPages).toEqual([2])
    expect(ticks.at(-1)?.failedPages).toEqual([2])
    expect(outcome.capReached).toBe(false)
    expect(state.docs.get('family-1/book-1')?.pages.map(p => p.images[0].url)).toEqual(['new-1', 'old-2', 'new-3'])
    expect(state.record).toHaveBeenCalledTimes(2)
  })

  it('skips a scene-free page without a failure or paid call', async () => {
    const { result } = renderHook(() => useBookIllustrator())
    const outcome = await result.current.illustrate({ ...illustrateOptions, pages: [{ pageNumber: 1, sceneDescription: '' }] })
    expect(outcome.failedPages).toEqual([])
    expect(state.generateImage).not.toHaveBeenCalled()
    expect(state.record).not.toHaveBeenCalled()
  })

  it('keeps thrown generation and failed saves as failures, spending only for returned images', async () => {
    state.generateImage.mockRejectedValueOnce(new Error('synthetic provider failure'))
    state.setDoc.mockRejectedValueOnce(new Error('synthetic save failure'))
    const { result } = renderHook(() => useBookIllustrator())
    const outcome = await result.current.illustrate(illustrateOptions)
    expect(outcome.failedPages).toEqual([1, 2])
    expect(outcome.capReached).toBe(false)
    expect(state.record).toHaveBeenCalledTimes(2)
    expect(state.docs.get('family-1/book-1')?.pages[1].images[0].url).toBe('old-2')
  })

  it('holds a mixed generation outcome until explicit continuation, without paying again', async () => {
    state.generateImage.mockResolvedValueOnce({ url: 'new-1', storagePath: 'one' })
      .mockResolvedValueOnce(null).mockResolvedValueOnce({ url: 'new-3', storagePath: 'three' })
    const onCommit = vi.fn()
    render(<BookGenerateChat resumeBookId="book-1" onCommit={onCommit} onAbandon={() => {}} />)
    const make = screen.getByRole('button', { name: /Make my book/ })
    await waitFor(() => expect(make).toBeEnabled())
    fireEvent.click(make)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('picture on page 2'))
    expect(onCommit).not.toHaveBeenCalled()
    expect(make).toBeDisabled()
    fireEvent.click(make)
    const open = screen.getByRole('button', { name: /take me to my book/i })
    fireEvent.click(open)
    fireEvent.click(open)
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('book-1')
    expect(state.generateImage).toHaveBeenCalledTimes(3)
    expect(state.record).toHaveBeenCalledTimes(2)
  })

  it('deduplicates commit calls before the initial save resolves and after a partial result', async () => {
    const { result } = renderHook(() => useBookGenerateChat(options))
    await waitFor(() => expect(result.current.currentStory).not.toBeNull())
    const save = deferred<void>()
    const normalSave = state.setDoc.getMockImplementation()!
    state.setDoc.mockImplementationOnce(async (...args: unknown[]) => { await save.promise; return normalSave(...args) })
    state.generateImage.mockResolvedValue(null)
    let first!: Promise<string | null>
    let second!: Promise<string | null>
    act(() => { first = result.current.commitAndClose(); second = result.current.commitAndClose() })
    await waitFor(() => expect(state.setDoc).toHaveBeenCalledTimes(1))
    expect(result.current.isCommitting).toBe(true)
    expect(state.generateImage).not.toHaveBeenCalled()
    await act(async () => { save.resolve(); await Promise.all([first, second]) })
    expect(await first).toBe('book-1')
    expect(await second).toBe('book-1')
    expect(state.generateImage).toHaveBeenCalledTimes(3)
    await act(async () => { expect(await result.current.commitAndClose()).toBe('book-1') })
    expect(state.generateImage).toHaveBeenCalledTimes(3)
    expect(result.current.illustrationProgress.failedPages).toEqual([1, 2, 3])
  })

  it('keeps normal navigation after all pictures succeed', async () => {
    const onCommit = vi.fn()
    render(<BookGenerateChat resumeBookId="book-1" onCommit={onCommit} onAbandon={() => {}} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Make my book/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Make my book/ }))
    await waitFor(() => expect(onCommit).toHaveBeenCalledExactlyOnceWith('book-1'))
    expect(state.record).toHaveBeenCalledTimes(3)
  })

  it('keeps quota refusal distinct and continues without an image call', async () => {
    state.remaining = 0
    const onCommit = vi.fn()
    render(<BookGenerateChat resumeBookId="book-1" onCommit={onCommit} onAbandon={() => {}} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Make my book/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Make my book/ }))
    await waitFor(() => expect(screen.getByText(/Your story is saved!/)).toBeVisible())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onCommit).not.toHaveBeenCalled()
    expect(state.generateImage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /take me to my book/i }))
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('book-1')
    expect(state.record).not.toHaveBeenCalled()
  })

  it('does not navigate or show an old generation result after the active child changes', async () => {
    const image = deferred<ImageResult>()
    state.generateImage.mockReturnValueOnce(image.promise)
    const onCommit = vi.fn()
    const view = render(<BookGenerateChat resumeBookId="book-1" onCommit={onCommit} onAbandon={() => {}} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Make my book/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Make my book/ }))
    await waitFor(() => expect(state.generateImage).toHaveBeenCalledTimes(1))
    state.childId = 'child-2'
    view.rerender(<BookGenerateChat resumeBookId="book-1" onCommit={onCommit} onAbandon={() => {}} />)
    await act(async () => { image.resolve(null) })
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders a failed page revision without dropping its prior picture', async () => {
    state.generateImage.mockResolvedValue(null)
    render(<BookReviewChat />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Change this/ })).toBeVisible())
    fireEvent.click(screen.getByRole('button', { name: /Change this/ }))
    fireEvent.click(screen.getByRole('button', { name: 'voice-submit' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('picture on page 1'))
    expect(screen.getByAltText('Page 1 picture')).toHaveAttribute('src', 'old-1')
    expect(screen.getByText('New words')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull()
    expect(state.record).not.toHaveBeenCalled()
  })

  it('keeps pending and failed picture outcomes visible after Skip finishes the review', async () => {
    const image = deferred<ImageResult>()
    state.generateImage.mockReturnValueOnce(image.promise)
    render(<BookReviewChat />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Change this/ })).toBeVisible())
    fireEvent.click(screen.getByRole('button', { name: /Change this/ }))
    fireEvent.click(screen.getByRole('button', { name: 'voice-submit' }))
    await waitFor(() => expect(state.generateImage).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /Skip the rest/ }))
    await waitFor(() => expect(screen.getByText(/All done!/)).toBeVisible())
    expect(screen.getByRole('status')).toHaveTextContent('Finishing a picture')
    await act(async () => { image.resolve(null) })
    expect(screen.getByRole('alert')).toHaveTextContent('picture on page 1')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: /Open my book/ })).toBeEnabled()
  })

  it('does not claim which picture is saved when the new picture saved but its reread failed', async () => {
    const read = state.getDoc.getMockImplementation()!
    state.getDoc.mockImplementation(async (ref: BookRef) => {
      if (state.docs.get(`${ref.family}/${ref.id}`)?.pages[0].images[0].url === 'new-image') {
        throw new Error('synthetic reread failure after successful image save')
      }
      return read(ref)
    })
    render(<BookReviewChat />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Change this/ })).toBeVisible())
    fireEvent.click(screen.getByRole('button', { name: /Change this/ }))
    fireEvent.click(screen.getByRole('button', { name: 'voice-submit' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong with the picture on page 1'))
    expect(state.docs.get('family-1/book-1')?.pages[0].images[0].url).toBe('new-image')
    expect(screen.getByAltText('Page 1 picture')).toHaveAttribute('src', 'old-1')
    expect(screen.getByRole('alert')).not.toHaveTextContent(/earlier picture is still there|could not finish/i)
    expect(screen.getByRole('alert')).toHaveTextContent('You can keep reading.')
    expect(state.record).toHaveBeenCalledTimes(1)
  })

  it('does not let an old family/book result replace the active book or its notices', async () => {
    const image = deferred<ImageResult>()
    state.generateImage.mockReturnValueOnce(image.promise)
    state.docs.set('family-2/book-2', makeBook('book-2', 'child-2'))
    const { result, rerender } = renderHook(({ familyId, bookId }) => useBookReview({ familyId, bookId, childName: 'Child', childAge: 10 }), {
      initialProps: { familyId: 'family-1', bookId: 'book-1' },
    })
    await waitFor(() => expect(result.current.book?.id).toBe('book-1'))
    await act(async () => { await result.current.reviseCurrentPage('make it blue') })
    rerender({ familyId: 'family-2', bookId: 'book-2' })
    await waitFor(() => expect(result.current.book?.id).toBe('book-2'))
    await act(async () => { image.resolve({ url: 'old-book-new-picture', storagePath: 'synthetic' }) })
    expect(result.current.book?.id).toBe('book-2')
    expect(result.current.imageFailedPages).toEqual([])
    expect(result.current.imageRegenerating).toBe(false)
    expect(state.docs.get('family-2/book-2')?.pages[0].images[0].url).toBe('old-1')
  })

  it('retains an earlier page failure after moving on and clears it only after that page succeeds', async () => {
    state.generateImage.mockResolvedValueOnce(null)
    const { result } = renderHook(() => useBookReview({ familyId: 'family-1', bookId: 'book-1', childName: 'Child', childAge: 10 }))
    await waitFor(() => expect(result.current.book).not.toBeNull())
    await act(async () => { await result.current.reviseCurrentPage('make it blue') })
    await waitFor(() => expect(result.current.imageFailedPages).toEqual([1]))
    await act(async () => { await result.current.gotoPage(1) })
    expect(result.current.imageFailedPages).toEqual([1])
    await act(async () => { await result.current.reviseCurrentPage('make page two blue') })
    await waitFor(() => expect(result.current.imageRegenerating).toBe(false))
    expect(result.current.imageFailedPages).toEqual([1])
    await act(async () => { await result.current.gotoPage(0); })
    await act(async () => { await result.current.reviseCurrentPage('a new scene') })
    await waitFor(() => expect(result.current.imageFailedPages).toEqual([]))
  })
})
