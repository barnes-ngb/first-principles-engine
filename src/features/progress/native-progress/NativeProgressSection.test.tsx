import { useLayoutEffect } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NativeProgressMeaning,
  NativeProgressProgram,
  NativeProgressSource,
  type NativeProgressObservation,
} from '../../../core/types/nativeProgress'

/**
 * The surface: propose → confirm → write, and the things it must never do.
 *
 * FEAT-241. Every case here is one of the run's own requirements rather than a
 * tour of the component: nothing is written without an explicit second tap, a
 * failure leaves the entry on screen and claims nothing about whether it landed, a
 * retry cannot write twice, the child is named before the write and the draft is
 * dropped when it changes, a kid profile has no door, a correction is linked and
 * the original is kept, and a failed read is never rendered as an empty record.
 *
 * Added by PR-1897's review: a confirmed save left UNCONFIRMED after the child
 * changed stays visible and retryable against the child it was confirmed for —
 * without claiming it was lost, and without outliving the family it was confirmed
 * under — and a correction started by accident can be cancelled.
 *
 * Added by its round 3: those verdicts hold for an answer that comes back at the
 * commit of the switch itself, and a change of ACCOUNT names nobody.
 *
 * Added by round 4: the allowed day follows the calendar under an open tab without
 * rewriting what is typed, and a pending save is claimed only for the record it
 * belongs to.
 */

let familyId: string | null = 'fam-1'
vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => familyId }))

/**
 * The clock is pinned, movable, and nothing else is.
 *
 * The form refuses a future day, so a test with real dates in it would start
 * failing on its own at some point in the past or future depending on when the
 * suite runs. Only `todayKey` is replaced; `formatDateShort` stays real, because
 * the displayed dates are part of what is being asserted.
 *
 * It is a `let` rather than a constant because the surface now reads the day
 * through `useTodayKey`, which re-reads it on focus and visibility — so a day
 * boundary is driven by moving this and firing the event the real hook listens
 * for, with no fake timers to leave running (round 4 P2). The minute tick is the
 * same `refresh`, pinned in `useTodayKey.test.ts`.
 */
let mockToday = '2026-10-16'
vi.mock('../../../core/utils/dateKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../core/utils/dateKey')>()
  return { ...actual, todayKey: () => mockToday }
})

/** Move the calendar under the open tab, the way midnight-then-focus does. */
function rollOverTo(day: string) {
  mockToday = day
  act(() => {
    window.dispatchEvent(new Event('focus'))
  })
}

let isChildProfile = false
let activeChildId = 'lincoln'
const CHILDREN: Record<string, { id: string; name: string }> = {
  lincoln: { id: 'lincoln', name: 'Lincoln' },
  london: { id: 'london', name: 'London' },
}
/**
 * The next household's list, where the id repeats and the boy does not.
 *
 * Round 3, P2: a child id is unique inside a family, not across sign-ins, so a
 * surface that names a child from `children` after an account change can name
 * either the family that just left (whose names are not this parent's to see) or
 * a different boy wearing the same id. The whole list is swapped, the way a real
 * account change swaps it.
 */
const OTHER_FAMILY_CHILDREN: Record<string, { id: string; name: string }> = {
  lincoln: { id: 'lincoln', name: 'Leo' },
}
let childrenById = CHILDREN
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

let observations: NativeProgressObservation[] = []
/** Which family + child the read above has answered for (round 4 P1). */
let observationsScope: { familyId: string; childId: string } | null = {
  familyId: 'fam-1',
  childId: 'lincoln',
}
let readError: string | null = null
let loading = false
/**
 * WHOSE write is in the air, mutable here.
 *
 * The surface reads the flag for every disabled control and the identity for the
 * switch notice, so a test about a save that is still in the air has to be able to
 * say which record it belongs to. `saving` is derived from it exactly as the hook
 * derives it, so the two can never disagree in a test either.
 */
let savingRequest: { familyId: string; childId: string; entryKey: string } | null = null
const saveMock = vi.fn()
vi.mock('./useNativeProgressObservations', () => ({
  NATIVE_PROGRESS_SAVE_IN_FLIGHT: 'in flight',
  useNativeProgressObservations: () => ({
    observations,
    loading,
    error: readError,
    observationsScope,
    saving: savingRequest !== null,
    savingRequest,
    save: (...a: unknown[]) => saveMock(...a),
  }),
}))

import NativeProgressSection from './NativeProgressSection'
// The real sentences, so a test can never assert wording the surface has stopped
// using — and never re-state a claim the rule module deliberately avoids.
import { failureNotice, strandedSaveTitle } from './nativeProgressRule'

function row(overrides: Partial<NativeProgressObservation> = {}): NativeProgressObservation {
  return {
    id: 'lincoln__e1',
    childId: 'lincoln',
    program: NativeProgressProgram.Mathseeds,
    nativeNumber: 42,
    meaning: NativeProgressMeaning.WorkingOn,
    observedOn: '2026-10-12',
    source: NativeProgressSource.ParentReport,
    recordedAt: '2026-10-14T15:00:00.000Z',
    entryKey: 'e1',
    ...overrides,
  }
}

/** Fill the number and the date, the two typed fields. */
async function fillEntry(
  user: ReturnType<typeof userEvent.setup>,
  number = '42',
  date = '2026-10-12',
) {
  const field = screen.getByLabelText('Lesson number')
  await user.clear(field)
  await user.type(field, number)
  fireEvent.change(screen.getByLabelText('Day you saw this'), { target: { value: date } })
}

const savedOk = (overrides: Partial<NativeProgressObservation> = {}) => ({
  ok: true as const,
  observation: row(overrides),
  alreadyRecorded: false,
})

/** The read has answered for this family and child. */
const scopeOf = (childId: string, family = 'fam-1') => ({ familyId: family, childId })

beforeEach(() => {
  isChildProfile = false
  activeChildId = 'lincoln'
  childrenById = CHILDREN
  familyId = 'fam-1'
  mockToday = '2026-10-16'
  observations = []
  observationsScope = scopeOf('lincoln')
  readError = null
  loading = false
  savingRequest = null
  saveMock.mockReset()
  saveMock.mockResolvedValue(savedOk())
})

/**
 * A save that is held open, the way a real one is while the header moves.
 *
 * The in-flight identity is set from the REQUEST and cleared on settlement, the
 * way the hook does it, because the surface renders from both: every disabled
 * control from the flag, and the switch notice's pending-save sentence from whose
 * request it is.
 */
function heldSave() {
  let settle!: (outcome: unknown) => void
  saveMock.mockImplementation(
    (request: { familyId: string; childId: string; entryKey: string }) => {
      savingRequest = {
        familyId: request.familyId,
        childId: request.childId,
        entryKey: request.entryKey,
      }
      return new Promise((resolve) => {
        settle = (outcome: unknown) => {
          savingRequest = null
          resolve(outcome)
        }
      })
    },
  )
  return {
    /** Let the held write come back unconfirmed, and drain what that unblocks. */
    refuse: async (message = failureNotice()) => {
      await act(async () => {
        settle({ ok: false, message })
        await Promise.resolve()
      })
      await act(async () => {
        await Promise.resolve()
      })
    },
    /**
     * The raw settlement, for a caller that chooses the moment itself — the
     * commit of a switch, via `SettleOnCommit`.
     */
    settleNow: (outcome: unknown) => settle(outcome),
  }
}

/**
 * Let a held write come back DURING a commit, before any passive effect runs.
 *
 * Round 3, P1. The sequence this stands for is the one the review found: React
 * commits the new child (or the new account), the passive effects it scheduled
 * have not run yet, and the in-flight save's promise settles in a microtask in
 * between. So the settlement is fired from a layout effect, which is the last
 * thing the commit does — whatever the surface uses to decide *"is this outcome
 * still mine"* has to be in step by then, and a token bumped after paint is not.
 *
 * It is the surface's later sibling, so the surface's own layout effects have
 * already run when the answer comes back — every chance to be in step, and no
 * passive effect yet.
 *
 * Mounted beside the surface from the first render and armed by giving it a
 * `settle` prop later, so the surface's own element never changes position and
 * is never remounted — a remount would lose the state these cases are about.
 * Armed once per case, so it answers once.
 */
function SettleOnCommit({ settle }: { settle?: () => void }) {
  useLayoutEffect(() => {
    settle?.()
  }, [settle])
  return null
}

/** Confirm the entry on screen and tap Save, leaving the result to the caller. */
async function confirmAndSave(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Check this entry' }))
  await user.click(await screen.findByRole('button', { name: 'Save this record' }))
  await waitFor(() => expect(saveMock).toHaveBeenCalled())
}

describe('before anything is written', () => {
  it('names the child and says planning has not moved', () => {
    render(<NativeProgressSection />)
    expect(screen.getByText(/Recording for/)).toHaveTextContent('Lincoln')
    expect(
      screen.getByText('Saved for reference. This does not update plans, hours or skills.'),
    ).toBeInTheDocument()
  })

  it('asks for the unit the chosen program uses', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    expect(screen.getByLabelText('Lesson number')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Program' }))
    await user.click(screen.getByRole('option', { name: 'Fast Phonics' }))

    expect(await screen.findByLabelText('Peak number')).toBeInTheDocument()
  })

  it('checking the entry writes nothing and shows what WOULD be saved', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))

    expect(
      await screen.findByText('Lincoln: Mathseeds — working on lesson 42, seen Oct 12.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Nothing has been saved yet.')).toBeInTheDocument()
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('refuses a number that is not one, without reaching the writer', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    await fillEntry(user, '4.5')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))

    expect(await screen.findByText('Use a whole number, like 42.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing has been saved yet.')).not.toBeInTheDocument()
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('refuses a day that has not happened, without reaching the writer', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    await fillEntry(user, '42', '2099-01-01')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))

    expect(await screen.findByText("That day hasn't happened yet.")).toBeInTheDocument()
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('going Back from the confirm step writes nothing', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Back' }))

    expect(saveMock).not.toHaveBeenCalled()
    // Her typing is still there.
    expect(screen.getByLabelText('Lesson number')).toHaveValue('42')
  })
})

describe('the write', () => {
  it('saves on the second tap, with the family, child and draft pinned', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    const request = saveMock.mock.calls[0][0]
    expect(request).toMatchObject({
      familyId: 'fam-1',
      childId: 'lincoln',
      observation: {
        program: 'mathseeds',
        nativeNumber: 42,
        meaning: 'workingOn',
        observedOn: '2026-10-12',
        source: 'parentReport',
      },
    })
    expect(request.entryKey).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(request.correctsObservationId).toBeUndefined()
  })

  it('shows a receipt that names the child and claims nothing else', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))

    expect(await screen.findByText(/Recorded for Lincoln/)).toHaveTextContent(
      'Nothing else changed.',
    )
    // The form is ready for the next entry rather than still holding the last.
    expect(screen.getByLabelText('Lesson number')).toHaveValue('')
  })

  it('an unconfirmed save leaves the entry on screen and claims nothing either way', async () => {
    const user = userEvent.setup()
    // The hook's own wording for a generic failure, which is indeterminate: the
    // transaction may have committed and lost its answer.
    saveMock.mockResolvedValue({ ok: false, message: failureNotice() })
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))

    expect(await screen.findByText(/not confirmed as saved/)).toBeInTheDocument()
    expect(screen.getByLabelText('Lesson number')).toHaveValue('42')
    expect(screen.queryByText(/Recorded for Lincoln/)).not.toBeInTheDocument()
    // Neither absence nor presence is asserted anywhere on screen.
    expect(screen.queryByText(/was not saved|Nothing was written/)).not.toBeInTheDocument()
  })

  it('retrying the same unconfirmed entry reuses its key, so it cannot become two rows', async () => {
    const user = userEvent.setup()
    saveMock.mockResolvedValue({ ok: false, message: failureNotice() })
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: 'Save this record' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2))

    expect(saveMock.mock.calls[1][0].entryKey).toBe(saveMock.mock.calls[0][0].entryKey)
  })

  it('EDITING after a failure makes it a new entry, with a new key', async () => {
    const user = userEvent.setup()
    saveMock.mockResolvedValue({ ok: false, message: failureNotice() })
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))

    await user.type(screen.getByLabelText('Lesson number'), '3')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2))

    expect(saveMock.mock.calls[1][0].entryKey).not.toBe(saveMock.mock.calls[0][0].entryKey)
    expect(saveMock.mock.calls[1][0].observation.nativeNumber).toBe(423)
  })

  it('reports an entry that was already recorded, without claiming a second save', async () => {
    const user = userEvent.setup()
    saveMock.mockResolvedValue({ ok: true, observation: row(), alreadyRecorded: true })
    render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))

    expect(await screen.findByText(/Already recorded for Lincoln/)).toHaveTextContent(
      'Nothing was saved twice.',
    )
  })
})

describe('the parent gate', () => {
  it('offers a kid profile no form at all', () => {
    isChildProfile = true
    render(<NativeProgressSection />)
    expect(screen.getByText('A parent keeps this record.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Lesson number')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Check this entry' }),
    ).not.toBeInTheDocument()
  })

  it('takes the confirm step away if the profile changes with one open', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    expect(await screen.findByRole('button', { name: 'Save this record' })).toBeInTheDocument()

    isChildProfile = true
    rerender(<NativeProgressSection />)

    expect(screen.queryByRole('button', { name: 'Save this record' })).not.toBeInTheDocument()
    expect(saveMock).not.toHaveBeenCalled()
  })
})

describe('when the child changes under it', () => {
  it('clears the draft and says what was lost', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))

    activeChildId = 'london'
    observationsScope = scopeOf('london')
    rerender(<NativeProgressSection />)

    expect(await screen.findByText(/was cleared and not saved/)).toHaveTextContent('Lincoln')
    expect(screen.getByLabelText('Lesson number')).toHaveValue('')
    expect(screen.queryByText(/Lincoln: Mathseeds/)).not.toBeInTheDocument()
    expect(screen.getByText(/Recording for/)).toHaveTextContent('London')
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('does not keep a receipt written under the previous child', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<NativeProgressSection />)
    await fillEntry(user)
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))
    expect(await screen.findByText(/Recorded for Lincoln/)).toBeInTheDocument()

    activeChildId = 'london'
    observationsScope = scopeOf('london')
    rerender(<NativeProgressSection />)

    expect(screen.queryByText(/Recorded for Lincoln/)).not.toBeInTheDocument()
  })
})

/**
 * PR-1897 review, P1 and round 2.
 *
 * The switch notice says a confirmed entry goes to the child it was confirmed
 * for. When no confirmation comes back after the switch, that sentence is only
 * honest if the outcome surfaces somewhere — so it does, as its own panel, with
 * the request pinned and a retry that cannot become a second row, cannot cross to
 * the child on screen, and cannot overwrite what is being typed now. What the
 * panel may NOT do is claim the entry was lost (round 2, finding 1) or outlive the
 * family it was confirmed under (finding 2).
 */
describe('a confirmed save left unconfirmed after the child changed', () => {
  /** Confirm and save for Lincoln, switch to London, then fail the write. */
  async function strandLincolnsEntry(user: ReturnType<typeof userEvent.setup>) {
    const held = heldSave()
    const view = render(<NativeProgressSection />)
    await fillEntry(user)
    await confirmAndSave(user)
    const request = saveMock.mock.calls[0][0]

    activeChildId = 'london'
    observationsScope = scopeOf('london')
    view.rerender(<NativeProgressSection />)
    // The notice that has to be true: it promises an unconfirmed entry is shown.
    expect(await screen.findByText(/goes to Lincoln's record/)).toBeInTheDocument()

    await held.refuse()
    return { view, request }
  }

  it('says whose entry is unconfirmed, and claims nothing either way', async () => {
    const user = userEvent.setup()
    await strandLincolnsEntry(user)

    expect(await screen.findByText(strandedSaveTitle('Lincoln'))).toBeInTheDocument()
    expect(
      screen.getByText('Lincoln: Mathseeds — working on lesson 42, seen Oct 12.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/no confirmation that it reached/)).toBeInTheDocument()
    // No record claimed...
    expect(screen.queryByText(/Recorded for/)).not.toBeInTheDocument()
    // ...and no absence claimed either, anywhere in this panel: a lost answer
    // leaves both open, and the transaction may have committed (round 2,
    // finding 1). Scoped to the panel, because the switch notice beside it says
    // the DRAFT was not saved, which is simply true — it was never sent.
    const panel = screen.getByText(strandedSaveTitle('Lincoln')).closest('[role="alert"]')
    expect(panel).not.toHaveTextContent(/not saved|did not save|Nothing was written/)
    // It is Lincoln's entry, not a failure of the form London is looking at.
    expect(screen.getByLabelText('Lesson number')).toHaveValue('')
  })

  it('keeps a NAMED refusal reason, which is accurate and says why', async () => {
    // Sol, round 2: a `NativeProgressRefused` validation error is determinate —
    // the writer rejected the entry and the transaction aborted — so its own
    // sentence is shown as it was given, beside wording that claims nothing.
    const user = userEvent.setup()
    const held = heldSave()
    const view = render(<NativeProgressSection />)
    await fillEntry(user)
    await confirmAndSave(user)

    activeChildId = 'london'
    observationsScope = scopeOf('london')
    view.rerender(<NativeProgressSection />)
    await held.refuse('That entry corrects a row that is no longer there.')

    expect(await screen.findByText(strandedSaveTitle('Lincoln'))).toBeInTheDocument()
    expect(
      screen.getByText('That entry corrects a row that is no longer there.'),
    ).toBeInTheDocument()
  })

  it('retries nothing on its own, and on a tap sends exactly the confirmed request', async () => {
    const user = userEvent.setup()
    const { request } = await strandLincolnsEntry(user)
    expect(await screen.findByText(strandedSaveTitle('Lincoln'))).toBeInTheDocument()
    expect(saveMock).toHaveBeenCalledTimes(1)

    saveMock.mockResolvedValue(savedOk())
    await user.click(
      screen.getByRole('button', { name: "Try saving Lincoln's entry again" }),
    )

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2))
    const retry = saveMock.mock.calls[1][0]
    // Same row, same record, same words: the key is the document id, so this is a
    // retry rather than a second entry, and it is still Lincoln's.
    expect(retry.entryKey).toBe(request.entryKey)
    expect(retry.childId).toBe('lincoln')
    expect(retry.familyId).toBe('fam-1')
    expect(retry.observation).toEqual(request.observation)
    expect(retry.correctsObservationId).toBe(request.correctsObservationId)

    // Only now is a record claimed, and it names Lincoln.
    expect(await screen.findByText(/Recorded for Lincoln/)).toBeInTheDocument()
    expect(screen.queryByText(strandedSaveTitle('Lincoln'))).not.toBeInTheDocument()
  })

  it('reports a retry whose first attempt had landed, without claiming two rows', async () => {
    // The outcome the indeterminate wording exists for: the first attempt DID
    // commit and only its answer was lost, so the retry finds the row already
    // there (round 2, finding 1).
    const user = userEvent.setup()
    const { request } = await strandLincolnsEntry(user)
    expect(await screen.findByText(strandedSaveTitle('Lincoln'))).toBeInTheDocument()

    saveMock.mockResolvedValue({ ok: true, observation: row(), alreadyRecorded: true })
    await user.click(
      screen.getByRole('button', { name: "Try saving Lincoln's entry again" }),
    )

    // The receipt says what happened: one row, not two.
    expect(await screen.findByText(/Already recorded for Lincoln/)).toHaveTextContent(
      'Nothing was saved twice.',
    )
    expect(screen.queryByText(strandedSaveTitle('Lincoln'))).not.toBeInTheDocument()
    // ...and it got there by asking about the same document, not a new one.
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2))
    expect(saveMock.mock.calls[1][0].entryKey).toBe(request.entryKey)
    expect(saveMock.mock.calls[1][0].childId).toBe('lincoln')
  })

  it('leaves a newer draft for the same child alone (A → B → A)', async () => {
    const user = userEvent.setup()
    const held = heldSave()
    const view = render(<NativeProgressSection />)
    await fillEntry(user)
    await confirmAndSave(user)
    const request = saveMock.mock.calls[0][0]

    activeChildId = 'london'
    observationsScope = scopeOf('london')
    view.rerender(<NativeProgressSection />)
    activeChildId = 'lincoln'
    observationsScope = scopeOf('lincoln')
    view.rerender(<NativeProgressSection />)

    // A different entry, typed for the same boy on this later visit.
    await fillEntry(user, '55', '2026-10-15')
    await held.refuse()

    expect(await screen.findByText(strandedSaveTitle('Lincoln'))).toBeInTheDocument()
    // The panel describes the OLD entry; the form still holds the new one.
    expect(
      screen.getByText('Lincoln: Mathseeds — working on lesson 42, seen Oct 12.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Lesson number')).toHaveValue('55')

    saveMock.mockResolvedValue(savedOk())
    await user.click(
      screen.getByRole('button', { name: "Try saving Lincoln's entry again" }),
    )

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2))
    expect(saveMock.mock.calls[1][0]).toMatchObject({
      childId: 'lincoln',
      entryKey: request.entryKey,
      observation: { nativeNumber: 42, observedOn: '2026-10-12' },
    })
    // ...and the retry wrote nothing into the draft on screen.
    expect(screen.getByLabelText('Lesson number')).toHaveValue('55')
  })

  it('shows nothing from the previous family, and cannot retry into this one', async () => {
    const user = userEvent.setup()
    const { view } = await strandLincolnsEntry(user)
    expect(await screen.findByText(strandedSaveTitle('Lincoln'))).toBeInTheDocument()

    familyId = 'fam-2'
    view.rerender(<NativeProgressSection />)

    expect(screen.queryByText(strandedSaveTitle('Lincoln'))).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try saving/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/working on lesson 42/)).not.toBeInTheDocument()
    expect(saveMock).toHaveBeenCalledTimes(1)
  })

  it('offers a kid profile no stranded entry and no retry', async () => {
    const user = userEvent.setup()
    const { view } = await strandLincolnsEntry(user)
    expect(await screen.findByText(strandedSaveTitle('Lincoln'))).toBeInTheDocument()

    isChildProfile = true
    view.rerender(<NativeProgressSection />)

    expect(screen.getByText('A parent keeps this record.')).toBeInTheDocument()
    expect(screen.queryByText(strandedSaveTitle('Lincoln'))).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try saving/ })).not.toBeInTheDocument()
    expect(saveMock).toHaveBeenCalledTimes(1)
  })

  /**
   * Round 2, finding 2: the completion itself must be discarded, not merely
   * filtered out of the render. A panel that is hidden while the other family is
   * signed in and reappears on the way back is cross-family information with a
   * delay on it.
   */
  it('discards the outcome when the family changed while it was in flight', async () => {
    const user = userEvent.setup()
    const held = heldSave()
    const view = render(<NativeProgressSection />)
    await fillEntry(user)
    await confirmAndSave(user)

    // Another family signs in while the write is in the air...
    familyId = 'fam-2'
    view.rerender(<NativeProgressSection />)
    await held.refuse()

    expect(screen.queryByText(strandedSaveTitle('Lincoln'))).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try saving/ })).not.toBeInTheDocument()

    // ...and coming back to the first family does not resurrect it.
    familyId = 'fam-1'
    view.rerender(<NativeProgressSection />)

    expect(screen.queryByText(strandedSaveTitle('Lincoln'))).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try saving/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/working on lesson 42/)).not.toBeInTheDocument()
    expect(saveMock).toHaveBeenCalledTimes(1)
  })

  it('discards it for a family A → B → A round trip before the answer comes back', async () => {
    const user = userEvent.setup()
    const held = heldSave()
    const view = render(<NativeProgressSection />)
    await fillEntry(user)
    await confirmAndSave(user)

    familyId = 'fam-2'
    view.rerender(<NativeProgressSection />)
    familyId = 'fam-1'
    view.rerender(<NativeProgressSection />)
    // Back on the family the entry was confirmed under — same id, different
    // visit, which is exactly what an id comparison cannot tell apart.
    await held.refuse()

    expect(screen.queryByText(strandedSaveTitle('Lincoln'))).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try saving/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/working on lesson 42/)).not.toBeInTheDocument()
    expect(saveMock).toHaveBeenCalledTimes(1)
  })

  it('still keeps the retry across a child switch inside one family', async () => {
    // The other side of the same guard: a child switch is not a family change,
    // so the panel and its retry survive it.
    const user = userEvent.setup()
    const { request } = await strandLincolnsEntry(user)
    expect(await screen.findByText(strandedSaveTitle('Lincoln'))).toBeInTheDocument()

    saveMock.mockResolvedValue(savedOk())
    await user.click(
      screen.getByRole('button', { name: "Try saving Lincoln's entry again" }),
    )

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2))
    expect(saveMock.mock.calls[1][0]).toMatchObject({
      familyId: 'fam-1',
      childId: 'lincoln',
      entryKey: request.entryKey,
    })
  })
})

/**
 * PR-1897 review, round 3 P1 — an answer that arrives at the commit itself.
 *
 * The switch tokens are what decide whether a completion may touch the screen,
 * and the review found them a frame late: advanced in a passive effect, which
 * runs after paint, while a save already in the air settles in a microtask
 * before that. In that window a committed switch is invisible to the completion,
 * so the previous child's outcome is taken for the current one — clearing the
 * new draft, or writing a receipt in the wrong boy's name.
 *
 * These cases hand the answer back from a layout effect in the switching commit:
 * the earliest moment anything can come back, and the one the window lives in.
 * The verdicts asked for are the same ones as above, which is the point — the
 * timing may not change them.
 *
 * That the tokens are advanced in a LAYOUT effect is pinned on source, in
 * `nativeProgressBoundary.source.test.ts`: the act-based renderer flushes a
 * commit and the passive effects that commit scheduled in one step, so no render
 * test can tell a layout effect from a passive one. These cases pin the
 * behaviour; that one pins the ordering the behaviour rests on.
 */
describe('a completion that settles at the commit of the switch', () => {
  /** The tree, with the settler armed or not — see `SettleOnCommit`. */
  const tree = (settle?: () => void) => (
    <>
      <NativeProgressSection />
      <SettleOnCommit settle={settle} />
    </>
  )

  /** Run the microtask the settlement queued, and whatever it then set. */
  async function drain() {
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
  }

  it('recovers an unconfirmed entry when the child changed in that same commit', async () => {
    const user = userEvent.setup()
    const held = heldSave()
    const view = render(tree())
    await fillEntry(user)
    await confirmAndSave(user)
    const request = saveMock.mock.calls[0][0]

    activeChildId = 'london'
    observationsScope = scopeOf('london')
    view.rerender(tree(() => held.settleNow({ ok: false, message: failureNotice() })))
    await drain()

    // Lincoln's entry comes back in its own panel...
    expect(await screen.findByText(strandedSaveTitle('Lincoln'))).toBeInTheDocument()
    expect(
      screen.getByText('Lincoln: Mathseeds — working on lesson 42, seen Oct 12.'),
    ).toBeInTheDocument()
    // ...nothing is claimed for London, and his form is untouched and usable.
    expect(screen.queryByText(/Recorded for/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Lesson number')).toHaveValue('')
    expect(screen.getByText(/Recording for/)).toHaveTextContent('London')

    // And the recovery is the real one: still bound to the entry it was
    // confirmed for, not to the child on screen.
    saveMock.mockResolvedValue(savedOk())
    await user.click(
      screen.getByRole('button', { name: "Try saving Lincoln's entry again" }),
    )
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2))
    expect(saveMock.mock.calls[1][0]).toMatchObject({
      familyId: 'fam-1',
      childId: 'lincoln',
      entryKey: request.entryKey,
    })
  })

  it('never turns a confirmation into the new child’s receipt', async () => {
    const user = userEvent.setup()
    const held = heldSave()
    const view = render(tree())
    await fillEntry(user)
    await confirmAndSave(user)

    activeChildId = 'london'
    observationsScope = scopeOf('london')
    view.rerender(tree(() => held.settleNow(savedOk())))
    await drain()

    // The entry went to Lincoln's record, which is what the switch notice says.
    // A receipt on this screen would read as London's, and there is none.
    expect(screen.queryByText(/Recorded for/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Already recorded for/)).not.toBeInTheDocument()
    // It was confirmed, so there is nothing to recover either.
    expect(screen.queryByText(strandedSaveTitle('Lincoln'))).not.toBeInTheDocument()
    expect(screen.queryByText(strandedSaveTitle('London'))).not.toBeInTheDocument()
    expect(saveMock).toHaveBeenCalledTimes(1)
  })

  it('leaves a newer draft for the same child alone when it confirms (A → B → A)', async () => {
    const user = userEvent.setup()
    const held = heldSave()
    const view = render(tree())
    await fillEntry(user)
    await confirmAndSave(user)

    activeChildId = 'london'
    observationsScope = scopeOf('london')
    view.rerender(tree())
    activeChildId = 'lincoln'
    observationsScope = scopeOf('lincoln')
    view.rerender(tree())
    // A different entry, typed for the same boy on this later visit.
    await fillEntry(user, '55', '2026-10-15')

    // The FIRST visit's save confirms only now: the same child by id, another
    // visit by history, which is exactly what an id comparison cannot tell apart.
    view.rerender(tree(() => held.settleNow(savedOk())))
    await drain()

    expect(screen.getByLabelText('Lesson number')).toHaveValue('55')
    expect(screen.getByLabelText('Day you saw this')).toHaveValue('2026-10-15')
    expect(screen.queryByText(/Recorded for/)).not.toBeInTheDocument()
    expect(saveMock).toHaveBeenCalledTimes(1)
  })

  it('discards an outcome when the ACCOUNT changed in that same commit', async () => {
    const user = userEvent.setup()
    const held = heldSave()
    const view = render(tree())
    await fillEntry(user)
    await confirmAndSave(user)

    // The next household is signed in by the time the answer comes back, and the
    // commit that signed them in is the commit it came back in.
    familyId = 'fam-2'
    childrenById = OTHER_FAMILY_CHILDREN
    view.rerender(tree(() => held.settleNow({ ok: false, message: failureNotice() })))
    await drain()

    expect(screen.queryByText(strandedSaveTitle('Lincoln'))).not.toBeInTheDocument()
    expect(screen.queryByText(strandedSaveTitle('Leo'))).not.toBeInTheDocument()
    expect(screen.queryByText(/working on lesson 42/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try saving/ })).not.toBeInTheDocument()

    // ...and going back does not resurrect it, as before.
    familyId = 'fam-1'
    childrenById = CHILDREN
    view.rerender(tree())

    expect(screen.queryByText(strandedSaveTitle('Lincoln'))).not.toBeInTheDocument()
    expect(screen.queryByText(/working on lesson 42/)).not.toBeInTheDocument()
    expect(saveMock).toHaveBeenCalledTimes(1)
  })
})

/**
 * PR-1897 review, round 3 P2 — a family change names nobody.
 *
 * The reset branch was shared with the child switch and built the child-switch
 * notice for an account change too, resolving a name out of `children`: either
 * the list of the family that has just signed out — whose child's name is not
 * this parent's to read — or the new family's, where the same id can be a
 * different boy. Nothing was switched between children either, so the sentence
 * was untrue as well as leaky. A family change clears the notice outright; only
 * a child change inside one family names anyone.
 */
describe('when the family changes under it', () => {
  it('clears the draft and names nobody, when the id repeats in the new family', async () => {
    const user = userEvent.setup()
    const view = render(<NativeProgressSection />)
    await fillEntry(user)

    familyId = 'fam-2'
    childrenById = OTHER_FAMILY_CHILDREN
    view.rerender(<NativeProgressSection />)

    // The draft is cleared, as it always is on a change of scope...
    expect(screen.getByLabelText('Lesson number')).toHaveValue('')
    // ...and no notice is shown, under either household's name.
    expect(screen.queryByText(/was cleared and not saved/)).not.toBeInTheDocument()
    expect(screen.queryByText(/goes to/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Lincoln/)).not.toBeInTheDocument()
    expect(screen.getByText(/Recording for/)).toHaveTextContent('Leo')
  })

  it('names nobody when the children list is still the previous family’s', async () => {
    const user = userEvent.setup()
    const view = render(<NativeProgressSection />)
    await fillEntry(user)

    // Only the sign-in has changed so far. The list a name would be resolved
    // from is still the family that has left, which is the name that may not be
    // printed — the surface's own "Recording for" line reads from the shell's
    // list and is the shell's to settle, but this surface's notice is not.
    familyId = 'fam-2'
    view.rerender(<NativeProgressSection />)

    expect(screen.getByLabelText('Lesson number')).toHaveValue('')
    expect(screen.queryByText(/was cleared and not saved/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Switched child/)).not.toBeInTheDocument()
    expect(screen.queryByText(/goes to/)).not.toBeInTheDocument()
  })

  it('promises nothing about a confirmed save that is still in the air', async () => {
    const user = userEvent.setup()
    const held = heldSave()
    const view = render(<NativeProgressSection />)
    await fillEntry(user)
    await confirmAndSave(user)

    familyId = 'fam-2'
    childrenById = OTHER_FAMILY_CHILDREN
    view.rerender(<NativeProgressSection />)

    // The in-flight sentence would have named Lincoln to the next household and
    // offered to report back on an entry this sign-in will never be shown.
    expect(screen.queryByText(/goes to/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Lincoln/)).not.toBeInTheDocument()

    await held.refuse()

    expect(screen.queryByText(strandedSaveTitle('Lincoln'))).not.toBeInTheDocument()
    expect(screen.queryByText(strandedSaveTitle('Leo'))).not.toBeInTheDocument()
    expect(screen.queryByText(/working on lesson 42/)).not.toBeInTheDocument()
    expect(saveMock).toHaveBeenCalledTimes(1)
  })

  it('still names the child for a switch inside the new family', async () => {
    // The clearing is scoped to the account change itself. Once this family is
    // the bound one, a child switch is a child switch again.
    const user = userEvent.setup()
    familyId = 'fam-2'
    childrenById = { ...OTHER_FAMILY_CHILDREN, luca: { id: 'luca', name: 'Luca' } }
    const view = render(<NativeProgressSection />)
    await fillEntry(user)

    activeChildId = 'luca'
    observationsScope = scopeOf('luca', 'fam-2')
    view.rerender(<NativeProgressSection />)

    expect(await screen.findByText(/was cleared and not saved/)).toHaveTextContent('Leo')
    expect(screen.getByLabelText('Lesson number')).toHaveValue('')
  })
})

/**
 * PR-1897 review, round 4 P2 — the allowed day follows the calendar.
 *
 * `useState(todayKey)` pinned the day the form validates against at mount. This is
 * a tab that is rarely closed, so a parent who opened it yesterday was told that
 * TODAY "hasn't happened yet" and had no way to record what she had just read
 * short of reloading. The live key fixes that and may not cost anything it was
 * protecting: a date already typed stays typed, a reviewed entry is still the one
 * that gets sent, and a day that has not happened is still refused.
 */
describe('when the day rolls over under an open tab', () => {
  it('accepts the new day without a remount', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    // Opened on the 16th; by the time she types, it is the 17th.
    rollOverTo('2026-10-17')

    await fillEntry(user, '42', '2026-10-17')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    expect(saveMock.mock.calls[0][0].observation.observedOn).toBe('2026-10-17')
    // ...and the field's own ceiling moved with it.
    expect(screen.getByLabelText('Day you saw this')).toHaveAttribute('max', '2026-10-17')
  })

  it('keeps a date already typed, and sends the entry exactly as reviewed', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    await fillEntry(user, '42', '2026-10-16')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    expect(await screen.findByText(/seen Oct 16/)).toBeInTheDocument()

    // Midnight passes with the entry reviewed, waiting for the second tap.
    rollOverTo('2026-10-17')

    expect(screen.getByLabelText('Day you saw this')).toHaveValue('2026-10-16')
    expect(screen.getByLabelText('Lesson number')).toHaveValue('42')
    // Still the entry she checked — nothing re-dated it behind the confirm step.
    expect(screen.getByText(/seen Oct 16/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save this record' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    expect(saveMock.mock.calls[0][0].observation.observedOn).toBe('2026-10-16')
  })

  it('still refuses a day that has not happened', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    rollOverTo('2026-10-17')
    await fillEntry(user, '42', '2026-10-18')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))

    expect(await screen.findByText("That day hasn't happened yet.")).toBeInTheDocument()
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('starts a fresh draft on the new day', async () => {
    const user = userEvent.setup()
    render(<NativeProgressSection />)
    await fillEntry(user, '42', '2026-10-16')
    rollOverTo('2026-10-17')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))
    expect(await screen.findByText(/Recorded for Lincoln/)).toBeInTheDocument()

    // What was saved kept the day she saw it...
    expect(saveMock.mock.calls[0][0].observation.observedOn).toBe('2026-10-16')
    // ...and the draft that replaced it starts on the live day.
    expect(screen.getByLabelText('Day you saw this')).toHaveValue('2026-10-17')
  })

  it('seeds the next draft on the new day when the save comes back after midnight', async () => {
    // Sol, round 4: `handleSave` holds the reset callback captured at the tap, so
    // a write held across midnight re-seeded the form on the day the tap happened
    // even though the live day had already moved.
    const user = userEvent.setup()
    const held = heldSave()
    render(<NativeProgressSection />)
    await fillEntry(user, '42', '2026-10-16')
    await confirmAndSave(user)

    rollOverTo('2026-10-17')
    await act(async () => {
      held.settleNow(savedOk())
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(await screen.findByText(/Recorded for Lincoln/)).toBeInTheDocument()
    // What was confirmed went unchanged...
    expect(saveMock.mock.calls[0][0].observation.observedOn).toBe('2026-10-16')
    // ...and the draft that replaced it is on the live day, within its ceiling.
    const field = screen.getByLabelText('Day you saw this')
    expect(field).toHaveValue('2026-10-17')
    expect(field).toHaveAttribute('max', '2026-10-17')
  })

  it('brings a cancelled correction back on the new day', async () => {
    const user = userEvent.setup()
    observations = [row()]
    render(<NativeProgressSection />)

    await user.click(screen.getByRole('button', { name: 'Correct this entry' }))
    expect(screen.getByLabelText('Day you saw this')).toHaveValue('2026-10-12')
    rollOverTo('2026-10-17')
    await user.click(screen.getByRole('button', { name: 'Cancel correction' }))

    expect(screen.getByLabelText('Day you saw this')).toHaveValue('2026-10-17')
  })

  it('does not report an untouched draft as typing lost when the child changes', async () => {
    // The seeded date is not typing. Judged against the live day it became
    // "edited" the moment midnight passed, and the switch notice then claimed an
    // entry had been cleared that never existed. (The control is the case above:
    // a draft that WAS typed is still reported — *clears the draft and says what
    // was lost*.)
    const { rerender } = render(<NativeProgressSection />)
    rollOverTo('2026-10-17')

    activeChildId = 'london'
    observationsScope = scopeOf('london')
    rerender(<NativeProgressSection />)

    expect(screen.queryByText(/was cleared and not saved/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Switched child/)).not.toBeInTheDocument()
    // The new child's fresh draft is on the live day.
    expect(screen.getByLabelText('Day you saw this')).toHaveValue('2026-10-17')
  })
})

/**
 * PR-1897 review, round 4 P2 — a pending save is claimed for ONE record.
 *
 * The notice read the hook's global in-flight flag as "this child has a save in
 * the air". With one held request and two switches — Lincoln → London → Luca, or
 * Lincoln → London → Lincoln — leaving London therefore promised that something
 * confirmed for London had gone to London's record and that an unconfirmed one
 * would be shown, inventing a second entry and a second receipt out of Lincoln's.
 * The claim is now made from the in-flight request's own family and child.
 */
describe('a pending save is attributed to the child it belongs to', () => {
  it('names it when leaving that child, and claims nothing for the next one', async () => {
    const user = userEvent.setup()
    childrenById = { ...CHILDREN, luca: { id: 'luca', name: 'Luca' } }
    const held = heldSave()
    const view = render(<NativeProgressSection />)
    await fillEntry(user)
    await confirmAndSave(user)

    // Lincoln → London, with his entry in the air: the true claim, as before.
    activeChildId = 'london'
    observationsScope = scopeOf('london')
    view.rerender(<NativeProgressSection />)
    expect(await screen.findByText(/goes to Lincoln's record/)).toBeInTheDocument()

    // London → Luca, the same request still held. London had nothing in the air.
    activeChildId = 'luca'
    observationsScope = scopeOf('luca')
    view.rerender(<NativeProgressSection />)

    expect(screen.queryByText(/goes to/)).not.toBeInTheDocument()
    expect(screen.queryByText(/London/)).not.toBeInTheDocument()
    expect(saveMock).toHaveBeenCalledTimes(1)

    // The held write is still Lincoln's, and still recoverable as his.
    await held.refuse()
    expect(await screen.findByText(strandedSaveTitle('Lincoln'))).toBeInTheDocument()
    expect(screen.queryByText(strandedSaveTitle('London'))).not.toBeInTheDocument()
    expect(saveMock).toHaveBeenCalledTimes(1)
  })

  it('claims nothing for the child passed through on the way back (A → B → A)', async () => {
    const user = userEvent.setup()
    const held = heldSave()
    const view = render(<NativeProgressSection />)
    await fillEntry(user)
    await confirmAndSave(user)
    const request = saveMock.mock.calls[0][0]

    activeChildId = 'london'
    observationsScope = scopeOf('london')
    view.rerender(<NativeProgressSection />)
    expect(await screen.findByText(/goes to Lincoln's record/)).toBeInTheDocument()

    // Back to Lincoln while his first entry is still held. Leaving LONDON is what
    // this switch is, and London has nothing pending.
    activeChildId = 'lincoln'
    observationsScope = scopeOf('lincoln')
    view.rerender(<NativeProgressSection />)

    expect(screen.queryByText(/goes to/)).not.toBeInTheDocument()
    expect(screen.queryByText(/London/)).not.toBeInTheDocument()

    // The one write still answers for itself, and a retry is still the same row.
    await held.refuse()
    expect(await screen.findByText(strandedSaveTitle('Lincoln'))).toBeInTheDocument()

    saveMock.mockResolvedValue(savedOk())
    await user.click(
      screen.getByRole('button', { name: "Try saving Lincoln's entry again" }),
    )
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2))
    expect(saveMock.mock.calls[1][0]).toMatchObject({
      familyId: 'fam-1',
      childId: 'lincoln',
      entryKey: request.entryKey,
    })
  })

  it('claims nothing for a child whose save has already come back', async () => {
    const user = userEvent.setup()
    const view = render(<NativeProgressSection />)
    await fillEntry(user)
    await confirmAndSave(user)
    expect(await screen.findByText(/Recorded for Lincoln/)).toBeInTheDocument()

    // Settled, so there is nothing to promise about: the notice says only what
    // was lost from the form.
    activeChildId = 'london'
    observationsScope = scopeOf('london')
    view.rerender(<NativeProgressSection />)

    expect(screen.queryByText(/goes to/)).not.toBeInTheDocument()
    expect(saveMock).toHaveBeenCalledTimes(1)
  })
})

/**
 * PR-1897 review, continuation 1 — the draft may not be edited while IT is
 * being written.
 *
 * `saving` was enough for the buttons and not for the fields: the six of them
 * stayed live while the request carrying the entry was unanswered, so typing
 * edited the very draft in the air. A confirmation then cleared the new typing
 * with a receipt for the old content, and an edit made before any failure kept
 * the `entryKey` — a changed entry under the id of one that may already have
 * landed.
 *
 * The guard is matched on family + child + entry key, never on `saving` alone,
 * which is what the last case here is about: a draft the held request does NOT
 * belong to stays editable, as the cross-child and A → B → A cases above require.
 */
describe('a draft whose own save is still in the air', () => {
  /** The commit the real hook makes when it records the in-flight request. */
  const showInFlight = (view: ReturnType<typeof render>) =>
    view.rerender(<NativeProgressSection />)

  it('locks the fields and the correction button, and keeps the entry as confirmed', async () => {
    const user = userEvent.setup()
    observations = [row({ id: 'lincoln__e1', nativeNumber: 42 })]
    const held = heldSave()
    const view = render(<NativeProgressSection />)
    await fillEntry(user)
    await confirmAndSave(user)
    showInFlight(view)

    expect(screen.getByLabelText('Lesson number')).toBeDisabled()
    expect(screen.getByLabelText('Day you saw this')).toBeDisabled()
    expect(screen.getByLabelText('Note (optional)')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Correct this entry' })).toBeDisabled()

    // The events a `disabled` attribute does not stop: one already queued when
    // the write began, and a programmatic tap on the correction button.
    fireEvent.change(screen.getByLabelText('Lesson number'), { target: { value: '99' } })
    fireEvent.click(screen.getByRole('button', { name: 'Correct this entry' }))

    expect(screen.getByLabelText('Lesson number')).toHaveValue('42')
    expect(screen.queryByText(/That entry stays on the record/)).not.toBeInTheDocument()

    // ...and the confirmation describes what was actually sent.
    await act(async () => {
      held.settleNow(savedOk())
      await Promise.resolve()
    })
    expect(await screen.findByText(/Recorded for Lincoln/)).toBeInTheDocument()
    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(saveMock.mock.calls[0][0].observation.nativeNumber).toBe(42)
    // The form is free again, and empty rather than holding the blocked edit.
    expect(screen.getByLabelText('Lesson number')).toBeEnabled()
    expect(screen.getByLabelText('Lesson number')).toHaveValue('')
  })

  it('hands the entry back unchanged when the answer is unconfirmed', async () => {
    const user = userEvent.setup()
    const held = heldSave()
    const view = render(<NativeProgressSection />)
    await fillEntry(user)
    await confirmAndSave(user)
    showInFlight(view)
    fireEvent.change(screen.getByLabelText('Lesson number'), { target: { value: '99' } })

    await held.refuse()

    expect(await screen.findByText(/not confirmed as saved/)).toBeInTheDocument()
    // Hers to retry or edit, and it says what she confirmed.
    const field = screen.getByLabelText('Lesson number')
    expect(field).toBeEnabled()
    expect(field).toHaveValue('42')

    // A retry is the same row...
    saveMock.mockResolvedValue({ ok: false, message: failureNotice() })
    await user.click(screen.getByRole('button', { name: 'Save this record' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2))
    expect(saveMock.mock.calls[1][0].entryKey).toBe(saveMock.mock.calls[0][0].entryKey)

    // ...and an edit, which is allowed again now, is a different one.
    await user.type(screen.getByLabelText('Lesson number'), '3')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(3))
    expect(saveMock.mock.calls[2][0].entryKey).not.toBe(saveMock.mock.calls[0][0].entryKey)
    expect(saveMock.mock.calls[2][0].observation.nativeNumber).toBe(423)
  })

  it('leaves a draft the held request does not belong to editable', async () => {
    // The retry of a stranded entry carries the OLD key, so the newer draft for
    // the same child is not the one in the air and must not freeze behind it.
    const user = userEvent.setup()
    const held = heldSave()
    const view = render(<NativeProgressSection />)
    await fillEntry(user)
    await confirmAndSave(user)

    activeChildId = 'london'
    observationsScope = scopeOf('london')
    view.rerender(<NativeProgressSection />)
    activeChildId = 'lincoln'
    observationsScope = scopeOf('lincoln')
    view.rerender(<NativeProgressSection />)
    await fillEntry(user, '55', '2026-10-15')
    await held.refuse()
    expect(await screen.findByText(strandedSaveTitle('Lincoln'))).toBeInTheDocument()

    // The retry is held in its turn, with the stranded entry's key.
    heldSave()
    await user.click(
      screen.getByRole('button', { name: "Try saving Lincoln's entry again" }),
    )
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2))
    showInFlight(view)

    const field = screen.getByLabelText('Lesson number')
    expect(field).toBeEnabled()
    await user.type(field, '6')
    expect(field).toHaveValue('556')
  })
})

/**
 * PR-1897 review, P2 — the way out of a correction started by accident.
 *
 * Without it the Program field stayed locked and every later entry was filed as a
 * correction of a row the parent never meant to touch.
 */
describe('cancelling a correction', () => {
  it('writes nothing and hands back a fresh standalone entry', async () => {
    const user = userEvent.setup()
    observations = [row({ id: 'lincoln__e1', nativeNumber: 42 })]
    render(<NativeProgressSection />)

    await user.click(screen.getByRole('button', { name: 'Correct this entry' }))
    expect(await screen.findByText(/That entry stays on the record/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel correction' }))

    expect(screen.queryByText(/That entry stays on the record/)).not.toBeInTheDocument()
    expect(
      screen.queryByText('A correction stays with the program of the entry it fixes.'),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Lesson number')).toHaveValue('')
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('unlocks the program, and the next save is linked to nothing', async () => {
    const user = userEvent.setup()
    observations = [row({ id: 'lincoln__e1', nativeNumber: 42 })]
    render(<NativeProgressSection />)

    await user.click(screen.getByRole('button', { name: 'Correct this entry' }))
    await user.click(screen.getByRole('button', { name: 'Cancel correction' }))

    // The Program field takes a new value again — it is dead while correcting.
    await user.click(screen.getByRole('combobox', { name: 'Program' }))
    await user.click(screen.getByRole('option', { name: 'Fast Phonics' }))
    const field = await screen.findByLabelText('Peak number')
    await user.clear(field)
    await user.type(field, '7')
    fireEvent.change(screen.getByLabelText('Day you saw this'), {
      target: { value: '2026-10-12' },
    })
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    const request = saveMock.mock.calls[0][0]
    // A standalone entry: nothing on the record is restated by it.
    expect(request.correctsObservationId).toBeUndefined()
    expect(request.observation).toMatchObject({ program: 'fastPhonics', nativeNumber: 7 })
  })
})

describe('the history', () => {
  it('shows each entry with the day seen, the meaning and the source', () => {
    observations = [row()]
    render(<NativeProgressSection />)
    expect(
      screen.getByText('Mathseeds — working on lesson 42, seen Oct 12 (parent report)'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Entered Oct 1[45]/)).toBeInTheDocument()
  })

  it('reports the latest READING, and flags entries made out of order', () => {
    observations = [
      row({ id: 'a', observedOn: '2026-10-12', recordedAt: '2026-10-12T10:00:00.000Z' }),
      row({
        id: 'b',
        nativeNumber: 30,
        observedOn: '2026-09-20',
        recordedAt: '2026-10-15T10:00:00.000Z',
      }),
    ]
    render(<NativeProgressSection />)
    expect(screen.getByText(/Latest record: working on lesson 42, as of Oct 12/)).toBeInTheDocument()
    expect(screen.getByText(/added out of order/)).toBeInTheDocument()
  })

  it('keeps both of two entries that disagree about the same day', () => {
    observations = [
      row({ id: 'a', nativeNumber: 42, recordedAt: '2026-10-12T10:00:00.000Z' }),
      row({ id: 'b', nativeNumber: 44, recordedAt: '2026-10-12T11:00:00.000Z' }),
    ]
    render(<NativeProgressSection />)
    expect(screen.getByText(/working on lesson 42, seen Oct 12/)).toBeInTheDocument()
    expect(screen.getByText(/working on lesson 44, seen Oct 12/)).toBeInTheDocument()
    expect(screen.getByText(/both are kept/)).toBeInTheDocument()
  })

  it('a correction is linked, and the entry it corrects is still there', () => {
    observations = [
      row({ id: 'a', nativeNumber: 42, recordedAt: '2026-10-12T10:00:00.000Z' }),
      row({
        id: 'b',
        nativeNumber: 41,
        recordedAt: '2026-10-15T10:00:00.000Z',
        correctsObservationId: 'a',
      }),
    ]
    render(<NativeProgressSection />)
    expect(screen.getByText(/working on lesson 41, seen Oct 12/)).toBeInTheDocument()
    expect(screen.getByText(/working on lesson 42, seen Oct 12/)).toBeInTheDocument()
    expect(screen.getByText(/Correction of the entry seen Oct 12/)).toBeInTheDocument()
    expect(screen.getByText('Later corrected')).toBeInTheDocument()
  })

  it('correcting an entry seeds the form and links the save to the original', async () => {
    const user = userEvent.setup()
    observations = [row({ id: 'lincoln__e1', nativeNumber: 42 })]
    render(<NativeProgressSection />)

    await user.click(screen.getByRole('button', { name: 'Correct this entry' }))
    expect(await screen.findByText(/That entry stays on the record/)).toBeInTheDocument()
    expect(screen.getByLabelText('Lesson number')).toHaveValue('42')

    const field = screen.getByLabelText('Lesson number')
    await user.clear(field)
    await user.type(field, '41')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    expect(saveMock.mock.calls[0][0]).toMatchObject({
      correctsObservationId: 'lincoln__e1',
      observation: { nativeNumber: 41 },
    })
  })

  it('a correction stays with the program of the entry it fixes', async () => {
    // Review item 7: the writer refuses a cross-program link, and the form says
    // so before she types rather than after she taps Save. (That the Program
    // field is also locked while correcting is pinned statically in
    // `nativeProgressBoundary.source.test.ts`, which does not depend on how MUI
    // renders a disabled select.)
    const user = userEvent.setup()
    observations = [row({ id: 'lincoln__e1', program: NativeProgressProgram.FastPhonics })]
    render(<NativeProgressSection />)

    await user.click(screen.getByRole('button', { name: 'Correct this entry' }))
    expect(
      await screen.findByText('A correction stays with the program of the entry it fixes.'),
    ).toBeInTheDocument()

    const field = screen.getByLabelText('Peak number')
    await user.clear(field)
    await user.type(field, '6')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    expect(saveMock.mock.calls[0][0]).toMatchObject({
      correctsObservationId: 'lincoln__e1',
      observation: { program: 'fastPhonics', nativeNumber: 6 },
    })
  })

  it('warns about a linked finished-program record BEFORE the correction is saved', async () => {
    // FEAT-242 review item 4. A correction can withdraw a confirmed
    // finished-program record in the same transaction, so the blanket "this does
    // not update plans, hours or skills" is false while one is open — and the
    // warning belongs before the second tap, not in the receipt.
    const user = userEvent.setup()
    observations = [row({ id: 'lincoln__e1', nativeNumber: 42 })]
    render(<NativeProgressSection />)
    expect(
      screen.getByText('Saved for reference. This does not update plans, hours or skills.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Correct this entry' }))
    expect(screen.getByText(/with one exception/)).toBeInTheDocument()
    expect(
      screen.queryByText('Saved for reference. This does not update plans, hours or skills.'),
    ).not.toBeInTheDocument()

    const field = screen.getByLabelText('Lesson number')
    await user.clear(field)
    await user.type(field, '41')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    // The warning is on the confirm step, with nothing written yet.
    expect(
      await screen.findByText(/withdraws that record and takes back what it had marked as covered/),
    ).toBeInTheDocument()
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('a correction that withdrew a completion does NOT say nothing else changed', async () => {
    const user = userEvent.setup()
    observations = [row({ id: 'lincoln__e1', nativeNumber: 42 })]
    saveMock.mockResolvedValue({
      ...savedOk({ nativeNumber: 41 }),
      completionRevoked: { status: 'revoked' as const },
    })
    render(<NativeProgressSection />)

    await user.click(screen.getByRole('button', { name: 'Correct this entry' }))
    const field = screen.getByLabelText('Lesson number')
    await user.clear(field)
    await user.type(field, '41')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))

    expect(
      await screen.findByText(/has been withdrawn, and what it had marked as covered has been taken back/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Nothing else changed\./)).not.toBeInTheDocument()
  })

  it('reports a withdrawal the learning picture could not take as PENDING', async () => {
    const user = userEvent.setup()
    observations = [row({ id: 'lincoln__e1', nativeNumber: 42 })]
    saveMock.mockResolvedValue({
      ...savedOk({ nativeNumber: 41 }),
      completionRevoked: { status: 'pending' as const },
    })
    render(<NativeProgressSection />)

    await user.click(screen.getByRole('button', { name: 'Correct this entry' }))
    const field = screen.getByLabelText('Lesson number')
    await user.clear(field)
    await user.type(field, '41')
    await user.click(screen.getByRole('button', { name: 'Check this entry' }))
    await user.click(await screen.findByRole('button', { name: 'Save this record' }))

    expect(
      await screen.findByText(/the learning picture could not be updated/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Nothing else changed\./)).not.toBeInTheDocument()
  })

  it('a failed read is never shown as an empty record', () => {
    readError = 'permission-denied'
    render(<NativeProgressSection />)
    expect(screen.getByText(/Couldn't load the entries you have saved/)).toBeInTheDocument()
    expect(screen.queryByText('Nothing recorded yet')).not.toBeInTheDocument()
  })

  it('does not present another child’s rows while this child’s read is unsettled', () => {
    observations = [row()]
    observationsScope = scopeOf('london')
    loading = true
    render(<NativeProgressSection />)
    expect(screen.queryByText(/working on lesson 42/)).not.toBeInTheDocument()
    expect(screen.getByText('Loading your entries…')).toBeInTheDocument()
  })
})
