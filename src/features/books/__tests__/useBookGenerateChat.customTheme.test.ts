import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * FEAT-194 — what the Generate chat does with the parent's one-off "how should
 * this book feel?" note.
 *
 * Four things: it reaches `generateStory`, it is recorded ON the book, a resumed
 * draft restores it, and a book WITHOUT one sends a payload byte-identical to
 * the request every draft made before this run sent.
 *
 * The chat hosts this control (as well as the Book Editor's Finish dialog)
 * because this is the surface that WRITES a story: a note that reaches no model
 * is the exact defect this run retired.
 */

const { chatMock, generateImageMock, addDocMock, getDocMock, setDocMock } = vi.hoisted(() => ({
  chatMock: vi.fn(),
  generateImageMock: vi.fn(),
  // Loosely typed on purpose: each test hands these a different document shape,
  // and inferring the signature from the default would pin the first one.
  addDocMock: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(),
  getDocMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  setDocMock: vi.fn<(...args: unknown[]) => Promise<void>>(),
}))

vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({ chat: chatMock, generateImage: generateImageMock, loading: false, error: null }),
  TaskType: { Chat: 'chat' },
}))

vi.mock('../../../core/firebase/firestore', () => ({
  booksCollection: () => ({ __collection: 'books' }),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: addDocMock,
  doc: vi.fn(() => ({ __ref: true })),
  getDoc: getDocMock,
  setDoc: setDocMock,
}))

vi.mock('../bookThemeInference', () => ({ inferBookTheme: () => 'fantasy' }))
vi.mock('../bookTypes', () => ({
  generatePageId: () => 'page-id',
  generateImageId: () => 'image-id',
}))

vi.mock('../useSightWordProgress', () => ({
  useSightWordProgress: () => ({
    progressMap: new Map(),
    allProgress: [],
    loading: false,
    recordInteraction: vi.fn(),
    confirmMastery: vi.fn(),
    getWeakWords: () => [],
  }),
}))

vi.mock('../useBookArtQuota', () => ({
  useBookArtQuota: () => ({
    count: 0,
    limit: 25,
    remaining: Infinity,
    atLimit: false,
    recordGeneration: vi.fn(async () => undefined),
  }),
  recordBookArtGeneration: () => undefined,
}))

import { useBookGenerateChat } from '../useBookGenerateChat'

const baseOpts = {
  familyId: 'family-1',
  childId: 'child-1',
  childName: 'Lincoln',
  childAge: 10,
  initialPageCount: 6,
  defaultIllustrationStyle: 'minecraft',
}

const STORY = {
  title: 'The Ship',
  pages: [{ pageNumber: 1, text: 'The ship is black.', sceneDescription: 'a dock' }],
}

beforeEach(() => {
  chatMock.mockReset()
  generateImageMock.mockReset()
  addDocMock.mockReset()
  addDocMock.mockResolvedValue({ id: 'book-new' })
  getDocMock.mockReset().mockResolvedValue({ exists: () => false } as unknown)
  setDocMock.mockReset().mockResolvedValue(undefined)
})

/** The parsed JSON payload of the `n`-th `chat()` call. */
function payloadOf(n: number): Record<string, unknown> {
  return JSON.parse(chatMock.mock.calls[n][0].messages[0].content)
}

describe('useBookGenerateChat — the one-off feel note (FEAT-194)', () => {
  it('starts every fresh draft with no note', () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))
    expect(result.current.customTheme).toBe('')
  })

  it('sends the note to generateStory', async () => {
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(STORY) })
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a ship')
    })
    act(() => {
      result.current.setCustomTheme('  spooky   but kind ')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })

    expect(payloadOf(0).customTheme).toBe('spooky but kind')
  })

  it('sends NO customTheme key when the parent typed none — the pre-FEAT-194 request', async () => {
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(STORY) })
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a ship')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })

    expect(payloadOf(0)).not.toHaveProperty('customTheme')
  })

  it('records the note on the book, so the book says how it was asked to feel', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    act(() => {
      result.current.setCustomTheme('warm and gentle')
    })
    await act(async () => {
      await result.current.sendKidMessage('a ship')
    })

    const created = addDocMock.mock.calls[0][1] as {
      generationConfig?: { customTheme?: string }
    }
    expect(created.generationConfig?.customTheme).toBe('warm and gentle')
  })

  it('WRITES a change once a draft exists, narrowly — the dialog can close with no handler running', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a ship')
    })
    setDocMock.mockClear()

    act(() => {
      result.current.setCustomTheme('spooky but kind')
    })

    await waitFor(() => expect(setDocMock).toHaveBeenCalled())
    const [, payload, options] = setDocMock.mock.calls[0] as [
      unknown,
      { generationConfig?: { customTheme?: string } },
      { merge?: boolean },
    ]
    expect(payload.generationConfig?.customTheme).toBe('spooky but kind')
    expect(options?.merge).toBe(true)
    // Narrow: the note, and the one field it is exclusive with (Codex P1 on
    // PR #1767). Nothing else on the book.
    expect(Object.keys(payload).sort()).toEqual(['generationConfig', 'theme'])
    expect(Object.keys(payload.generationConfig ?? {})).toEqual(['customTheme'])
  })

  it('CLEARS the inferred preset in the same write (Codex P1, PR #1767)', async () => {
    // This chat has no theme chips — it assigns an `inferBookTheme` id on every
    // create — so without this a noted book stored both, reopening Finish
    // selected a preset chip AND Custom, and the shelf's preset filter listed a
    // custom-noted book.
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a ship')
    })
    setDocMock.mockClear()
    act(() => {
      result.current.setCustomTheme('spooky but kind')
    })

    await waitFor(() => expect(setDocMock).toHaveBeenCalled())
    const [, payload] = setDocMock.mock.calls[0] as [unknown, { theme?: string }]
    expect(payload.theme).toBe('')
  })

  it('leaves the inferred preset alone when a note is CLEARED', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a ship')
    })
    act(() => {
      result.current.setCustomTheme('spooky')
    })
    setDocMock.mockClear()
    act(() => {
      result.current.setCustomTheme('')
    })

    await waitFor(() => expect(setDocMock).toHaveBeenCalled())
    const [, payload] = setDocMock.mock.calls[0] as [unknown, { theme?: string }]
    expect(payload).not.toHaveProperty('theme')
  })

  it('omits the inferred preset from a draft CREATED with a note', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    act(() => {
      result.current.setCustomTheme('spooky but kind')
    })
    await act(async () => {
      await result.current.sendKidMessage('a ship')
    })

    const created = addDocMock.mock.calls[0][1] as { theme?: string }
    expect(created.theme).toBe('')
  })

  it('still records the inferred preset on a draft created WITHOUT one', async () => {
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a ship')
    })

    const created = addDocMock.mock.calls[0][1] as { theme?: string }
    expect(created.theme).toBe('fantasy')
  })

  it("clears a note as `''` — `undefined` would survive a merge write", async () => {
    // The app runs Firestore with `ignoreUndefinedProperties`, so a cleared note
    // written as `undefined` leaves the old one stored and the book keeps a feel
    // the parent removed.
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a ship')
    })
    act(() => {
      result.current.setCustomTheme('spooky')
    })
    setDocMock.mockClear()
    act(() => {
      result.current.setCustomTheme('')
    })

    await waitFor(() => expect(setDocMock).toHaveBeenCalled())
    const [, payload] = setDocMock.mock.calls[0] as [
      unknown,
      { generationConfig?: { customTheme?: string } },
    ]
    expect(payload.generationConfig?.customTheme).toBe('')
  })

  it('keeps a note typed WHILE the draft is being created', async () => {
    let releaseCreate: (v: { id: string }) => void = () => {}
    addDocMock.mockImplementation(
      () => new Promise<{ id: string }>((resolve) => (releaseCreate = resolve)),
    )

    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    let sent: Promise<void> = Promise.resolve()
    await act(async () => {
      sent = result.current.sendKidMessage('a ship')
      await Promise.resolve()
    })

    act(() => {
      result.current.setCustomTheme('spooky but kind')
    })
    expect(setDocMock).not.toHaveBeenCalled()

    await act(async () => {
      releaseCreate({ id: 'book-new' })
      await sent
    })

    const writes = [
      ...addDocMock.mock.calls.map(([, d]) => d),
      ...setDocMock.mock.calls.map(([, d]) => d),
    ] as Array<{ generationConfig?: { customTheme?: string } }>
    const notes = writes
      .map((d) => d?.generationConfig?.customTheme)
      .filter((v): v is string => typeof v === 'string')
    expect(notes.at(-1)).toBe('spooky but kind')
    expect(result.current.customTheme).toBe('spooky but kind')
  })

  it('restores the note a resumed draft was started with', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({
        title: 'The Ship',
        pages: [],
        generationConfig: { words: [], pageCount: 6, customTheme: 'spooky but kind' },
        reviewState: { chatHistory: [], clarificationPhase: 'clarifying', pendingIdea: 'a ship' },
      }),
    } as unknown)

    const { result } = renderHook(() =>
      useBookGenerateChat({ ...baseOpts, resumeBookId: 'book-1' }),
    )

    await waitFor(() => expect(result.current.customTheme).toBe('spooky but kind'))
  })

  it('leaves a resumed draft with no note on record with none', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({
        title: 'The Ship',
        pages: [],
        generationConfig: { words: ['cat'], pageCount: 6 },
        reviewState: { chatHistory: [], clarificationPhase: 'clarifying', pendingIdea: 'a ship' },
      }),
    } as unknown)

    const { result } = renderHook(() =>
      useBookGenerateChat({ ...baseOpts, resumeBookId: 'book-1' }),
    )

    await waitFor(() => expect(result.current.pendingIdea).toBe('a ship'))
    expect(result.current.customTheme).toBe('')
  })

  it('never sends the note on a PICTURE request — a note names subject matter', async () => {
    // FEAT-189's lesson, one table over: `buildImagePrompt` appends the page's
    // own scene after its prefix, so a parent's free text there is a second
    // scene and the model splits the canvas. The illustrate calls this hook
    // makes must carry the style and the scene, and nothing of the note.
    chatMock.mockResolvedValueOnce({ message: JSON.stringify(STORY) })
    generateImageMock.mockResolvedValue({ url: 'u', storagePath: 'p' })
    const { result } = renderHook(() => useBookGenerateChat(baseOpts))

    await act(async () => {
      await result.current.sendKidMessage('a ship')
    })
    act(() => {
      result.current.setCustomTheme('a spooky forest with a kind witch')
    })
    await act(async () => {
      await result.current.confirmStartStory()
    })

    for (const call of generateImageMock.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('spooky')
      expect(JSON.stringify(call)).not.toContain('witch')
    }
  })
})
