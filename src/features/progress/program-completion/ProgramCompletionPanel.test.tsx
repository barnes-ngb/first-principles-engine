import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CompletionProjectionStatus,
  ProgramCompletionProgram,
  type ProgramCompletionState,
} from '../../../core/types/programCompletion'
import { NativeProgressSource } from '../../../core/types/nativeProgress'

/**
 * The finished-program surface, in the DOM (FEAT-242).
 *
 * The hook tests next door prove the write is attributed to the record it was
 * confirmed for. These prove what a PARENT ends up looking at, which is a
 * different question and the one the independent review reopened:
 *
 *   1. a confirmed save whose answer never came back survives a child switch as
 *      its own retry panel, named for the child it was confirmed for — it does
 *      not evaporate, and its notice is not attached to the new child's record;
 *   2. a change of ACCOUNT discards it instead, because nothing pinned to the
 *      previous sign-in may stay on screen or stay retryable;
 *   3. a retry's late answer settles only the request it belongs to, so a newer
 *      stranded entry is never marked saved by an older answer; and
 *   4. the apply receipt says which of three things happened — updated, already
 *      up to date, or recorded-but-NOT-updated — rather than claiming success
 *      whenever the write did not report a duplicate.
 */

let familyId: string | null = 'fam-1'
vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => familyId }))

let activeChildId = 'alice'
const CHILDREN: Record<string, { id: string; name: string }> = {
  alice: { id: 'alice', name: 'Alice' },
  bob: { id: 'bob', name: 'Bob' },
}
let childrenById = CHILDREN
let isChildProfile = false
vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId,
    activeChild: childrenById[activeChildId],
    children: Object.values(childrenById),
    setActiveChildId: vi.fn(),
    isChildProfile,
    isLoading: false,
    addChild: vi.fn(),
  }),
}))

vi.mock('../../../core/hooks/useTodayKey', () => ({
  useTodayKey: () => ['2026-10-17', vi.fn()],
}))

vi.mock('../native-progress/useNativeProgressObservations', () => ({
  useNativeProgressObservations: () => ({
    observations: [],
    loading: false,
    error: null,
    observationsScope: { familyId: familyId ?? '', childId: activeChildId },
    saving: false,
    savingRequest: null,
    save: vi.fn(),
  }),
}))

let state: ProgramCompletionState | null = null
let savingRequest: {
  familyId: string
  childId: string
  entryKey: string
  kind: 'confirm' | 'withdraw' | 'apply'
} | null = null
const confirmMock = vi.fn()
const withdrawMock = vi.fn()
const applyMock = vi.fn()
vi.mock('./useProgramCompletion', () => ({
  useProgramCompletion: () => ({
    state,
    events: [],
    stateStream: {
      loading: false,
      error: null,
      settled: { familyId: familyId ?? '', childId: activeChildId },
    },
    eventStream: {
      loading: false,
      error: null,
      settled: { familyId: familyId ?? '', childId: activeChildId },
    },
    saving: savingRequest !== null,
    savingRequest,
    confirm: confirmMock,
    withdraw: withdrawMock,
    applyProjection: applyMock,
  }),
}))

import ProgramCompletionPanel from './ProgramCompletionPanel'

/** A promise a test resolves when it wants the write to answer. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** The indeterminate failure: no answer came back, and nothing is claimed. */
const UNCONFIRMED = {
  ok: false as const,
  refused: false,
  message: 'not confirmed',
  current: false,
}

function activeState(
  status: CompletionProjectionStatus,
  entryKey = 'landed-entry-key',
): ProgramCompletionState {
  return {
    id: `${activeChildId}__fastPhonics`,
    childId: activeChildId,
    program: ProgramCompletionProgram.FastPhonics,
    activeEntryKey: entryKey,
    activeAssertion: {
      observedOn: '2026-10-01',
      source: NativeProgressSource.ParentReport,
      assistance: 'unknown',
      reportedProgramVersion: 'unknown',
    },
    activeConfirmedAt: '2026-10-17T12:00:00.000Z',
    activeMappingVersion: 1,
    projection: { status },
    eventCount: 1,
    lastEventAt: '2026-10-17T12:00:00.000Z',
    sourceConflict: null,
    updatedAt: '2026-10-17T12:00:00.000Z',
  }
}

/**
 * Fill in and confirm one entry.
 *
 * Each tap is its own `fireEvent`, outside any `act` of the caller's: the form
 * only exists after the first one has committed, and a batched block would look
 * for *Check this* in a panel that has not opened yet.
 */
function confirmAnEntry() {
  fireEvent.click(screen.getByRole('button', { name: 'This program is finished' }))
  fireEvent.click(screen.getByRole('button', { name: 'Check this' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm it is finished' }))
}

/** Let an awaited write settle and its state land. */
async function settle() {
  await act(async () => {})
}

beforeEach(() => {
  familyId = 'fam-1'
  activeChildId = 'alice'
  childrenById = CHILDREN
  isChildProfile = false
  state = null
  savingRequest = null
  confirmMock.mockReset()
  withdrawMock.mockReset()
  applyMock.mockReset()
})

describe('a confirmed save whose answer never came back', () => {
  it('keeps a retry bound to the child it was confirmed for, after a switch', async () => {
    const answer = deferred<typeof UNCONFIRMED>()
    confirmMock.mockImplementationOnce((request: { childId: string; entryKey: string }) => {
      savingRequest = {
        familyId: 'fam-1',
        childId: request.childId,
        entryKey: request.entryKey,
        kind: 'confirm',
      }
      return answer.promise
    })
    const view = render(<ProgramCompletionPanel />)
    confirmAnEntry()
    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(confirmMock.mock.calls[0][0].childId).toBe('alice')

    // The parent moves to Bob while the save is still in the air...
    activeChildId = 'bob'
    view.rerender(<ProgramCompletionPanel />)
    // ...and the answer never comes: not a refusal, just no confirmation.
    await act(async () => {
      answer.resolve(UNCONFIRMED)
    })

    // The entry is retryable, and it is Alice's — the panel says so by name.
    expect(screen.getByRole('button', { name: 'Try that entry again' })).toBeTruthy()
    expect(screen.getByText(/Not confirmed for Alice/)).toBeTruthy()
    // ...and nothing claims anything about Bob's record.
    expect(screen.queryByText(/Recorded for Bob/)).toBeNull()
  })

  it('retries exactly the request that was confirmed, not what is on screen now', async () => {
    confirmMock.mockResolvedValueOnce(UNCONFIRMED)
    render(<ProgramCompletionPanel />)
    confirmAnEntry()
    await settle()
    const sent = confirmMock.mock.calls[0][0]

    confirmMock.mockResolvedValueOnce({
      ok: true,
      current: true,
      result: { alreadyRecorded: true, applied: true, applicationPending: false },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))
    })
    expect(confirmMock.mock.calls[1][0]).toEqual(sent)
    expect(screen.getByText('That entry is on the record now.')).toBeTruthy()
  })

  it('discards it when the ACCOUNT changes', async () => {
    confirmMock.mockResolvedValueOnce(UNCONFIRMED)
    const view = render(<ProgramCompletionPanel />)
    confirmAnEntry()
    await settle()
    expect(screen.getByRole('button', { name: 'Try that entry again' })).toBeTruthy()

    // A different household, where the same id can be a different child.
    familyId = 'fam-2'
    childrenById = { alice: { id: 'alice', name: 'Annie' } }
    view.rerender(<ProgramCompletionPanel />)
    expect(screen.queryByRole('button', { name: 'Try that entry again' })).toBeNull()
    expect(screen.queryByText(/Not confirmed for/)).toBeNull()
  })

  it('does not let an older retry answer settle a NEWER stranded entry', async () => {
    // The identity check the review asked for, in the DOM: the first entry's
    // retry is still out when a second entry strands, and its late success must
    // not report the second one as saved.
    confirmMock.mockResolvedValueOnce(UNCONFIRMED)
    render(<ProgramCompletionPanel />)
    confirmAnEntry()
    await settle()
    const first = confirmMock.mock.calls[0][0]

    const lateRetry = deferred<{ ok: true; current: boolean; result: unknown }>()
    confirmMock.mockReturnValueOnce(lateRetry.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))

    // A second entry — a different day, so a different draft key — strands too.
    // The form is still open with the first entry's content: an unconfirmed save
    // leaves it exactly as it was, and editing it mints a new key.
    fireEvent.change(
      screen.getByLabelText('When did you know it was finished?'),
      { target: { value: '2026-10-16' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Check this' }))
    confirmMock.mockResolvedValueOnce(UNCONFIRMED)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm it is finished' }))
    await settle()
    const second = confirmMock.mock.calls[2][0]
    expect(second.entryKey).not.toBe(first.entryKey)

    await act(async () => {
      lateRetry.resolve({
        ok: true,
        current: true,
        result: { alreadyRecorded: true, applied: true, applicationPending: false },
      })
    })
    // The panel is showing the SECOND entry, which has not been saved.
    expect(screen.queryByText('That entry is on the record now.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Try that entry again' })).toBeTruthy()
  })
})

describe('an account change while the answer is still out', () => {
  it('does not resurrect a confirmation for a sign-in that has ended (A → B → A)', async () => {
    const answer = deferred<typeof UNCONFIRMED>()
    confirmMock.mockImplementationOnce(() => answer.promise)
    const view = render(<ProgramCompletionPanel />)
    confirmAnEntry()
    expect(confirmMock).toHaveBeenCalledTimes(1)

    // Another household signs in, then the first one comes back: the id is equal
    // again and the VISIT is not.
    familyId = 'fam-2'
    childrenById = { alice: { id: 'alice', name: 'Annie' } }
    view.rerender(<ProgramCompletionPanel />)
    familyId = 'fam-1'
    childrenById = CHILDREN
    view.rerender(<ProgramCompletionPanel />)

    await act(async () => {
      answer.resolve(UNCONFIRMED)
    })
    expect(screen.queryByRole('button', { name: 'Try that entry again' })).toBeNull()
    expect(screen.queryByText(/Not confirmed for/)).toBeNull()
  })

  it('does not resurrect a WITHDRAWAL for a sign-in that has ended (A → B → A)', async () => {
    state = activeState(CompletionProjectionStatus.Applied)
    const answer = deferred<typeof UNCONFIRMED>()
    withdrawMock.mockImplementationOnce(() => answer.promise)
    const view = render(<ProgramCompletionPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Correct this — it isn’t finished' }))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'What was wrong with it?' }))
    fireEvent.click(screen.getByRole('option', { name: "He hasn't finished it after all" }))
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw it' }))
    expect(withdrawMock).toHaveBeenCalledTimes(1)

    familyId = 'fam-2'
    childrenById = { alice: { id: 'alice', name: 'Annie' } }
    view.rerender(<ProgramCompletionPanel />)
    familyId = 'fam-1'
    childrenById = CHILDREN
    view.rerender(<ProgramCompletionPanel />)

    await act(async () => {
      answer.resolve(UNCONFIRMED)
    })
    expect(screen.queryByRole('button', { name: 'Try that entry again' })).toBeNull()
    expect(screen.queryByText(/Not confirmed for/)).toBeNull()
  })

  it('still keeps a withdrawal retry across a child switch inside one family', async () => {
    state = activeState(CompletionProjectionStatus.Applied)
    const answer = deferred<typeof UNCONFIRMED>()
    withdrawMock.mockImplementationOnce(() => answer.promise)
    const view = render(<ProgramCompletionPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Correct this — it isn’t finished' }))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'What was wrong with it?' }))
    fireEvent.click(screen.getByRole('option', { name: "He hasn't finished it after all" }))
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw it' }))

    activeChildId = 'bob'
    state = null
    view.rerender(<ProgramCompletionPanel />)
    await act(async () => {
      answer.resolve(UNCONFIRMED)
    })
    expect(screen.getByRole('button', { name: 'Try that entry again' })).toBeTruthy()
    expect(screen.getByText(/Not confirmed for Alice/)).toBeTruthy()
  })
})

describe('the apply receipt', () => {
  it('does NOT claim an update while the application is still pending', async () => {
    state = activeState(CompletionProjectionStatus.Pending)
    applyMock.mockResolvedValue({
      ok: true,
      current: true,
      result: {
        alreadyRecorded: false,
        applied: false,
        applicationPending: true,
        conceptIds: [],
        promotedConceptIds: [],
      },
    })
    render(<ProgramCompletionPanel />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update the learning picture' }))
    })
    expect(screen.queryByText('The learning picture has been updated.')).toBeNull()
    // The receipt names the reason, so "not updated" cannot be read as a
    // failure of the entry itself.
    expect(
      screen.getByText(/nothing to update it on for this child yet/),
    ).toBeTruthy()
  })

  it('does not claim a WITHDRAWAL finished while there is no model to update', async () => {
    // Review item 2: the stored status is `withdrawalPending`, and the writer
    // now says `applicationPending: true`. The receipt must agree with both.
    state = activeState(CompletionProjectionStatus.WithdrawalPending)
    applyMock.mockResolvedValue({
      ok: true,
      current: true,
      result: {
        alreadyRecorded: false,
        applied: false,
        applicationPending: true,
        conceptIds: [],
        promotedConceptIds: [],
      },
    })
    render(<ProgramCompletionPanel />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update the learning picture' }))
    })
    expect(screen.queryByText('The learning picture has been updated.')).toBeNull()
    expect(screen.getByText(/has not been updated/)).toBeTruthy()
  })

  it('claims the update only when the writer applied it', async () => {
    state = activeState(CompletionProjectionStatus.Pending)
    applyMock.mockResolvedValue({
      ok: true,
      current: true,
      result: {
        alreadyRecorded: false,
        applied: true,
        applicationPending: false,
        conceptIds: ['reading.phonics.cvc'],
        promotedConceptIds: ['reading.phonics.cvc'],
      },
    })
    render(<ProgramCompletionPanel />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update the learning picture' }))
    })
    expect(screen.getByText('The learning picture has been updated.')).toBeTruthy()
  })

  it('says nothing needed changing when it was already up to date', async () => {
    state = activeState(CompletionProjectionStatus.Pending)
    applyMock.mockResolvedValue({
      ok: true,
      current: true,
      result: {
        alreadyRecorded: true,
        applied: true,
        applicationPending: false,
        conceptIds: [],
        promotedConceptIds: [],
      },
    })
    render(<ProgramCompletionPanel />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update the learning picture' }))
    })
    expect(screen.getByText('Already up to date — nothing needed changing.')).toBeTruthy()
  })
})
