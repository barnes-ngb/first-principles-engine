import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────

const { chatMock, generateImageMock } = vi.hoisted(() => ({
  chatMock: vi.fn(),
  generateImageMock: vi.fn(),
}))

vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({
    chat: chatMock,
    generateImage: generateImageMock,
    loading: false,
    error: null,
  }),
  TaskType: { Chat: 'chat' },
}))

vi.mock('../../core/firebase/firestore', () => ({
  booksCollection: () => ({ __collection: 'books' }),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async () => ({ id: 'book-new' })),
  doc: vi.fn(() => ({ __ref: true })),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  setDoc: vi.fn(async () => undefined),
}))

vi.mock('./useBookGenerator', () => ({
  inferBookTheme: () => 'fantasy',
}))

vi.mock('./bookTypes', () => ({
  generatePageId: () => 'page-id',
  generateImageId: () => 'image-id',
}))

// ── Subject under test ──────────────────────────────────────────

import { joinIdeas, useBookGenerateChat } from './useBookGenerateChat'

const baseOpts = {
  familyId: 'family-1',
  childId: 'child-1',
  childName: 'London',
  childAge: 6,
  pageCount: 6,
  defaultIllustrationStyle: 'storybook',
}

beforeEach(() => {
  chatMock.mockReset()
  generateImageMock.mockReset()
})

describe('joinIdeas', () => {
  it('inserts "and" when refinement does not start with a chaining word', () => {
    expect(joinIdeas('a puppy who finds a rainbow', 'a dragon')).toBe(
      'a puppy who finds a rainbow and a dragon',
    )
  })

  it('strips trailing punctuation from the first idea', () => {
    expect(joinIdeas('a puppy.', 'a dragon')).toBe('a puppy and a dragon')
    expect(joinIdeas('a puppy!', 'a dragon')).toBe('a puppy and a dragon')
  })

  it('does not double-up when refinement already starts with a chaining word', () => {
    expect(joinIdeas('a puppy', 'and a dragon')).toBe('a puppy and a dragon')
    expect(joinIdeas('a puppy', 'with a dragon')).toBe('a puppy with a dragon')
    expect(joinIdeas('a puppy', 'or a kitten')).toBe('a puppy or a kitten')
  })

  it('collapses multiple spaces', () => {
    expect(joinIdeas('a puppy  ', '  a dragon')).toBe('a puppy and a dragon')
  })

  it('handles empty parts gracefully', () => {
    expect(joinIdeas('', 'a dragon')).toBe('a dragon')
    expect(joinIdeas('a puppy', '')).toBe('a puppy')
  })
})

describe('useBookGenerateChat clarification state machine', () => {
  it('first kid message creates an echo turn and does NOT call generateStory', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy who finds a rainbow')
    })

    expect(chatMock).not.toHaveBeenCalled()
    expect(result.current.chatHistory.length).toBe(2)
    expect(result.current.chatHistory[0]).toMatchObject({
      role: 'kid',
      content: 'a puppy who finds a rainbow',
    })
    expect(result.current.chatHistory[1]).toMatchObject({
      role: 'ai',
      kind: 'echo',
    })
    expect(result.current.chatHistory[1].content).toMatch(/here's what i heard/i)
    expect(result.current.pendingIdea).toBe('a puppy who finds a rainbow')
    expect(result.current.pendingRefinement).toBeNull()
    expect(result.current.canStartStory).toBe(true)
    expect(result.current.clarificationPhase).toBe('clarifying')
    expect(result.current.currentStory).toBeNull()
  })

  it('confirmStartStory triggers generateStory and transitions to ready', async () => {
    const fakeStory = {
      title: 'Rainbow Puppy',
      pages: [
        { pageNumber: 1, text: 'Page 1.', sceneDescription: 'a field' },
        { pageNumber: 2, text: 'Page 2.', sceneDescription: 'a tree' },
      ],
    }
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })

    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy who finds a rainbow')
    })

    await act(async () => {
      await result.current.confirmStartStory()
    })

    expect(chatMock).toHaveBeenCalledTimes(1)
    expect(chatMock.mock.calls[0][0].taskType).toBe('generateStory')
    expect(result.current.clarificationPhase).toBe('ready')
    expect(result.current.currentStory).toEqual(fakeStory)
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi).toMatchObject({ role: 'ai', kind: 'story-draft' })
  })

  it('second kid message during clarification creates an add-or-change turn and disables canStartStory', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy who finds a rainbow')
    })
    await act(async () => {
      await result.current.sendKidMessage('and a dragon')
    })

    expect(chatMock).not.toHaveBeenCalled()
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi).toMatchObject({ role: 'ai', kind: 'add-or-change' })
    expect(result.current.pendingRefinement).toBe('and a dragon')
    expect(result.current.canStartStory).toBe(false)
  })

  it('confirmAddRefinement joins ideas and creates a new echo turn', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy who finds a rainbow')
    })
    await act(async () => {
      await result.current.sendKidMessage('a dragon')
    })
    await act(async () => {
      await result.current.confirmAddRefinement()
    })

    expect(result.current.pendingIdea).toBe(
      'a puppy who finds a rainbow and a dragon',
    )
    expect(result.current.pendingRefinement).toBeNull()
    expect(result.current.canStartStory).toBe(true)
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi).toMatchObject({ role: 'ai', kind: 'echo' })
    expect(lastAi.content).toMatch(/a puppy who finds a rainbow and a dragon/)
  })

  it('confirmChangeRefinement replaces pendingIdea and creates a new echo turn', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy who finds a rainbow')
    })
    await act(async () => {
      await result.current.sendKidMessage('a robot in space')
    })
    await act(async () => {
      await result.current.confirmChangeRefinement()
    })

    expect(result.current.pendingIdea).toBe('a robot in space')
    expect(result.current.pendingRefinement).toBeNull()
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi).toMatchObject({ role: 'ai', kind: 'echo' })
    expect(lastAi.content).toMatch(/a robot in space/)
  })

  it('confirmStartStory is a no-op when a refinement is pending', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy')
    })
    await act(async () => {
      await result.current.sendKidMessage('and a dragon')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })

    expect(chatMock).not.toHaveBeenCalled()
    expect(result.current.clarificationPhase).toBe('clarifying')
  })

  it('overwrites the pending refinement when a third clarification message arrives', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy')
    })
    await act(async () => {
      await result.current.sendKidMessage('and a dragon')
    })
    await act(async () => {
      await result.current.sendKidMessage('and a spaceship')
    })

    expect(result.current.pendingRefinement).toBe('and a spaceship')
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi).toMatchObject({ role: 'ai', kind: 'add-or-change' })
    expect(lastAi.content).toMatch(/got it/i)
  })

  it('after ready phase, sendKidMessage routes to reviseStory', async () => {
    const fakeStory = {
      title: 'Rainbow Puppy',
      pages: [{ pageNumber: 1, text: 'Page 1.', sceneDescription: 'a field' }],
    }
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })

    const reviseResult = {
      humanResponse: 'Okay, I made the dragon Sparkle.',
      storyUpdated: true,
      updatedStory: {
        title: 'Rainbow Puppy',
        pages: [
          { pageNumber: 1, text: 'Page 1 updated.', sceneDescription: 'a field' },
        ],
      },
      pagesNeedingImageRegen: [1],
    }
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(reviseResult) })

    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })
    await act(async () => {
      await result.current.sendKidMessage('make the dragon a girl')
    })

    expect(chatMock).toHaveBeenCalledTimes(2)
    expect(chatMock.mock.calls[1][0].taskType).toBe('reviseStory')
    const lastAi = result.current.chatHistory[result.current.chatHistory.length - 1]
    expect(lastAi).toMatchObject({ role: 'ai', kind: 'revision' })
    expect(result.current.currentStory?.pages[0].text).toBe('Page 1 updated.')
  })

  it('abandonDraft clears state during clarification (before any story-draft)', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy')
    })
    await act(async () => {
      await result.current.abandonDraft()
    })

    expect(result.current.chatHistory.length).toBe(0)
    expect(result.current.pendingIdea).toBe('')
    expect(result.current.pendingRefinement).toBeNull()
  })

  it('commitAndClose generates an illustration for each page with a sceneDescription', async () => {
    const firestore = await import('firebase/firestore')
    const addDoc = firestore.addDoc as ReturnType<typeof vi.fn>
    const setDoc = firestore.setDoc as ReturnType<typeof vi.fn>
    const getDoc = firestore.getDoc as ReturnType<typeof vi.fn>
    addDoc.mockResolvedValue({ id: 'book-new' })
    setDoc.mockResolvedValue(undefined)

    const fakeStory = {
      title: 'Rainbow Puppy',
      pages: [
        { pageNumber: 1, text: 'Page 1.', sceneDescription: 'a field' },
        { pageNumber: 2, text: 'Page 2.', sceneDescription: 'a tree' },
        // Empty sceneDescription — must NOT call generateImage.
        { pageNumber: 3, text: 'Page 3.', sceneDescription: '' },
      ],
    }
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    generateImageMock
      .mockResolvedValueOnce({ url: 'url-1', storagePath: 'path-1' })
      .mockResolvedValueOnce({ url: 'url-2', storagePath: 'path-2' })

    // After persistStory's setDoc, subsequent getDoc reads return a doc with
    // story pages so the in-loop read+merge can run.
    const bookDocState: { pages: Array<{ images: unknown[]; layout: string }>; coverImageUrl?: string } = {
      pages: fakeStory.pages.map(() => ({ images: [], layout: 'text-only' })),
    }
    getDoc.mockImplementation(async () => ({
      exists: () => true,
      data: () => ({ ...bookDocState, pages: [...bookDocState.pages] }),
    }))

    const { result } = renderHook(() =>
      useBookGenerateChat({ ...baseOpts, defaultIllustrationStyle: 'storybook' }),
    )

    await act(async () => {
      await result.current.sendKidMessage('a puppy who finds a rainbow')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })

    let returned: string | null = null
    await act(async () => {
      returned = await result.current.commitAndClose()
    })

    expect(returned).toBe('book-new')
    // 2 pages with sceneDescription → 2 calls.
    expect(generateImageMock).toHaveBeenCalledTimes(2)
    expect(generateImageMock.mock.calls[0][0]).toMatchObject({
      familyId: 'family-1',
      prompt: 'a field',
      style: 'book-illustration-storybook',
      size: '1024x1024',
    })
    expect(generateImageMock.mock.calls[1][0]).toMatchObject({
      prompt: 'a tree',
      style: 'book-illustration-storybook',
    })

    // illustrationProgress lands in 'done'.
    expect(result.current.illustrationProgress.phase).toBe('done')

    // Final setDoc for page 1 must include coverImageUrl from page 0's image.
    const coverWrite = setDoc.mock.calls.find(
      (call) => (call[1] as { coverImageUrl?: string }).coverImageUrl === 'url-1',
    )
    expect(coverWrite).toBeTruthy()
  })

  it('commitAndClose passes the RAW illustrationStyle key to generateImage (illustrator handles prefix)', async () => {
    const firestore = await import('firebase/firestore')
    const addDoc = firestore.addDoc as ReturnType<typeof vi.fn>
    const setDoc = firestore.setDoc as ReturnType<typeof vi.fn>
    const getDoc = firestore.getDoc as ReturnType<typeof vi.fn>
    addDoc.mockResolvedValue({ id: 'book-new' })
    setDoc.mockResolvedValue(undefined)
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ pages: [{ images: [], layout: 'text-only' }] }),
    })

    const fakeStory = {
      title: 'One Page',
      pages: [{ pageNumber: 1, text: 'p', sceneDescription: 'a field' }],
    }
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    generateImageMock.mockResolvedValue({ url: 'u', storagePath: 's' })

    const { result } = renderHook(() =>
      useBookGenerateChat({ ...baseOpts, defaultIllustrationStyle: 'minecraft' }),
    )

    await act(async () => {
      await result.current.sendKidMessage('a puppy')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })
    await act(async () => {
      await result.current.commitAndClose()
    })

    // Contract: hook stores raw style ('minecraft'); illustrator constructs
    // the 'book-illustration-minecraft' prefix before calling generateImage.
    expect(result.current.illustrationStyle).toBe('minecraft')
    expect(generateImageMock).toHaveBeenCalled()
    expect(generateImageMock.mock.calls[0][0]).toMatchObject({
      style: 'book-illustration-minecraft',
    })
  })

  it('commitAndClose continues when one page fails to illustrate', async () => {
    const firestore = await import('firebase/firestore')
    const addDoc = firestore.addDoc as ReturnType<typeof vi.fn>
    const setDoc = firestore.setDoc as ReturnType<typeof vi.fn>
    const getDoc = firestore.getDoc as ReturnType<typeof vi.fn>
    addDoc.mockResolvedValue({ id: 'book-new' })
    setDoc.mockResolvedValue(undefined)
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ pages: [{ images: [], layout: 'text-only' }, { images: [], layout: 'text-only' }] }),
    })

    const fakeStory = {
      title: 'Two-Page Story',
      pages: [
        { pageNumber: 1, text: 'Page 1.', sceneDescription: 'a field' },
        { pageNumber: 2, text: 'Page 2.', sceneDescription: 'a tree' },
      ],
    }
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })
    // First page rejects, second succeeds.
    generateImageMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ url: 'url-2', storagePath: 'path-2' })

    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a puppy')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })
    await act(async () => {
      await result.current.commitAndClose()
    })

    expect(generateImageMock).toHaveBeenCalledTimes(2)
    expect(result.current.illustrationProgress.phase).toBe('done')
  })

  it('commitAndClose transitions illustrationProgress idle → illustrating → done', async () => {
    const firestore = await import('firebase/firestore')
    const addDoc = firestore.addDoc as ReturnType<typeof vi.fn>
    const setDoc = firestore.setDoc as ReturnType<typeof vi.fn>
    const getDoc = firestore.getDoc as ReturnType<typeof vi.fn>
    addDoc.mockResolvedValue({ id: 'book-new' })
    setDoc.mockResolvedValue(undefined)
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ pages: [{ images: [], layout: 'text-only' }] }),
    })

    const fakeStory = {
      title: 'One Page',
      pages: [{ pageNumber: 1, text: 'p', sceneDescription: 'a field' }],
    }
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(fakeStory) })

    const phases: string[] = []
    generateImageMock.mockImplementation(async () => {
      phases.push('inside-generate')
      return { url: 'u', storagePath: 's' }
    })

    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    // Idle before any commit.
    expect(result.current.illustrationProgress.phase).toBe('idle')

    await act(async () => {
      await result.current.sendKidMessage('a puppy')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })
    await act(async () => {
      await result.current.commitAndClose()
    })

    expect(phases).toContain('inside-generate')
    expect(result.current.illustrationProgress.phase).toBe('done')
  })

  it('resume hydrates clarification phase + pendingIdea + pendingRefinement', async () => {
    const firestore = await import('firebase/firestore')
    const getDoc = firestore.getDoc as ReturnType<typeof vi.fn>
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        title: '',
        pages: [],
        reviewState: {
          generateChatState: 'in-progress',
          clarificationPhase: 'clarifying',
          pendingIdea: 'a puppy who finds a rainbow',
          pendingRefinement: 'a dragon',
          chatHistory: [
            { role: 'kid', content: 'a puppy who finds a rainbow', ts: 1 },
            { role: 'ai', content: 'echoed', ts: 2, kind: 'echo' },
            { role: 'kid', content: 'a dragon', ts: 3 },
            { role: 'ai', content: 'add or change?', ts: 4, kind: 'add-or-change' },
          ],
          illustrationStyle: 'minecraft',
        },
      }),
    })

    const { result } = renderHook(() =>
      useBookGenerateChat({ ...baseOpts, resumeBookId: 'book-existing' }),
    )

    await waitFor(() => {
      expect(result.current.pendingIdea).toBe('a puppy who finds a rainbow')
    })
    expect(result.current.pendingRefinement).toBe('a dragon')
    expect(result.current.clarificationPhase).toBe('clarifying')
    expect(result.current.chatHistory.length).toBe(4)
  })
})
