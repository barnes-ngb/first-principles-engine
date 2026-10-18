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
 *      stranded entry is never marked saved by an older answer;
 *   4. a retry's refusal is shown in the writer's OWN words and with the scope
 *      it actually has — a refusal on stored data withdraws the button, a check
 *      the writer could not run keeps it (and cannot be dismissed), and neither
 *      of them says the attempt that stranded the entry never landed; and
 *   5. the apply receipt says which of three things happened — updated, already
 *      up to date, or recorded-but-NOT-updated — rather than claiming success
 *      whenever the write did not report a duplicate.
 */

/** Mirrors `COMPLETION_SAVE_IN_FLIGHT`, hoisted for the mock factory below. */
const { IN_FLIGHT } = vi.hoisted(() => ({
  IN_FLIGHT: 'That entry is already saving — give it a moment.',
}))

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
  COMPLETION_SAVE_IN_FLIGHT: IN_FLIGHT,
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

// ── The refusal sentences are the WRITER'S, not copies of them ──
//
// The panel decides which refusals may end a retry by comparing the writer's
// own exported strings, so these tests load that module and use the same
// constants. Its two firebase doors are stubbed: nothing here reaches them, and
// the module touches neither while it is being imported.
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn(),
  where: vi.fn(),
}))
vi.mock('../../../core/firebase/firestore', () => ({
  db: {},
  learnerModelsCollection: vi.fn(),
  nativeProgressCorrectionMarkersCollection: vi.fn(),
  nativeProgressObservationsCollection: vi.fn(),
  programCompletionEventsCollection: vi.fn(),
  programCompletionStateCollection: vi.fn(),
}))

import {
  PROGRAM_COMPLETION_CITATION_CHANGED,
  PROGRAM_COMPLETION_NOT_ACTIVE,
  PROGRAM_COMPLETION_RECORD_CHECK_FAILED,
  PROGRAM_COMPLETION_SOURCE_CHECK_FAILED,
} from '../../../core/firebase/programCompletionWrites'

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

/**
 * A refusal of the request just sent, in the writer's own sentence.
 *
 * `current: false` throughout, so these tests also prove the answer is not
 * gated on the header still naming that child — the stranded panel carries its
 * own identity and is named for the child it belongs to.
 */
function refused(message: string) {
  return { ok: false as const, refused: true, message, current: false }
}

/** ...and the in-flight latch, which is a refusal that IS worth retrying. */
const BUSY = { ok: false as const, refused: true, message: IN_FLIGHT, current: true }

/** Matches the element that actually carries `needle`, quoting no wording. */
const saying = (needle: string) => (content: string) => content.includes(needle)

/** Open the withdrawal form and ask for it, on the record in `state`. */
function withdrawTheEntry() {
  fireEvent.click(screen.getByRole('button', { name: 'Correct this — it isn’t finished' }))
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'What was wrong with it?' }))
  fireEvent.click(screen.getByRole('option', { name: "He hasn't finished it after all" }))
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw it' }))
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

describe('a retry refused on what is stored', () => {
  it('shows the reason without saying the earlier attempt never landed', async () => {
    // The landed-then-corrected case, which is why the wording matters: the
    // writer checks the stored record and the cited entry BEFORE its idempotent
    // branch, so a confirmation that DID reach the record can be refused on a
    // retry. "Nothing was added" would be a false claim here.
    confirmMock.mockResolvedValueOnce(UNCONFIRMED)
    render(<ProgramCompletionPanel />)
    confirmAnEntry()
    await settle()

    confirmMock.mockResolvedValueOnce(refused(PROGRAM_COMPLETION_CITATION_CHANGED))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))
    })

    // The writer's own sentence, so the reason is the actual one...
    expect(screen.getByText(saying(PROGRAM_COMPLETION_CITATION_CHANGED))).toBeTruthy()
    // ...said of the TRY, with the first attempt left unknown...
    expect(screen.getByText('Trying again was refused for Alice')).toBeTruthy()
    expect(
      screen.getByText(
        saying(
          "does not say whether the confirmation you sent before reached Alice's record, which is still unknown",
        ),
      ),
    ).toBeTruthy()
    // ...and the next step is to READ the record, not to confirm again.
    expect(
      screen.getByText(saying('Check what is recorded for Alice before sending anything again')),
    ).toBeTruthy()
    expect(screen.queryByText(saying('Nothing was added to'))).toBeNull()
    expect(screen.queryByText(saying('Not saved for Alice'))).toBeNull()
    expect(screen.queryByText(saying('nothing left to retry'))).toBeNull()
    // No button for a request that cannot answer differently, and no claim it
    // is on the record.
    expect(screen.queryByRole('button', { name: 'Try that entry again' })).toBeNull()
    expect(screen.queryByText('That entry is on the record now.')).toBeNull()
    expect(confirmMock).toHaveBeenCalledTimes(2)
  })

  it('does the same for a WITHDRAWAL, in the words of a correction', async () => {
    state = activeState(CompletionProjectionStatus.Applied)
    withdrawMock.mockResolvedValueOnce(UNCONFIRMED)
    render(<ProgramCompletionPanel />)
    withdrawTheEntry()
    await settle()
    expect(screen.getByRole('button', { name: 'Try that entry again' })).toBeTruthy()

    withdrawMock.mockResolvedValueOnce(refused(PROGRAM_COMPLETION_NOT_ACTIVE))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))
    })

    expect(screen.getByText(saying(PROGRAM_COMPLETION_NOT_ACTIVE))).toBeTruthy()
    expect(
      screen.getByText(
        saying("whether the correction you sent before reached Alice's record"),
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try that entry again' })).toBeNull()
    // The retry was the SAME withdrawal — same entry key, same entry withdrawn.
    expect(withdrawMock.mock.calls[1][0]).toEqual(withdrawMock.mock.calls[0][0])
    expect(withdrawMock).toHaveBeenCalledTimes(2)
  })

  it('can be put away, leaving the unsaved entry in the form', async () => {
    confirmMock.mockResolvedValueOnce(UNCONFIRMED)
    render(<ProgramCompletionPanel />)
    confirmAnEntry()
    await settle()
    confirmMock.mockResolvedValueOnce(refused(PROGRAM_COMPLETION_CITATION_CHANGED))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Trying again was refused for Alice')).toBeNull()
    // Dismissing an answered entry does not throw away what she filled in: it
    // is still in the form, still unsaved, still hers to send again.
    expect(screen.getByText('Nothing has been saved yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirm it is finished' })).toBeTruthy()
    expect(
      (screen.getByLabelText('When did you know it was finished?') as HTMLInputElement)
        .value,
    ).toBe('2026-10-17')
  })
})

describe('a retry refused by a check the writer could not run', () => {
  it('keeps the request, the button and the uncertainty when the SOURCE check fails', async () => {
    confirmMock.mockResolvedValueOnce(UNCONFIRMED)
    render(<ProgramCompletionPanel />)
    confirmAnEntry()
    await settle()

    confirmMock.mockResolvedValueOnce(refused(PROGRAM_COMPLETION_SOURCE_CHECK_FAILED))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))
    })

    // The reason is shown — it asks for a retry in so many words...
    expect(screen.getByText(saying(PROGRAM_COMPLETION_SOURCE_CHECK_FAILED))).toBeTruthy()
    // ...and its "nothing was saved" is scoped to the try it belongs to, so a
    // temporary lookup failure is not read as a verdict on the record.
    expect(
      screen.getByText(
        saying('including anything in it about nothing being saved — is about the try just now'),
      ),
    ).toBeTruthy()
    // The entry is still unconfirmed, not refused: same heading, same promise
    // that a retry cannot record it twice, and no way to dismiss it.
    expect(screen.getByText(/Not confirmed for Alice/)).toBeTruthy()
    expect(screen.queryByText('Trying again was refused for Alice')).toBeNull()
    expect(screen.getByText(saying('cannot be recorded twice'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()

    // ...and the button is still there, still sending the SAME request, which
    // can still land.
    confirmMock.mockResolvedValueOnce({
      ok: true,
      current: true,
      result: { alreadyRecorded: true, applied: true, applicationPending: false },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))
    })
    expect(confirmMock.mock.calls[2][0]).toEqual(confirmMock.mock.calls[0][0])
    expect(screen.getByText('That entry is on the record now.')).toBeTruthy()
    expect(screen.queryByText(saying(PROGRAM_COMPLETION_SOURCE_CHECK_FAILED))).toBeNull()
  })

  it('keeps a WITHDRAWAL retryable when the RECORD check fails', async () => {
    state = activeState(CompletionProjectionStatus.Applied)
    withdrawMock.mockResolvedValueOnce(UNCONFIRMED)
    render(<ProgramCompletionPanel />)
    withdrawTheEntry()
    await settle()

    withdrawMock.mockResolvedValueOnce(refused(PROGRAM_COMPLETION_RECORD_CHECK_FAILED))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))
    })

    expect(screen.getByText(saying(PROGRAM_COMPLETION_RECORD_CHECK_FAILED))).toBeTruthy()
    expect(
      screen.getByText(saying("whether the correction you sent before reached Alice's record")),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try that entry again' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()

    withdrawMock.mockResolvedValueOnce(refused(PROGRAM_COMPLETION_RECORD_CHECK_FAILED))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))
    })
    // Twice refused by the same check, twice the same correction — the request
    // is never rebuilt from what is on screen.
    expect(withdrawMock.mock.calls[2][0]).toEqual(withdrawMock.mock.calls[0][0])
    expect(screen.getByRole('button', { name: 'Try that entry again' })).toBeTruthy()
  })

  it('keeps the retry when the refusal is only the save-in-flight latch', async () => {
    // A refusal about a DIFFERENT save in the air says nothing about this
    // entry, so the button must survive it too.
    confirmMock.mockResolvedValueOnce(UNCONFIRMED)
    render(<ProgramCompletionPanel />)
    confirmAnEntry()
    await settle()

    confirmMock.mockResolvedValueOnce(BUSY)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))
    })
    expect(screen.getByRole('button', { name: 'Try that entry again' })).toBeTruthy()
    expect(screen.queryByText('Trying again was refused for Alice')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('drops the temporary reason when the next try gets no answer at all', async () => {
    confirmMock.mockResolvedValueOnce(UNCONFIRMED)
    render(<ProgramCompletionPanel />)
    confirmAnEntry()
    await settle()

    confirmMock.mockResolvedValueOnce(refused(PROGRAM_COMPLETION_RECORD_CHECK_FAILED))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))
    })
    expect(screen.getByText(saying(PROGRAM_COMPLETION_RECORD_CHECK_FAILED))).toBeTruthy()

    // A transport failure is a different answer, and a stale reason read as the
    // current one would be a sentence about a check that was not run this time.
    confirmMock.mockResolvedValueOnce(UNCONFIRMED)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))
    })
    expect(screen.queryByText(saying(PROGRAM_COMPLETION_RECORD_CHECK_FAILED))).toBeNull()
    expect(screen.getByText(/Not confirmed for Alice/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try that entry again' })).toBeTruthy()
  })

  it('stays Alice’s entry, and Alice’s request, after a switch to Bob', async () => {
    confirmMock.mockResolvedValueOnce(UNCONFIRMED)
    const view = render(<ProgramCompletionPanel />)
    confirmAnEntry()
    await settle()

    // Bob is on screen when the answer lands; the entry is Alice's. The outcome
    // is `current: false` for exactly that reason, and the panel still has to
    // say it — it holds the only copy of that request.
    activeChildId = 'bob'
    view.rerender(<ProgramCompletionPanel />)
    confirmMock.mockResolvedValueOnce(refused(PROGRAM_COMPLETION_SOURCE_CHECK_FAILED))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))
    })

    expect(screen.getByText(/Not confirmed for Alice/)).toBeTruthy()
    expect(screen.getByText(saying(PROGRAM_COMPLETION_SOURCE_CHECK_FAILED))).toBeTruthy()
    expect(screen.queryByText(saying("Bob's record"))).toBeNull()

    confirmMock.mockResolvedValueOnce(refused(PROGRAM_COMPLETION_SOURCE_CHECK_FAILED))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))
    })
    expect(confirmMock.mock.calls[2][0]).toEqual(confirmMock.mock.calls[0][0])
    expect(confirmMock.mock.calls[2][0].childId).toBe('alice')
  })

  it('still keeps the retry when the answer is indeterminate instead', async () => {
    confirmMock.mockResolvedValueOnce(UNCONFIRMED)
    render(<ProgramCompletionPanel />)
    confirmAnEntry()
    await settle()

    confirmMock.mockResolvedValueOnce(UNCONFIRMED)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))
    })
    expect(screen.getByText(/Not confirmed for Alice/)).toBeTruthy()
    expect(screen.queryByText('Trying again was refused for Alice')).toBeNull()

    // ...and it is still the same entry, which can still land.
    confirmMock.mockResolvedValueOnce({
      ok: true,
      current: true,
      result: { alreadyRecorded: true, applied: true, applicationPending: false },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try that entry again' }))
    })
    expect(screen.getByText('That entry is on the record now.')).toBeTruthy()
    expect(confirmMock.mock.calls[2][0]).toEqual(confirmMock.mock.calls[0][0])
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
