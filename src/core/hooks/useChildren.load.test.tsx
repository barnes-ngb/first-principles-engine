import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The failed children read, and the way back from it.
 *
 * Found by an independent run while verifying the UX-273 composer gate: `getDocs`
 * and `seedProfileChildren` are both awaited in this hook's load effect with no
 * catch, so an offline start, a rules refusal or a transaction that cannot
 * commit left the promise rejected, the effect simply stopped, `isLoading` true
 * for the rest of the session and no child ever selected. Nothing on screen said
 * so — and a surface that GATES on an unsettled read (the Ask AI composer now
 * does) would wait for an answer that is never coming.
 *
 * What is asserted here is the pair that makes that sayable without pretending
 * the identity is known: on failure `isLoading` STAYS true and `loadFailed`
 * becomes true, and `retryLoad` runs the same load again. Nothing is written in
 * either direction.
 */

// `vi.mock` factories are hoisted above every module-scope `const`, so anything
// a factory dereferences as it is evaluated has to be hoisted with them —
// `vi.hoisted` is the only place these can live. The fixture children are
// Lincoln and London; Shelly is the parent whose composer gate this read gates.
const { reads, getDocsMock, seedMock } = vi.hoisted(() => {
  const reads: { reject: boolean } = { reject: false }
  const docsFor = (rows: { id: string; name: string }[]) => ({
    docs: rows.map((r) => ({ id: r.id, data: () => ({ name: r.name }) })),
  })
  return {
    reads,
    getDocsMock: vi.fn(async () => {
      if (reads.reject) throw new Error('synthetic firestore failure')
      return docsFor([
        { id: 'child-lincoln', name: 'Lincoln' },
        { id: 'child-london', name: 'London' },
      ])
    }),
    // Mocked so a failing test can never reach a real write path; both profile
    // children exist in the fixture above, so nothing is missing and this is
    // not called on the success path either.
    seedMock: vi.fn(async () => [] as { id: string; name: string }[]),
  }
})

vi.mock('firebase/firestore', () => ({ getDocs: () => getDocsMock() }))
vi.mock('../firebase/firestore', () => ({ childrenCollection: () => ({}) }))
vi.mock('../firebase/seedProfileChildren', () => ({ seedProfileChildren: seedMock }))
vi.mock('../auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
vi.mock('../profile/useProfile', () => ({ useProfile: () => ({ profile: 'parents' }) }))

import { setActiveChildIdShared } from './activeChildStore'
import { setSharedChildren } from './childrenStore'
import { useChildren } from './useChildren'

function Probe() {
  const { children, isLoading, loadFailed, retryLoad, selectedChildId } = useChildren()
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="failed">{String(Boolean(loadFailed))}</span>
      <span data-testid="count">{children.length}</span>
      <span data-testid="selected">{selectedChildId}</span>
      <button onClick={() => retryLoad?.()}>retry</button>
    </div>
  )
}

const text = (id: string) => screen.getByTestId(id).textContent

beforeEach(() => {
  reads.reject = false
  getDocsMock.mockClear()
  seedMock.mockClear()
  setSharedChildren([])
  setActiveChildIdShared('')
})

afterEach(() => {
  setSharedChildren([])
  setActiveChildIdShared('')
})

describe('a children read that rejects', () => {
  it('says it failed, keeps the identity unknown, and selects nobody', async () => {
    reads.reject = true
    render(<Probe />)

    await waitFor(() => expect(text('failed')).toBe('true'))
    // Still loading, deliberately: a failed read is not an empty family, so
    // every gate that keys on "not settled" keeps holding.
    expect(text('loading')).toBe('true')
    expect(text('count')).toBe('0')
    expect(text('selected')).toBe('')
    expect(seedMock).not.toHaveBeenCalled()
  })

  it('loads normally on the retry, and clears the failure', async () => {
    reads.reject = true
    render(<Probe />)
    await waitFor(() => expect(text('failed')).toBe('true'))

    reads.reject = false
    fireEvent.click(screen.getByText('retry'))

    await waitFor(() => expect(text('loading')).toBe('false'))
    expect(text('failed')).toBe('false')
    // The retry IS the same load: the same dedupe, the same seeding rule and the
    // same profile-based selection as a first attempt.
    expect(text('count')).toBe('2')
    expect(text('selected')).toBe('child-lincoln')
    expect(getDocsMock).toHaveBeenCalledTimes(2)
    expect(seedMock).not.toHaveBeenCalled()
  })

  it('leaves an ordinary successful read exactly as it was', async () => {
    render(<Probe />)

    await waitFor(() => expect(text('loading')).toBe('false'))
    expect(text('failed')).toBe('false')
    expect(text('count')).toBe('2')
    expect(text('selected')).toBe('child-lincoln')
    expect(getDocsMock).toHaveBeenCalledTimes(1)
  })

  it('does not report a failure from a load the unmount made obsolete', async () => {
    reads.reject = true
    const view = render(<Probe />)
    view.unmount()
    // The rejection lands after the unmount; the cancellation flag swallows it,
    // so nothing is set on a dead instance and no unhandled rejection escapes.
    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('failed')).not.toBeInTheDocument()
  })
})
