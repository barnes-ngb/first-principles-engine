import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import type { ChatAction, Child } from '../../core/types'

// ── Mocks ────────────────────────────────────────────────────────
// Route applyChatAction through the shared sight-word writers (mocked) and a
// mocked Firestore so the propose→confirm→write contract is testable without
// touching real Firebase.
const addSightWord = vi.fn()
const removeSightWord = vi.fn()
vi.mock('../books/useSightWordProgress', () => ({
  addSightWord: (...args: unknown[]) => addSightWord(...args),
  removeSightWord: (...args: unknown[]) => removeSightWord(...args),
}))

const updateDoc = vi.fn()
const arrayUnion = vi.fn((...v: unknown[]) => ({ __arrayUnion: v[0] }))
const doc = vi.fn((...args: unknown[]) => ({ __doc: args.length }))
vi.mock('firebase/firestore', () => ({
  updateDoc: (...args: unknown[]) => updateDoc(...args),
  arrayUnion: (...args: unknown[]) => arrayUnion(...args),
  doc: (...args: unknown[]) => doc(...args),
}))

vi.mock('../../core/firebase/firestore', () => ({
  shellyChatMessagesCollection: vi.fn(() => ({ __collection: true })),
}))

import { useShellyChatActions } from './useShellyChatActions'

const CHILDREN: Child[] = [
  { id: 'lincoln1', name: 'Lincoln' } as Child,
  { id: 'london1', name: 'London' } as Child,
]

function setup(activeChildId = 'lincoln1', activeThreadId: string | null = 'thread1') {
  return renderHook(() =>
    useShellyChatActions({
      familyId: 'fam1',
      children: CHILDREN,
      activeChildId,
      activeThreadId,
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  addSightWord.mockResolvedValue(undefined)
  removeSightWord.mockResolvedValue(undefined)
  updateDoc.mockResolvedValue(undefined)
})

describe('useShellyChatActions', () => {
  it('does not write when actions are merely staged (no confirm tap)', () => {
    const { result } = setup()
    const action: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'because' }

    act(() => result.current.stagePendingActions('msg1', [action]))

    expect(result.current.pending).toHaveLength(1)
    expect(result.current.pending[0].status).toBe('pending')
    expect(addSightWord).not.toHaveBeenCalled()
    expect(removeSightWord).not.toHaveBeenCalled()
  })

  it('routes a confirmed addSightWord through the shared writer', async () => {
    const { result } = setup()
    const action: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'Because' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(action)
    })

    expect(ok).toBe(true)
    expect(addSightWord).toHaveBeenCalledWith('fam1', 'lincoln1', 'Because')
    expect(removeSightWord).not.toHaveBeenCalled()
    expect(result.current.pending[0].status).toBe('applied')
  })

  it('routes a confirmed removeSightWord through the shared writer', async () => {
    const { result } = setup()
    const action: ChatAction = { kind: 'removeSightWord', childId: 'lincoln1', word: 'the' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    await act(async () => {
      await result.current.applyChatAction(action)
    })

    expect(removeSightWord).toHaveBeenCalledWith('fam1', 'lincoln1', 'the')
    expect(addSightWord).not.toHaveBeenCalled()
  })

  it('records the applied action inline on the source message', async () => {
    const { result } = setup()
    const action: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'said' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    await act(async () => {
      await result.current.applyChatAction(action)
    })

    expect(updateDoc).toHaveBeenCalledTimes(1)
    expect(arrayUnion).toHaveBeenCalledWith(
      expect.objectContaining({ action, appliedAt: expect.any(String) }),
    )
  })

  it('rejects an action whose childId is not a family child', async () => {
    const { result } = setup()
    const action: ChatAction = { kind: 'addSightWord', childId: 'ghost', word: 'because' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(action)
    })

    expect(ok).toBe(false)
    expect(addSightWord).not.toHaveBeenCalled()
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('rejects an action that targets a child other than the active context', async () => {
    const { result } = setup('lincoln1')
    // london1 is a real child, but the active tab is Lincoln.
    const action: ChatAction = { kind: 'addSightWord', childId: 'london1', word: 'cat' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.applyChatAction(action)
    })

    expect(ok).toBe(false)
    expect(addSightWord).not.toHaveBeenCalled()
  })

  it('is idempotent and safe to re-tap a confirmed action', async () => {
    const { result } = setup()
    const action: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'and' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    await act(async () => {
      await result.current.applyChatAction(action)
      await result.current.applyChatAction(action)
    })

    // The writer is safe to call again (setDoc merge); no throw, still applied.
    expect(addSightWord).toHaveBeenCalledTimes(2)
    expect(result.current.pending[0].status).toBe('applied')
  })

  it('dismisses an action without writing', async () => {
    const { result } = setup()
    const action: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'play' }

    act(() => result.current.stagePendingActions('msg1', [action]))
    act(() => result.current.dismissAction(action))

    expect(result.current.pending[0].status).toBe('dismissed')
    expect(addSightWord).not.toHaveBeenCalled()
  })

  it('confirmAll applies every still-pending action', async () => {
    const { result } = setup()
    const a1: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'and' }
    const a2: ChatAction = { kind: 'addSightWord', childId: 'lincoln1', word: 'said' }

    act(() => result.current.stagePendingActions('msg1', [a1, a2]))
    await act(async () => {
      await result.current.confirmAll()
    })

    expect(addSightWord).toHaveBeenCalledTimes(2)
    expect(result.current.pending.every((p) => p.status === 'applied')).toBe(true)
  })
})
