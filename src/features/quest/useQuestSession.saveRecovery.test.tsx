import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-494 — the close saves ONE payload under its own id, and a failure is
 * recoverable.
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
 *   • an ordinary untagged quest makes no model attempt at all, so nothing ever
 *     offers it a retry;
 *   • a manual partial exit whose transaction is rejected keeps its answers and
 *     its minutes, and retries through the same scoped affordance;
 *   • a retained control cannot pick up another payload, and a retry after a
 *     child switch is refused.
 */

// ── A fake Firestore keyed by document path ────────────────────
const store = new Map<string, unknown>()
const writes: Array<{ path: string; data: Record<string, unknown> }> = []
const addDoc = vi.fn<(ref: unknown, data: unknown) => Promise<{ id: string }>>(
  async () => ({ id: 'new-doc' }),
)
const setDoc = vi.fn<(ref: unknown, data: unknown) => Promise<void>>(async () => {})
const addXpEvent = vi.fn(async () => {})
const addDiamondEvent = vi.fn(async () => {})

/** Set per test: make every transaction reject, as an offline device does. */
let transactionError: Error | null = null
/**
 * Set per test: COMMIT the write and then reject, which is the acknowledgement
 * lost in flight — the client never hears that its own payload landed.
 */
let lostAcknowledgement = false

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
    if (transactionError) throw transactionError
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
vi.mock('../../core/profile/useProfile', () => ({ useProfile: () => ({ profile: 'parent' }) }))

let identityEpoch = 1
vi.mock('../avatar/stonebridge/libraryReturnFlow', () => ({
  getLibraryIdentityEpoch: () => identityEpoch,
  subscribeLibraryIdentityEpoch: () => () => {},
}))

vi.mock('../../core/xp/addXpEvent', () => ({
  addXpEvent: (...a: unknown[]) => addXpEvent(...(a as [])),
}))
vi.mock('../../core/xp/addDiamondEvent', () => ({
  addDiamondEvent: (...a: unknown[]) => addDiamondEvent(...(a as [])),
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

const LINCOLN = { id: 'lincoln', name: 'Lincoln' }
const LONDON = { id: 'london', name: 'London' }

function setActive(child: { id: string; name: string }) {
  mockUseActiveChild.mockReturnValue({
    activeChildId: child.id,
    activeChild: child,
    children: [LINCOLN, LONDON],
    childrenFamilyId: 'fam-1',
    setActiveChildId: vi.fn(),
    isChildProfile: false,
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

type Hook = ReturnType<typeof import('./useQuestSession').useQuestSession>

async function mountHook() {
  const { useQuestSession } = await import('./useQuestSession')
  return renderHook(() => useQuestSession())
}

/** Answer `n` questions correctly. Five of them closes the session. */
async function answer(view: { result: { current: Hook } }, n: number) {
  for (let i = 0; i < n; i += 1) {
    await act(async () => {
      await view.result.current.submitAnswer('cat')
    })
  }
}

/** Every saved quest-source document, newest write last. */
function sourceWrites() {
  return writes.filter((w) => w.path.startsWith('sessions-fam-1/'))
}

/**
 * The LAST write to one source document. A resumed run stamps `status:
 * 'resumed'` before it plays, so the first write to that path is not the
 * payload under test.
 */
function lastWriteTo(sessionId: string) {
  return sourceWrites()
    .filter((w) => w.path === `sessions-fam-1/${sessionId}`)
    .at(-1)!
}

/** The run id behind a banked reward key — the only place the hook exposes it. */
function runIdFromRewardKey(index = 0): string {
  const key = (addDiamondEvent.mock.calls[index][0] as { dedupKey: string }).dedupKey
  return key.replace(/^quest_/, '').replace(/_q\d+-diamond$/, '')
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
  selectedPlan = []
  activeSeconds = 27 * 60
  stopCalls = 0
  identityEpoch = 1
  setActive(LINCOLN)
  chat.mockResolvedValue({ message: `<quest>${QUESTION}</quest>` })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // Advance the feedback pauses without waiting for them in real time.
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 20 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a denied complete source', () => {
  it('produces ZERO graph changes and offers a retry for that payload', async () => {
    selectedPlan = PLAN
    transactionError = new Error('permission-denied')
    const view = await mountHook()
    await act(async () => {
      await view.result.current.startQuest('reading', 'phonics')
    })
    await answer(view, 5)

    expect(sourceWrites()).toHaveLength(0)
    // The whole point: no projection was attempted for a source that does not exist.
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
    transactionError = new Error('permission-denied')
    const view = await mountHook()
    await act(async () => {
      await view.result.current.startQuest('reading', 'phonics')
    })
    await answer(view, 5)
    const xpBefore = addXpEvent.mock.calls.length
    const summaryCalls = chat.mock.calls.length

    transactionError = null
    await act(async () => {
      await view.result.current.retrySourceSave(view.result.current.sourceSave.runInstanceId)
    })

    expect(sourceWrites()).toHaveLength(1)
    expect(view.result.current.sourceSave.state).toBe('saved')
    expect(projectQuestSourceToModel).toHaveBeenCalledTimes(1)
    // The retry repeats NO other close side effect: no second AI summary, no
    // further XP, no second hours row.
    expect(chat.mock.calls).toHaveLength(summaryCalls)
    expect(addXpEvent.mock.calls.length).toBe(xpBefore)
    expect(hoursRows()).toHaveLength(1)
  })
})

describe('a committed acknowledgement lost before the retry', () => {
  it('recognises the matching payload, writes nothing more, and projects once', async () => {
    selectedPlan = PLAN
    lostAcknowledgement = true
    const view = await mountHook()
    await act(async () => {
      await view.result.current.startQuest('reading', 'phonics')
    })
    await answer(view, 5)

    // The write DID land; the client never heard so, so the summary offers the
    // retry and no projection was attempted on an unacknowledged source.
    expect(sourceWrites()).toHaveLength(1)
    expect(view.result.current.sourceSave).toMatchObject({ state: 'failed', canRetry: true })
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()

    const savedPath = sourceWrites()[0].path
    const committed = store.get(savedPath)
    lostAcknowledgement = false
    writes.length = 0

    await act(async () => {
      await view.result.current.retrySourceSave(view.result.current.sourceSave.runInstanceId)
    })

    // A matching committed retry is a success that writes NOTHING — the stored
    // payload stays byte-for-byte what it was — and the graph runs once.
    expect(writes).toHaveLength(0)
    expect(store.get(savedPath)).toBe(committed)
    expect(view.result.current.sourceSave.state).toBe('saved')
    expect(projectQuestSourceToModel).toHaveBeenCalledTimes(1)
  })
})

describe('the same id carrying a different payload', () => {
  it('is a conflict: the stored record is preserved and no graph applies', async () => {
    selectedPlan = PLAN
    const view = await mountHook()
    await act(async () => {
      await view.result.current.startQuest('reading', 'phonics')
    })
    // Another writer finalizes this run's id with different answers mid-session.
    await answer(view, 4)
    const runId = runIdFromRewardKey()
    const other = {
      childId: 'lincoln',
      sessionType: 'interactive',
      domain: 'reading',
      questMode: 'phonics',
      status: 'complete',
      questRunId: runId,
      sourceCommittedAt: 'earlier',
      totalCorrect: 1,
      summary: 'someone else',
    }
    seed(`sessions-fam-1/${runId}`, other)
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
    selectedPlan = [] // nothing queued — the overwhelming common case
    const view = await mountHook()
    await act(async () => {
      await view.result.current.startQuest('reading', 'phonics')
    })
    await answer(view, 5)

    const saved = sourceWrites()[0].data
    expect(saved).toMatchObject({ status: 'complete', modelProjection: 'skipped' })
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()
    expect(view.result.current.sourceSave.state).toBe('saved')
    expect(view.result.current.graphSync.state).toBe('skipped')
  })
})

describe('a held summary, then Try another quest and Start Phonics', () => {
  it('finishes the first run under its OWN id, mode, timer and reward keys', async () => {
    const view = await mountHook()
    await act(async () => {
      await view.result.current.startQuest('math', 'math')
    })
    await answer(view, 4)

    const mathRunId = runIdFromRewardKey()

    // The fifth answer closes Math — and its summary call hangs.
    let releaseSummary: (v: unknown) => void = () => {}
    chat.mockImplementationOnce(
      () => new Promise((resolve) => { releaseSummary = resolve }),
    )
    // Deliberately NOT wrapped in `act`: it must still be in flight while the
    // taps below run, which is the whole reproduction.
    const closing = view.result.current.submitAnswer('cat')
    // Let the feedback pause clear and the summary call start.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    // Try another quest, then Start Phonics, while that summary is in flight.
    await act(async () => {
      view.result.current.resetToIntro()
    })
    chat.mockResolvedValue({ message: `<quest>${QUESTION}</quest>` })
    await act(async () => {
      await view.result.current.startQuest('reading', 'phonics')
    })
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

    // Math's record is Math's: its own id, mode and domain.
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
    const mathHours = hoursRows().find((r) => r.notes === 'math quest session')!
    expect(mathHours.minutes).toBe(30)
    expect(stopCalls).toBe(stopsBefore)
    // Its reward keys are its own.
    const keys = addDiamondEvent.mock.calls.map((c) => (c[0] as { dedupKey: string }).dedupKey)
    expect(keys.filter((k) => k.startsWith(`quest_${mathRunId}_`)).length).toBeGreaterThan(0)
    // And the delayed close did not take over the Phonics screen.
    expect(view.result.current.questMode).toBe('phonics')
    expect(view.result.current.screen).not.toBe('summary')
  })
})

describe('a manual partial exit whose save is rejected', () => {
  it('keeps its answers for the same scoped retry, and its minutes either way', async () => {
    const view = await mountHook()
    await act(async () => {
      await view.result.current.startQuest('reading', 'phonics')
    })
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
      await view.result.current.retrySourceSave(view.result.current.sourceSave.runInstanceId)
    })

    const saved = sourceWrites()[0].data
    expect(saved).toMatchObject({ status: 'partial', childId: 'lincoln' })
    expect(saved.savedQuestState).toBeTruthy() // still resumable
    expect(view.result.current.sourceSave.state).toBe('saved')
    // A partial is never eligible for the graph.
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()
    expect(hoursRows()).toHaveLength(1)
  })
})

describe('stale controls and stale scope', () => {
  it('a retained source-retry control cannot pick up a different payload', async () => {
    transactionError = new Error('offline')
    const view = await mountHook()
    await act(async () => {
      await view.result.current.startQuest('reading', 'phonics')
    })
    await answer(view, 5)
    const staleInstanceId = view.result.current.sourceSave.runInstanceId
    expect(staleInstanceId).toBeTruthy()

    // A second run fails the same way, replacing what is held.
    await act(async () => {
      await view.result.current.startQuest('reading', 'comprehension')
    })
    await answer(view, 5)
    const freshInstanceId = view.result.current.sourceSave.runInstanceId
    expect(freshInstanceId).not.toBe(staleInstanceId)

    transactionError = null
    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.retrySourceSave(staleInstanceId)
    })
    expect(outcome).toBe('identity-mismatch')
    expect(sourceWrites()).toHaveLength(0)
  })

  it('refuses a graph retry for a child who is no longer the active one', async () => {
    const view = await mountHook()
    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.retryGraphProjection('some-session', 'london')
    })
    expect(outcome).toBe('identity-mismatch')
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()
  })

  it('refuses a graph retry carrying the scope it was rendered under after a switch', async () => {
    const view = await mountHook()
    const scopeAtRender = view.result.current.recoveryScope

    // The header moves, and moves back: family and child are the same again,
    // the identity epoch is not.
    identityEpoch = 2
    setActive(LONDON)
    view.rerender()
    setActive(LINCOLN)
    view.rerender()

    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.retryGraphProjection('some-session', 'lincoln', {
        scopeKey: scopeAtRender,
      })
    })
    expect(outcome).toBe('identity-mismatch')
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()
  })
})

describe('Resume checks what is stored now', () => {
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

  it('refuses a partial the stored record says is already finished, and starts nothing', async () => {
    seed(`sessions-fam-1/${partialDoc.id}`, {
      ...partialDoc,
      status: 'complete',
      sourceCommittedAt: 'earlier',
    })
    const view = await mountHook()
    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.resumeSession(partialDoc)
    })
    expect(outcome).toBe('finalized')
    expect(view.result.current.screen).toBe('intro')
    expect(chat).not.toHaveBeenCalled() // no fresh paid quest was started
  })

  it('refuses a record that is gone', async () => {
    const view = await mountHook()
    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.resumeSession(partialDoc)
    })
    expect(outcome).toBe('missing')
    expect(chat).not.toHaveBeenCalled()
  })

  /** Cold and warm Resume agree, and a saved plan survives both. */
  it('restores the plan from the exact partial, warm or cold', async () => {
    // A warm hook that has already run a session with its own selected request.
    selectedPlan = PLAN
    const warm = await mountHook()
    await act(async () => {
      await warm.result.current.startQuest('reading', 'phonics')
    })
    await answer(warm, 5)
    projectQuestSourceToModel.mockClear()

    // A LEGACY partial carrying no plan field at all.
    seed(`sessions-fam-1/${partialDoc.id}`, partialDoc)
    await act(async () => {
      await warm.result.current.resumeSession(partialDoc)
    })
    await answer(warm, 4)
    const warmSave = lastWriteTo(partialDoc.id)
    expect(warmSave.data.status).toBe('complete')
    // The warm hook was holding the PREVIOUS run's request. It did not lend it.
    expect(warmSave.data.targetPlan).toEqual([])
    expect(warmSave.data.modelProjection).toBe('skipped')
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()

    // A cold mount resuming the same legacy partial agrees.
    writes.length = 0
    store.clear()
    seed(`sessions-fam-1/${partialDoc.id}`, partialDoc)
    const cold = await mountHook()
    await act(async () => {
      await cold.result.current.resumeSession(partialDoc)
    })
    await answer(cold, 4)
    const coldSave = lastWriteTo(partialDoc.id)
    expect(coldSave.data.status).toBe('complete')
    expect(coldSave.data.targetPlan).toEqual([])
    expect(coldSave.data.modelProjection).toBe('skipped')

    // And a partial that DID save a plan brings it back.
    writes.length = 0
    store.clear()
    const planned = { ...partialDoc, targetPlan: PLAN }
    seed(`sessions-fam-1/${partialDoc.id}`, planned)
    const withPlan = await mountHook()
    await act(async () => {
      await withPlan.result.current.resumeSession(planned)
    })
    await answer(withPlan, 4)
    const plannedSave = lastWriteTo(partialDoc.id)
    expect(plannedSave.data.targetPlan).toEqual(PLAN)
    expect(plannedSave.data.modelProjection).toBe('pending')
  })
})
