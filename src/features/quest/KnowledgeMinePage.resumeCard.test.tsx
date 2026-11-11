import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getLibraryIdentityEpoch } from '../avatar/stonebridge/libraryReturnFlow'
import { QUEST_RESUME_REFUSAL_COPY } from './questSaveCopy'
import { QuestScreen } from './questTypes'
import KnowledgeMinePage from './KnowledgeMinePage'

/**
 * The intro's Resume card: which rows it is drawn for, and what a tap does
 * (UX-494).
 *
 * The defect this file covers: a claim accepted and then retired — a reload, a
 * child switch, a route change BEFORE the child ever saw the question — left an
 * intact saved point stored as `resumed`, which nothing offered again. It is
 * offered now, without its discard button, because the same row may still be
 * open in another tab.
 *
 * Everything else the hub needs is stubbed. What is REAL is the page's query
 * shape, its scope binding and its handlers, which is where the defects were.
 */

const fx = vi.hoisted(() => ({
  screen: 'intro' as string,
  resumeSession: vi.fn<(doc: unknown) => Promise<unknown>>(async () => true),
  discardPartial: vi.fn<(doc: unknown, expected: unknown) => Promise<unknown>>(
    async () => 'missing',
  ),
  recoveryScope: 'fam-1|lincoln|child|1',
  recoveryEpoch: 1,
  /** What the resume query finds, newest first (its `orderBy` is stubbed). */
  resumeRows: [] as Array<Record<string, unknown>>,
  /** The constraints each resume read carried, newest last. */
  resumeQueries: [] as Array<Array<Record<string, unknown>>>,
  /** Leave the next resume read in flight, as a slow round trip does. */
  holdResumeRead: false,
}))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
  useAuth: () => ({ familyId: 'fam-1' }),
}))

vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: 'lincoln' }),
}))

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'lincoln', name: 'Lincoln' },
    activeChildId: 'lincoln',
    childrenFamilyId: 'fam-1',
    children: [{ id: 'lincoln', name: 'Lincoln' }],
    setActiveChildId: () => {},
    isChildProfile: true,
    isLoading: false,
    loadFailed: false,
  }),
}))

/** Reading-calibrated, so the ordinary intro renders. */
vi.mock('../../core/hooks/useChildSkillSnapshot', () => ({
  useChildSkillSnapshot: () => ({
    snapshot: { childId: 'lincoln', prioritySkills: [], workingLevels: { phonics: 3 } },
    loaded: true,
  }),
}))

vi.mock('../../core/hooks/useLearnerModel', () => ({
  useLearnerModel: () => ({ model: null, loading: false }),
}))

vi.mock('./useQuestSession', () => ({
  useQuestSession: () => ({
    screen: fx.screen,
    questMode: 'phonics',
    questState: null,
    currentQuestion: null,
    lastAnswer: null,
    answeredQuestions: [],
    findings: [],
    streak: { currentStreak: 0, lastQuestDate: null },
    hitLevelCap: false,
    startQuestError: null,
    aiError: null,
    sessionLeftItsChild: false,
    sessionOwnerName: 'Lincoln',
    sourceSave: { state: 'idle', canRetry: false },
    graphSync: { state: 'idle' },
    recoveryScope: fx.recoveryScope,
    recoveryEpoch: fx.recoveryEpoch,
    viewGeneration: 0,
    resumeReloadNonce: 0,
    questDomain: 'reading',
    retrySourceSave: async () => 'nothing-pending' as const,
    retryGraphProjection: async () => 'identity-mismatch' as const,
    startQuest: vi.fn(),
    resumeSession: fx.resumeSession,
    discardPartial: fx.discardPartial,
    resetToIntro: vi.fn(),
    submitAnswer: () => {},
    handleSkip: () => {},
  }),
}))

vi.mock('../../core/xp/useXpLedger', () => ({
  useXpLedger: () => ({
    loading: true,
    totalXp: 0,
    armorTier: { color: '#fff', title: 'Wood' },
  }),
}))

vi.mock('./FluencyPractice', () => ({ default: () => <div>Fluency</div> }))
vi.mock('./QuestSummary', () => ({ default: () => <div>Summary</div> }))
vi.mock('./ReadingQuest', () => ({
  default: () => null,
  QuestFeedback: () => null,
  QuestLoading: () => null,
}))
vi.mock('./BuildWordQuestion', () => ({ default: () => null }))
vi.mock('./BuildSentenceQuestion', () => ({ default: () => null }))
vi.mock('../avatar/MinecraftAvatar', () => ({ default: () => null }))
vi.mock('../../core/firebase/firestore', () => ({
  db: {},
  evaluationSessionsCollection: () => ({}),
}))
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  query: (_col: unknown, ...constraints: Array<Record<string, unknown>>) => ({ constraints }),
  where: (field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value }),
  orderBy: (field: string) => ({ kind: 'orderBy', field }),
  limit: (n: number) => ({ kind: 'limit', n }),
  updateDoc: async () => {},
  runTransaction: async () => undefined,
  getDocs: async (q: { constraints?: Array<Record<string, unknown>> }) => {
    const constraints = q?.constraints ?? []
    const status = constraints.find((c) => c.kind === 'where' && c.field === 'status')
    // The page makes two reads from this collection; only one is the resume
    // card's. The graph-recovery read (`modelProjection == 'pending'`) finds
    // nothing here.
    if (!status) return { docs: [] }
    fx.resumeQueries.push(constraints)
    if (fx.holdResumeRead) await new Promise(() => {})
    return {
      docs: fx.resumeRows.map((row) => ({ id: row.id as string, data: () => row })),
    }
  },
}))

const NOW = new Date().toISOString()
const LONG_AGO = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()

/** The ordinary manual-exit partial. */
const PARTIAL = {
  id: 'interactive_lincoln_500',
  childId: 'lincoln',
  domain: 'reading',
  questMode: 'phonics',
  status: 'partial',
  sessionType: 'interactive',
  evaluatedAt: NOW,
  finalLevel: 2,
  savedQuestState: { currentLevel: 2 },
  savedCurrentQuestion: { id: 'q-saved' },
}

/** The row the released app hid: claimed, then its UI retired. */
const RESUMED = { ...PARTIAL, id: 'interactive_lincoln_501', status: 'resumed' }

function mineElement() {
  return (
    <MemoryRouter initialEntries={['/quest']}>
      <KnowledgeMinePage />
    </MemoryRouter>
  )
}

function renderMine() {
  return render(mineElement())
}

/** Let the reads, the handlers and their continuations settle. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function resumeCard() {
  return screen.queryByRole('button', { name: /Pick up where you left off/ })
}

function startFreshLink() {
  return screen.queryByRole('button', { name: 'Start fresh instead' })
}

/** The statuses the last resume read asked for. */
function lastAskedStatuses(): unknown {
  const constraints = fx.resumeQueries.at(-1) ?? []
  return constraints.find((c) => c.field === 'status')?.value
}

beforeEach(() => {
  fx.screen = QuestScreen.Intro
  fx.recoveryScope = 'fam-1|lincoln|child|1'
  // The page checks the epoch it read under against the store's own.
  fx.recoveryEpoch = getLibraryIdentityEpoch()
  fx.resumeRows = []
  fx.resumeQueries = []
  fx.holdResumeRead = false
  fx.resumeSession.mockReset()
  fx.resumeSession.mockResolvedValue(true)
  fx.discardPartial.mockReset()
  fx.discardPartial.mockResolvedValue('abandoned')
})

describe('which rows the Resume card is offered for', () => {
  it('asks for the claimed `resumed` row too, and reads a bounded few', async () => {
    fx.resumeRows = [RESUMED]
    renderMine()
    await flush()

    expect(lastAskedStatuses()).toEqual(['partial', 'in-progress', 'resumed'])
    expect(fx.resumeQueries.at(-1)?.find((c) => c.kind === 'limit')?.n).toBe(5)
    expect(resumeCard()).toBeInTheDocument()
  })

  /**
   * A `resumed` row may still be live in another tab, where `abandoned` would
   * land on that run's only saved point. Resume converges on it; discard
   * cannot, so the button is not there at all.
   */
  it('offers NO discard for a `resumed` row', async () => {
    fx.resumeRows = [RESUMED]
    renderMine()
    await flush()
    expect(resumeCard()).toBeInTheDocument()
    expect(startFreshLink()).toBeNull()
  })

  it('keeps the discard for an ordinary partial', async () => {
    fx.resumeRows = [PARTIAL]
    renderMine()
    await flush()
    expect(startFreshLink()).toBeInTheDocument()

    fireEvent.click(startFreshLink()!)
    await flush()
    expect(fx.discardPartial).toHaveBeenCalledWith(
      { id: PARTIAL.id, childId: 'lincoln' },
      { scopeKey: fx.recoveryScope, epoch: fx.recoveryEpoch },
    )
    expect(resumeCard()).toBeNull()
  })

  it('still offers a legacy in-progress row, with its discard', async () => {
    fx.resumeRows = [{ ...PARTIAL, status: 'in-progress' }]
    renderMine()
    await flush()
    expect(resumeCard()).toBeInTheDocument()
    expect(startFreshLink()).toBeInTheDocument()
  })

  it('takes the first ELIGIBLE row, not merely the newest one', async () => {
    // The newest rows are a finalized one and one whose status came back
    // `resumed` but was committed — neither is offered; the saved point is.
    fx.resumeRows = [
      { ...PARTIAL, id: 'done', status: 'complete' },
      { ...PARTIAL, id: 'committed', status: 'resumed', sourceCommittedAt: NOW },
      RESUMED,
    ]
    renderMine()
    await flush()

    expect(resumeCard()).toBeInTheDocument()
    fireEvent.click(resumeCard()!)
    await flush()
    expect(fx.resumeSession).toHaveBeenCalledWith(expect.objectContaining({ id: RESUMED.id }))
  })

  it('keeps finalized, abandoned, stale, pointless and other children’s rows out', async () => {
    fx.resumeRows = [
      { ...PARTIAL, id: 'a', status: 'complete' },
      { ...PARTIAL, id: 'b', status: 'abandoned' },
      { ...PARTIAL, id: 'c', sourceCommittedAt: NOW },
      { ...PARTIAL, id: 'd', childId: 'london' },
      { ...PARTIAL, id: 'e', sessionType: 'fluency' },
      { ...PARTIAL, id: 'f', evaluatedAt: LONG_AGO },
      { ...PARTIAL, id: 'g', savedQuestState: undefined },
    ]
    renderMine()
    await flush()

    expect(resumeCard()).toBeNull()
    expect(fx.resumeSession).not.toHaveBeenCalled()
  })
})

describe('tapping Resume', () => {
  it('reopens the row it was drawn for and starts nothing else', async () => {
    fx.resumeRows = [RESUMED]
    renderMine()
    await flush()

    fireEvent.click(resumeCard()!)
    await flush()
    expect(fx.resumeSession).toHaveBeenCalledTimes(1)
    expect(fx.resumeSession).toHaveBeenCalledWith(expect.objectContaining({ id: RESUMED.id }))
    expect(screen.queryByText(QUEST_RESUME_REFUSAL_COPY.missing)).toBeNull()
  })

  /**
   * A rejected claim transport is a retry, not a loss: the document was never
   * judged, so the saved point is intact and the card stays.
   */
  it('keeps the card and asks for another tap when the claim cannot be sent', async () => {
    fx.resumeRows = [RESUMED]
    fx.resumeSession.mockResolvedValue('claim-failed')
    renderMine()
    await flush()

    fireEvent.click(resumeCard()!)
    await flush()

    expect(screen.getByText(QUEST_RESUME_REFUSAL_COPY['claim-failed'])).toBeInTheDocument()
    expect(resumeCard()).toBeInTheDocument()
  })

  it('keeps the card when the intro lane was busy', async () => {
    fx.resumeRows = [PARTIAL]
    fx.resumeSession.mockResolvedValue('stale-scope')
    renderMine()
    await flush()

    fireEvent.click(resumeCard()!)
    await flush()

    expect(screen.getByText(QUEST_RESUME_REFUSAL_COPY['stale-scope'])).toBeInTheDocument()
    expect(resumeCard()).toBeInTheDocument()
  })

  it('retires the card when the SOURCE refuses it', async () => {
    fx.resumeRows = [PARTIAL]
    fx.resumeSession.mockResolvedValue('finalized')
    renderMine()
    await flush()

    fireEvent.click(resumeCard()!)
    await flush()

    expect(screen.getByText(QUEST_RESUME_REFUSAL_COPY.finalized)).toBeInTheDocument()
    expect(resumeCard()).toBeNull()
  })
})

describe('the Resume card’s scope', () => {
  it('hides a previous scope’s card before the new read completes', async () => {
    fx.resumeRows = [PARTIAL]
    const view = renderMine()
    await flush()
    expect(resumeCard()).toBeInTheDocument()

    // The identity moves and the new read has not landed.
    fx.holdResumeRead = true
    fx.recoveryScope = 'fam-1|lincoln|child|2'
    view.rerender(mineElement())
    await flush()

    expect(resumeCard()).toBeNull()
  })

  it('does not report a refusal that lands after the identity moved', async () => {
    fx.resumeRows = [PARTIAL]
    let settle: (outcome: unknown) => void = () => {}
    fx.resumeSession.mockImplementation(
      () => new Promise((resolve) => { settle = resolve }),
    )
    const view = renderMine()
    await flush()
    fireEvent.click(resumeCard()!)
    await flush()

    fx.recoveryScope = 'fam-1|lincoln|child|2'
    view.rerender(mineElement())
    await flush()
    settle('finalized')
    await flush()

    // Nobody's screen: no refusal copy, and the new scope's own read — which
    // found the row still eligible — is left exactly as it is.
    expect(screen.queryByText(QUEST_RESUME_REFUSAL_COPY.finalized)).toBeNull()
    expect(resumeCard()).toBeInTheDocument()
  })
})
