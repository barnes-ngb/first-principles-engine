import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
import type { QuestExitBinding } from './useQuestSession'
import KnowledgeMinePage from './KnowledgeMinePage'

/**
 * UX-496 — leaving the Mine with answers that have not landed.
 *
 * Two baselines, both reproduced on the released app:
 *
 *   • a denied CLOSE: the summary showed *Try saving again*, and *Back to
 *     village*, *Done* and *Try another quest* threw the held payload away —
 *     re-entry found no source, no evidence, no Retry and no Resume;
 *   • a denied PARTIAL: *Back to mine* → intro → *Back to village*, on phone
 *     and tablet, lost the manual exit's payload the same way.
 *
 * And two corrections this file pins on top of them: an OLD *Done* must not
 * navigate after a re-entry even with the source acknowledged, and a RETAINED
 * *Leave anyway* must not navigate after a Stay, an Escape or an
 * acknowledgement.
 *
 * REAL here: the page's gate, the real `QuestSummary` with its real buttons,
 * the real journey store and the real door. Stubbed: the session hook, whose
 * verdict is the one input the gate reads — the verdict's own logic is pinned
 * against the real hook in `useQuestSession.saveRecovery.test.tsx`.
 */

const fx = vi.hoisted(() => ({
  screen: 'summary' as string,
  sourceState: 'saved' as 'idle' | 'saving' | 'saved' | 'failed' | 'conflict',
  saveKind: 'final' as 'final' | 'partial',
  canRetry: false,
  graphState: 'reached' as 'idle' | 'pending' | 'running' | 'reached' | 'skipped' | 'failed',
  runInstanceId: 'run-1' as string | undefined,
  recoveryScope: 'fam-1|lincoln|child|1',
  recoveryEpoch: 1,
  viewGeneration: 7,
  strugglingWord: null as string | null,
  resetToIntro: vi.fn(),
  retrySourceSave: vi.fn(async () => 'saved' as const),
  startQuest: vi.fn(),
  verdictAsked: vi.fn(),
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
    screen: fx.screen,
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
      kind: fx.saveKind,
      runInstanceId: fx.runInstanceId,
      viewGeneration: fx.viewGeneration,
      originalChildId: 'lincoln',
      originalFamilyId: 'fam-1',
    },
    graphSync: { state: fx.graphState, sessionId: 'sess-1', childId: 'lincoln' },
    recoveryScope: fx.recoveryScope,
    recoveryEpoch: fx.recoveryEpoch,
    viewGeneration: fx.viewGeneration,
    resumeReloadNonce: 0,
    questDomain: 'reading',
    /**
     * The real verdict's contract, mirrored: identity first (and a mismatch is
     * STALE, never clear), then this control's own payload phase.
     */
    questExitVerdict: (binding: QuestExitBinding) => {
      fx.verdictAsked(binding)
      if (
        binding.viewGeneration !== fx.viewGeneration ||
        binding.epoch !== fx.recoveryEpoch ||
        binding.scope !== fx.recoveryScope
      ) {
        return { kind: 'stale' as const }
      }
      if (
        binding.runInstanceId &&
        fx.runInstanceId &&
        binding.runInstanceId !== fx.runInstanceId
      ) {
        return { kind: 'stale' as const }
      }
      if (binding.kind !== fx.saveKind) return { kind: 'clear' as const }
      if (fx.sourceState === 'saving' || fx.sourceState === 'failed' || fx.sourceState === 'conflict') {
        return {
          kind: 'hold' as const,
          phase: fx.sourceState,
          canRetry: fx.canRetry,
          runInstanceId: fx.runInstanceId,
        }
      }
      return { kind: 'clear' as const }
    },
    retrySourceSave: fx.retrySourceSave,
    retryGraphProjection: async () => 'identity-mismatch' as const,
    startQuest: fx.startQuest,
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

/**
 * The `onClick` a RENDERED control is holding — captured, then invoked later.
 *
 * Clicking the node afterwards proves nothing (React detaches it, and an open
 * dialog hides the page behind it from a role query), so the retained callback
 * is read off the element and called directly. That is what Sol's old *Done*
 * was: a handler from a view that no longer exists.
 */
function retainedOnClick(node: HTMLElement): () => void {
  const key = Object.keys(node).find((k) => k.startsWith('__reactProps$'))
  const props = (node as unknown as Record<string, { onClick?: () => void }>)[key!]
  const onClick = props?.onClick
  expect(typeof onClick).toBe('function')
  // Wrapped the way `fireEvent` would be, so any state it does reach settles.
  return () => {
    act(() => {
      onClick!()
    })
  }
}

const path = () => screen.getByTestId('path').textContent
const dialog = () => screen.getByRole('dialog')
const noDialog = () => expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
const villageButton = () => screen.getByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })
const doneButton = () => screen.getByRole('button', { name: 'Done' })
const tryAnotherButton = () => screen.getByRole('button', { name: 'Try another quest' })
const stayButton = () => within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.stay })
const leaveButton = () => within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.leave })
/** The retry on the SCREEN behind the door, which must survive every stay. */
const screenRetry = () =>
  screen
    .getAllByRole('button', { name: QUEST_SOURCE_COPY.retry })
    .filter((b) => !b.closest('[role="dialog"]'))

/** A denied source save, with its payload still held and retryable. */
function deniedSave(kind: 'final' | 'partial' = 'final') {
  fx.saveKind = kind
  fx.sourceState = 'failed'
  fx.canRetry = true
}

beforeEach(() => {
  fx.screen = QuestScreen.Summary
  fx.sourceState = 'saved'
  fx.saveKind = 'final'
  fx.canRetry = false
  fx.graphState = 'reached'
  fx.runInstanceId = 'run-1'
  fx.recoveryScope = 'fam-1|lincoln|child|1'
  fx.recoveryEpoch = 1
  fx.viewGeneration = 7
  fx.strugglingWord = null
  fx.resetToIntro.mockClear()
  fx.retrySourceSave.mockClear()
  fx.startQuest.mockClear()
  fx.verdictAsked.mockClear()
  endLibraryReturnFlow()
})

afterEach(() => {
  endLibraryReturnFlow()
})

describe('an acknowledged quest leaves exactly as it always did', () => {
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
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Returning)
  })

  it('keeps the practice-story handoff', () => {
    fx.strugglingWord = 'cat'
    renderMine()
    fireEvent.click(screen.getByRole('button', { name: 'Generate a practice story' }))
    noDialog()
    expect(fx.resetToIntro).toHaveBeenCalledTimes(1)
    expect(path()).toBe('/books/create-story')
  })

  it('leaves an ordinary intro return alone', () => {
    fx.screen = QuestScreen.Intro
    fx.sourceState = 'idle'
    beginTrip()
    renderMine()
    fireEvent.click(villageButton())
    noDialog()
    expect(path()).not.toBe('/quest')
  })

  /**
   * The two successes stay apart (UX-494). A failed MAP update is not an
   * unsaved quest: it is recoverable from the saved source after a village
   * return and re-entry, where the Mine's own recovery card offers it.
   */
  it('never holds the door for a graph-only failure', () => {
    fx.graphState = 'failed'
    renderMine()
    fireEvent.click(doneButton())
    noDialog()
    expect(path()).toBe('/today')
  })
})

describe('a denied close holds every Mine-owned completion exit', () => {
  it('holds Back to village, leaves the journey unspent and keeps the way back', () => {
    beginTrip()
    deniedSave()
    renderMine()
    fireEvent.click(villageButton())

    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.failedTitle)).toBeInTheDocument()
    expect(path()).toBe('/quest')
    // Asked BEFORE the trip was mutated: still Away, not Returning.
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Away)
    expect(fx.resetToIntro).not.toHaveBeenCalled()

    fireEvent.click(stayButton())
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

  it('holds the practice-story button, which also departs', () => {
    deniedSave()
    fx.strugglingWord = 'cat'
    renderMine()
    fireEvent.click(screen.getByRole('button', { name: 'Generate a practice story' }))
    expect(dialog()).toBeInTheDocument()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')
  })

  it('binds the question to its own render and payload', () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())
    expect(fx.verdictAsked).toHaveBeenCalledWith({
      kind: 'final',
      scope: 'fam-1|lincoln|child|1',
      epoch: 1,
      viewGeneration: 7,
      runInstanceId: 'run-1',
    })
  })
})

describe('the door itself', () => {
  it('puts focus on the safe action when it opens', () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())
    expect(stayButton()).toHaveFocus()
  })

  it('offers a stay that keeps the original summary and its retry', () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())
    fireEvent.click(stayButton())

    noDialog()
    expect(path()).toBe('/quest')
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(screenRetry()).toHaveLength(1)
  })

  it('treats Escape as staying', () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())
    fireEvent.keyDown(dialog(), { key: 'Escape', code: 'Escape' })

    noDialog()
    expect(path()).toBe('/quest')
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(screenRetry()).toHaveLength(1)
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
    // A retry neither departs nor resets, and the door waits for the outcome.
    expect(path()).toBe('/quest')
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(dialog()).toBeInTheDocument()
  })

  it("departs to the action's own destination on the deliberate tap", () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())
    fireEvent.click(leaveButton())

    expect(fx.resetToIntro).toHaveBeenCalledTimes(1)
    expect(path()).toBe('/today')
  })

  it('preserves the village destination on the deliberate tap', () => {
    beginTrip()
    deniedSave()
    renderMine()
    fireEvent.click(villageButton())
    fireEvent.click(leaveButton())

    expect(path()).not.toBe('/quest')
  })

  it('raises one prompt for a double tap, and departs once', () => {
    deniedSave()
    renderMine()
    const done = doneButton()
    fireEvent.click(done)
    fireEvent.click(done)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    const leave = retainedOnClick(leaveButton())
    leave()
    leave()
    expect(fx.resetToIntro).toHaveBeenCalledTimes(1)
  })
})

describe('a save that is still in flight', () => {
  it('is a wait, not a failure — no retry, and the escape is still honest', () => {
    fx.sourceState = 'saving'
    fx.canRetry = false
    renderMine()
    fireEvent.click(doneButton())

    const d = dialog()
    expect(within(d).getByText(QUEST_EXIT_GUARD_COPY.savingTitle)).toBeInTheDocument()
    expect(within(d).queryByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry })).toBeNull()
    expect(within(d).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.stay })).toBeInTheDocument()
    // Reachable mid-write: an in-flight write is not a bounded wait, and the
    // warning is what makes the choice informed.
    expect(within(d).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.leave })).toBeInTheDocument()
    expect(path()).toBe('/quest')
  })

  /** The baseline's second loss: the exit tapped while saving, denied after. */
  it('becomes the failed door, with its retry, when the held save denies', () => {
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
    fx.sourceState = 'saving'
    const view = renderMine()
    fireEvent.click(doneButton())
    expect(dialog()).toBeInTheDocument()

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
    fx.sourceState = 'conflict'
    fx.canRetry = false
    renderMine()
    fireEvent.click(doneButton())

    const d = dialog()
    expect(within(d).getByText(QUEST_EXIT_GUARD_COPY.conflictTitle)).toBeInTheDocument()
    // Nothing to re-send: another run owns this id.
    expect(within(d).queryByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry })).toBeNull()
    fireEvent.click(leaveButton())
    expect(fx.resetToIntro).toHaveBeenCalledTimes(1)
    expect(path()).toBe('/today')
  })
})

/**
 * Correction 1. Sol reproduced an OLD *Done* navigating after the same child
 * re-entered the Mine following a SAVED return. A stale handler is not a clean
 * departure, however healthy the current save looks.
 */
describe('a handler retained from a view that is gone', () => {
  it('does nothing when a new run owns the view, even with the source saved', () => {
    const view = renderMine()
    const staleDone = retainedOnClick(doneButton())

    fx.viewGeneration = 8
    view.rerender(mineElement())

    staleDone()
    noDialog()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')
  })

  it('does nothing after a same-tick A -> B -> A, under an equal scope', () => {
    const view = renderMine()
    const staleDone = retainedOnClick(doneButton())

    fx.recoveryEpoch = 2
    view.rerender(mineElement())

    staleDone()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')
  })

  it('does nothing after the scope moved to a sibling', () => {
    const view = renderMine()
    const staleDone = retainedOnClick(doneButton())

    fx.recoveryScope = 'fam-1|london|child|1'
    view.rerender(mineElement())

    staleDone()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')
  })

  it('does not consume the trip on a refused village return', () => {
    beginTrip()
    const view = renderMine()
    const staleReturn = retainedOnClick(villageButton())

    fx.viewGeneration = 8
    view.rerender(mineElement())

    staleReturn()
    expect(path()).toBe('/quest')
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Away)
  })

  it('does nothing when its payload is not the one on screen', () => {
    const view = renderMine()
    const staleDone = retainedOnClick(doneButton())

    // A newer run's payload holds the slot now.
    fx.runInstanceId = 'run-2'
    view.rerender(mineElement())

    staleDone()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')
  })
})

/**
 * Correction 2. A retained *Leave anyway* must not be able to navigate after
 * the intent it was raised for is gone.
 */
describe('a retained deliberate departure', () => {
  it('cannot navigate after a stay', () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())
    const leave = retainedOnClick(leaveButton())
    fireEvent.click(stayButton())

    leave()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')
  })

  it('cannot navigate after Escape', () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())
    const leave = retainedOnClick(leaveButton())
    fireEvent.keyDown(dialog(), { key: 'Escape', code: 'Escape' })

    leave()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')
  })

  it('cannot navigate after the save is acknowledged', () => {
    deniedSave()
    const view = renderMine()
    fireEvent.click(doneButton())
    const leave = retainedOnClick(leaveButton())

    fx.sourceState = 'saved'
    fx.canRetry = false
    view.rerender(mineElement())
    noDialog()

    leave()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')
  })

  it('cannot navigate after the identity moved', () => {
    deniedSave()
    const view = renderMine()
    fireEvent.click(doneButton())
    const leave = retainedOnClick(leaveButton())

    fx.recoveryEpoch = 2
    view.rerender(mineElement())

    leave()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')
  })

  it('cannot navigate after the journey it was raised for ended', () => {
    beginTrip()
    deniedSave()
    renderMine()
    fireEvent.click(villageButton())
    const leave = retainedOnClick(leaveButton())

    act(() => {
      endLibraryReturnFlow()
    })
    leave()
    expect(path()).toBe('/quest')
  })

  it('refuses a stale retry from the door', () => {
    deniedSave()
    const view = renderMine()
    fireEvent.click(doneButton())
    const retry = retainedOnClick(
      within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry }),
    )

    fx.viewGeneration = 8
    view.rerender(mineElement())

    retry()
    expect(fx.retrySourceSave).not.toHaveBeenCalled()
  })
})

/**
 * Correction 4 — the same loss from the intro, which Sol reproduced on phone
 * and tablet: *Back to mine* → intro → *Back to village* with the manual
 * exit's partial still unsaved.
 */
describe("the owning intro's return, while its partial is unsaved", () => {
  beforeEach(() => {
    fx.screen = QuestScreen.Intro
    beginTrip()
  })

  it('is held while the partial write is still going', () => {
    fx.saveKind = 'partial'
    fx.sourceState = 'saving'
    renderMine()
    fireEvent.click(villageButton())

    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.savingTitle)).toBeInTheDocument()
    expect(path()).toBe('/quest')
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Away)
  })

  it('is held when the partial was denied, and the card keeps its retry', () => {
    deniedSave('partial')
    renderMine()
    fireEvent.click(villageButton())

    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.failedTitle)).toBeInTheDocument()
    fireEvent.click(stayButton())
    // The intro's own unsaved card, exactly where it was.
    expect(screenRetry().length).toBeGreaterThan(0)
    expect(path()).toBe('/quest')
  })

  it('lets the child go once a retry has landed, on a fresh tap', () => {
    deniedSave('partial')
    const view = renderMine()
    fireEvent.click(villageButton())
    fireEvent.click(within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry }))
    expect(fx.retrySourceSave).toHaveBeenCalledTimes(1)

    // The retry lands: the door closes and nothing departs on its own.
    fx.sourceState = 'saved'
    fx.canRetry = false
    view.rerender(mineElement())
    noDialog()
    expect(path()).toBe('/quest')

    fireEvent.click(villageButton())
    expect(path()).not.toBe('/quest')
  })

  it('leaves other intro actions alone', () => {
    deniedSave('partial')
    renderMine()
    // A mode card is not a departure: it is unguarded and still starts.
    fireEvent.click(screen.getAllByText('Phonics Quest')[0])
    noDialog()
  })
})
