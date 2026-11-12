import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-495 — the pilot's whole path through the NORMAL entry point: the suggested
 * Start, the one checked item in the opening slot, the ordinary session around
 * it, and the records it leaves.
 *
 * What this file pins that nothing else can:
 *
 *   • an accepted suggested Start asks the checked item LOCALLY — no provider
 *     call for the opening slot — and the rest of the session is the ordinary
 *     provider-driven, adaptive, timed Mine run;
 *   • the accepted target and the item's provenance reach the immutable final
 *     record, which is the only thing the projection later reads;
 *   • a correct answer, a wrong answer and a skip all behave as ordinary rows,
 *     and a skipped or answered probe does not reappear;
 *   • every refusal falls back to the ordinary calibrated Math Start: an
 *     ordinary card, a changed synthesis, a queued ask that arrived while the
 *     Start was reading, the wrong level, and a journey that ended;
 *   • a Resume restores the exact pending item, before and after it is
 *     answered, and generates no second probe;
 *   • a save that fails is recoverable through the existing source-only retry,
 *     with the pilot's own payload.
 *
 * Real timers, like the other two hook harnesses — the feedback pauses are
 * genuinely awaited.
 */

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

// ── A fake Firestore keyed by document path ────────────────────
const store = new Map<string, unknown>()
const writes: Array<{ path: string; data: Record<string, unknown> }> = []
let transactionError: Error | null = null

const addDoc = vi.fn<(ref: unknown, data: unknown) => Promise<{ id: string }>>(
  async () => ({ id: 'new-doc' }),
)
const setDoc = vi.fn<(ref: unknown, data: unknown) => Promise<void>>(async () => {})

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
    const failWith = transactionError
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
    for (const w of staged) {
      const prev = w.merge ? ((store.get(w.path) as object) ?? {}) : {}
      store.set(w.path, { ...prev, ...w.data })
      writes.push({ path: w.path, data: w.data })
    }
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
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: 'lincoln' }),
}))

let identityEpoch = 1
vi.mock('../avatar/stonebridge/libraryReturnFlow', () => ({
  getLibraryIdentityEpoch: () => identityEpoch,
  subscribeLibraryIdentityEpoch: () => () => {},
}))

vi.mock('../../core/xp/addXpEvent', () => ({ addXpEvent: vi.fn(async () => {}) }))
vi.mock('../../core/xp/addDiamondEvent', () => ({ addDiamondEvent: vi.fn(async () => {}) }))
vi.mock('../../core/curriculum/updateSkillMapFromFindings', () => ({
  updateSkillMapFromFindings: vi.fn(async () => {}),
}))
vi.mock('../evaluate/skillSnapshotWrites', () => ({ writeSnapshotUpdate: vi.fn(async () => {}) }))
vi.mock('../today/dayWriteGuard', () => ({ updateDayLogGuarded: vi.fn(async () => {}) }))

/** Spied, not run: the real projection has its own file. */
const projectQuestSourceToModel = vi.fn(async () => 'projected' as const)
vi.mock('./questModelSync', () => ({
  projectQuestSourceToModel: (...a: unknown[]) =>
    projectQuestSourceToModel(...(a as [])) as Promise<string>,
  projectionReachedGraph: (outcome: string) =>
    outcome === 'projected' || outcome === 'already-projected',
}))

let activeSeconds = 27 * 60
vi.mock('../../core/utils/sessionTimer', () => ({
  useSessionTimer: () => ({
    startTimer: vi.fn(),
    stop: () => activeSeconds,
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
import { MINE_ADDITION_PROBE_CONCEPT, mineAdditionProbeStamp } from './mineAdditionProbe'
import type { MineAdditionPilotRequest } from './mineAdditionPilot'
import { MINE_ADDITION_PROBE_KIND } from './questTypes'
import type { MineAdditionPilotTarget, SessionQuestion } from './questTypes'
import { EvaluationDomain } from '../../core/types/enums'
import { SynthesisVehicle } from '../../core/types/learnerModel'

const LINCOLN = { id: 'lincoln', name: 'Lincoln' }
const LONDON = { id: 'london', name: 'London' }
const GENERATION = '2026-11-10T08:00:00.000Z'
const MODEL_SEEDED = '2026-07-01T00:00:00.000Z'

const PILOT: MineAdditionPilotTarget = {
  kind: MINE_ADDITION_PROBE_KIND,
  templateId: 'mine.addition.within20.v1',
  conceptId: MINE_ADDITION_PROBE_CONCEPT,
  offerSource: 'synthesis',
  synthesisGeneratedAt: GENERATION,
  level: 2,
}

function setActive(child: { id: string; name: string }) {
  mockUseActiveChild.mockReturnValue({
    activeChildId: child.id,
    activeChild: child,
    children: [LINCOLN, LONDON],
    childrenFamilyId: 'fam-1',
    setActiveChildId: vi.fn(),
    isChildProfile: true,
    isLoading: false,
    loadFailed: false,
    addChild: vi.fn(),
  })
}

/** The owner snapshot: math-calibrated, and in the level-2 Math band. */
function seedSnapshot(level = 2) {
  seed('skillSnapshots/lincoln', {
    childId: 'lincoln',
    workingLevels: {
      math: { level, updatedAt: MODEL_SEEDED, source: 'evaluation' },
    },
  })
}

/** The owner model: a fresh synthesis whose next move is this concept, by quest. */
function seedModel(
  partial: { openQuestions?: unknown[]; generatedAt?: string; staleAt?: string | null } = {},
) {
  seed('models-fam-1/lincoln', {
    childId: 'lincoln',
    graphVersion: 'reading@1+math@1',
    status: 'synthesized',
    conceptStates: {},
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: partial.openQuestions ?? [],
    synthesis: {
      whatMattersNext: [
        {
          conceptId: MINE_ADDITION_PROBE_CONCEPT,
          kidName: 'Adding to 20',
          why: 'He is adding within 20.',
          suggestedVehicle: SynthesisVehicle.Quest,
        },
      ],
      narrative: '',
      openQuestionsSummary: [],
      generatedAt: partial.generatedAt ?? GENERATION,
    },
    ...(partial.staleAt ? { synthesisStaleAt: partial.staleAt } : {}),
    seededAt: MODEL_SEEDED,
    updatedAt: MODEL_SEEDED,
  })
}

function pilotRequest(
  overrides: Partial<MineAdditionPilotRequest> = {},
): MineAdditionPilotRequest {
  return {
    familyId: 'fam-1',
    childId: 'lincoln',
    conceptId: MINE_ADDITION_PROBE_CONCEPT,
    domain: EvaluationDomain.Math,
    questMode: 'math',
    offerSource: 'synthesis',
    synthesisGeneratedAt: GENERATION,
    tripGeneration: 2,
    tripStillLive: () => true,
    ...overrides,
  }
}

/** The ordinary provider question every slot after the opening one gets. */
const PROVIDER_QUESTION = JSON.stringify({
  prompt: 'What is 3 + 4?',
  options: ['6', '7', '8'],
  correctAnswer: '7',
  level: 2,
  skill: 'math.addition',
})

function mountHook() {
  return renderHook(() => useQuestSession())
}
type View = ReturnType<typeof mountHook>

async function startPilot(view: View, request = pilotRequest()) {
  let outcome: unknown
  await act(async () => {
    outcome = await view.result.current.startQuest(
      EvaluationDomain.Math,
      'math',
      request,
    )
  })
  return outcome
}

/** Answer `n` questions with whatever the LIVE question expects. */
async function answer(view: View, n: number, override?: string) {
  for (let i = 0; i < n; i += 1) {
    const expected = override ?? view.result.current.currentQuestion?.correctAnswer ?? '7'
    await act(async () => {
      await view.result.current.submitAnswer(expected)
    })
    override = undefined
  }
}

function sourceWrites() {
  return writes.filter((w) => w.path.startsWith('sessions-fam-1/'))
}

/** The last written source document, as the stored shape. */
function lastSource() {
  const data = sourceWrites().at(-1)!.data as Record<string, unknown>
  return data as Record<string, unknown> & { questions?: SessionQuestion[] }
}

function probeRows(questions: SessionQuestion[] = lastSource().questions ?? []) {
  return questions.filter((q) => q.localProbe !== undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  store.clear()
  writes.length = 0
  transactionError = null
  activeSeconds = 27 * 60
  identityEpoch = 1
  setActive(LINCOLN)
  seedSnapshot()
  seedModel()
  chat.mockResolvedValue({ message: `<quest>${PROVIDER_QUESTION}</quest>` })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the accepted suggested Start', () => {
  it('asks the checked item locally in the opening slot, with no provider call for it', async () => {
    const view = mountHook()
    expect(await startPilot(view)).toBe('started')

    expect(view.result.current.screen).toBe('question')
    const q = view.result.current.currentQuestion!
    // Narrowed before the multiple-choice fields are read: `currentQuestion` is
    // the whole question union, and the tile types carry `tiles`, not `options`.
    expect(q.type).toBe('multiple-choice')
    if (q.type !== 'multiple-choice') throw new Error('expected a multiple-choice probe')
    expect(q.level).toBe(2)
    expect(q.prompt).toContain('8 + 7')
    // The display ORDER is chosen per item, so the set is what is fixed.
    expect([...q.options].sort()).toEqual(['14', '15', '16'])
    expect(q.correctAnswer).toBe('15')
    expect(q.localProbe).toMatchObject({ conceptId: MINE_ADDITION_PROBE_CONCEPT })
    // And what was shown is what was stamped.
    expect(q.localProbe!.choices).toEqual(q.options)
    // Nothing was asked of the provider for this slot.
    expect(chat).not.toHaveBeenCalled()
    // And the ordinary session is running: mode, state and timer.
    expect(view.result.current.questMode).toBe('math')
    expect(view.result.current.questState?.currentLevel).toBe(2)
  })

  it('carries the target and the item’s provenance into the immutable final record', async () => {
    const view = mountHook()
    await startPilot(view)
    // What the child was actually shown, captured before it is answered.
    const shown = view.result.current.currentQuestion!
    const shownOptions =
      shown.type === 'multiple-choice' ? shown.options : []
    const shownStamp = shown.localProbe!
    await answer(view, 5)

    expect(view.result.current.screen).toBe('summary')
    const source = lastSource()
    expect(source).toMatchObject({
      status: 'complete',
      domain: 'math',
      questMode: 'math',
      childId: 'lincoln',
      modelProjection: 'pending',
      pilotProbe: PILOT,
      // No queued request identity for this synthesis result.
      targetPlan: [],
    })
    const rows = probeRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      level: 2,
      // The exact displayed order, preserved — not a re-derived one.
      options: shownOptions,
      correctAnswer: '15',
      childAnswer: '15',
      correct: true,
      inputMethod: 'multiple-choice',
      targetConceptId: MINE_ADDITION_PROBE_CONCEPT,
      localProbe: shownStamp,
    })
    expect(rows[0].localProbe!.choices).toEqual(shownOptions)
    expect(rows[0].localProbe!.synthesisGeneratedAt).toBe(GENERATION)
    expect(rows[0].responseTimeMs).toBeGreaterThanOrEqual(0)
    expect(rows[0].timestamp).toBeTruthy()
    // The projection is attempted for the saved source, under this run.
    expect(projectQuestSourceToModel).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: 'fam-1',
        childId: 'lincoln',
        expectedDomain: 'math',
        expectedQuestMode: 'math',
      }),
    )
  })

  it('records a WRONG answer on the probe as an ordinary wrong row', async () => {
    const view = mountHook()
    await startPilot(view)
    await answer(view, 5, '14')

    const rows = probeRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ childAnswer: '14', correct: false })
    expect(lastSource()).toMatchObject({ pilotProbe: PILOT })
  })

  it('does not re-ask a SKIPPED probe, and leaves one skipped row behind', async () => {
    const view = mountHook()
    await startPilot(view)
    await act(async () => {
      await view.result.current.handleSkip()
    })
    // The replacement is an ordinary provider question.
    expect(view.result.current.currentQuestion?.localProbe).toBeUndefined()
    await answer(view, 5)

    const rows = probeRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ skipped: true, correct: false })
  })

  it('does not re-ask an ANSWERED probe', async () => {
    const view = mountHook()
    await startPilot(view)
    await answer(view, 1)
    expect(view.result.current.currentQuestion?.localProbe).toBeUndefined()
    await answer(view, 4)
    expect(probeRows()).toHaveLength(1)
  })
})

describe('every refusal leaves the ordinary calibrated Math Start', () => {
  /** Start and assert the opening slot came from the provider, with no probe. */
  async function expectsOrdinaryStart(view: View, request?: MineAdditionPilotRequest | null) {
    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.startQuest(
        EvaluationDomain.Math,
        'math',
        request,
      )
    })
    expect(outcome).toBe('started')
    expect(chat).toHaveBeenCalled()
    expect(view.result.current.currentQuestion?.localProbe).toBeUndefined()
    expect(view.result.current.currentQuestion?.prompt).toBe('What is 3 + 4?')
  }

  it('an ordinary mode card, which carries no request at all', async () => {
    const view = mountHook()
    await expectsOrdinaryStart(view)
    await answer(view, 5)
    expect(lastSource().pilotProbe).toBeUndefined()
    expect(probeRows()).toHaveLength(0)
    // Nothing to project: no plan and no probe.
    expect(lastSource().modelProjection).toBe('skipped')
  })

  it('a synthesis regenerated while the child walked over', async () => {
    seedModel({ generatedAt: '2026-11-11T07:00:00.000Z' })
    const view = mountHook()
    await expectsOrdinaryStart(view, pilotRequest())
  })

  it('a stale synthesis mark', async () => {
    seedModel({ staleAt: '2026-11-10T08:30:00.000Z' })
    const view = mountHook()
    await expectsOrdinaryStart(view, pilotRequest())
  })

  it('an eligible queued ask that arrived before this Start’s own read', async () => {
    seedModel({
      openQuestions: [
        {
          conceptId: MINE_ADDITION_PROBE_CONCEPT,
          question: 'Test adding within 20?',
          routedTo: 'quest',
          reason: 'Parent asked.',
        },
      ],
    })
    const view = mountHook()
    await expectsOrdinaryStart(view, pilotRequest())
    await answer(view, 5)
    // The queue is served the ordinary way: a selected request, no probe.
    const source = lastSource()
    expect(source.pilotProbe).toBeUndefined()
    expect(source.targetPlan).toHaveLength(1)
  })

  it('a level outside the band the item was checked for', async () => {
    seedSnapshot(5)
    const view = mountHook()
    await expectsOrdinaryStart(view, pilotRequest())
    expect(view.result.current.questState?.currentLevel).toBe(5)
  })

  it('a journey that ended between the card and the Start', async () => {
    const view = mountHook()
    await expectsOrdinaryStart(view, pilotRequest({ tripStillLive: () => false }))
  })

  it('a request for another child', async () => {
    const view = mountHook()
    await expectsOrdinaryStart(view, pilotRequest({ childId: 'london' }))
  })

  it('a missing learner model', async () => {
    store.delete('models-fam-1/lincoln')
    const view = mountHook()
    await expectsOrdinaryStart(view, pilotRequest())
  })

  it('an uncalibrated child — nothing is attached, and the ordinary Start still runs', async () => {
    seed('skillSnapshots/lincoln', { childId: 'lincoln' })
    const view = mountHook()
    await expectsOrdinaryStart(view, pilotRequest())
  })

  it('a retained suggested Start whose identity has moved: nothing starts at all', async () => {
    const view = mountHook()
    const retained = view.result.current.startQuest
    identityEpoch = 2
    setActive(LONDON)
    view.rerender()

    let outcome: unknown
    await act(async () => {
      outcome = await retained(EvaluationDomain.Math, 'math', pilotRequest())
    })
    expect(outcome).toBe('stale-scope')
    expect(chat).not.toHaveBeenCalled()
    expect(view.result.current.screen).toBe('intro')
  })
})

describe('Resume keeps the original run’s pilot and its exact pending item', () => {
  const PARTIAL_ID = 'interactive_lincoln_5000'

  /** A stored partial of the pilot run, with the probe as the pending item. */
  function seedPartial(answered: SessionQuestion[], pending: object | null) {
    seed(`sessions-fam-1/${PARTIAL_ID}`, {
      childId: 'lincoln',
      sessionType: 'interactive',
      status: 'partial',
      domain: 'math',
      questMode: 'math',
      questRunId: PARTIAL_ID,
      evaluatedAt: '2026-11-10T08:40:00.000Z',
      findings: [],
      questions: answered,
      targetPlan: [],
      pilotProbe: PILOT,
      savedQuestState: {
        currentLevel: 2,
        consecutiveCorrect: 0,
        consecutiveWrong: 0,
        levelDownsInARow: 0,
        wrongAtFloor: 0,
        totalQuestions: answered.length,
        totalCorrect: answered.filter((q) => q.correct).length,
        questionsThisLevel: answered.length,
        startedAt: '2026-11-10T08:35:00.000Z',
        elapsedSeconds: 30,
      },
      savedCurrentQuestion: pending ?? undefined,
    })
  }

  const pendingProbe = {
    id: 'q_pilot_1',
    type: 'multiple-choice',
    level: 2,
    skill: 'math.addition',
    prompt: 'What is 8 + 7?',
    stimulus: '8 + 7',
    options: ['14', '15', '16'],
    correctAnswer: '15',
    targetConceptId: MINE_ADDITION_PROBE_CONCEPT,
    localProbe: mineAdditionProbeStamp(PILOT),
  }

  async function resume(view: View) {
    let outcome: unknown
    await act(async () => {
      outcome = await view.result.current.resumeSession({
        ...(store.get(`sessions-fam-1/${PARTIAL_ID}`) as Record<string, unknown>),
        id: PARTIAL_ID,
      } as never)
    })
    return outcome
  }

  it('restores the exact pending probe, un-asked, before it has been answered', async () => {
    seedPartial([], pendingProbe)
    const view = mountHook()
    expect(await resume(view)).toBe(true)

    const q = view.result.current.currentQuestion!
    expect(q.id).toBe('q_pilot_1')
    expect(q.prompt).toContain('8 + 7')
    expect(q.localProbe).toEqual(mineAdditionProbeStamp(PILOT))
    // No second item was generated and no provider call was made to restore it.
    expect(chat).not.toHaveBeenCalled()

    // Answering it and finishing keeps the ORIGINAL run's target and one row.
    await answer(view, 5)
    const source = lastSource()
    expect(source).toMatchObject({ questRunId: PARTIAL_ID, pilotProbe: PILOT })
    expect(probeRows()).toHaveLength(1)
  })

  it('keeps the target after the probe was already answered, and asks no second one', async () => {
    const answeredProbe: SessionQuestion = {
      id: 'q_pilot_1',
      type: 'multiple-choice',
      level: 2,
      skill: 'math.addition',
      prompt: 'What is 8 + 7?',
      stimulus: '8 + 7',
      options: ['14', '15', '16'],
      correctAnswer: '15',
      childAnswer: '15',
      correct: true,
      responseTimeMs: 3000,
      timestamp: '2026-11-10T08:36:00.000Z',
      inputMethod: 'multiple-choice',
      targetConceptId: MINE_ADDITION_PROBE_CONCEPT,
      localProbe: mineAdditionProbeStamp(PILOT),
    }
    seedPartial([answeredProbe], {
      id: 'q2',
      type: 'multiple-choice',
      level: 2,
      skill: 'math.addition',
      prompt: 'What is 3 + 4?',
      options: ['6', '7', '8'],
      correctAnswer: '7',
    })
    const view = mountHook()
    expect(await resume(view)).toBe(true)
    expect(view.result.current.currentQuestion?.localProbe).toBeUndefined()

    await answer(view, 4)
    const source = lastSource()
    expect(source).toMatchObject({ pilotProbe: PILOT })
    expect(probeRows()).toHaveLength(1)
  })

  /** Overwrite one field of the seeded partial. */
  function amendPartial(patch: Record<string, unknown>) {
    const stored = store.get(`sessions-fam-1/${PARTIAL_ID}`) as Record<string, unknown>
    store.set(`sessions-fam-1/${PARTIAL_ID}`, { ...stored, ...patch })
  }

  /**
   * UX-495 correction — a pending probe is judged at the existing Resume
   * eligibility boundary, so an invalid one is refused there rather than
   * restored and then displayed and scored. The refusal is the ordinary
   * `no-resume-point`, and nothing is claimed, restored or asked.
   */
  it('refuses a pending probe whose accepted target is malformed', async () => {
    seedPartial([], pendingProbe)
    amendPartial({ pilotProbe: { kind: 'nonsense' } })
    const view = mountHook()

    expect(await resume(view)).toBe('no-resume-point')
    expect(view.result.current.screen).toBe('intro')
    expect(view.result.current.currentQuestion).toBeNull()
    // Not even claimed: the stored row is left exactly as found.
    expect((store.get(`sessions-fam-1/${PARTIAL_ID}`) as { status: string }).status).toBe('partial')
    expect(chat).not.toHaveBeenCalled()
  })

  /**
   * The browser blocker Sol reproduced: a checked MATH item stored under a
   * reading/phonics session was restored and shown, so `8 + 7` appeared on a
   * phonics screen. The refusal is the ordinary `no-resume-point`.
   */
  it('refuses a pending probe stored under a reading/phonics session', async () => {
    seedPartial([], pendingProbe)
    amendPartial({ domain: 'reading', questMode: 'phonics' })
    const view = mountHook()

    expect(await resume(view)).toBe('no-resume-point')
    expect(view.result.current.screen).toBe('intro')
    expect(view.result.current.currentQuestion).toBeNull()
    expect((store.get(`sessions-fam-1/${PARTIAL_ID}`) as { status: string }).status).toBe('partial')
  })

  it('refuses a corrupt, mismatched or reordered pending probe', async () => {
    for (const patch of [
      { localProbe: { nonsense: true } },
      { correctAnswer: '16' },
      { prompt: 'What is 9 + 7?' },
      { options: ['16', '15', '14'] },
      {
        localProbe: mineAdditionProbeStamp({
          ...PILOT,
          synthesisGeneratedAt: '2026-01-01T00:00:00.000Z',
        }),
      },
    ]) {
      store.clear()
      seedSnapshot()
      seedModel()
      seedPartial([], { ...pendingProbe, ...patch })
      const view = mountHook()
      expect(await resume(view)).toBe('no-resume-point')
      expect(view.result.current.currentQuestion).toBeNull()
      view.unmount()
    }
  })

  it('refuses a pending probe on a record whose probe was already answered', async () => {
    const answeredProbe = {
      ...pendingProbe,
      childAnswer: '15',
      correct: true,
      responseTimeMs: 3000,
      timestamp: '2026-11-10T08:36:00.000Z',
    } as unknown as SessionQuestion
    seedPartial([answeredProbe], pendingProbe)
    const view = mountHook()
    expect(await resume(view)).toBe('no-resume-point')
    expect(view.result.current.currentQuestion).toBeNull()
  })

  /** Positive control: an ordinary/legacy saved question is still resumable. */
  it('still resumes an ordinary saved question on a record with no pilot at all', async () => {
    seedPartial([], {
      id: 'q2',
      type: 'multiple-choice',
      level: 2,
      skill: 'math.addition',
      prompt: 'What is 3 + 4?',
      options: ['6', '7', '8'],
      correctAnswer: '7',
    })
    amendPartial({ pilotProbe: undefined })
    const view = mountHook()

    expect(await resume(view)).toBe(true)
    expect(view.result.current.currentQuestion?.id).toBe('q2')
    await answer(view, 5)
    expect(lastSource().pilotProbe).toBeUndefined()
    expect(probeRows()).toHaveLength(0)
  })
})

describe('a pilot save that fails stays recoverable on the existing path', () => {
  it('holds the payload — target and provenance intact — and lands it on retry', async () => {
    const view = mountHook()
    await startPilot(view)
    transactionError = new Error('unavailable')
    await answer(view, 5)

    expect(view.result.current.sourceSave).toMatchObject({
      state: 'failed',
      kind: 'final',
      canRetry: true,
      originalChildId: 'lincoln',
    })
    expect(sourceWrites()).toHaveLength(0)
    // Nothing reached the graph from a save that did not land.
    expect(projectQuestSourceToModel).not.toHaveBeenCalled()

    transactionError = null
    await act(async () => {
      await view.result.current.retrySourceSave()
    })

    expect(view.result.current.sourceSave.state).toBe('saved')
    const source = lastSource()
    expect(source).toMatchObject({ status: 'complete', pilotProbe: PILOT })
    expect(probeRows()).toHaveLength(1)
    expect(projectQuestSourceToModel).toHaveBeenCalledTimes(1)
  })
})
