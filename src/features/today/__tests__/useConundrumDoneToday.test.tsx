import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { conundrumXpDedupKey, useConundrumDoneToday } from '../useConundrumDoneToday'

const getDocMock = vi.fn()
const docMock = vi.fn((...args: unknown[]) => ({ path: args }))

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => docMock(...args),
  getDoc: (...args: unknown[]) => getDocMock(...args),
}))

vi.mock('../../../core/firebase/firestore', () => ({
  xpLedgerCollection: vi.fn((familyId: string) => ({ familyId })),
  xpLedgerDocId: vi.fn((childId: string, dedupKey: string) => `${childId}_${dedupKey}`),
}))

function exists(value: boolean) {
  return Promise.resolve({ exists: () => value })
}

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
  getDocMock.mockReset()
  docMock.mockClear()
})

describe('conundrumXpDedupKey', () => {
  it('matches the key both conundrum save paths stamp', () => {
    expect(conundrumXpDedupKey('2026-07-25')).toBe('conundrum_2026-07-25-xp')
  })
})

describe('useConundrumDoneToday', () => {
  it('reports done when the ledger event doc exists', async () => {
    getDocMock.mockReturnValue(exists(true))
    render(<Probe />)

    await waitFor(() => expect(doneText()).toBe('yes'))
    expect(getDocMock).toHaveBeenCalledTimes(1)
  })

  it('reports not-done when the ledger event doc is missing', async () => {
    getDocMock.mockReturnValue(exists(false))
    render(<Probe />)

    await waitFor(() => expect(getDocMock).toHaveBeenCalledTimes(1))
    expect(doneText()).toBe('no')
  })

  it('reports not-done (and never throws) when the read fails', async () => {
    getDocMock.mockReturnValue(Promise.reject(new Error('offline')))
    render(<Probe />)

    await waitFor(() => expect(getDocMock).toHaveBeenCalledTimes(1))
    expect(doneText()).toBe('no')
  })

  it('issues no read at all when disabled (no conundrum this week)', async () => {
    getDocMock.mockReturnValue(exists(true))
    render(<Probe enabled={false} />)

    await waitFor(() => expect(doneText()).toBe('no'))
    expect(getDocMock).not.toHaveBeenCalled()
  })

  it('issues no read when the family / child / date is not resolved yet', async () => {
    getDocMock.mockReturnValue(exists(true))
    render(<Probe childId="" />)

    await waitFor(() => expect(doneText()).toBe('no'))
    expect(getDocMock).not.toHaveBeenCalled()
  })

  it('resets to false on a day change before the new read resolves', async () => {
    getDocMock.mockReturnValue(exists(true))
    const { rerender } = render(<Probe today="2026-07-25" />)
    await waitFor(() => expect(doneText()).toBe('yes'))

    // New day: the stale `true` must not leak while the next read is in flight.
    let resolveNext: ((v: { exists: () => boolean }) => void) | undefined
    getDocMock.mockReturnValue(new Promise((res) => { resolveNext = res }))
    rerender(<Probe today="2026-07-26" />)

    expect(doneText()).toBe('no')

    resolveNext!({ exists: () => true })
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
    expect(source).toMatch(/\bgetDoc\b/)
    expect(source).not.toMatch(/\bsetDoc\b/)
    expect(source).not.toMatch(/\baddDoc\b/)
    expect(source).not.toMatch(/\bupdateDoc\b/)
    expect(source).not.toMatch(/\bdeleteDoc\b/)
    expect(source).not.toMatch(/\bwriteBatch\b/)
    expect(source).not.toMatch(/\brunTransaction\b/)
  })
})
