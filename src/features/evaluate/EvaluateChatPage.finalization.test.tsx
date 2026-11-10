import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-492 — a completed guided evaluation's finalization is the thing Apply
 * points at, and nothing downstream runs until it is acknowledged.
 *
 * Two defects are pinned here, both reachable from the ordinary controls:
 *
 *  1. **The same-day replacement.** The daily record id is
 *     `{childId}_{domain}_{date}`, so both completed attempts in a day write the
 *     same document. Two attempts can project the SAME evidence summary with
 *     opposite recorded help, so after the replacement nothing stored said which
 *     attempt an applied finding came from. The repair writes one finalized
 *     source per completion, with a fresh id, in the same transaction — and the
 *     learner-model write-back now stamps that id alongside the (unchanged) day
 *     id.
 *  2. **Apply over a pending or failed save.** The old Apply was enabled as soon
 *     as the summary rendered, so it could stamp a source that was not committed
 *     — or never would be. Apply is now disabled and refused until the exact
 *     pinned save is acknowledged, with an explicit retry of the same payload and
 *     id that costs no new AI request and no second hour log.
 *
 * POSITIVE CONTROLS are named per case. The `PENDING` case is the one that fails
 * if the Apply gate is removed: with the gate deleted, `syncEvalFindingsToModel`
 * is called while the finalization is still in flight.
 */

const FAMILY_ID = 'fam-1'

const CHILDREN = [
  { id: 'lincoln', name: 'Lincoln' },
  { id: 'london', name: 'London' },
]

const activeChildId = vi.fn<() => string>()

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    children: CHILDREN,
    activeChildId: activeChildId(),
    activeChild: CHILDREN.find((c) => c.id === activeChildId()),
    childrenFamilyId: FAMILY_ID,
    setActiveChildId: vi.fn(),
    isChildProfile: false,
    isLoading: false,
    loadFailed: false,
    retryLoad: vi.fn(),
    addChild: vi.fn(),
  }),
}))

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => FAMILY_ID }))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

// ── The AI turn ─────────────────────────────────────────────────

let releaseChat: (value: { message: string } | null) => void = () => {}
const chat = vi.fn(
  () =>
    new Promise<{ message: string } | null>((resolve) => {
      releaseChat = resolve
    }),
)
const analyzePatterns = vi.fn(async () => null)

vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({ chat, analyzePatterns, loading: false, error: null }),
  TaskType: { Evaluate: 'evaluate' },
}))

// A long-enough session, so the hour log is a REAL write this run can count —
// which is what makes "a retry logs no second hour" an assertion rather than a
// vacuous pass under the 5-minute floor.
const timerStop = vi.fn(() => 600)
vi.mock('../../core/utils/sessionTimer', () => ({
  useSessionTimer: () => ({
    startTimer: vi.fn(),
    getCurrentSeconds: () => 600,
    stop: timerStop,
    isActive: true,
    isPaused: false,
  }),
}))

// ── Firestore ───────────────────────────────────────────────────

interface Ref {
  collection: string
  id: string
}

/** Every write performed, by either path. */
let writes: Array<{ collection: string; id: string; data: Record<string, unknown> }> = []
/** Committed finalized sources, so a retry can find its own first attempt. */
const sources = new Map<string, Record<string, unknown>>()
/** Queued transaction outcomes: `null` commits, an Error rejects. */
let transactionFailures: Array<Error | null> = []
/** Set to hold the next transaction open until released. */
let holdTransaction: (() => void) | null = null

const setDoc = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve())
const addDoc = vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: 'new' }),
)
const getDocs = vi.fn<(...args: unknown[]) => Promise<{ docs: unknown[] }>>(() =>
  Promise.resolve({ docs: [] }),
)

let autoId = 0

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDoc(...args),
  setDoc: (...args: unknown[]) => setDoc(...args),
  updateDoc: vi.fn(() => Promise.resolve()),
  doc: (collection: { name: string }, id?: string): Ref => ({
    collection: collection.name,
    id: id ?? `src_${(autoId += 1)}`,
  }),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
  getDocs: (...args: unknown[]) => getDocs(...args),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const staged: Array<{ ref: Ref; data: Record<string, unknown> }> = []
    const tx = {
      get: async (ref: Ref) => {
        const stored = ref.collection === 'guidedEvaluationSources' ? sources.get(ref.id) : undefined
        return {
          exists: () => stored !== undefined,
          data: () => (stored ? { ...stored, id: ref.id } : undefined),
        }
      },
      set: (ref: Ref, data: Record<string, unknown>) => {
        staged.push({ ref, data })
      },
    }
    const out = await fn(tx)
    if (holdTransaction) {
      const held = holdTransaction
      holdTransaction = null
      await new Promise<void>((resolve) => {
        held()
        releaseTransaction = resolve
      })
    }
    const failure = transactionFailures.shift()
    if (failure) throw failure
    for (const { ref, data } of staged) {
      writes.push({ collection: ref.collection, id: ref.id, data })
      if (ref.collection === 'guidedEvaluationSources') {
        sources.set(ref.id, JSON.parse(JSON.stringify(data)))
      }
    }
    return out
  },
}))

/** Releases a transaction held open by `holdTransaction`. */
let releaseTransaction: () => void = () => {}

vi.mock('../../core/firebase/firestore', () => ({
  db: {},
  evaluationSessionsCollection: () => ({ name: 'evaluationSessions' }),
  guidedEvaluationSourcesCollection: () => ({ name: 'guidedEvaluationSources' }),
  hoursCollection: () => ({ name: 'hours' }),
  skillSnapshotsCollection: () => ({ name: 'skillSnapshots' }),
}))

const syncEvalFindingsToModel = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
  Promise.resolve(),
)
vi.mock('./evalModelWriteback', () => ({
  syncEvalFindingsToModel: (...args: unknown[]) => syncEvalFindingsToModel(...args),
}))

const addXpEvent = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve())
const addDiamondEvent = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve())

vi.mock('../../core/curriculum/updateSkillMapFromFindings', () => ({
  updateSkillMapFromFindings: vi.fn(async () => {}),
}))
vi.mock('../../core/xp/addXpEvent', () => ({
  addXpEvent: (...args: unknown[]) => addXpEvent(...args),
}))
vi.mock('../../core/xp/addDiamondEvent', () => ({
  addDiamondEvent: (...args: unknown[]) => addDiamondEvent(...args),
}))
vi.mock('./FoundationsSection', () => ({ default: () => null }))

import EvaluateChatPage from './EvaluateChatPage'

/** A completing turn whose finding records that the child read it UNAIDED. */
const UNAIDED_TURN = {
  message:
    'Nice work.\n' +
    '<finding>{"skill":"phonics.cvc.short-o","status":"emerging","evidence":"read hop and mop, stalled on dog","notes":"read it with no help from me"}</finding>' +
    '<complete>{"summary":"Short-o is the frontier.","frontier":"Short-o CVC words","recommendations":[]}</complete>',
}

const dayWrites = () => writes.filter((w) => w.collection === 'evaluationSessions')
const sourceWrites = () => writes.filter((w) => w.collection === 'guidedEvaluationSources')
const hoursWrites = () =>
  addDoc.mock.calls.filter((c) => (c[0] as { name?: string })?.name === 'hours')

const applyButton = () => screen.getByRole('button', { name: /apply to skill snapshot/i })

/** Start an evaluation and let it complete. */
async function completeAnEvaluation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /start reading assessment/i }))
  await act(async () => {
    releaseChat(UNAIDED_TURN)
  })
  await waitFor(() => expect(screen.getByText(/Short-o is the frontier/i)).toBeInTheDocument())
}

beforeEach(() => {
  vi.clearAllMocks()
  writes = []
  sources.clear()
  transactionFailures = []
  holdTransaction = null
  activeChildId.mockReturnValue('lincoln')
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

describe('UX-492 — Apply waits for the finalization it will point at', () => {
  it('ORDINARY PATH — Apply stamps the receipt’s day id AND its finalization id', async () => {
    const user = userEvent.setup()
    render(<EvaluateChatPage />)
    await completeAnEvaluation(user)

    await waitFor(() => expect(applyButton()).toBeEnabled())
    await user.click(applyButton())

    await waitFor(() => expect(syncEvalFindingsToModel).toHaveBeenCalledTimes(1))
    const [, childId, sourceId, findings, , finalizedSourceId] =
      syncEvalFindingsToModel.mock.calls[0] as [
        string,
        string,
        string,
        Array<{ notes?: string }>,
        string,
        string | undefined,
      ]

    expect(childId).toBe('lincoln')
    // `sourceId` is unchanged — the daily id every existing reader keys on.
    expect(sourceId).toMatch(/^lincoln_reading_/)
    expect(sourceId).toBe(dayWrites()[0].id)
    // POSITIVE CONTROL: stop passing the finalization id and this fails — the
    // ref is then indistinguishable from one written by a later same-day attempt.
    expect(finalizedSourceId).toBe(sourceWrites()[0].id)
    // The findings come from the acknowledged source, with the recorded help
    // exactly as it was written.
    expect(findings[0].notes).toBe('read it with no help from me')

    // The reward dedup key is the SAVED day id, exactly as before.
    expect(addXpEvent).toHaveBeenCalledTimes(1)
    expect(addXpEvent.mock.calls[0][4]).toBe(`eval_${sourceId}`)
    expect(
      (addDiamondEvent.mock.calls[0][0] as { dedupKey: string }).dedupKey,
    ).toBe(`eval_${sourceId}-diamond`)
  })

  it('PENDING — a finalization still in flight says so and admits no Apply', async () => {
    const user = userEvent.setup()
    render(<EvaluateChatPage />)

    // Hold the finalization open at the moment the completed reply lands.
    let held = false
    holdTransaction = () => {
      held = true
    }

    await user.click(await screen.findByRole('button', { name: /start reading assessment/i }))
    await act(async () => {
      releaseChat(UNAIDED_TURN)
    })

    await waitFor(() => expect(held).toBe(true))

    // The parent is told out loud, rather than meeting an Apply that looks
    // available and would stamp an uncommitted source.
    expect(await screen.findByText(/saving the completed evaluation/i)).toBeInTheDocument()
    expect(applyButton()).toBeDisabled()

    // POSITIVE CONTROL: the write-back is what the old build reached here. The
    // tap is dispatched directly, so it is really delivered to the control
    // rather than skipped by the test library's pointer-events check.
    fireEvent.click(applyButton())
    expect(syncEvalFindingsToModel).not.toHaveBeenCalled()
    expect(addXpEvent).not.toHaveBeenCalled()

    // Settling — not a timeout — opens it.
    await act(async () => {
      releaseTransaction()
    })
    await waitFor(() => expect(applyButton()).toBeEnabled())
    expect(screen.queryByText(/saving the completed evaluation/i)).not.toBeInTheDocument()
  })

  it('REJECTED — the summary and report stay, Apply stays shut, and a retry is offered', async () => {
    const user = userEvent.setup()
    transactionFailures = [new Error('connection lost')]
    render(<EvaluateChatPage />)
    await completeAnEvaluation(user)

    // The work is not lost: summary and download are still on screen.
    expect(screen.getByText(/Short-o is the frontier/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download report/i })).toBeInTheDocument()
    expect(await screen.findByText(/didn't save/i)).toBeInTheDocument()
    expect(applyButton()).toBeDisabled()

    // Nothing was stored and nothing downstream ran.
    expect(dayWrites()).toEqual([])
    expect(sourceWrites()).toEqual([])
    expect(syncEvalFindingsToModel).not.toHaveBeenCalled()

    const aiCallsBefore = chat.mock.calls.length
    const hoursBefore = hoursWrites().length
    expect(hoursBefore).toBe(1) // the one log the completion already made

    await user.click(screen.getByRole('button', { name: /retry save/i }))

    await waitFor(() => expect(applyButton()).toBeEnabled())
    // The retry sent the same payload to the same ids, with no new AI request
    // and no second hour log.
    expect(chat.mock.calls.length).toBe(aiCallsBefore)
    expect(hoursWrites().length).toBe(hoursBefore)
    expect(sourceWrites()).toHaveLength(1)
    expect(dayWrites()).toHaveLength(1)

    // And the same original findings can then be applied once, by the usual path.
    await user.click(applyButton())
    await waitFor(() => expect(syncEvalFindingsToModel).toHaveBeenCalledTimes(1))
    expect(syncEvalFindingsToModel.mock.calls[0][5]).toBe(sourceWrites()[0].id)
  })

  it('ONE FINALIZATION PER COMPLETION — a repeat Apply keeps the same original pointer', async () => {
    const user = userEvent.setup()
    render(<EvaluateChatPage />)
    await completeAnEvaluation(user)
    await waitFor(() => expect(applyButton()).toBeEnabled())

    await user.click(applyButton())
    await waitFor(() => expect(syncEvalFindingsToModel).toHaveBeenCalledTimes(1))

    // The deliberate re-apply (FEAT-75) confirms first, then re-runs the same
    // additive write — against the SAME original, never a re-derived one.
    await user.click(screen.getByRole('button', { name: /re-apply to skill snapshot/i }))
    await user.click(screen.getByRole('button', { name: /^re-apply$/i }))
    await waitFor(() => expect(syncEvalFindingsToModel).toHaveBeenCalledTimes(2))

    const first = syncEvalFindingsToModel.mock.calls[0]
    const second = syncEvalFindingsToModel.mock.calls[1]
    expect(second[2]).toBe(first[2]) // the daily id
    expect(second[5]).toBe(first[5]) // the finalization id
    expect(second[3]).toEqual(first[3]) // the same ordered findings
    // And no second finalization was written for the second Apply.
    expect(sourceWrites()).toHaveLength(1)
  })

  it('SWITCH WHILE SAVING — the admitted save finishes for its own child and shows nothing', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<EvaluateChatPage />)

    let held = false
    holdTransaction = () => {
      held = true
    }

    await user.click(await screen.findByRole('button', { name: /start reading assessment/i }))
    await act(async () => {
      releaseChat(UNAIDED_TURN)
    })
    await waitFor(() => expect(held).toBe(true))

    // The shell chip moves while Lincoln's finalization is in flight.
    activeChildId.mockReturnValue('london')
    rerender(<EvaluateChatPage />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Evaluate London/ })).toBeInTheDocument(),
    )

    await act(async () => {
      releaseTransaction()
    })

    // The save that was already admitted lands under LINCOLN, its own captured
    // scope — and says nothing on London's screen.
    await waitFor(() => expect(sourceWrites()).toHaveLength(1))
    expect(sourceWrites()[0].data.childId).toBe('lincoln')
    expect(dayWrites()[0].id).toMatch(/^lincoln_reading_/)
    expect(screen.queryByText(/saving the completed evaluation/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Short-o is the frontier/i)).not.toBeInTheDocument()
    expect(syncEvalFindingsToModel).not.toHaveBeenCalled()
  })

  it('RESTART AFTER A FAILED SAVE — a cleared draft neither retries nor applies the old one', async () => {
    const user = userEvent.setup()
    render(<EvaluateChatPage />)

    transactionFailures = [new Error('connection lost')]
    await completeAnEvaluation(user)
    expect(await screen.findByText(/didn't save/i)).toBeInTheDocument()

    // Clear & Restart mounts a new draft, which owns no finalization at all.
    await user.click(screen.getByRole('button', { name: /clear & restart/i }))
    await user.click(
      screen.getAllByRole('button', { name: /clear & restart/i }).slice(-1)[0],
    )

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /start reading assessment/i })).toBeInTheDocument(),
    )
    // No retry, no Apply and no summary survive the restart, so the old pinned
    // payload cannot be re-saved or applied by the draft that replaced it.
    expect(screen.queryByRole('button', { name: /retry save/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/didn't save/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /apply to skill snapshot/i })).not.toBeInTheDocument()
    expect(syncEvalFindingsToModel).not.toHaveBeenCalled()
  })

  it('LEGACY RESUME — a resumed in-progress session finalizes onto its own day record', async () => {
    const user = userEvent.setup()
    // The visit's read finds an in-progress session with no finalization — the
    // pre-UX-492 shape — and the completion finalizes it in place.
    getDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'lincoln_reading_2026-11-09',
          data: () => ({
            childId: 'lincoln',
            domain: 'reading',
            status: 'in-progress',
            messages: [
              { id: 'm1', role: 'assistant', text: 'Show him hop.', createdAt: '2026-11-09T09:00:00.000Z' },
            ],
            findings: [],
            recommendations: [],
            evaluatedAt: '2026-11-09T09:00:00.000Z',
          }),
        },
      ],
    })

    render(<EvaluateChatPage />)

    const composer = await screen.findByPlaceholderText(/type your response/i)
    await user.type(composer, 'He read hop and mop')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await act(async () => {
      releaseChat(UNAIDED_TURN)
    })

    await waitFor(() => expect(sourceWrites()).toHaveLength(1))
    // The resumed day document keeps its id, and now names its finalization.
    expect(dayWrites()[0].id).toBe('lincoln_reading_2026-11-09')
    expect(dayWrites()[0].data.finalizedSourceId).toBe(sourceWrites()[0].id)
    expect(sourceWrites()[0].data.sessionDocId).toBe('lincoln_reading_2026-11-09')
  })
})
