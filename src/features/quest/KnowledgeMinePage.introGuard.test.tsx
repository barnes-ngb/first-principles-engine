import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LibraryReturnDestination,
  LibraryReturnFocus,
  LibraryReturnOrigin,
  beginLibraryReturnFlow,
  endLibraryReturnFlow,
  getLibraryIdentityEpoch,
} from '../avatar/stonebridge/libraryReturnFlow'
import { MINE_READING_DIG_LABEL } from '../avatar/stonebridge/libraryReturnCopy'
import { QUEST_EXIT_GUARD_COPY, QUEST_SOURCE_COPY } from './questSaveCopy'
import { QuestScreen } from './questTypes'
import type { QuestExitBinding } from './useQuestSession'
import KnowledgeMinePage from './KnowledgeMinePage'

/**
 * UX-497 — starting or resuming a dig while the LAST one's answers are held.
 *
 * The baseline, reproduced on the deployed tree on both layouts: answer one
 * Math question, *Back to mine*, deny the partial write, then tap the mode card
 * (or the village's own suggested dig). A new question opened, and coming back
 * to the intro before answering it found no notice, no Retry and no Resume —
 * the Start had bumped the view that owned the held payload, so the only
 * control that could ever land those answers was gone. The confirmed older
 * *Resume* lost the newer unsaved dig the same way.
 *
 * So the intro's four replacements — the ordinary Start, the suggested Start,
 * the error *Try Again* and a confirmed *Resume* — take the UX-496 door, bound
 * to the same partial payload the intro's own return is bound to.
 *
 * REAL here: the page's gate, its intro, the real door, the real journey store
 * and the real invitation selector. Stubbed: the session hook, whose verdict is
 * the one input the gate reads (pinned against the real hook in
 * `useQuestSession.saveRecovery.test.tsx`).
 */

interface SourceRetryControl {
  runInstanceId?: string
  viewGeneration?: number
  scopeKey: string
  epoch: number
}

const fx = vi.hoisted(() => ({
  screen: 'intro' as string,
  sourceState: 'idle' as 'idle' | 'saving' | 'saved' | 'failed' | 'conflict',
  canRetry: false,
  /** The held partial is not this viewer's to see — a sibling, another family. */
  noticeHidden: false,
  runInstanceId: 'run-1' as string | undefined,
  recoveryScope: 'fam-1|lincoln|child|1',
  recoveryEpoch: 1,
  viewGeneration: 7,
  startQuestError: null as string | null,
  /** Bumped by the hook when a partial lands, which re-reads the Resume card. */
  resumeReloadNonce: 0,
  /** What the resume query finds, newest first (its `orderBy` is stubbed). */
  resumeRows: [] as Array<Record<string, unknown>>,
  startQuest: vi.fn(),
  resumeSession: vi.fn<(doc: unknown) => Promise<unknown>>(async () => true),
  retrySourceSave: vi.fn<(control: SourceRetryControl) => Promise<'saved'>>(
    async () => 'saved' as const,
  ),
  resetToIntro: vi.fn(),
}))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
  useAuth: () => ({ familyId: 'fam-1' }),
}))
vi.mock('../../core/profile/useProfile', () => ({ useProfile: () => ({ profile: 'lincoln' }) }))
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
/** Reading-calibrated, so the ordinary intro and its mode cards render. */
vi.mock('../../core/hooks/useChildSkillSnapshot', () => ({
  useChildSkillSnapshot: () => ({
    snapshot: { childId: 'lincoln', prioritySkills: [], workingLevels: { phonics: 3 } },
    loaded: true,
  }),
}))
/** A queue waiting on the one supported reading concept, so the offer agrees. */
vi.mock('../../core/hooks/useLearnerModel', () => ({
  useLearnerModel: () => ({
    model: {
      childId: 'lincoln',
      openQuestions: [
        {
          conceptId: 'reading.phonics.cvc',
          question: 'see this?',
          routedTo: 'quest',
          reason: 'queued',
        },
      ],
      synthesisStaleAt: null,
    },
    loading: false,
  }),
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
    startQuestError: fx.startQuestError,
    aiError: null,
    sessionLeftItsChild: false,
    sessionOwnerName: 'Lincoln',
    sourceSave: { state: fx.sourceState, canRetry: fx.canRetry },
    visibleSourceSave: fx.noticeHidden
      ? { state: 'idle' as const, canRetry: false }
      : {
          state: fx.sourceState,
          canRetry: fx.canRetry,
          kind: 'partial' as const,
          runInstanceId: fx.runInstanceId,
          viewGeneration: fx.viewGeneration,
          originalChildId: 'lincoln',
          originalFamilyId: 'fam-1',
        },
    /** The real verdict's contract: identity first, then this control's phase. */
    questExitVerdict: (binding: QuestExitBinding) => {
      if (
        binding.viewGeneration !== fx.viewGeneration ||
        binding.epoch !== fx.recoveryEpoch ||
        binding.scope !== fx.recoveryScope
      ) {
        return { kind: 'stale' as const }
      }
      if (binding.runInstanceId && fx.runInstanceId && binding.runInstanceId !== fx.runInstanceId) {
        return { kind: 'stale' as const }
      }
      if (binding.kind !== 'partial') return { kind: 'clear' as const }
      if (
        fx.sourceState === 'saving' ||
        fx.sourceState === 'failed' ||
        fx.sourceState === 'conflict'
      ) {
        return {
          kind: 'hold' as const,
          phase: fx.sourceState,
          canRetry: fx.canRetry,
          runInstanceId: fx.runInstanceId,
        }
      }
      return { kind: 'clear' as const }
    },
    /** The face, asked of the UNFILTERED notice — a hidden one still has one. */
    questExitFace: (binding: QuestExitBinding) => {
      if (binding.viewGeneration !== fx.viewGeneration) return null
      if (binding.kind !== 'partial') return null
      if (binding.runInstanceId && fx.runInstanceId && binding.runInstanceId !== fx.runInstanceId) {
        return null
      }
      if (
        fx.sourceState !== 'saving' &&
        fx.sourceState !== 'failed' &&
        fx.sourceState !== 'conflict'
      ) {
        return null
      }
      return { phase: fx.sourceState, generic: fx.noticeHidden }
    },
    graphSync: { state: 'idle' },
    recoveryScope: fx.recoveryScope,
    recoveryEpoch: fx.recoveryEpoch,
    viewGeneration: fx.viewGeneration,
    resumeReloadNonce: fx.resumeReloadNonce,
    questDomain: 'reading',
    retrySourceSave: fx.retrySourceSave,
    retryGraphProjection: async () => 'identity-mismatch' as const,
    startQuest: fx.startQuest,
    resumeSession: fx.resumeSession,
    discardPartial: async () => 'missing' as const,
    resetToIntro: fx.resetToIntro,
    submitAnswer: () => {},
    handleSkip: () => {},
  }),
}))

vi.mock('../../core/xp/useXpLedger', () => ({
  useXpLedger: () => ({ loading: true, totalXp: 0, armorTier: { color: '#fff', title: 'Wood' } }),
}))
vi.mock('./FluencyPractice', () => ({ default: () => null }))
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
    // Only one of the page's two reads from this collection is the Resume
    // card's; the graph-recovery read finds nothing here.
    if (!constraints.some((c) => c.kind === 'where' && c.field === 'status')) return { docs: [] }
    return { docs: fx.resumeRows.map((row) => ({ id: row.id as string, data: () => row })) }
  },
}))

const NOW = new Date().toISOString()

/** An older acknowledged partial — the row the Resume card is drawn for. */
const OLDER_PARTIAL = {
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

/** The village's offer, as the journey carries it. */
const READING_SUGGESTION = {
  conceptId: 'reading.phonics.cvc',
  domain: 'reading' as const,
  questMode: 'phonics' as const,
  label: MINE_READING_DIG_LABEL,
  source: 'ask' as const,
}

function beginTrip() {
  return beginLibraryReturnFlow({
    familyId: 'fam-1',
    childId: 'lincoln',
    missionId: '',
    origin: LibraryReturnOrigin.Town,
    destination: LibraryReturnDestination.Mine,
    focus: LibraryReturnFocus.SquareInvitation,
    suggestion: READING_SUGGESTION as never,
    observedEpoch: getLibraryIdentityEpoch(),
  })
}

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

/** Let the resume read, the handlers and their continuations settle. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const dialog = () => screen.getByRole('dialog')
const noDialog = () =>
  waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
const stayButton = () => within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.stay })
const startAnywayButton = () =>
  within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.start })
const resumeAnywayButton = () =>
  within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.resume })
const doorRetry = () => within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry })
/** The intro's OWN retry card, which every refusal must leave on screen. */
const screenRetry = () =>
  screen
    .getAllByRole('button', { name: QUEST_SOURCE_COPY.retry })
    .filter((b) => !b.closest('[role="dialog"]'))
const phonicsCard = () => screen.getByRole('button', { name: /Phonics Quest/ })
const suggestedCard = () =>
  screen.getByRole('button', { name: new RegExp(MINE_READING_DIG_LABEL) })
const resumeCard = () => screen.queryByRole('button', { name: /Pick up where you left off/ })

/** A denied partial write, with its payload still held and retryable. */
function deniedPartial() {
  fx.sourceState = 'failed'
  fx.canRetry = true
}

beforeEach(() => {
  fx.screen = QuestScreen.Intro
  fx.sourceState = 'idle'
  fx.canRetry = false
  fx.noticeHidden = false
  fx.runInstanceId = 'run-1'
  fx.recoveryScope = 'fam-1|lincoln|child|1'
  fx.recoveryEpoch = getLibraryIdentityEpoch()
  fx.viewGeneration = 7
  fx.startQuestError = null
  fx.resumeReloadNonce = 0
  fx.resumeRows = []
  fx.startQuest.mockClear()
  fx.resumeSession.mockReset()
  fx.resumeSession.mockResolvedValue(true)
  fx.retrySourceSave.mockClear()
  fx.resetToIntro.mockClear()
  endLibraryReturnFlow()
})

afterEach(() => {
  endLibraryReturnFlow()
})

describe('an intro that owes nothing starts and resumes exactly as it always did', () => {
  it('lets an ordinary mode card through without asking', async () => {
    renderMine()
    await flush()
    fireEvent.click(phonicsCard())

    await noDialog()
    expect(fx.startQuest).toHaveBeenCalledTimes(1)
    expect(fx.startQuest).toHaveBeenCalledWith('reading', 'phonics')
  })

  it('lets the suggested dig through without asking', async () => {
    beginTrip()
    renderMine()
    await flush()
    fireEvent.click(suggestedCard())

    await noDialog()
    expect(fx.startQuest).toHaveBeenCalledTimes(1)
    expect(fx.startQuest).toHaveBeenCalledWith('reading', 'phonics')
  })

  /**
   * And an ACKNOWLEDGED partial is the ordinary case too: it survives another
   * Start and is still offered, which is why a saved notice holds nothing.
   */
  it('lets a Resume through while the last partial is safely saved', async () => {
    fx.sourceState = 'saved'
    fx.resumeRows = [OLDER_PARTIAL]
    renderMine()
    await flush()
    fireEvent.click(resumeCard()!)

    await noDialog()
    await flush()
    expect(fx.resumeSession).toHaveBeenCalledTimes(1)
    expect(fx.resumeSession).toHaveBeenCalledWith(expect.objectContaining({ id: OLDER_PARTIAL.id }))
  })
})

describe('a denied partial holds the intro’s own replacements', () => {
  it('holds the ordinary mode card, and starts nothing', async () => {
    deniedPartial()
    renderMine()
    await flush()
    fireEvent.click(phonicsCard())

    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.failedTitle)).toBeInTheDocument()
    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.replaceWarning)).toBeInTheDocument()
    expect(startAnywayButton()).toBeInTheDocument()
    expect(fx.startQuest).not.toHaveBeenCalled()
  })

  it('holds the suggested dig, and starts nothing', async () => {
    deniedPartial()
    beginTrip()
    renderMine()
    await flush()
    fireEvent.click(suggestedCard())

    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.failedTitle)).toBeInTheDocument()
    expect(fx.startQuest).not.toHaveBeenCalled()
  })

  /** The error retry is a Start too, and it is reachable on this screen. */
  it('holds the error Try Again, and starts nothing', async () => {
    const view = renderMine()
    await flush()
    // A mode is selected the only way the error retry can have one: a Start.
    fireEvent.click(phonicsCard())
    fx.startQuest.mockClear()
    fx.startQuestError = 'The quest could not start.'
    deniedPartial()
    view.rerender(mineElement())
    await flush()

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
    expect(dialog()).toBeInTheDocument()
    expect(fx.startQuest).not.toHaveBeenCalled()
  })

  /**
   * The verified older-Resume case: an older acknowledged partial is offered
   * while the NEWER dig's own write has been denied, and tapping Resume used to
   * take the newer payload's Retry with it.
   */
  it('holds the older Resume, and claims nothing', async () => {
    deniedPartial()
    fx.resumeRows = [OLDER_PARTIAL]
    renderMine()
    await flush()
    fireEvent.click(resumeCard()!)

    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.failedTitle)).toBeInTheDocument()
    expect(resumeAnywayButton()).toBeInTheDocument()
    expect(fx.resumeSession).not.toHaveBeenCalled()
  })

  it('holds the older Resume while the write is still SAVING, with no retry', async () => {
    fx.sourceState = 'saving'
    fx.canRetry = false
    fx.resumeRows = [OLDER_PARTIAL]
    renderMine()
    await flush()
    fireEvent.click(resumeCard()!)

    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.savingTitle)).toBeInTheDocument()
    expect(
      within(dialog()).queryByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry }),
    ).toBeNull()
    expect(resumeAnywayButton()).toBeInTheDocument()
    expect(fx.resumeSession).not.toHaveBeenCalled()
  })

  /** Nothing to retry: a different run owns that id, so the dig is the move. */
  it('holds a conflict with no retry at all', async () => {
    fx.sourceState = 'conflict'
    renderMine()
    await flush()
    fireEvent.click(phonicsCard())

    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.conflictTitle)).toBeInTheDocument()
    expect(
      within(dialog()).queryByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry }),
    ).toBeNull()
    expect(startAnywayButton()).toBeInTheDocument()
  })

  /**
   * A held notice that is not this viewer's gets the ownerless face and no
   * Retry — the payload belongs to the child who made it, on his own screen —
   * and the dig is still his to take deliberately.
   */
  it('shows the generic face, and no retry, where the notice is hidden', async () => {
    deniedPartial()
    fx.noticeHidden = true
    renderMine()
    await flush()
    fireEvent.click(phonicsCard())

    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.genericTitle)).toBeInTheDocument()
    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.genericReplaceWarning)).toBeInTheDocument()
    expect(
      within(dialog()).queryByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry }),
    ).toBeNull()
    expect(startAnywayButton()).toBeInTheDocument()
    expect(fx.startQuest).not.toHaveBeenCalled()
  })

  it('still holds a denied partial under StrictMode, and still starts after it', async () => {
    deniedPartial()
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/quest']}>
          <KnowledgeMinePage />
        </MemoryRouter>
      </StrictMode>,
    )
    await flush()
    fireEvent.click(phonicsCard())
    expect(dialog()).toBeInTheDocument()
    expect(fx.startQuest).not.toHaveBeenCalled()

    fireEvent.click(startAnywayButton())
    await noDialog()
    expect(fx.startQuest).toHaveBeenCalledTimes(1)
  })
})

describe('what the held door does', () => {
  it('keeps the payload on a stay, and starts nothing', async () => {
    deniedPartial()
    renderMine()
    await flush()
    fireEvent.click(phonicsCard())
    fireEvent.click(stayButton())

    await noDialog()
    expect(fx.startQuest).not.toHaveBeenCalled()
    // The intro's own Retry — the only control that can land those answers.
    expect(screenRetry()).toHaveLength(1)
  })

  it('treats Escape as staying', async () => {
    deniedPartial()
    renderMine()
    await flush()
    fireEvent.click(phonicsCard())
    fireEvent.keyDown(dialog(), { key: 'Escape', code: 'Escape' })

    await noDialog()
    expect(fx.startQuest).not.toHaveBeenCalled()
    expect(screenRetry()).toHaveLength(1)
  })

  /**
   * The Retry is the ORIGINAL payload's, named by its own run — never the
   * captured replacement's. It also must not start the new dig as a side
   * effect: the door waits for the outcome.
   */
  it('retries the exact original source, and starts nothing', async () => {
    deniedPartial()
    renderMine()
    await flush()
    fireEvent.click(phonicsCard())
    fireEvent.click(doorRetry())

    expect(fx.retrySourceSave).toHaveBeenCalledTimes(1)
    expect(fx.retrySourceSave).toHaveBeenCalledWith(
      expect.objectContaining({
        runInstanceId: 'run-1',
        scopeKey: 'fam-1|lincoln|child|1',
        epoch: fx.recoveryEpoch,
      }),
    )
    expect(fx.startQuest).not.toHaveBeenCalled()
    expect(dialog()).toBeInTheDocument()
  })

  /**
   * An acknowledged save closes the door and asks for a FRESH tap. It is not a
   * licence to run an action the child never saw resolve.
   */
  it('closes on an acknowledgement without starting anything', async () => {
    deniedPartial()
    const view = renderMine()
    await flush()
    fireEvent.click(phonicsCard())
    expect(dialog()).toBeInTheDocument()

    // The retry landed while the door was open.
    fx.sourceState = 'saved'
    fx.canRetry = false
    view.rerender(mineElement())

    await noDialog()
    expect(fx.startQuest).not.toHaveBeenCalled()

    // And the next tap is an ordinary Start.
    fireEvent.click(phonicsCard())
    await noDialog()
    expect(fx.startQuest).toHaveBeenCalledTimes(1)
  })

  it('performs the confirmed Start once, and not again from a retained tap', async () => {
    deniedPartial()
    renderMine()
    await flush()
    fireEvent.click(phonicsCard())
    const deliberate = startAnywayButton()
    const retained = retainedOnClick(deliberate)

    fireEvent.click(deliberate)
    await noDialog()
    expect(fx.startQuest).toHaveBeenCalledTimes(1)

    // The same handler again — a double tap, a replayed event — admits nothing.
    retained()
    expect(fx.startQuest).toHaveBeenCalledTimes(1)
  })

  it('performs the confirmed older Resume once, on its own row', async () => {
    deniedPartial()
    fx.resumeRows = [OLDER_PARTIAL]
    renderMine()
    await flush()
    fireEvent.click(resumeCard()!)
    fireEvent.click(resumeAnywayButton())

    await noDialog()
    await flush()
    expect(fx.resumeSession).toHaveBeenCalledTimes(1)
    expect(fx.resumeSession).toHaveBeenCalledWith(expect.objectContaining({ id: OLDER_PARTIAL.id }))
    // Nothing else was started in its place.
    expect(fx.startQuest).not.toHaveBeenCalled()
  })

  it('takes the confirmed suggested dig with its own journey still live', async () => {
    deniedPartial()
    beginTrip()
    renderMine()
    await flush()
    fireEvent.click(suggestedCard())
    fireEvent.click(startAnywayButton())

    await noDialog()
    expect(fx.startQuest).toHaveBeenCalledTimes(1)
    expect(fx.startQuest).toHaveBeenCalledWith('reading', 'phonics')
  })
})

describe('a Start retained from the PREVIOUS intro is inert', () => {
  /**
   * Sol's first blocker on the candidate repair. The callback was captured on
   * an intro, a different dig then ran and failed its partial save, and the
   * retained tap fired on the new intro: same family, same child, same scope,
   * so neither `startQuest`'s scope rail nor the claim could see anything
   * wrong. Only the view generation knows, and the first candidate let a
   * `stale` verdict through for Start/Resume — which started a real quest and
   * retired the held Retry.
   *
   * Nothing may run on `stale`, and nothing may be lost either.
   */
  it('starts nothing and keeps the held Retry', async () => {
    const view = renderMine()
    await flush()
    const retainedStart = retainedOnClick(phonicsCard())

    // A different dig ran and came back: a new view, and its partial denied.
    fx.viewGeneration = 8
    fx.runInstanceId = 'run-2'
    deniedPartial()
    view.rerender(mineElement())
    await flush()

    retainedStart()
    expect(fx.startQuest).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screenRetry()).toHaveLength(1)

    // And the FRESHLY rendered card for the same mode still works — held, then
    // confirmed. (The hook publishes its generation on every bump, so a current
    // control is never bound to a retired one.)
    fireEvent.click(phonicsCard())
    expect(dialog()).toBeInTheDocument()
    fireEvent.click(startAnywayButton())
    await noDialog()
    expect(fx.startQuest).toHaveBeenCalledTimes(1)
  })

  /** The same for a retained Resume: no claim, no refusal copy, no loss. */
  it('claims nothing from a retained Resume', async () => {
    fx.resumeRows = [OLDER_PARTIAL]
    const view = renderMine()
    await flush()
    const retainedResume = retainedOnClick(resumeCard()!)

    fx.viewGeneration = 8
    fx.runInstanceId = 'run-2'
    deniedPartial()
    view.rerender(mineElement())
    await flush()

    retainedResume()
    await flush()
    expect(fx.resumeSession).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screenRetry()).toHaveLength(1)
  })

  /**
   * A raw A → B → A leaves the scope string equal to itself, so the epoch is
   * the only evidence. A retained control carrying the old one is inert too.
   */
  it('is inert across a same-tick identity A → B → A', async () => {
    const view = renderMine()
    await flush()
    const retainedStart = retainedOnClick(phonicsCard())

    fx.recoveryEpoch = fx.recoveryEpoch + 1
    deniedPartial()
    view.rerender(mineElement())
    await flush()

    retainedStart()
    expect(fx.startQuest).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('a confirmation whose own control has moved does nothing', () => {
  /**
   * The journey can end while the door is open — a role change, a switch, a
   * readiness change — and a Start admitted behind the prompt re-reads it from
   * the STORE rather than from the closure the door was opened with.
   */
  it('refuses a confirmed suggested dig whose journey ended, keeping the retry', async () => {
    deniedPartial()
    beginTrip()
    renderMine()
    await flush()
    fireEvent.click(suggestedCard())

    act(() => {
      endLibraryReturnFlow()
    })
    fireEvent.click(startAnywayButton())

    await noDialog()
    expect(fx.startQuest).not.toHaveBeenCalled()
    // Refused is not lost: the held payload's own Retry is still on screen.
    expect(screenRetry()).toHaveLength(1)
  })

  /**
   * The Resume card is one exact stored row, and the newer partial landing is
   * what re-reads it. A row the child was never shown is not what he confirmed.
   */
  it('refuses a confirmed Resume whose row was replaced behind the door', async () => {
    deniedPartial()
    fx.resumeRows = [OLDER_PARTIAL]
    const view = renderMine()
    await flush()
    fireEvent.click(resumeCard()!)
    expect(dialog()).toBeInTheDocument()

    // A different saved point is now the one on offer.
    fx.resumeRows = [{ ...OLDER_PARTIAL, id: 'interactive_lincoln_777' }]
    fx.resumeReloadNonce = 1
    view.rerender(mineElement())
    await flush()

    fireEvent.click(resumeAnywayButton())
    await noDialog()
    expect(fx.resumeSession).not.toHaveBeenCalled()
    expect(screenRetry()).toHaveLength(1)
  })
})

/**
 * The `onClick` a RENDERED control is holding — captured, then invoked later.
 *
 * Clicking the node afterwards proves nothing once React has detached it, so
 * the retained callback is read off the element and called directly.
 */
function retainedOnClick(node: HTMLElement): () => void {
  const key = Object.keys(node).find((k) => k.startsWith('__reactProps$'))
  const props = (node as unknown as Record<string, { onClick?: () => void }>)[key!]
  const onClick = props?.onClick
  expect(typeof onClick).toBe('function')
  return () => {
    act(() => {
      onClick!()
    })
  }
}
