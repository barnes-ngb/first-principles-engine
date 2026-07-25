import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { conundrumXpDedupKey, useConundrumDoneToday } from '../useConundrumDoneToday'

type NextHandler = (snap: { exists: () => boolean }) => void
type ErrHandler = (err: Error) => void

/** Live subscribers keyed by the order they registered, so a test can push. */
const subscribers: NextHandler[] = []
const unsubscribe = vi.fn()
const onSnapshotMock = vi.fn(
  (_ref: unknown, onNext: NextHandler, onError?: ErrHandler) => {
    subscribers.push(onNext)
    if (snapshotState.error && onError) onError(snapshotState.error)
    else onNext({ exists: () => snapshotState.exists })
    return unsubscribe
  },
)
const docMock = vi.fn((...args: unknown[]) => ({ path: args }))

const snapshotState: { exists: boolean; error: Error | null } = {
  exists: false,
  error: null,
}

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => docMock(...args),
  onSnapshot: (...args: unknown[]) =>
    (onSnapshotMock as unknown as (...a: unknown[]) => () => void)(...args),
}))

vi.mock('../../../core/firebase/firestore', () => ({
  xpLedgerCollection: vi.fn((familyId: string) => ({ familyId })),
  xpLedgerDocId: vi.fn((childId: string, dedupKey: string) => `${childId}_${dedupKey}`),
}))

function Probe({
  familyId = 'fam-1',
  childId = 'kid-1',
  today = '2026-07-25',
  enabled = true,
}: {
  familyId?: string
  childId?: string
  today?: string
  enabled?: boolean
}) {
  const done = useConundrumDoneToday(familyId, childId, today, enabled)
  return <span data-testid="done">{done ? 'yes' : 'no'}</span>
}

function doneText(): string {
  return screen.getByTestId('done').textContent ?? ''
}

afterEach(() => {
  onSnapshotMock.mockClear()
  unsubscribe.mockClear()
  docMock.mockClear()
  subscribers.length = 0
  snapshotState.exists = false
  snapshotState.error = null
})

describe('conundrumXpDedupKey', () => {
  it('matches the key both conundrum save paths stamp', () => {
    expect(conundrumXpDedupKey('2026-07-25')).toBe('conundrum_2026-07-25-xp')
  })
})

describe('useConundrumDoneToday', () => {
  it('reports done when the ledger event doc exists', async () => {
    snapshotState.exists = true
    render(<Probe />)

    await waitFor(() => expect(doneText()).toBe('yes'))
    expect(onSnapshotMock).toHaveBeenCalledTimes(1)
  })

  it('reports not-done when the ledger event doc is missing', async () => {
    render(<Probe />)

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalledTimes(1))
    expect(doneText()).toBe('no')
  })

  it('reports not-done (and never throws) when the read fails', async () => {
    snapshotState.error = new Error('offline')
    render(<Probe />)

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalledTimes(1))
    expect(doneText()).toBe('no')
  })

  it('flips to done when the kid saves mid-session, with no reload (Codex P1)', async () => {
    // KidConundrumResponse keeps "saved" in local state and writes the ledger
    // event fire-and-forget, so nothing this hook depends on changes. A
    // one-shot getDoc would leave the row unfolded until a reload.
    render(<Probe />)
    await waitFor(() => expect(doneText()).toBe('no'))

    act(() => subscribers[0]({ exists: () => true }))

    await waitFor(() => expect(doneText()).toBe('yes'))
  })

  it('subscribes once per day and tears the listener down on unmount', async () => {
    render(<Probe />)
    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalledTimes(1))

    const { unmount } = render(<Probe today="2026-07-26" />)
    unmount()

    expect(unsubscribe).toHaveBeenCalled()
  })

  it('issues no read at all when disabled (no conundrum this week)', async () => {
    snapshotState.exists = true
    render(<Probe enabled={false} />)

    await waitFor(() => expect(doneText()).toBe('no'))
    expect(onSnapshotMock).not.toHaveBeenCalled()
  })

  it('issues no read when the family / child / date is not resolved yet', async () => {
    snapshotState.exists = true
    render(<Probe childId="" />)

    await waitFor(() => expect(doneText()).toBe('no'))
    expect(onSnapshotMock).not.toHaveBeenCalled()
  })

  it('resets to false on a day change before the new subscription reports', async () => {
    snapshotState.exists = true
    const { rerender } = render(<Probe today="2026-07-25" />)
    await waitFor(() => expect(doneText()).toBe('yes'))

    // New day: the stale `true` must not leak while the next read is in flight.
    // Register the new listener without letting it emit immediately.
    onSnapshotMock.mockImplementationOnce((_ref, onNext: NextHandler) => {
      subscribers.push(onNext)
      return unsubscribe
    })
    rerender(<Probe today="2026-07-26" />)

    expect(doneText()).toBe('no')

    act(() => subscribers[subscribers.length - 1]({ exists: () => true }))
    await waitFor(() => expect(doneText()).toBe('yes'))
  })

  it('reads the ledger with the dedup doc id and never imports a write primitive', () => {
    // The xpLedger is a propose-and-confirm invariant: this hook may read it,
    // never write it. Asserted statically against the module source so a future
    // edit that reaches for setDoc/addDoc/updateDoc fails here.
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/today/useConundrumDoneToday.ts'),
      'utf8',
    )
    expect(source).toMatch(/\bonSnapshot\b/)
    expect(source).not.toMatch(/\bsetDoc\b/)
    expect(source).not.toMatch(/\baddDoc\b/)
    expect(source).not.toMatch(/\bupdateDoc\b/)
    expect(source).not.toMatch(/\bdeleteDoc\b/)
    expect(source).not.toMatch(/\bwriteBatch\b/)
    expect(source).not.toMatch(/\brunTransaction\b/)
  })
})
