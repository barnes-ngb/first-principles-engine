import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LibraryReturnDestination,
  LibraryReturnFocus,
  LibraryReturnOrigin,
  LibraryReturnPhase,
  beginLibraryReturnFlow,
  endLibraryReturnFlow,
  getLibraryIdentityEpoch,
  getLibraryReturnFlow,
} from '../avatar/stonebridge/libraryReturnFlow'
import { MINE_RETURN_LABEL } from '../avatar/stonebridge/libraryReturnCopy'
import { QUEST_EXIT_GUARD_COPY, QUEST_SOURCE_COPY } from './questSaveCopy'
import { QuestScreen } from './questTypes'
import KnowledgeMinePage from './KnowledgeMinePage'

/**
 * UX-496 — leaving a finished quest whose answers have not landed.
 *
 * The baseline, reproduced on the released app: a denied source save left *Try
 * saving again* on the summary, and the exits beside it threw the held payload
 * away — re-entering the Mine found no source, no evidence, no Retry and no
 * Resume. Staying and retrying kept everything.
 *
 * So this file is about the three Mine-owned completion exits (*Back to
 * village*, *Done*, *Try another quest*) and the conditional practice-story
 * button that also departs. REAL here: the page's own gate, the real
 * `QuestSummary` with its real buttons, the real journey store and the real
 * dialog. Stubbed: the session hook, whose live hold is the one input the gate
 * reads, so each case is exactly one save phase.
 */

const fx = vi.hoisted(() => ({
  hold: 'clear' as 'clear' | 'saving' | 'failed' | 'conflict',
  sourceState: 'saved' as 'idle' | 'saving' | 'saved' | 'failed' | 'conflict',
  canRetry: false,
  graphState: 'reached' as 'idle' | 'pending' | 'running' | 'reached' | 'skipped' | 'failed',
  recoveryScope: 'fam-1|lincoln|child|1',
  recoveryEpoch: 1,
  viewGeneration: 7,
  strugglingWord: null as string | null,
  resetToIntro: vi.fn(),
  retrySourceSave: vi.fn(async () => 'saved' as const),
  exitHold: vi.fn(),
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
    screen: QuestScreen.Summary,
    questMode: 'phonics',
    questState: { totalCorrect: 5, currentLevel: 3, totalQuestions: 5, consecutiveWrong: 0 },
    currentQuestion: null,
    lastAnswer: null,
    answeredQuestions: fx.strugglingWord
      ? [
          {
            id: 'q1',
            type: 'multiple-choice',
            skill: 'phonics.word-reading',
            stimulus: fx.strugglingWord,
            correctAnswer: fx.strugglingWord,
            correct: false,
            skipped: false,
            flaggedAsError: false,
          },
        ]
      : [],
    findings: [],
    streak: { currentStreak: 0, lastQuestDate: null },
    hitLevelCap: false,
    startQuestError: null,
    aiError: null,
    sessionLeftItsChild: false,
    sessionOwnerName: 'Lincoln',
    sourceSave: { state: fx.sourceState, canRetry: fx.canRetry },
    visibleSourceSave: {
      state: fx.sourceState,
      canRetry: fx.canRetry,
      kind: 'final' as const,
      runInstanceId: 'run-1',
      viewGeneration: fx.viewGeneration,
    },
    graphSync: { state: fx.graphState, sessionId: 'sess-1', childId: 'lincoln' },
    recoveryScope: fx.recoveryScope,
    recoveryEpoch: fx.recoveryEpoch,
    viewGeneration: fx.viewGeneration,
    resumeReloadNonce: 0,
    questDomain: 'reading',
    // The live hold — the whole input to the gate.
    sourceSaveExitHold: (expect?: { runInstanceId?: string }) => {
      fx.exitHold(expect)
      return fx.hold
    },
    retrySourceSave: fx.retrySourceSave,
    retryGraphProjection: async () => 'identity-mismatch' as const,
    startQuest: vi.fn(),
    resumeSession: vi.fn(),
    discardPartial: async () => 'missing' as const,
    resetToIntro: fx.resetToIntro,
    submitAnswer: () => {},
    handleSkip: () => {},
  }),
}))

vi.mock('../../core/xp/useXpLedger', () => ({
  useXpLedger: () => ({ loading: false, totalXp: 10, armorTier: { color: '#fff', title: 'Wood' } }),
}))
vi.mock('./FluencyPractice', () => ({ default: () => null }))
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
  getDocs: async () => ({ docs: [] }),
  query: () => ({}),
  updateDoc: async () => {},
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  runTransaction: async () => undefined,
}))

function PathProbe() {
  const { pathname } = useLocation()
  return <div data-testid="path">{pathname}</div>
}

function mineElement() {
  return (
    <MemoryRouter initialEntries={['/quest']}>
      <KnowledgeMinePage />
      <PathProbe />
    </MemoryRouter>
  )
}

function renderMine() {
  return render(mineElement())
}

function beginTrip() {
  return beginLibraryReturnFlow({
    familyId: 'fam-1',
    childId: 'lincoln',
    missionId: '',
    origin: LibraryReturnOrigin.Town,
    destination: LibraryReturnDestination.Mine,
    focus: LibraryReturnFocus.SquareInvitation,
    suggestion: null,
    observedEpoch: getLibraryIdentityEpoch(),
  })
}

const path = () => screen.getByTestId('path').textContent
const dialog = () => screen.getByRole('dialog')
const noDialog = () => expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
const villageButton = () => screen.getByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })
const doneButton = () => screen.getByRole('button', { name: 'Done' })
const tryAnotherButton = () => screen.getByRole('button', { name: 'Try another quest' })
/** The summary's OWN same-source retry, which must survive every stay. */
const summaryRetry = () =>
  screen
    .getAllByRole('button', { name: QUEST_SOURCE_COPY.retry })
    .filter((b) => !b.closest('[role="dialog"]'))

/** A denied source save, with its payload still held and retryable. */
function deniedSave() {
  fx.hold = 'failed'
  fx.sourceState = 'failed'
  fx.canRetry = true
}

beforeEach(() => {
  fx.hold = 'clear'
  fx.sourceState = 'saved'
  fx.canRetry = false
  fx.graphState = 'reached'
  fx.recoveryScope = 'fam-1|lincoln|child|1'
  fx.recoveryEpoch = 1
  fx.viewGeneration = 7
  fx.strugglingWord = null
  fx.resetToIntro.mockClear()
  fx.retrySourceSave.mockClear()
  fx.exitHold.mockClear()
  endLibraryReturnFlow()
})

afterEach(() => {
  endLibraryReturnFlow()
})

describe('an ordinary saved quest leaves exactly as it always did', () => {
  it('lets Done through without asking', () => {
    renderMine()
    fireEvent.click(doneButton())
    noDialog()
    expect(fx.resetToIntro).toHaveBeenCalledTimes(1)
    expect(path()).toBe('/today')
  })

  it('lets Try another quest through without asking', () => {
    renderMine()
    fireEvent.click(tryAnotherButton())
    noDialog()
    expect(fx.resetToIntro).toHaveBeenCalledTimes(1)
    expect(path()).toBe('/quest')
  })

  it('lets Back to village through, and consumes the journey', () => {
    beginTrip()
    renderMine()
    fireEvent.click(villageButton())
    noDialog()
    expect(path()).not.toBe('/quest')
  })

  /**
   * The two successes stay apart (UX-494). A pending or failed MAP update is
   * not an unsaved quest: the answers committed, and the Mine's own recovery
   * card offers the map retry again after a village return and re-entry.
   */
  it('never holds the door for a graph-only failure', () => {
    fx.graphState = 'failed'
    renderMine()
    fireEvent.click(doneButton())
    noDialog()
    expect(path()).toBe('/today')
  })
})

describe('a denied source save holds every Mine-owned exit', () => {
  it('holds Back to village, leaves the journey unspent and keeps the summary', () => {
    beginTrip()
    deniedSave()
    renderMine()
    fireEvent.click(villageButton())

    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.failedTitle)).toBeInTheDocument()
    expect(path()).toBe('/quest')
    // Checked BEFORE the return state was mutated: the journey is still Away,
    // not Returning, so *Stay here* leaves a working way back. (A consumed
    // request would also take the button off the screen.)
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Away)
    expect(fx.resetToIntro).not.toHaveBeenCalled()

    fireEvent.click(within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.stay }))
    expect(villageButton()).toBeInTheDocument()
  })

  it('holds Done without resetting the session', () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())
    expect(dialog()).toBeInTheDocument()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')
  })

  it('holds Try another quest without resetting the session', () => {
    deniedSave()
    renderMine()
    fireEvent.click(tryAnotherButton())
    expect(dialog()).toBeInTheDocument()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
  })

  /** The conditional practice-story button departs too, so it takes the gate. */
  it('holds the practice-story button', () => {
    deniedSave()
    fx.strugglingWord = 'cat'
    renderMine()
    fireEvent.click(screen.getByRole('button', { name: 'Generate a practice story' }))
    expect(dialog()).toBeInTheDocument()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')
  })

  it('asks about the run whose payload is held', () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())
    expect(fx.exitHold).toHaveBeenCalledWith({ runInstanceId: 'run-1' })
  })
})

describe('the door itself', () => {
  it('offers a safe stay that keeps the original summary and its retry', () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())
    fireEvent.click(within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.stay }))

    noDialog()
    expect(path()).toBe('/quest')
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    // The exact same-source retry, exactly where it was.
    expect(summaryRetry()).toHaveLength(1)
  })

  it('treats Escape as staying', () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())
    fireEvent.keyDown(dialog(), { key: 'Escape', code: 'Escape' })

    noDialog()
    expect(path()).toBe('/quest')
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(summaryRetry()).toHaveLength(1)
  })

  it('keeps the same-source retry reachable from the door', () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())
    fireEvent.click(within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry }))

    expect(fx.retrySourceSave).toHaveBeenCalledTimes(1)
    expect(fx.retrySourceSave.mock.calls[0][0]).toMatchObject({
      runInstanceId: 'run-1',
      scopeKey: 'fam-1|lincoln|child|1',
      epoch: 1,
    })
    // Nothing navigated, and nothing was reset, on a retry.
    expect(path()).toBe('/quest')
    expect(fx.resetToIntro).not.toHaveBeenCalled()
  })

  it("departs to the action's own destination on the deliberate tap", () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())
    fireEvent.click(within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.leave }))

    expect(fx.resetToIntro).toHaveBeenCalledTimes(1)
    expect(path()).toBe('/today')
  })

  it('preserves the village destination on the deliberate tap', () => {
    beginTrip()
    deniedSave()
    renderMine()
    fireEvent.click(villageButton())
    fireEvent.click(within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.leave }))

    expect(path()).not.toBe('/quest')
  })

  it('raises one prompt for a double tap, and departs once', () => {
    deniedSave()
    renderMine()
    // The SAME node both times — an open MUI dialog hides the page behind it
    // from a role query, and a double tap is two taps on one button anyway.
    const done = doneButton()
    fireEvent.click(done)
    fireEvent.click(done)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    fireEvent.click(within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.leave }))
    expect(fx.resetToIntro).toHaveBeenCalledTimes(1)
  })
})

describe('a save that is still in flight', () => {
  it('is a wait, not a failure — no retry, and the stay is the default', () => {
    fx.hold = 'saving'
    fx.sourceState = 'saving'
    fx.canRetry = false
    renderMine()
    fireEvent.click(doneButton())

    const d = dialog()
    expect(within(d).getByText(QUEST_EXIT_GUARD_COPY.savingTitle)).toBeInTheDocument()
    expect(within(d).queryByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry })).toBeNull()
    expect(within(d).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.stay })).toBeInTheDocument()
    // The honest escape is reachable mid-write: an in-flight write is not a
    // bounded wait, and the warning is what makes the choice informed.
    expect(within(d).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.leave })).toBeInTheDocument()
    expect(path()).toBe('/quest')
  })

  /**
   * The baseline's second loss: *Back to village* tapped while saving, and the
   * held save denying afterwards. The same held departure must turn into the
   * recovery door rather than departing or going quiet.
   */
  it('becomes the failed door, with its retry, when the held save denies', () => {
    fx.hold = 'saving'
    fx.sourceState = 'saving'
    const view = renderMine()
    fireEvent.click(doneButton())
    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.savingTitle)).toBeInTheDocument()

    deniedSave()
    view.rerender(mineElement())

    const d = dialog()
    expect(within(d).getByText(QUEST_EXIT_GUARD_COPY.failedTitle)).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry })).toBeInTheDocument()
    expect(path()).toBe('/quest')
    expect(fx.resetToIntro).not.toHaveBeenCalled()
  })

  it('closes its own door when the save lands, and waits for a fresh tap', () => {
    fx.hold = 'saving'
    fx.sourceState = 'saving'
    const view = renderMine()
    fireEvent.click(doneButton())
    expect(dialog()).toBeInTheDocument()

    fx.hold = 'clear'
    fx.sourceState = 'saved'
    view.rerender(mineElement())

    // No surprise navigation: the door closed, nothing departed.
    noDialog()
    expect(path()).toBe('/quest')
    expect(fx.resetToIntro).not.toHaveBeenCalled()

    // And the ordinary action is available again.
    fireEvent.click(doneButton())
    expect(fx.resetToIntro).toHaveBeenCalledTimes(1)
    expect(path()).toBe('/today')
  })
})

describe('a source conflict', () => {
  it('is not a success, and its only move is the honest escape', () => {
    fx.hold = 'conflict'
    fx.sourceState = 'conflict'
    fx.canRetry = false
    renderMine()
    fireEvent.click(doneButton())

    const d = dialog()
    expect(within(d).getByText(QUEST_EXIT_GUARD_COPY.conflictTitle)).toBeInTheDocument()
    // Nothing to re-send: another run owns this id.
    expect(within(d).queryByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry })).toBeNull()
    fireEvent.click(within(d).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.leave }))
    expect(fx.resetToIntro).toHaveBeenCalledTimes(1)
    expect(path()).toBe('/today')
  })
})

describe('a held intent is never revived', () => {
  it('is dropped when the scope moves, and navigates nowhere', () => {
    deniedSave()
    const view = renderMine()
    fireEvent.click(doneButton())
    expect(dialog()).toBeInTheDocument()

    fx.recoveryScope = 'fam-1|london|child|1'
    view.rerender(mineElement())

    noDialog()
    expect(path()).toBe('/quest')
    expect(fx.resetToIntro).not.toHaveBeenCalled()
  })

  /**
   * The same-tick `A → B → A`: family, child and profile end up exactly as
   * they were, so the scope string equals itself and only the epoch differs.
   */
  it('is dropped when the identity epoch moves under an equal scope', () => {
    deniedSave()
    const view = renderMine()
    fireEvent.click(doneButton())
    expect(dialog()).toBeInTheDocument()

    fx.recoveryEpoch = 2
    view.rerender(mineElement())

    noDialog()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
  })

  it('is dropped when a new run owns the view', () => {
    deniedSave()
    const view = renderMine()
    fireEvent.click(doneButton())
    expect(dialog()).toBeInTheDocument()

    fx.viewGeneration = 8
    view.rerender(mineElement())

    noDialog()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
  })
})
