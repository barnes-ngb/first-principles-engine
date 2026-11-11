import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-494 — the close saves ONE payload under its own id, a failure is
 * recoverable, and every door is bound to the view it was rendered in.
 *
 * The baseline reproductions this file pins at the hook level:
 *
 *   • a DENIED five-answer save must produce ZERO graph changes and offer a
 *     retry for that payload;
 *   • a committed acknowledgement lost before the retry is a success that
 *     writes nothing and still projects once;
 *   • the same id carrying a DIFFERENT payload is a conflict — no overwrite and
 *     no graph application;
 *   • a held Math summary, then *Try another quest* and Start Phonics, must
 *     finish Math under Math's own id, mode and timer, and must not touch the
 *     Phonics run's screen;
 *   • an ordinary untagged quest makes no model attempt at all;
 *   • a manual partial exit whose transaction is rejected keeps its answers and
 *     its minutes, and retries through the same scoped affordance;
 *   • a retained Start cannot run for the child who left the screen, a second
 *     Start cannot replace an established run, and an old summary's settled
 *     retry cannot relabel a newer same-child summary.
 *
 * The three release-review paths it pins on top of those:
 *
 *   • a FIRST-question Skip whose replacement throws retires that run, so the
 *     intro's own Start works again;
 *   • an acknowledged partial RETRY asks its open intro to re-read the resume
 *     card, with one source and one time credit;
 *   • a freshly rendered Retry on a retained summary is authorised after a
 *     same-family child change, while the button retained from before it is
 *     not — and the payload it writes is still the original owner's;
 *   • a freshly MOUNTED sibling child profile, whose own scope and epoch are
 *     current, still cannot save the original owner's held payload — while the
 *     parent and the run's own child profile can, and no profile cannot.
 *
 * The two promotion findings it pins on top of those:
 *
 *   • a FIRST question held while its own scope retires is retired with it —
 *     timers stopped, state cleared, Intro back — and a newer run is left
 *     alone (4539941772);
 *   • a child change while an ADMITTED Retry is in flight settles that
 *     attempt's status instead of dropping it, so the bound summary stops
 *     saying *Saving…* and offers a working Retry — while a newer run's notice
 *     is never overwritten and an unauthorised render is told nothing
 *     (4539941784).
 *
 * **Real timers**, like the `childSwitch` harness: the feedback pauses are
 * genuinely awaited, which is why this file sets its own generous timeout. Fake
 * timers raced `renderHook` and returned null results.
 */

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

// ── A fake Firestore keyed by document path ────────────────────
const store = new Map<string, unknown>()
const writes: Array<{ path: string; data: Record<string, unknown> }> = []

interface DiamondEvent {
  familyId: string
  childId: string
  amount: number
  type: string
  reason: string
  dedupKey: string
}
/** Typed to the real signatures, so a call assertion needs no cast. */
const addDiamondEvent = vi.fn<(event: DiamondEvent) => Promise<void>>(async () => {})
const addXpEvent = vi.fn<
  (
    familyId: string,
    childId: string,
    kind: string,
    amount: number,
    dedupKey: string,
    meta?: Record<string, unknown>,
  ) => Promise<void>
>(async () => {})
const addDoc = vi.fn<(ref: unknown, data: unknown) => Promise<{ id: string }>>(
  async () => ({ id: 'new-doc' }),
)
const setDoc = vi.fn<(ref: unknown, data: unknown) => Promise<void>>(async () => {})

/** Set per test: make every transaction reject, as an offline device does. */
let transactionError: Error | null = null
/**
 * Set per test: COMMIT the write and then reject, which is the acknowledgement
 * lost in flight — the client never hears that its own payload landed.
 */
let lostAcknowledgement = false
/**
 * Set per test: hold the NEXT transaction in flight until this resolves.
 *
 * One transaction only, consumed by the first call after it is set — which is
 * how a rejection from an abandoned attempt, or a Resume claim a Start is
 * tapped on top of, can be made to land at a chosen moment. The outcome a
 * gated call reports is the one captured when it was MADE, not whatever the
 * test has moved on to by the time it settles.
 */
let transactionGate: Promise<void> | null = null

/** Gate the next transaction; returns the release. */
function holdNextTransaction(): () => void {
  let release: () => void = () => {}
  transactionGate = new Promise<void>((resolve) => {
    release = () => resolve()
  })
  return release
}

/** Let a held promise's own continuations run. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function seed(path: string, value: object): void {
  store.set(path, value)
}

vi.mock('firebase/firestore', () => ({
  addDoc: (ref: unknown, data: unknown) => addDoc(ref, data),
  collection: (_db: unknown, path: string) => path,
  doc: (col: unknown, id?: string) => ({ path: `${String(col)}/${id ?? ''}`, id }),
  getDoc: async (ref: { path: string }) => {
    const data = store.get(ref.path)
    return { exists: () => data !== undefined, data: () => data }
  },
  getDocs: async () => ({ docs: [], empty: true, size: 0 }),
  limit: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  setDoc: (ref: unknown, data: unknown) => setDoc(ref, data),
  updateDoc: vi.fn(async () => {}),
  where: vi.fn(() => ({})),
  runTransaction: async (
    _db: unknown,
    fn: (tx: {
      get: (ref: { path: string }) => Promise<unknown>
      set: (ref: { path: string }, data: unknown, opts?: { merge?: boolean }) => void
    }) => unknown,
  ) => {
    // Captured when the call was MADE, then held if this one is gated.
    const failWith = transactionError
    const gate = transactionGate
    if (gate) {
      transactionGate = null
      await gate
    }
    if (failWith) throw failWith
    const staged: Array<{ path: string; data: Record<string, unknown>; merge: boolean }> = []
    const out = await fn({
      get: async (ref) => {
        const data = store.get(ref.path)
        return { exists: () => data !== undefined, data: () => data }
      },
      set: (ref, data, opts) => {
        staged.push({
          path: ref.path,
          data: data as Record<string, unknown>,
          merge: Boolean(opts?.merge),
        })
      },
    })
    // Commit, so a later read in the same test sees what landed.
    for (const w of staged) {
      const prev = w.merge ? ((store.get(w.path) as object) ?? {}) : {}
      store.set(w.path, { ...prev, ...w.data })
      writes.push({ path: w.path, data: w.data })
    }
    if (lostAcknowledgement) throw new Error('deadline-exceeded')
    return out
  },
}))

vi.mock('../../core/firebase/firestore', () => ({
  db: {},
  activityConfigsCollection: () => 'activityConfigs',
  daysCollection: () => 'days',
  evaluationSessionsCollection: (familyId: string) => `sessions-${familyId}`,
  hoursCollection: () => 'hours',
  learnerModelsCollection: (familyId: string) => `models-${familyId}`,
  sightWordProgressCollection: () => 'sightWordProgress',
  skillSnapshotsCollection: () => 'skillSnapshots',
}))

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
/**
 * The live profile, as the real app spells it — `UserProfile.Parents` is
 * `'parents'`. Settable per test, because a child profile mounting is exactly
 * the case a scope key cannot see: a sibling's own view is freshly current.
 */
let activeProfile: string | null = 'parents'
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: activeProfile }),
}))

let identityEpoch = 1
vi.mock('../avatar/stonebridge/libraryReturnFlow', () => ({
  getLibraryIdentityEpoch: () => identityEpoch,
  subscribeLibraryIdentityEpoch: () => () => {},
}))

vi.mock('../../core/xp/addXpEvent', () => ({
  addXpEvent: (...a: Parameters<typeof addXpEvent>) => addXpEvent(...a),
}))
vi.mock('../../core/xp/addDiamondEvent', () => ({
  addDiamondEvent: (event: DiamondEvent) => addDiamondEvent(event),
}))
vi.mock('../../core/curriculum/updateSkillMapFromFindings', () => ({
  updateSkillMapFromFindings: vi.fn(async () => {}),
}))
vi.mock('../evaluate/skillSnapshotWrites', () => ({ writeSnapshotUpdate: vi.fn(async () => {}) }))
vi.mock('../today/dayWriteGuard', () => ({ updateDayLogGuarded: vi.fn(async () => {}) }))

// The projection is spied rather than run: this file is about WHETHER the close
// attempts it, with what identity, and what the surfaces then say.
const projectQuestSourceToModel = vi.fn(async () => 'projected' as const)
vi.mock('./questModelSync', () => ({
  projectQuestSourceToModel: (...a: unknown[]) =>
    projectQuestSourceToModel(...(a as [])) as Promise<string>,
  projectionReachedGraph: (outcome: string) =>
    outcome === 'projected' || outcome === 'already-projected',
}))

const PLAN = [
  { conceptId: 'reading.phonics.cvc', rowIndex: 0, digest: 'abcd1234', modelSeededAt: 'seeded' },
]
/** Set per test: does this run select a queued request? */
let selectedPlan: typeof PLAN = []

/**
 * The synthetic learner model a TARGETED Start reads.
 *
 * `selectedPlan` alone is not enough: `startQuest` only consults the targeting
 * helpers when this document EXISTS, so without it the run saved an untagged
 * source and there was nothing for a retry to project. Seeded at the same path
 * the hook reads, with the queued ask the plan row names.
 */
function seedTargetedModel(childId = 'lincoln') {
  seed(`models-fam-1/${childId}`, {
    childId,
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: {},
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [
      {
        conceptId: PLAN[0].conceptId,
        question: 'Test CVC with a quick quest?',
        routedTo: 'quest',
        reason: 'Parent asked to verify this by testing.',
      },
    ],
    seededAt: PLAN[0].modelSeededAt,
    updatedAt: PLAN[0].modelSeededAt,
  })
}
vi.mock('../../core/foundations/questTargeting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/foundations/questTargeting')>()
  return {
    ...actual,
    selectQuestTargets: () =>
      selectedPlan.map((row) => ({ conceptId: row.conceptId, name: 'CVC', description: 'd' })),
    captureQuestTargetPlan: () => selectedPlan,
  }
})

/** The idle-aware timer, so the hours arithmetic below is driven, not guessed. */
let activeSeconds = 0
let stopCalls = 0
vi.mock('../../core/utils/sessionTimer', () => ({
  useSessionTimer: () => ({
    startTimer: vi.fn(),
    stop: () => {
      stopCalls += 1
      return activeSeconds
    },
    getCurrentSeconds: () => activeSeconds,
    isActive: true,
    isPaused: false,
  }),
}))

const chat = vi.fn()
vi.mock('../../core/ai/useAI', async () => {
  const actual = await vi.importActual<typeof import('../../core/ai/useAI')>('../../core/ai/useAI')
  return {
    ...actual,
    useAI: () => ({ chat, analyzePatterns: vi.fn(async () => null), loading: false, error: null }),
  }
})

const mockUseActiveChild = vi.fn()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

import { useQuestSession } from './useQuestSession'
import type { EvaluationDomain } from '../../core/types/enums'
import { UserProfile } from '../../core/types/enums'
import type { QuestMode } from './questTypes'

const LINCOLN = { id: 'lincoln', name: 'Lincoln' }
const LONDON = { id: 'london', name: 'London' }

function setActive(child: { id: string; name: string }, isChildProfile = false) {
  mockUseActiveChild.mockReturnValue({
    activeChildId: child.id,
    activeChild: child,
    children: [LINCOLN, LONDON],
    childrenFamilyId: 'fam-1',
    setActiveChildId: vi.fn(),
    isChildProfile,
    isLoading: false,
    loadFailed: false,
    addChild: vi.fn(),
  })
}

const QUESTION = JSON.stringify({
  prompt: 'Which word says /kat/?',
  options: ['cat', 'cot', 'cut'],
  correctAnswer: 'cat',
  level: 2,
  skill: 'phonics.cvc',
})

function mountHook() {
  return renderHook(() => useQuestSession())
}
type View = ReturnType<typeof mountHook>

/**
 * Answer `n` questions correctly. Five in a run closes the session.
 *
 * The nominal correct answer is whatever the LIVE question expects, not a fixed
 * `'cat'`: a locally generated spelling or build-sentence question expects its
 * own target, and hard-coding one word made a warm run fail for a reason that
 * had nothing to do with saves. Production question selection is untouched.
 */
async function answer(view: View, n: number) {
  for (let i = 0; i < n; i += 1) {
    const expected = view.result.current.currentQuestion?.correctAnswer ?? 'cat'
    await act(async () => {
      await view.result.current.submitAnswer(expected)
    })
  }
}

async function start(
  view: View,
  domain: EvaluationDomain = 'reading',
  mode: QuestMode = 'phonics',
) {
  let outcome: unknown
  await act(async () => {
    outcome = await view.result.current.startQuest(domain, mode)
  })
  return outcome
}

/** Every saved quest-source document, newest write last. */
function sourceWrites() {
  return writes.filter((w) => w.path.startsWith('sessions-fam-1/'))
}

/** The LAST write to one source document — a resume stamps before it plays. */
function lastWriteTo(sessionId: string) {
  return sourceWrites()
    .filter((w) => w.path === `sessions-fam-1/${sessionId}`)
    .at(-1)!
}

/** The run id behind a banked reward key — the only place the hook exposes it. */
function runIdFromRewardKey(index = 0): string {
  return addDiamondEvent.mock.calls[index][0].dedupKey
    .replace(/^quest_/, '')
    .replace(/_q\d+-diamond$/, '')
}

function hoursRows() {
  return addDoc.mock.calls
    .map((c) => c[1] as { childId?: string; minutes?: number; notes?: string; source?: string })
    .filter((d) => d.source === 'knowledge-mine')
}

beforeEach(() => {
  vi.clearAllMocks()
  store.clear()
  writes.length = 0
  transactionError = null
  lostAcknowledgement = false
  transactionGate = null
  selectedPlan = []
  activeSeconds = 27 * 60
  stopCalls = 0
  identityEpoch = 1
  activeProfile = UserProfile.Parents
  setActive(LINCOLN)
  chat.mockResolvedValue({ message: `<quest>${QUESTION}</quest>` })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('an ordinary Start is bound to the identity it was rendered under', () => {
  it('refuses a retained Start after the child moved, before any provider call', async () => {
    const view = mountHook()
    // The card's handler, captured while Lincoln was on screen.
    const staleStart = view.result.current.startQuest

    setActive(LONDON)
    view.rerender()

    let outcome: unknown
    await act(async () => {
      outcome = await staleStart('reading', 'phonics')
    })
    expect(outcome).toBe('stale-scope')
    // Nothing read, nothing established, nothing spent.
    expect(chat).not.toHaveBeenCalled()
    expect(view.result.current.screen).toBe('intro')
  })

  it('refuses a retained Start after a same-tick A → B → A', async () => {
    const view = mountHook()
    const staleStart = view.result.current.startQuest

    // Family, child and profile come back the same; the epoch does not.
    identityEpoch = 2

    let outcome: unknown
    await act(async () => {
      outcome = await staleStart('reading', 'phonics')
    })
    expect(outcome).toBe('stale-scope')
    expect(chat).not.toHaveBeenCalled()
  })

  it('refuses a second Start rather than replacing an established run', async () => {
    const view = mountHook()
    expect(await start(view)).toBe('started')
    const established = view.result.current.currentQuestion
    const callsAfterFirst = chat.mock.calls.length

    expect(await start(view, 'reading', 'comprehension')).toBe('already-running')
    expect(chat.mock.calls).toHaveLength(callsAfterFirst)
    expect(view.result.current.currentQuestion).toBe(established)
    expect(view.result.current.questMode).toBe('phonics')
  })

  it('still allows the intro’s own Try Again after a first-question failure', async () => {
    const view = mountHook()
    chat.mockResolvedValueOnce(null)

    expect(await start(view)).toBe('failed')
    expect(view.result.current.screen).toBe('intro')
    expect(view.result.current.startQuestError).toBeTruthy()

    // The failed Start RELEASED the run, so the newly rendered retry is a
    // first-class Start rather than a refused duplicate.
    expect(await start(view)).toBe('started')
    expect(view.result.current.screen).toBe('question')
  })

  /**
   * The release-review path: the FIRST question is skipped and the replacement
   * provider throws. `handleSkip`'s friendly no-counted-answers return left the
   * run established, so every card afterwards was refused as `already-running`.
   */
  it('retires a skipped-only run whose replacement threw, and starts again', async () => {
    const view = mountHook()
    expect(await start(view)).toBe('started')
    const stopsBefore = stopCalls

    chat.mockRejectedValueOnce(new Error('provider down'))
    await act(async () => {
      await view.result.current.handleSkip()
    })

    expect(view.result.current.screen).toBe('intro')
    expect(view.result.current.startQuestError).toBe(
      'Hmm, the mine is being tricky. Try again in a minute.',
    )
    // A skipped-only failed start has no counted answers: nothing is saved,
    // credited or rewarded.
    expect(sourceWrites()).toHaveLength(0)
    expect(hoursRows()).toHaveLength(0)
    expect(addDiamondEvent).not.toHaveBeenCalled()
    expect(addXpEvent).not.toHaveBeenCalled()
    // The run went with the intro — its ownership, its live state and its timer.
    expect(view.result.current.questState).toBeNull()
    expect(view.result.current.currentQuestion).toBeNull()
    expect(view.result.current.sessionOwnerName).toBe('')
    expect(stopCalls).toBeGreaterThan(stopsBefore)

    // So the intro's own Start is a first-class one, not `already-running`.
    chat.mockResolvedValue({ message: `<quest>${QUESTION}</quest>` })
    expect(await start(view)).toBe('started')
    expect(view.result.current.screen).toBe('question')
  })

  /** A normal counted-answer close after a skip is untouched by that retirement. */
  it('still closes normally when a skip is followed by counted answers', async () => {
    const view = mountHook()
    expect(await start(view)).toBe('started')
    await act(async () => {
      await view.result.current.handleSkip()
    })
    await answer(view, 5)

    expect(view.result.current.screen).toBe('summary')
    expect(sourceWrites()).toHaveLength(1)
    expect(sourceWrites()[0].data).toMatchObject({ status: 'complete', childId: 'lincoln' })
  })
})

/**
 * Promotion finding 4539941772 — a first question (or an initial Fluency
 * passage) still in flight when its own scope retires. The claim release
 * cleared the owner refs and nothing else, so the attempt's own view sat on
 * Loading with its one-second interval still ticking and no way back.
 */
describe('a first question held while its scope retires', () => {
  it('retires that attempt: timers stopped, state cleared, Intro back', async () => {
    const view = mountHook()
    let releaseQuestion: (value: unknown) => void = () => {}
    chat.mockImplementationOnce(
      () => new Promise((resolve) => { releaseQuestion = resolve }),
    )
    // Deliberately NOT awaited: the provider call must still be in flight while
    // the header moves, which is the whole reproduction.
    const starting = view.result.current.startQuest('reading', 'phonics')
    await settle()
    expect(view.result.current.screen).toBe('loading')
    const stopsBefore = stopCalls

    // The parent selects London while Lincoln's first question is in flight.
    identityEpoch = 2
    setActive(LONDON)
    view.rerender()

    releaseQuestion({ message: `<quest>${QUESTION}</quest>` })
    let outcome: unknown
    await act(async () => {
      outcome = await starting
    })

    expect(outcome).toBe('stale-scope')
    // The retired attempt's own view, not a stuck spinner.
    expect(view.result.current.screen).toBe('intro')
    expect(view.result.current.questState).toBeNull()
    expect(view.result.current.currentQuestion).toBeNull()
    expect(view.result.current.sessionOwnerName).toBe('')
    expect(stopCalls).toBeGreaterThan(stopsBefore)
    // Nothing was answered, so there is no source, no reward and no time.
    expect(sourceWrites()).toHaveLength(0)
    expect(hoursRows()).toHaveLength(0)
    expect(addDiamondEvent).not.toHaveBeenCalled()
    expect(addXpEvent).not.toHaveBeenCalled()

    // And the Mine works for the child who is on screen now.
    chat.mockResolvedValue({ message: `<quest>${QUESTION}</quest>` })
    expect(await start(view)).toBe('started')
    expect(view.result.current.screen).toBe('question')
  })

  it('leaves a NEWER run, timer and screen alone when the old one lands', async () => {
    const view = mountHook()
    let releaseFirst: (value: unknown) => void = () => {}
    chat.mockImplementationOnce(
      () => new Promise((resolve) => { releaseFirst = resolve }),
    )
    const starting = view.result.current.startQuest('reading', 'phonics')
    await settle()
    expect(view.result.current.screen).toBe('loading')

    // He leaves the Mine (no counted answers, so no partial) and starts again.
    await act(async () => {
      view.result.current.resetToIntro()
    })
    chat.mockResolvedValue({ message: `<quest>${QUESTION}</quest>` })
    expect(await start(view, 'reading', 'comprehension')).toBe('started')
    const liveQuestion = view.result.current.currentQuestion
    const stopsBefore = stopCalls

    releaseFirst({ message: `<quest>${QUESTION}</quest>` })
    let outcome: unknown
    await act(async () => {
      outcome = await starting
    })

    expect(outcome).toBe('stale-scope')
    // The run it does not own is untouched — screen, question, mode and timer.
    expect(view.result.current.screen).toBe('question')
    expect(view.result.current.currentQuestion).toBe(liveQuestion)
    expect(view.result.current.questMode).toBe('comprehension')
    expect(view.result.current.questState).not.toBeNull()
    expect(stopCalls).toBe(stopsBefore)
    expect(sourceWrites()).toHaveLength(0)
  })

  it('releases only its own claim when the scope moves before Loading', async () => {
    const view = mountHook()
    const staleStart = view.result.current.startQuest
    setActive(LONDON)
    view.rerender()

    let outcome: unknown
    await act(async () => {
      outcome = await staleStart('reading', 'phonics')
    })
    expect(outcome).toBe('stale-scope')
    // No run, no Loading, no timer to retire — and the next Start is free.
    expect(view.result.current.screen).toBe('intro')
    expect(await start(view)).toBe('started')
  })
})

/**
 * Promotion finding 4539941784 — a child change while an ADMITTED source Retry
 * is in flight. The settlement was gated on the strict rendered scope, so it
 * was dropped and the bound summary (UX-339) said *Saving…* for ever.
 */
describe('a child change while an admitted source Retry is in flight', () => {
  it('settles that attempt, and the bound summary offers a working Retry', async () => {
    selectedPlan = PLAN
    seedTargetedModel()
    const view = mountHook()
    await start(view)
    transactionError = new Error('offline')
    await answer(view, 5)
    const runId = runIdFromRewardKey()
    const chatCalls = chat.mock.calls.length
    const xpBefore = addXpEvent.mock.calls.length
    expect(view.result.current.sourceSave).toMatchObject({
      state: 'failed',
      kind: 'final',
      canRetry: true,
    })

    // The Retry is admitted under the live scope, and its transaction is HELD.
    const release = holdNextTransaction()
    const retrying = view.result.current.retrySourceSave({
      runInstanceId: view.result.current.sourceSave.runInstanceId,
      viewGeneration: view.result.current.sourceSave.viewGeneration,
      scopeKey: view.result.current.recoveryScope,
      epoch: view.result.current.recoveryEpoch,
    })
    await settle()
    expect(view.result.current.sourceSave.state).toBe('saving')

    // The parent taps London's chip while it is in flight, so the scope that
    // admitted the attempt is retired before it settles.
    identityEpoch = 2
    setActive(LONDON)
    view.rerender()
    release()
    await act(async () => {
      expect(await retrying).toBe('failed')
    })

    // Settled, not stuck — and the bound summary is still the parent's to see.
    expect(view.result.current.sourceSave).toMatchObject({
      state: 'failed',
      kind: 'final',
      canRetry: true,
      originalChildId: 'lincoln',
    })
    expect(view.result.current.visibleSourceSave.state).toBe('failed')

    // A → B → A, and the freshly rendered Retry lands the ORIGINAL payload.
    identityEpoch = 3
    setActive(LINCOLN)
    view.rerender()
    transactionError = null
    let fresh: unknown
    await act(async () => {
      fresh = await view.result.current.retrySourceSave({
        runInstanceId: view.result.current.visibleSourceSave.runInstanceId,
        viewGeneration: view.result.current.visibleSourceSave.viewGeneration,
        scopeKey: view.result.current.recoveryScope,
        epoch: view.result.current.recoveryEpoch,
      })
    })

    expect(fresh).toBe('saved')
    expect(sourceWrites()).toHaveLength(1)
    expect(sourceWrites()[0].path).toBe(`sessions-fam-1/${runId}`)
    expect(sourceWrites()[0].data).toMatchObject({
      questRunId: runId,
      childId: 'lincoln',
      questMode: 'phonics',
      status: 'complete',
    })
    expect(view.result.current.visibleSourceSave.state).toBe('saved')
    // One save, one projection, one time credit, no repeated provider work.
    expect(projectQuestSourceToModel).toHaveBeenCalledTimes(1)
    expect(hoursRows()).toHaveLength(1)
    expect(chat.mock.calls).toHaveLength(chatCalls)
    expect(addXpEvent.mock.calls).toHaveLength(xpBefore)
  })

  it('presents Saved for the original summary when the held save succeeded', async () => {
    const view = mountHook()
    await start(view)
    transactionError = new Error('offline')
    await answer(view, 5)

    transactionError = null
    const release = holdNextTransaction()
    const retrying = view.result.current.retrySourceSave({
      runInstanceId: view.result.current.sourceSave.runInstanceId,
      viewGeneration: view.result.current.sourceSave.viewGeneration,
      scopeKey: view.result.current.recoveryScope,
      epoch: view.result.current.recoveryEpoch,
    })
    await settle()

    identityEpoch = 2
    setActive(LONDON)
    view.rerender()
    release()
    await act(async () => {
      expect(await retrying).toBe('saved')
    })

    expect(view.result.current.sourceSave).toMatchObject({
      state: 'saved',
      kind: 'final',
      canRetry: false,
      originalChildId: 'lincoln',
    })
    expect(sourceWrites()).toHaveLength(1)
    expect(sourceWrites()[0].data).toMatchObject({ childId: 'lincoln', status: 'complete' })
    expect(hoursRows()).toHaveLength(1)
  })

  it('cannot overwrite a newer run’s notice when it settles late', async () => {
    const view = mountHook()
    await start(view)
    transactionError = new Error('offline')
    await answer(view, 5)

    const release = holdNextTransaction()
    const retrying = view.result.current.retrySourceSave({
      runInstanceId: view.result.current.sourceSave.runInstanceId,
      viewGeneration: view.result.current.sourceSave.viewGeneration,
      scopeKey: view.result.current.recoveryScope,
      epoch: view.result.current.recoveryEpoch,
    })
    await settle()

    // A second quest for the same child closes successfully: this summary's
    // notice is what is on screen now.
    await act(async () => {
      view.result.current.resetToIntro()
    })
    transactionError = null
    expect(await start(view, 'reading', 'comprehension')).toBe('started')
    await answer(view, 5)
    expect(view.result.current.sourceSave).toMatchObject({ state: 'saved', kind: 'final' })

    // The retired attempt leaves the newer notice exactly as it found it.
    release()
    await act(async () => {
      expect(await retrying).toBe('failed')
    })
    expect(view.result.current.sourceSave).toMatchObject({ state: 'saved', kind: 'final' })
    expect(view.result.current.visibleSourceSave.state).toBe('saved')
  })

  it('keeps the status out of an unauthorised or wrong-family render', async () => {
    const view = mountHook()
    await start(view)
    transactionError = new Error('offline')
    await answer(view, 5)
    expect(view.result.current.visibleSourceSave.state).toBe('failed')

    // No profile vouches for nobody, so no status and no control.
    identityEpoch = 2
    activeProfile = null
    view.rerender()
    expect(view.result.current.visibleSourceSave).toMatchObject({
      state: 'idle',
      canRetry: false,
    })
    // The settled status itself is untouched — the payload is still held.
    expect(view.result.current.sourceSave).toMatchObject({ state: 'failed', canRetry: true })

    // A sibling's own profile is not shown another child's close either.
    identityEpoch = 3
    activeProfile = UserProfile.London
    setActive(LONDON, true)
    view.rerender()
    expect(view.result.current.visibleSourceSave.state).toBe('idle')
  })
})

describe('a denied complete source', () => {
  it('produces ZERO graph changes and offers a retry for that payload', async () => {
    selectedPlan = PLAN
    seedTargetedModel()
    const view = mountHook()
    await start(view)
    transactionError = new Error('permission-denied')
    await answer(view, 5)

    expect(sourceWrites()).toHaveLength(0)
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()
    expect(view.result.current.sourceSave).toMatchObject({
      state: 'failed',
      kind: 'final',
      canRetry: true,
    })
    // The rewards and the minutes still landed — they happened.
    expect(hoursRows()[0]?.minutes).toBe(30)
    expect(addDiamondEvent).toHaveBeenCalled()
  })

  it('retries the held payload, saves it, and projects exactly once', async () => {
    selectedPlan = PLAN
    seedTargetedModel()
    const view = mountHook()
    await start(view)
    transactionError = new Error('permission-denied')
    await answer(view, 5)
    const xpBefore = addXpEvent.mock.calls.length
    const chatCalls = chat.mock.calls.length

    transactionError = null
    await act(async () => {
      await view.result.current.retrySourceSave({
        runInstanceId: view.result.current.sourceSave.runInstanceId,
        viewGeneration: view.result.current.sourceSave.viewGeneration,
      })
    })

    // The payload this retry wrote really is the TARGETED one: a pending
    // request on the saved source is what makes the projection its own work.
    expect(sourceWrites()).toHaveLength(1)
    expect(sourceWrites()[0].data).toMatchObject({
      targetPlan: PLAN,
      modelProjection: 'pending',
    })
    expect(view.result.current.sourceSave.state).toBe('saved')
    expect(projectQuestSourceToModel).toHaveBeenCalledTimes(1)
    // The retry repeats NO other close side effect.
    expect(chat.mock.calls).toHaveLength(chatCalls)
    expect(addXpEvent.mock.calls.length).toBe(xpBefore)
    expect(hoursRows()).toHaveLength(1)
  })
})

describe('a committed acknowledgement lost before the retry', () => {
  it('recognises the matching payload, writes nothing more, and projects once', async () => {
    selectedPlan = PLAN
    seedTargetedModel()
    const view = mountHook()
    await start(view)
    lostAcknowledgement = true
    await answer(view, 5)

    // The write DID land, as the targeted payload with its request still
    // pending; the client never heard so.
    expect(sourceWrites()).toHaveLength(1)
    expect(sourceWrites()[0].data).toMatchObject({
      targetPlan: PLAN,
      modelProjection: 'pending',
    })
    expect(view.result.current.sourceSave).toMatchObject({ state: 'failed', canRetry: true })
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()

    const savedPath = sourceWrites()[0].path
    const committed = store.get(savedPath)
    lostAcknowledgement = false
    writes.length = 0

    await act(async () => {
      await view.result.current.retrySourceSave({
        runInstanceId: view.result.current.sourceSave.runInstanceId,
        viewGeneration: view.result.current.sourceSave.viewGeneration,
      })
    })

    expect(writes).toHaveLength(0)
    expect(store.get(savedPath)).toBe(committed)
    expect(view.result.current.sourceSave.state).toBe('saved')
    expect(projectQuestSourceToModel).toHaveBeenCalledTimes(1)
  })
})

describe('the same id carrying a different payload', () => {
  it('is a conflict: the stored record is preserved and no graph applies', async () => {
    selectedPlan = PLAN
    const view = mountHook()
    await start(view)
    await answer(view, 4)

    // Another writer finalizes this run's id with different answers mid-session.
    const runId = runIdFromRewardKey()
    seed(`sessions-fam-1/${runId}`, {
      childId: 'lincoln',
      sessionType: 'interactive',
      domain: 'reading',
      questMode: 'phonics',
      status: 'complete',
      questRunId: runId,
      sourceCommittedAt: 'earlier',
      totalCorrect: 1,
      summary: 'someone else',
    })
    writes.length = 0

    await answer(view, 1)

    expect(writes.filter((w) => w.path === `sessions-fam-1/${runId}`)).toHaveLength(0)
    expect(store.get(`sessions-fam-1/${runId}`)).toMatchObject({ summary: 'someone else' })
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()
    expect(view.result.current.sourceSave).toMatchObject({ state: 'conflict', canRetry: false })
  })
})

describe('an ordinary untagged quest', () => {
  it('saves, and makes no model attempt, so nothing offers it a retry', async () => {
    selectedPlan = []
    const view = mountHook()
    await start(view)
    await answer(view, 5)

    expect(sourceWrites()[0].data).toMatchObject({
      status: 'complete',
      modelProjection: 'skipped',
    })
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()
    expect(view.result.current.sourceSave.state).toBe('saved')
    expect(view.result.current.graphSync.state).toBe('skipped')
  })
})

describe('a held summary, then Try another quest and Start Phonics', () => {
  it('finishes the first run under its OWN id, mode, timer and reward keys', async () => {
    const view = mountHook()
    await start(view, 'math', 'math')
    await answer(view, 4)
    const mathRunId = runIdFromRewardKey()

    // The fifth answer closes Math — and its summary call hangs.
    let releaseSummary: (v: unknown) => void = () => {}
    chat.mockImplementationOnce(() => new Promise((resolve) => { releaseSummary = resolve }))
    // Deliberately NOT awaited inside `act`: the close must still be in flight
    // while the taps below run, which is the whole reproduction.
    const closing = view.result.current.submitAnswer('cat')
    // Let the feedback pause clear and the summary call start.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
    })

    await act(async () => {
      view.result.current.resetToIntro()
    })
    chat.mockResolvedValue({ message: `<quest>${QUESTION}</quest>` })
    expect(await start(view, 'reading', 'phonics')).toBe('started')
    await answer(view, 1)
    const phonicsRunId = runIdFromRewardKey(addDiamondEvent.mock.calls.length - 1)
    expect(phonicsRunId).not.toBe(mathRunId)

    // The Phonics timer is the live one now, and reads something else.
    activeSeconds = 3 * 60
    const stopsBefore = stopCalls

    releaseSummary({ message: 'no summary block' })
    await act(async () => {
      await closing
    })

    const mathWrite = lastWriteTo(mathRunId)
    expect(mathWrite.data).toMatchObject({
      questRunId: mathRunId,
      questMode: 'math',
      domain: 'math',
      childId: 'lincoln',
      status: 'complete',
    })
    // Its minutes come from the reading it froze at close, not from the timer
    // the Phonics run now owns — and it never stopped that timer.
    expect(hoursRows().find((r) => r.notes === 'math quest session')!.minutes).toBe(30)
    expect(stopCalls).toBe(stopsBefore)
    const keys = addDiamondEvent.mock.calls.map((c) => c[0].dedupKey)
    expect(keys.filter((k) => k.startsWith(`quest_${mathRunId}_`)).length).toBeGreaterThan(0)
    // And the delayed close did not take over the Phonics screen.
    expect(view.result.current.questMode).toBe('phonics')
    expect(view.result.current.screen).not.toBe('summary')
  })
})

describe('a manual partial exit whose save is rejected', () => {
  it('keeps its answers for the same scoped retry, and its minutes either way', async () => {
    const view = mountHook()
    await start(view)
    await answer(view, 2)

    transactionError = new Error('offline')
    await act(async () => {
      view.result.current.resetToIntro()
    })

    expect(view.result.current.sourceSave).toMatchObject({
      state: 'failed',
      kind: 'partial',
      canRetry: true,
    })
    // The minutes are recorded regardless: they happened.
    expect(hoursRows()[0]).toMatchObject({
      minutes: 30,
      notes: 'phonics quest session (partial)',
      childId: 'lincoln',
    })

    transactionError = null
    await act(async () => {
      await view.result.current.retrySourceSave({
        runInstanceId: view.result.current.sourceSave.runInstanceId,
        viewGeneration: view.result.current.sourceSave.viewGeneration,
      })
    })

    const saved = sourceWrites()[0].data
    expect(saved).toMatchObject({ status: 'partial', childId: 'lincoln' })
    expect(saved.savedQuestState).toBeTruthy() // still resumable
    expect(view.result.current.sourceSave.state).toBe('saved')
    // A partial is never eligible for the graph, and the accounting is not
    // repeated by the retry.
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()
    expect(hoursRows()).toHaveLength(1)
  })

  it('re-reads the resume card once the partial has actually landed', async () => {
    const view = mountHook()
    await start(view)
    await answer(view, 2)
    const nonceBefore = view.result.current.resumeReloadNonce

    await act(async () => {
      view.result.current.resetToIntro()
    })

    // The intro's own resume query can finish before this write does, so a
    // confirmed save asks for one more read.
    expect(view.result.current.sourceSave.state).toBe('saved')
    expect(view.result.current.resumeReloadNonce).toBeGreaterThan(nonceBefore)
  })

  /**
   * The release-review path: the retry RESOLVED the partial and cleared the
   * error, but the intro already open never asked for the resume card again, so
   * the quest looked gone until the page was reloaded.
   */
  it('re-reads the resume card after an acknowledged RETRY of the partial', async () => {
    const view = mountHook()
    await start(view)
    await answer(view, 2)

    transactionError = new Error('offline')
    await act(async () => {
      view.result.current.resetToIntro()
    })
    // A refused save asks for no read: there is nothing stored to resume yet.
    const nonceBefore = view.result.current.resumeReloadNonce
    const chatCalls = chat.mock.calls.length
    const xpBefore = addXpEvent.mock.calls.length
    const diamondCalls = addDiamondEvent.mock.calls.length

    transactionError = null
    await act(async () => {
      await view.result.current.retrySourceSave({
        runInstanceId: view.result.current.sourceSave.runInstanceId,
        viewGeneration: view.result.current.sourceSave.viewGeneration,
      })
    })

    // One source, one more read for the intro that owns the notice.
    expect(view.result.current.sourceSave.state).toBe('saved')
    expect(sourceWrites()).toHaveLength(1)
    expect(sourceWrites()[0].data).toMatchObject({ status: 'partial', childId: 'lincoln' })
    expect(view.result.current.resumeReloadNonce).toBe(nonceBefore + 1)
    // One time credit, and no repeated AI, reward or projection work.
    expect(hoursRows()).toHaveLength(1)
    expect(chat.mock.calls).toHaveLength(chatCalls)
    expect(addXpEvent.mock.calls).toHaveLength(xpBefore)
    expect(addDiamondEvent.mock.calls).toHaveLength(diamondCalls)
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()
  })

  /**
   * Sol's reproduction (release review): the partial's notice lives on whatever
   * Mine intro the exit landed on, and a child change re-renders that intro
   * under a sibling. The parent's cross-child exception is for a BOUND final
   * summary, so here the active child has to be the payload's own owner — the
   * notice is hidden on the sibling's intro, and comes back on his.
   */
  it('refuses a partial retry on a sibling’s intro, and admits it back on the owner’s', async () => {
    const view = mountHook()
    await start(view)
    await answer(view, 2)

    transactionError = new Error('offline')
    await act(async () => {
      view.result.current.resetToIntro()
    })
    const held = view.result.current.sourceSave.runInstanceId
    expect(view.result.current.sourceSave).toMatchObject({
      state: 'failed',
      kind: 'partial',
      canRetry: true,
      // What the intro gates the notice on.
      originalChildId: 'lincoln',
    })

    // The parent selects London and the intro settles under his scope.
    identityEpoch = 2
    setActive(LONDON)
    view.rerender()
    // The notice is not hers to see — the page hides it on this mismatch.
    expect(view.result.current.sourceSave.originalChildId).not.toBe('london')

    transactionError = null
    let refused: unknown
    await act(async () => {
      refused = await view.result.current.retrySourceSave({
        runInstanceId: view.result.current.sourceSave.runInstanceId,
        viewGeneration: view.result.current.sourceSave.viewGeneration,
        scopeKey: view.result.current.recoveryScope,
        epoch: view.result.current.recoveryEpoch,
      })
    })
    expect(refused).toBe('identity-mismatch')
    expect(sourceWrites()).toHaveLength(0)
    // Nothing consumed: Lincoln's answers are still held for his own view.
    expect(view.result.current.sourceSave).toMatchObject({
      state: 'failed',
      kind: 'partial',
      canRetry: true,
      runInstanceId: held,
      originalChildId: 'lincoln',
    })

    // Back on Lincoln, the same payload lands and his resume card re-reads.
    identityEpoch = 3
    setActive(LINCOLN)
    view.rerender()
    const nonceBefore = view.result.current.resumeReloadNonce
    let allowed: unknown
    await act(async () => {
      allowed = await view.result.current.retrySourceSave({
        runInstanceId: view.result.current.sourceSave.runInstanceId,
        viewGeneration: view.result.current.sourceSave.viewGeneration,
        scopeKey: view.result.current.recoveryScope,
        epoch: view.result.current.recoveryEpoch,
      })
    })
    expect(allowed).toBe('saved')
    expect(sourceWrites()).toHaveLength(1)
    expect(sourceWrites()[0].data).toMatchObject({ status: 'partial', childId: 'lincoln' })
    expect(view.result.current.resumeReloadNonce).toBe(nonceBefore + 1)
    expect(hoursRows()).toHaveLength(1)
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()
  })

  /**
   * Sol's first partial overlap: a later run that goes back to Intro WITHOUT a
   * counted answer does not replace the old partial's notice — nothing was
   * saved, so there is nothing to publish. Settling (and showing) on the
   * attempt id alone then offered that retired intro's Retry on the live one,
   * where the generation guard refuses every tap: a dead control.
   */
  it('hides a retired intro’s partial notice without discarding it', async () => {
    const view = mountHook()
    await start(view)
    await answer(view, 2)

    transactionError = new Error('offline')
    await act(async () => {
      view.result.current.resetToIntro()
    })
    expect(view.result.current.visibleSourceSave).toMatchObject({
      state: 'failed',
      kind: 'partial',
      canRetry: true,
    })
    const retiredControl = {
      runInstanceId: view.result.current.sourceSave.runInstanceId,
      viewGeneration: view.result.current.sourceSave.viewGeneration,
    }

    // A later quest starts and is retired back to Intro with no counted answer.
    transactionError = null
    expect(await start(view)).toBe('started')
    chat.mockRejectedValueOnce(new Error('provider down'))
    await act(async () => {
      await view.result.current.handleSkip()
    })
    expect(view.result.current.screen).toBe('intro')
    expect(view.result.current.viewGeneration).not.toBe(retiredControl.viewGeneration)

    // The live intro is told nothing: the old notice belongs to a retired view.
    expect(view.result.current.visibleSourceSave).toMatchObject({
      state: 'idle',
      canRetry: false,
    })
    // And nothing is discarded — the status and the held answers are as found.
    expect(view.result.current.sourceSave).toMatchObject({
      state: 'failed',
      kind: 'partial',
      canRetry: true,
      runInstanceId: retiredControl.runInstanceId,
    })
    let refused: unknown
    await act(async () => {
      refused = await view.result.current.retrySourceSave(retiredControl)
    })
    expect(refused).toBe('identity-mismatch')
    expect(sourceWrites()).toHaveLength(0)
  })

  /**
   * Sol's second partial overlap: the partial Retry is admitted on its own
   * intro and acknowledged after an `A → B → A`. Family and child come back
   * the same, so the intro that owns the payload is still this generation,
   * while the epoch `ownsView` checks has moved — and dropping the intro's
   * one-more-read left the acknowledged partial unresumable until the page was
   * navigated again.
   */
  it('re-reads the owning intro after an A → B → A acknowledged retry', async () => {
    const view = mountHook()
    await start(view)
    await answer(view, 2)

    transactionError = new Error('offline')
    await act(async () => {
      view.result.current.resetToIntro()
    })
    const nonceBefore = view.result.current.resumeReloadNonce
    const generation = view.result.current.sourceSave.viewGeneration

    transactionError = null
    const release = holdNextTransaction()
    const retrying = view.result.current.retrySourceSave({
      runInstanceId: view.result.current.sourceSave.runInstanceId,
      viewGeneration: generation,
      scopeKey: view.result.current.recoveryScope,
      epoch: view.result.current.recoveryEpoch,
    })
    await settle()

    // The parent taps London's chip and taps back while it is in flight.
    identityEpoch = 2
    setActive(LONDON)
    view.rerender()
    identityEpoch = 3
    setActive(LINCOLN)
    view.rerender()
    release()
    await act(async () => {
      expect(await retrying).toBe('saved')
    })

    // The same intro, same generation: one more read, and the partial is
    // resumable without another navigation.
    expect(view.result.current.viewGeneration).toBe(generation)
    expect(view.result.current.resumeReloadNonce).toBe(nonceBefore + 1)
    expect(sourceWrites()).toHaveLength(1)
    expect(sourceWrites()[0].data).toMatchObject({ status: 'partial', childId: 'lincoln' })
    expect(view.result.current.visibleSourceSave).toMatchObject({
      state: 'saved',
      kind: 'partial',
      originalChildId: 'lincoln',
      viewGeneration: generation,
    })
    // Nothing outside that read: no completion side effect is repeated, and the
    // retired render's own view flag is not moved.
    expect(view.result.current.sessionSaved).toBe(false)
    expect(hoursRows()).toHaveLength(1)
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()
  })

  /** A NEWER generation is never refreshed, however the retry lands. */
  it('asks for no read when the owning intro retires mid-retry', async () => {
    const view = mountHook()
    await start(view)
    await answer(view, 2)

    transactionError = new Error('offline')
    await act(async () => {
      view.result.current.resetToIntro()
    })
    const nonceBefore = view.result.current.resumeReloadNonce

    transactionError = null
    const release = holdNextTransaction()
    const retrying = view.result.current.retrySourceSave({
      runInstanceId: view.result.current.sourceSave.runInstanceId,
      viewGeneration: view.result.current.sourceSave.viewGeneration,
      scopeKey: view.result.current.recoveryScope,
      epoch: view.result.current.recoveryEpoch,
    })
    await settle()
    expect(view.result.current.sourceSave.state).toBe('saving')

    // A later run takes the intro, then retires back to it.
    expect(await start(view, 'reading', 'comprehension')).toBe('started')
    chat.mockRejectedValueOnce(new Error('provider down'))
    await act(async () => {
      await view.result.current.handleSkip()
    })

    release()
    await act(async () => {
      expect(await retrying).toBe('saved')
    })

    // His answers landed under their own id, and the retired view reported
    // nowhere: no read asked for, and nothing shown on the live intro.
    expect(sourceWrites()).toHaveLength(1)
    expect(sourceWrites()[0].data).toMatchObject({ status: 'partial', childId: 'lincoln' })
    expect(view.result.current.resumeReloadNonce).toBe(nonceBefore)
    expect(view.result.current.visibleSourceSave).toMatchObject({
      state: 'idle',
      canRetry: false,
    })
  })

  /**
   * Sol's reproduction: the delayed partial that replaced the newer Retry's
   * payload, so the button on screen saved the wrong answers — or nothing.
   */
  it('cannot replace a newer failed final’s held payload when it rejects late', async () => {
    const view = mountHook()
    await start(view)
    await answer(view, 2)

    // The manual exit's partial is denied, and its rejection is HELD in flight.
    transactionError = new Error('offline')
    const releaseOldPartial = holdNextTransaction()
    await act(async () => {
      view.result.current.resetToIntro()
    })

    // A second quest for the same child closes, and its final save fails: this
    // summary's own Retry is what is on screen now.
    transactionError = null
    expect(await start(view, 'reading', 'comprehension')).toBe('started')
    transactionError = new Error('offline')
    await answer(view, 5)
    const newerControl = {
      runInstanceId: view.result.current.sourceSave.runInstanceId,
      viewGeneration: view.result.current.sourceSave.viewGeneration,
    }
    expect(view.result.current.sourceSave).toMatchObject({
      state: 'failed',
      kind: 'final',
      canRetry: true,
    })

    // Only now does the old partial reject. It owns neither the notice nor the
    // slot: the retired attempt leaves both exactly as it found them.
    releaseOldPartial()
    await settle()
    expect(view.result.current.sourceSave).toMatchObject({
      state: 'failed',
      kind: 'final',
      runInstanceId: newerControl.runInstanceId,
    })

    // And the Retry still on screen saves the payload it names.
    transactionError = null
    await act(async () => {
      await view.result.current.retrySourceSave(newerControl)
    })
    expect(sourceWrites()).toHaveLength(1)
    expect(sourceWrites()[0].data).toMatchObject({
      status: 'complete',
      questMode: 'comprehension',
      childId: 'lincoln',
    })
    expect(view.result.current.sourceSave).toMatchObject({ state: 'saved', kind: 'final' })
  })
})

describe('stale controls and stale scope', () => {
  it('a retained source-retry control cannot pick up a different payload', async () => {
    const view = mountHook()
    await start(view)
    transactionError = new Error('offline')
    await answer(view, 5)
    const stale = {
      runInstanceId: view.result.current.sourceSave.runInstanceId,
      viewGeneration: view.result.current.sourceSave.viewGeneration,
    }
    expect(stale.runInstanceId).toBeTruthy()

    // A second run fails the same way, replacing what is held.
    await act(async () => {
      view.result.current.resetToIntro()
    })
    transactionError = null
    expect(await start(view, 'reading', 'comprehension')).toBe('started')
    transactionError = new Error('offline')
    await answer(view, 5)
    const fresh = view.result.current.sourceSave.runInstanceId
    expect(fresh).not.toBe(stale.runInstanceId)

    transactionError = null
    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.retrySourceSave(stale)
    })
    expect(outcome).toBe('identity-mismatch')
    expect(sourceWrites()).toHaveLength(0)
  })

  /** Sol's Chrome reproduction: an old retry relabelling a newer summary. */
  it('an old summary’s retry cannot relabel a newer same-child summary', async () => {
    selectedPlan = PLAN
    const view = mountHook()
    await start(view)
    transactionError = new Error('offline')
    await answer(view, 5)
    const oldSummaryControl = {
      runInstanceId: view.result.current.sourceSave.runInstanceId,
      viewGeneration: view.result.current.sourceSave.viewGeneration,
    }

    // A SECOND quest for the SAME child closes successfully. Same scope, same
    // family, same boy — only the view has moved on.
    await act(async () => {
      view.result.current.resetToIntro()
    })
    transactionError = null
    expect(await start(view, 'reading', 'comprehension')).toBe('started')
    await answer(view, 5)
    expect(view.result.current.sourceSave.state).toBe('saved')
    const projectionsSoFar = projectQuestSourceToModel.mock.calls.length

    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.retrySourceSave(oldSummaryControl)
    })

    expect(outcome).toBe('identity-mismatch')
    // The newer summary's labels and its map status are untouched.
    expect(view.result.current.sourceSave.state).toBe('saved')
    expect(projectQuestSourceToModel.mock.calls.length).toBe(projectionsSoFar)
  })

  /**
   * The release-review path (UX-339 × UX-494): the parent taps a sibling's chip
   * — and taps back — while the original summary is still on screen, bound to
   * its owner. The Retry rendered NOW on that summary must work; the one
   * retained from before the switch must not.
   */
  it('authorises a freshly rendered retry after a same-family child change', async () => {
    selectedPlan = PLAN
    seedTargetedModel()
    const view = mountHook()
    await start(view)
    transactionError = new Error('offline')
    await answer(view, 5)
    const runId = runIdFromRewardKey()
    // The button as drawn while Lincoln was the chip on screen.
    const retained = {
      runInstanceId: view.result.current.sourceSave.runInstanceId,
      viewGeneration: view.result.current.sourceSave.viewGeneration,
      scopeKey: view.result.current.recoveryScope,
      epoch: view.result.current.recoveryEpoch,
    }

    identityEpoch = 2
    setActive(LONDON)
    view.rerender()
    identityEpoch = 3
    setActive(LINCOLN)
    view.rerender()
    // The summary is still his, and still offering its retry.
    expect(view.result.current.sourceSave).toMatchObject({
      state: 'failed',
      kind: 'final',
      canRetry: true,
      runInstanceId: retained.runInstanceId,
    })

    transactionError = null
    let stale: unknown
    await act(async () => {
      stale = await view.result.current.retrySourceSave(retained)
    })
    expect(stale).toBe('identity-mismatch')
    expect(sourceWrites()).toHaveLength(0)

    let fresh: unknown
    await act(async () => {
      fresh = await view.result.current.retrySourceSave({
        runInstanceId: view.result.current.sourceSave.runInstanceId,
        viewGeneration: view.result.current.sourceSave.viewGeneration,
        scopeKey: view.result.current.recoveryScope,
        epoch: view.result.current.recoveryEpoch,
      })
    })
    expect(fresh).toBe('saved')
    // The ORIGINAL run's id, child and payload — the header's move changed
    // nothing about whose answers these are.
    expect(sourceWrites()).toHaveLength(1)
    expect(sourceWrites()[0].path).toBe(`sessions-fam-1/${runId}`)
    expect(sourceWrites()[0].data).toMatchObject({
      questRunId: runId,
      childId: 'lincoln',
      questMode: 'phonics',
      status: 'complete',
      targetPlan: PLAN,
    })
    expect(view.result.current.sourceSave.state).toBe('saved')
    // One write, one projection, and no other close side effect.
    expect(projectQuestSourceToModel).toHaveBeenCalledTimes(1)
    expect(hoursRows()).toHaveLength(1)
  })

  /**
   * The review correction: the scope guard above is about the retained RENDER,
   * and a sibling child profile that mounts afresh passes it by construction —
   * its own scope and epoch are the live ones. So the VIEWER is checked too,
   * with a real mounted profile change rather than a fabricated scope key.
   */
  it('refuses a freshly rendered retry under a sibling child profile', async () => {
    selectedPlan = PLAN
    seedTargetedModel()
    const view = mountHook()
    await start(view)
    transactionError = new Error('offline')
    await answer(view, 5)
    const held = view.result.current.sourceSave.runInstanceId
    expect(held).toBeTruthy()

    // London's profile settles. The summary still belongs to Lincoln (UX-339).
    // The fresh Retry now belongs to London's scope.
    identityEpoch = 2
    activeProfile = UserProfile.London
    setActive(LONDON, true)
    view.rerender()
    expect(view.result.current.recoveryScope).toBe('fam-1|london|london|2')

    transactionError = null
    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.retrySourceSave({
        runInstanceId: view.result.current.sourceSave.runInstanceId,
        viewGeneration: view.result.current.sourceSave.viewGeneration,
        scopeKey: view.result.current.recoveryScope,
        epoch: view.result.current.recoveryEpoch,
      })
    })

    expect(outcome).toBe('identity-mismatch')
    expect(sourceWrites()).toHaveLength(0)
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()
    // Nothing was consumed: the payload is still held for whoever may land it.
    expect(view.result.current.sourceSave).toMatchObject({
      state: 'failed',
      kind: 'final',
      canRetry: true,
      runInstanceId: held,
    })

    // Back to the parent, who may. Same payload, same original owner.
    identityEpoch = 3
    activeProfile = UserProfile.Parents
    setActive(LINCOLN)
    view.rerender()
    let allowed: unknown
    await act(async () => {
      allowed = await view.result.current.retrySourceSave({
        runInstanceId: view.result.current.sourceSave.runInstanceId,
        viewGeneration: view.result.current.sourceSave.viewGeneration,
        scopeKey: view.result.current.recoveryScope,
        epoch: view.result.current.recoveryEpoch,
      })
    })
    expect(allowed).toBe('saved')
    expect(sourceWrites()).toHaveLength(1)
    expect(sourceWrites()[0].data).toMatchObject({ childId: 'lincoln', status: 'complete' })
  })

  /** The run's OWN child profile is still a first-class retry. */
  it('admits a retry under the original authorised child’s own profile', async () => {
    const view = mountHook()
    await start(view)
    transactionError = new Error('offline')
    await answer(view, 5)

    identityEpoch = 2
    activeProfile = UserProfile.Lincoln
    setActive(LINCOLN, true)
    view.rerender()

    transactionError = null
    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.retrySourceSave({
        runInstanceId: view.result.current.sourceSave.runInstanceId,
        viewGeneration: view.result.current.sourceSave.viewGeneration,
        scopeKey: view.result.current.recoveryScope,
        epoch: view.result.current.recoveryEpoch,
      })
    })
    expect(outcome).toBe('saved')
    expect(sourceWrites()[0].data).toMatchObject({ childId: 'lincoln', status: 'complete' })
  })

  /** No profile vouches for nobody, even with a settled family and child. */
  it('refuses a retry with no profile selected', async () => {
    const view = mountHook()
    await start(view)
    transactionError = new Error('offline')
    await answer(view, 5)

    identityEpoch = 2
    activeProfile = null
    view.rerender()

    transactionError = null
    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.retrySourceSave({
        runInstanceId: view.result.current.sourceSave.runInstanceId,
        viewGeneration: view.result.current.sourceSave.viewGeneration,
        scopeKey: view.result.current.recoveryScope,
        epoch: view.result.current.recoveryEpoch,
      })
    })
    expect(outcome).toBe('identity-mismatch')
    expect(sourceWrites()).toHaveLength(0)
    expect(view.result.current.sourceSave).toMatchObject({ state: 'failed', canRetry: true })
  })

  it('fails a retry closed on an unsettled, other-family or other-profile scope', async () => {
    const view = mountHook()
    await start(view)
    transactionError = new Error('offline')
    await answer(view, 5)
    const control = {
      runInstanceId: view.result.current.sourceSave.runInstanceId,
      viewGeneration: view.result.current.sourceSave.viewGeneration,
      epoch: view.result.current.recoveryEpoch,
    }
    transactionError = null

    // `familyId|childId|profile|epoch` — none of these is the live scope.
    for (const scopeKey of ['unsettled', 'fam-2|lincoln|parents|1', 'fam-1|london|london|1']) {
      let outcome: unknown
      await act(async () => {
        outcome = await view.result.current.retrySourceSave({ ...control, scopeKey })
      })
      expect(outcome).toBe('identity-mismatch')
    }
    expect(sourceWrites()).toHaveLength(0)
    // The payload is still held, so the honest button can still land it.
    expect(view.result.current.sourceSave).toMatchObject({ state: 'failed', canRetry: true })
  })

  it('refuses a graph retry for a child who is no longer the active one', async () => {
    const view = mountHook()
    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.retryGraphProjection('some-session', 'london')
    })
    expect(outcome).toBe('identity-mismatch')
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()
  })

  it('refuses a graph retry carrying the scope it was rendered under after a switch', async () => {
    const view = mountHook()
    const rendered = {
      scopeKey: view.result.current.recoveryScope,
      epoch: view.result.current.recoveryEpoch,
    }

    // The header moves, and moves back: family and child are the same again,
    // the identity epoch is not.
    identityEpoch = 2
    setActive(LONDON)
    view.rerender()
    setActive(LINCOLN)
    view.rerender()

    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.retryGraphProjection(
        'some-session',
        'lincoln',
        rendered,
      )
    })
    expect(outcome).toBe('identity-mismatch')
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()
  })
})

describe('Resume claims what is stored now, atomically', () => {
  /** One answered question already in the record, so four more reach the floor. */
  const ANSWERED = {
    id: 'q-done',
    type: 'multiple-choice' as const,
    level: 2,
    skill: 'phonics.cvc',
    prompt: 'already answered',
    options: ['cat', 'cot', 'cut'],
    correctAnswer: 'cat',
    childAnswer: 'cat',
    correct: true,
    responseTimeMs: 1000,
    timestamp: '2026-11-10T00:00:00.000Z',
  }

  const partialDoc = {
    id: 'interactive_lincoln_500',
    childId: 'lincoln',
    domain: 'reading' as const,
    status: 'partial' as const,
    messages: [],
    findings: [],
    recommendations: [],
    summary: 'partial',
    evaluatedAt: '2026-11-10T00:00:00.000Z',
    sessionType: 'interactive' as const,
    questMode: 'phonics' as const,
    questions: [ANSWERED],
    finalLevel: 2,
    totalCorrect: 1,
    totalQuestions: 1,
    diamondsMined: 1,
    streakDays: 0,
    savedQuestState: {
      currentLevel: 2,
      consecutiveCorrect: 1,
      consecutiveWrong: 0,
      levelDownsInARow: 0,
      wrongAtFloor: 0,
      totalQuestions: 1,
      totalCorrect: 1,
      questionsThisLevel: 1,
      startedAt: '2026-11-10T00:00:00.000Z',
      elapsedSeconds: 30,
    },
    savedCurrentQuestion: {
      id: 'q-saved',
      type: 'multiple-choice' as const,
      level: 2,
      skill: 'phonics.cvc',
      prompt: 'saved question',
      options: ['cat', 'cot', 'cut'],
      correctAnswer: 'cat',
    },
  }

  const path = `sessions-fam-1/${partialDoc.id}`

  async function resume(view: View, doc = partialDoc) {
    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.resumeSession(doc)
    })
    return outcome
  }

  it('stamps `resumed` in the SAME transaction that accepted it', async () => {
    seed(path, partialDoc)
    const view = mountHook()

    expect(await resume(view)).toBe(true)
    // One write, from the claim itself — no detached second stamp.
    expect(writes.filter((w) => w.path === path)).toHaveLength(1)
    expect(store.get(path)).toMatchObject({ status: 'resumed' })
    expect(view.result.current.screen).toBe('question')
    expect(view.result.current.currentQuestion?.id).toBe('q-saved')
  })

  it('refuses a record the stored copy says is finished, and starts nothing', async () => {
    seed(path, { ...partialDoc, status: 'complete', sourceCommittedAt: 'earlier' })
    const view = mountHook()

    expect(await resume(view)).toBe('finalized')
    expect(view.result.current.screen).toBe('intro')
    expect(chat).not.toHaveBeenCalled()
    // Refused inside the transaction, so nothing was stamped.
    expect(writes.filter((w) => w.path === path)).toHaveLength(0)
  })

  it('refuses an abandoned record, a missing one and another child’s', async () => {
    const view = mountHook()
    expect(await resume(view)).toBe('missing')

    seed(path, { ...partialDoc, status: 'abandoned' })
    expect(await resume(view)).toBe('abandoned')

    seed(path, { ...partialDoc, childId: 'london' })
    expect(await resume(view)).toBe('wrong-child')

    seed(path, { ...partialDoc, status: 'something-else' })
    expect(await resume(view)).toBe('not-resumable')

    expect(chat).not.toHaveBeenCalled()
    expect(writes.filter((w) => w.path === path)).toHaveLength(0)
  })

  /**
   * A rejected claim is NOT a missing quest: the document was never judged, so
   * the saved point is intact and still eligible. The card must stay and ask
   * for another tap rather than telling a child the quest is gone.
   */
  it('reports a rejected claim transport as a retry, not as missing', async () => {
    seed(path, partialDoc)
    const view = mountHook()
    transactionError = new Error('offline')

    expect(await resume(view)).toBe('claim-failed')
    transactionError = null
    expect(view.result.current.screen).toBe('intro')
    expect(chat).not.toHaveBeenCalled()
    // Untouched and still resumable — the second tap gets through.
    expect(store.get(path)).toMatchObject({ status: 'partial' })
    expect(await resume(view)).toBe(true)
    expect(view.result.current.currentQuestion?.id).toBe('q-saved')
  })

  /**
   * The row the released app hid: a claim was accepted and the UI retired
   * before the child answered anything. The stored status is `resumed`, the
   * saved question is intact, and reopening it must land on the ORIGINAL id,
   * mode and plan.
   */
  it('reopens a stored `resumed` row on its original id and plan', async () => {
    seed(path, { ...partialDoc, status: 'resumed', targetPlan: [] })
    const view = mountHook()

    expect(await resume(view)).toBe(true)
    expect(view.result.current.screen).toBe('question')
    expect(view.result.current.currentQuestion?.id).toBe('q-saved')

    await answer(view, 4)
    const saved = lastWriteTo(partialDoc.id)
    expect(saved.data.status).toBe('complete')
    expect(saved.data.questMode).toBe('phonics')
    expect(saved.data.targetPlan).toEqual([])
    // One document throughout: no second record was created for the reopen.
    expect(
      new Set(sourceWrites().map((w) => w.path)),
    ).toEqual(new Set([path]))
  })

  it('refuses a retained Resume before it calls Firestore at all', async () => {
    seed(path, partialDoc)
    const view = mountHook()
    const staleResume = view.result.current.resumeSession

    setActive(LONDON)
    view.rerender()

    let outcome: unknown
    await act(async () => {
      outcome = await staleResume(partialDoc)
    })
    expect(outcome).toBe('stale-scope')
    expect(writes.filter((w) => w.path === path)).toHaveLength(0)
    expect(store.get(path)).toMatchObject({ status: 'partial' })
  })

  /** Cold and warm Resume agree on a legacy partial with no plan. */
  it('restores an empty plan from a legacy partial, warm or cold', async () => {
    selectedPlan = PLAN
    seedTargetedModel()
    const warm = mountHook()
    await start(warm)
    await answer(warm, 5)
    // The ordinary exit from the finished run's summary — *Try another quest* —
    // which is how a warm hook actually arrives back at the intro the resume
    // card is drawn on. (It saves no partial: that run is already closed.)
    await act(async () => {
      warm.result.current.resetToIntro()
    })
    projectQuestSourceToModel.mockClear()

    seed(path, partialDoc)
    expect(await resume(warm)).toBe(true)
    await answer(warm, 4)
    const warmSave = lastWriteTo(partialDoc.id)
    expect(warmSave.data.status).toBe('complete')
    // The warm hook was holding the PREVIOUS run's request. It did not lend it.
    expect(warmSave.data.targetPlan).toEqual([])
    expect(warmSave.data.modelProjection).toBe('skipped')
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()

    writes.length = 0
    store.clear()
    seed(path, partialDoc)
    const cold = mountHook()
    expect(await resume(cold)).toBe(true)
    await answer(cold, 4)
    const coldSave = lastWriteTo(partialDoc.id)
    expect(coldSave.data.status).toBe('complete')
    expect(coldSave.data.targetPlan).toEqual([])
    expect(coldSave.data.modelProjection).toBe('skipped')
  })

  /**
   * Sol's two Chrome overlaps: a Resume awaiting its claim, then an ordinary
   * Start — and then *Start fresh instead*. Both used to let the only
   * discoverable partial disappear: the claim had stamped `resumed`, which the
   * card filters out, while Resume threw its own restore away.
   */
  it('holds the intro lane while its claim is in flight, refusing a Start', async () => {
    seed(path, partialDoc)
    const view = mountHook()
    const release = holdNextTransaction()
    const resuming = view.result.current.resumeSession(partialDoc)
    await settle()

    // The ordinary Math Start, tapped while Resume is still awaiting.
    let startOutcome: unknown
    await act(async () => {
      startOutcome = await view.result.current.startQuest('math', 'math')
    })
    expect(startOutcome).toBe('busy')
    expect(chat).not.toHaveBeenCalled()

    release()
    let resumeOutcome: unknown
    await act(async () => {
      resumeOutcome = await resuming
    })
    // The Resume keeps its own screen, and the partial is open rather than
    // stamped-and-lost.
    expect(resumeOutcome).toBe(true)
    expect(view.result.current.screen).toBe('question')
    expect(view.result.current.currentQuestion?.id).toBe('q-saved')
    expect(view.result.current.questMode).toBe('phonics')
  })

  it('refuses *Start fresh instead* while a Resume is mid-claim', async () => {
    seed(path, partialDoc)
    const view = mountHook()
    const release = holdNextTransaction()
    const resuming = view.result.current.resumeSession(partialDoc)
    await settle()

    let discarded: unknown
    await act(async () => {
      discarded = await view.result.current.discardPartial(partialDoc)
    })
    expect(discarded).toBe('stale-scope')

    release()
    await act(async () => {
      expect(await resuming).toBe(true)
    })
    // Reopened, not closed out: the two buttons cannot disagree.
    expect(store.get(path)).toMatchObject({ status: 'resumed' })
    expect(view.result.current.screen).toBe('question')
  })

  it('discards a partial when it owns the lane, and refuses another child’s', async () => {
    seed(path, partialDoc)
    const view = mountHook()

    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.discardPartial(partialDoc)
    })
    expect(outcome).toBe('abandoned')
    expect(store.get(path)).toMatchObject({ status: 'abandoned' })

    seed(path, { ...partialDoc, childId: 'london' })
    writes.length = 0
    await act(async () => {
      outcome = await view.result.current.discardPartial({ ...partialDoc, childId: 'london' })
    })
    expect(outcome).toBe('refused')
    expect(writes.filter((w) => w.path === path)).toHaveLength(0)
  })

  it('refuses a retained Resume rather than replacing a live run', async () => {
    seed(path, partialDoc)
    const view = mountHook()
    expect(await start(view)).toBe('started')
    const live = view.result.current.currentQuestion

    expect(await resume(view)).toBe('stale-scope')
    // Nothing stamped, and the live quest is still the one on screen.
    expect(store.get(path)).toMatchObject({ status: 'partial' })
    expect(view.result.current.screen).toBe('question')
    expect(view.result.current.currentQuestion).toBe(live)
  })

  it('brings a SAVED plan back off the exact partial', async () => {
    const planned = { ...partialDoc, targetPlan: PLAN }
    seed(path, planned)
    const view = mountHook()

    expect(await resume(view, planned)).toBe(true)
    await answer(view, 4)
    const save = lastWriteTo(partialDoc.id)
    expect(save.data.targetPlan).toEqual(PLAN)
    expect(save.data.modelProjection).toBe('pending')
  })
})
