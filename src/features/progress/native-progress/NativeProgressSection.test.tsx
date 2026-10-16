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
 */

let familyId: string | null = 'fam-1'
vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => familyId }))

/**
 * The clock is pinned and nothing else is.
 *
 * The form refuses a future day, so a test with real dates in it would start
 * failing on its own at some point in the past or future depending on when the
 * suite runs. Only `todayKey` is replaced; `formatDateShort` stays real, because
 * the displayed dates are part of what is being asserted.
 */
vi.mock('../../../core/utils/dateKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../core/utils/dateKey')>()
  return { ...actual, todayKey: () => '2026-10-16' }
})

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
let observationsChildId: string | null = 'lincoln'
let readError: string | null = null
let loading = false
/**
 * The hook's in-flight flag, mutable here.
 *
 * The surface reads it for the switch notice and for every disabled control, so a
 * test about a save that is still in the air has to be able to say so.
 */
let saving = false
const saveMock = vi.fn()
vi.mock('./useNativeProgressObservations', () => ({
  NATIVE_PROGRESS_SAVE_IN_FLIGHT: 'in flight',
  useNativeProgressObservations: () => ({
    observations,
    loading,
    error: readError,
    observationsChildId,
    saving,
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

beforeEach(() => {
  isChildProfile = false
  activeChildId = 'lincoln'
  childrenById = CHILDREN
  familyId = 'fam-1'
  observations = []
  observationsChildId = 'lincoln'
  readError = null
  loading = false
  saving = false
  saveMock.mockReset()
  saveMock.mockResolvedValue(savedOk())
})

/**
 * A save that is held open, the way a real one is while the header moves.
 *
 * `saving` is flipped the way the hook flips it, because the surface renders from
 * it — the switch notice's confirmed-save sentence and every disabled control.
 */
function heldSave() {
  let settle!: (outcome: unknown) => void
  saveMock.mockImplementation(() => {
    saving = true
    return new Promise((resolve) => {
      settle = (outcome: unknown) => {
        saving = false
        resolve(outcome)
      }
    })
  })
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
    observationsChildId = 'london'
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
    observationsChildId = 'london'
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
    observationsChildId = 'london'
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
    observationsChildId = 'london'
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
    observationsChildId = 'london'
    view.rerender(<NativeProgressSection />)
    activeChildId = 'lincoln'
    observationsChildId = 'lincoln'
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
    observationsChildId = 'london'
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
    observationsChildId = 'london'
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
    observationsChildId = 'london'
    view.rerender(tree())
    activeChildId = 'lincoln'
    observationsChildId = 'lincoln'
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
    observationsChildId = 'luca'
    view.rerender(<NativeProgressSection />)

    expect(await screen.findByText(/was cleared and not saved/)).toHaveTextContent('Leo')
    expect(screen.getByLabelText('Lesson number')).toHaveValue('')
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

  it('a failed read is never shown as an empty record', () => {
    readError = 'permission-denied'
    render(<NativeProgressSection />)
    expect(screen.getByText(/Couldn't load the entries you have saved/)).toBeInTheDocument()
    expect(screen.queryByText('Nothing recorded yet')).not.toBeInTheDocument()
  })

  it('does not present another child’s rows while this child’s read is unsettled', () => {
    observations = [row()]
    observationsChildId = 'london'
    loading = true
    render(<NativeProgressSection />)
    expect(screen.queryByText(/working on lesson 42/)).not.toBeInTheDocument()
    expect(screen.getByText('Loading your entries…')).toBeInTheDocument()
  })
})
