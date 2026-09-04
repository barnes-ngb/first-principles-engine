import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Child } from '../../core/types'

// ── FEAT-162 / UX-33(b) ──────────────────────────────────────────────────
// The wiring test, and the one that matters most here: `clearPending` already
// existed on `useShellyChatActions`, was already exported, and was already
// covered by its own unit test — and was called from NOWHERE in the UI. A
// lifecycle rail nothing invokes is not a rail. These assertions are on the
// three handlers that end a card's context, not on the clearing itself.

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  doc: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [], forEach: () => {} })),
  increment: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  orderBy: vi.fn(),
  query: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}))
vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
}))
vi.mock('../../core/firebase/firestore', () => ({
  daysCollection: vi.fn(() => ({})),
  db: {},
  shellyChatMessagesCollection: vi.fn(() => ({})),
  shellyChatThreadsCollection: vi.fn(() => ({})),
}))
vi.mock('../../core/firebase/storage', () => ({ storage: {} }))
vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({ imageFailureRef: { current: null }, chat: vi.fn(), generateImage: vi.fn(), lastErrorRef: { current: null } }),
  TaskType: { ShellyChat: 'shellyChat', Chat: 'chat' },
}))

import { useShellyChatFlows } from './useShellyChatFlows'
import { useShellyChatState } from './useShellyChatState'

const CHILDREN: Child[] = [
  { id: 'lincoln1', name: 'Lincoln' } as Child,
  { id: 'london1', name: 'London' } as Child,
]

const dropPendingForContext = vi.fn()
const stagePendingActions = vi.fn()
const currentContextScope = vi.fn(() => 0)

function setup() {
  return renderHook(() => {
    const state = useShellyChatState(null)
    const flows = useShellyChatFlows(state, {
      familyId: 'fam1',
      children: CHILDREN,
      activeChildId: 'lincoln1',
      chat: vi.fn(),
      generateImage: vi.fn(),
      lastErrorRef: { current: null },
      setSearchParams: vi.fn(),
      stagePendingActions,
      dropPendingForContext,
      currentContextScope,
    } as unknown as Parameters<typeof useShellyChatFlows>[1])
    return { state, flows }
  })
}

describe('useShellyChatFlows — a card never outlives its context (UX-33b)', () => {
  beforeEach(() => {
    dropPendingForContext.mockClear()
  })

  it('drops the pending cards when the parent switches child tabs', () => {
    const { result } = setup()
    act(() => result.current.flows.handleContextChange(null, 'london'))
    expect(dropPendingForContext).toHaveBeenCalledWith('context-switch')
  })

  it('does nothing on a no-op tab change (the toggle deselecting)', () => {
    const { result } = setup()
    act(() => result.current.flows.handleContextChange(null, null))
    expect(dropPendingForContext).not.toHaveBeenCalled()
  })

  it('drops them when the parent starts a new conversation', () => {
    const { result } = setup()
    act(() => result.current.flows.handleNewThread())
    expect(dropPendingForContext).toHaveBeenCalledWith('thread-switch')
  })

  it('drops them when the parent opens a different conversation', () => {
    const { result } = setup()
    act(() => result.current.flows.handleSelectThread('thread-9'))
    expect(dropPendingForContext).toHaveBeenCalledWith('thread-switch')
  })

  // Codex P2, PR #1706. The drawer renders the active conversation as a live
  // `ListItemButton` (`ChatThreadDrawer.tsx`, `selected` styles it but does not
  // disable it), so tapping the row you are already in reaches this handler. An
  // unconditional drop there would delete every pending card and report a
  // context change that did not happen — the silent-eat this fix exists to
  // stop, in a new place.
  it('does NOT drop them when the parent taps the conversation they are already in', () => {
    const { result } = setup()
    act(() => result.current.flows.handleSelectThread('thread-9'))
    expect(dropPendingForContext).toHaveBeenCalledTimes(1)

    act(() => result.current.flows.handleSelectThread('thread-9'))
    expect(dropPendingForContext).toHaveBeenCalledTimes(1)
  })
})
