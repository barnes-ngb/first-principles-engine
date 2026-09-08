/**
 * UX-189, the wiring half — the gate and the meter sit at the funnel.
 *
 * Driven through `handleJustGenerate`, a real user path, rather than through the
 * button: hiding the button was never the fix. The audit found SIX handlers with
 * no capability check on a route that is nav-gated only, and every one of them
 * funnels into `handleGenerateImageDirect`, which is where both rails live. What
 * is asserted is therefore what the funnel does — refuse before the paid call,
 * count only once a picture exists.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const addDoc = vi.fn()
const updateDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDoc(...args),
  updateDoc: (...args: unknown[]) => updateDoc(...args),
  doc: vi.fn(() => ({ __doc: true })),
  increment: vi.fn((n: number) => ({ __increment: n })),
  collection: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  // Only so the hook's unrelated thread-migration effect stays quiet.
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn(async () => {}) })),
}))

vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}))

vi.mock('../../core/firebase/storage', () => ({ storage: {} }))

vi.mock('../../core/firebase/firestore', () => ({
  shellyChatMessagesCollection: vi.fn(() => ({ __collection: true })),
  shellyChatThreadsCollection: vi.fn(() => ({ __collection: true })),
}))

const recordGeneration = vi.fn(async () => {})

import { useShellyChatFlows } from './useShellyChatFlows'
import { CHAT_IMAGE_KID_NOTICE, ART_QUOTA_MESSAGE } from './chatImageAccess'
import type { ShellyChatState } from './useShellyChatState'

const generateImage = vi.fn()

const IDEA = 'a dragon on a skateboard'

/** Only the slice the two handlers under test actually read. */
function fakeState(): ShellyChatState {
  const noop = vi.fn()
  return new Proxy({} as ShellyChatState, {
    get(_t, prop: string) {
      if (prop === 'activeThreadId') return 'thread1'
      if (prop === 'chatContext') return 'lincoln'
      if (prop === 'messages' || prop === 'uploadFiles' || prop === 'uploadPreviews') return []
      if (prop === 'imageQuestions') return []
      if (prop === 'imageAnswers') return {}
      if (prop === 'input') return ''
      // The idea the parent typed — `handleJustGenerate` reads it off state.
      if (prop === 'imageIdea') return IDEA
      if (prop === 'pendingAttachments') return []
      if (prop === 'pendingReferenceImage') return null
      if (prop.endsWith('Ref')) return { current: null }
      return noop
    },
  })
}

function setup(opts: { isParent: boolean; atLimit?: boolean }) {
  return renderHook(() =>
    useShellyChatFlows(fakeState(), {
      familyId: 'fam1',
      children: [],
      activeChildId: 'lincoln1',
      chat: vi.fn() as never,
      generateImage: generateImage as never,
      lastErrorRef: { current: null } as never,
      imageFailureRef: { current: null } as never,
      setSearchParams: vi.fn(),
      stagePendingActions: vi.fn(),
      currentContextScope: () => 0,
      dropPendingForContext: vi.fn(),
      isParent: opts.isParent,
      artQuota: { atLimit: opts.atLimit ?? false, recordGeneration },
    }),
  )
}

const contentOf = (call: unknown[]): string =>
  (call[1] as { content?: string }).content ?? ''

beforeEach(() => {
  vi.clearAllMocks()
  addDoc.mockResolvedValue({ id: 'msg1' })
  updateDoc.mockResolvedValue(undefined)
  generateImage.mockResolvedValue({ url: 'https://example.test/pic.png' })
})

describe('the image funnel refuses a child (UX-189)', () => {
  it('never reaches the paid call', async () => {
    const { result } = setup({ isParent: false })

    await act(async () => {
      await result.current.handleJustGenerate()
    })

    expect(generateImage).not.toHaveBeenCalled()
  })

  it('spends no quota, because a refused generation is not a generation', async () => {
    const { result } = setup({ isParent: false })

    await act(async () => {
      await result.current.handleJustGenerate()
    })

    expect(recordGeneration).not.toHaveBeenCalled()
  })

  it('says where a picture CAN be made rather than stopping dead', async () => {
    const { result } = setup({ isParent: false })

    await act(async () => {
      await result.current.handleJustGenerate()
    })

    const said = addDoc.mock.calls.map(contentOf).join(' ')
    expect(said).toBe(CHAT_IMAGE_KID_NOTICE)
    expect(said).toContain('Stickers page')
  })
})

describe('the image funnel meters a parent on the shared counter (UX-189)', () => {
  it('counts exactly one generation when a picture comes back', async () => {
    const { result } = setup({ isParent: true })

    await act(async () => {
      await result.current.handleJustGenerate()
    })

    expect(generateImage).toHaveBeenCalledTimes(1)
    expect(recordGeneration).toHaveBeenCalledTimes(1)
  })

  it('counts nothing when the call comes back with no image', async () => {
    // A refusal, a block, a dead call: the money may or may not have been spent
    // upstream, but nothing was produced, so the child-facing counter must not
    // move (FEAT-167).
    generateImage.mockResolvedValue({ url: undefined })
    const { result } = setup({ isParent: true })

    await act(async () => {
      await result.current.handleJustGenerate()
    })

    expect(recordGeneration).not.toHaveBeenCalled()
  })

  it('refuses at the cap without spending a call or a count', async () => {
    const { result } = setup({ isParent: true, atLimit: true })

    await act(async () => {
      await result.current.handleJustGenerate()
    })

    expect(generateImage).not.toHaveBeenCalled()
    expect(recordGeneration).not.toHaveBeenCalled()
    expect(addDoc.mock.calls.map(contentOf).join(' ')).toBe(ART_QUOTA_MESSAGE)
  })
})
