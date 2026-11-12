import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

/** What the summary and the door both hand to the source retry. */
interface SourceRetryControl {
  runInstanceId?: string
  viewGeneration?: number
  scopeKey: string
  epoch: number
}

const fx = vi.hoisted(() => ({
  screen: 'summary' as string,
  sourceState: 'saved' as 'idle' | 'saving' | 'saved' | 'failed' | 'conflict',
  saveKind: 'final' as 'final' | 'partial',
  canRetry: false,
  /**
   * Is the held notice HIDDEN from whoever is looking? The released case is a
   * denied final save followed by a switch to a sibling's profile: the bound
   * summary stays mounted, the real notice (and so the hold) is unchanged, and
   * `visibleSourceSave` goes idle. See `useQuestSession`'s `noticeIsVisible`.
   */
  noticeHidden: false,
  graphState: 'reached' as 'idle' | 'pending' | 'running' | 'reached' | 'skipped' | 'failed',
  runInstanceId: 'run-1' as string | undefined,
  recoveryScope: 'fam-1|lincoln|child|1',
  recoveryEpoch: 1,
  viewGeneration: 7,
  strugglingWord: null as string | null,
  resetToIntro: vi.fn(),
  // Typed with the control it is actually called with — the `addDiamondEvent`
  // shape in `useQuestSession.saveRecovery.test.tsx`. A zero-argument mock
  // signature makes both `mock.calls[0][0]` and a one-argument
  // `toHaveBeenCalledWith` a type error.
  retrySourceSave: vi.fn<(control: SourceRetryControl) => Promise<'saved'>>(
    async () => 'saved' as const,
  ),
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
    visibleSourceSave: fx.noticeHidden
      ? // Exactly what the hook publishes for a notice this viewer may not see.
        { state: 'idle' as const, canRetry: false }
      : {
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
    /**
     * The real face's contract, mirrored: the payload half asked of the
     * UNFILTERED notice — so a hidden one still has a face — and visibility
     * deciding only whether that face is the ownerless `generic` one.
     */
    questExitFace: (binding: QuestExitBinding) => {
      if (binding.viewGeneration !== fx.viewGeneration) return null
      if (binding.kind !== fx.saveKind) return null
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
/**
 * The door is gone — awaited, not asserted on the spot.
 *
 * It also has to be awaited BEFORE anything behind the door is queried: while
 * a dialog is up, MUI marks the page behind it `aria-hidden`, so a role query
 * for the summary's own Retry would find nothing even though it is there.
 */
const noDialog = () =>
  waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
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
  fx.noticeHidden = false
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
  it('lets Done through without asking', async () => {
    renderMine()
    fireEvent.click(doneButton())
    await noDialog()
    expect(fx.resetToIntro).toHaveBeenCalledTimes(1)
    expect(path()).toBe('/today')
  })

  it('lets Try another quest through without asking', async () => {
    renderMine()
    fireEvent.click(tryAnotherButton())
    await noDialog()
    expect(fx.resetToIntro).toHaveBeenCalledTimes(1)
    expect(path()).toBe('/quest')
  })

  it('lets Back to village through, and consumes the journey', async () => {
    beginTrip()
    renderMine()
    fireEvent.click(villageButton())
    await noDialog()
    expect(path()).not.toBe('/quest')
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Returning)
  })

  it('keeps the practice-story handoff', async () => {
    fx.strugglingWord = 'cat'
    renderMine()
    fireEvent.click(screen.getByRole('button', { name: 'Generate a practice story' }))
    await noDialog()
    expect(fx.resetToIntro).toHaveBeenCalledTimes(1)
    expect(path()).toBe('/books/create-story')
  })

  it('leaves an ordinary intro return alone', async () => {
    fx.screen = QuestScreen.Intro
    fx.sourceState = 'idle'
    beginTrip()
    renderMine()
    fireEvent.click(villageButton())
    await noDialog()
    expect(path()).not.toBe('/quest')
  })

  /**
   * Correction 1 — the confirmed StrictMode dead exit. `main.tsx` renders the
   * app inside `StrictMode`, so every mount is mount → cleanup → mount. A
   * mounted-ref that is only ever CLEARED stays false after that second setup,
   * and then every guarded exit on this page silently does nothing. This is
   * the positive case: the real app's own render mode, and the exit works.
   */
  it('still leaves under StrictMode, which is how the app renders', async () => {
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/quest']}>
          <KnowledgeMinePage />
          <PathProbe />
        </MemoryRouter>
      </StrictMode>,
    )
    fireEvent.click(doneButton())
    await noDialog()
    expect(fx.resetToIntro).toHaveBeenCalled()
    expect(path()).toBe('/today')
  })

  it('still holds a denied close under StrictMode', async () => {
    deniedSave()
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/quest']}>
          <KnowledgeMinePage />
          <PathProbe />
        </MemoryRouter>
      </StrictMode>,
    )
    fireEvent.click(doneButton())

    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.failedTitle)).toBeInTheDocument()
    expect(fx.resetToIntro).not.toHaveBeenCalled()

    // And the deliberate departure still works from that door.
    fireEvent.click(leaveButton())
    await noDialog()
    expect(fx.resetToIntro).toHaveBeenCalledTimes(1)
    expect(path()).toBe('/today')
  })

  /**
   * The two successes stay apart (UX-494). A failed MAP update is not an
   * unsaved quest: it is recoverable from the saved source after a village
   * return and re-entry, where the Mine's own recovery card offers it.
   */
  it('never holds the door for a graph-only failure', async () => {
    fx.graphState = 'failed'
    renderMine()
    fireEvent.click(doneButton())
    await noDialog()
    expect(path()).toBe('/today')
  })
})

describe('a denied close holds every Mine-owned completion exit', () => {
  it('holds Back to village, leaves the journey unspent and keeps the way back', async () => {
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
    await noDialog()
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

  it('offers a stay that keeps the original summary and its retry', async () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())
    fireEvent.click(stayButton())

    await noDialog()
    expect(path()).toBe('/quest')
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(screenRetry()).toHaveLength(1)
  })

  it('treats Escape as staying', async () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())
    fireEvent.keyDown(dialog(), { key: 'Escape', code: 'Escape' })

    await noDialog()
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
    expect(fx.retrySourceSave).toHaveBeenCalledWith(
      expect.objectContaining({
        runInstanceId: 'run-1',
        scopeKey: 'fam-1|lincoln|child|1',
        epoch: 1,
      }),
    )
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

  it('closes its own door when the save lands, and waits for a fresh tap', async () => {
    fx.sourceState = 'saving'
    const view = renderMine()
    fireEvent.click(doneButton())
    expect(dialog()).toBeInTheDocument()

    fx.sourceState = 'saved'
    view.rerender(mineElement())

    // No surprise navigation: the door closed, nothing departed.
    await noDialog()
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
 * Correction 2 — a hold must never be invisible.
 *
 * The released sequence: a final save is denied, the summary keeps its *Try
 * saving again*, and the family switches to a SIBLING's profile. The bound
 * summary stays mounted and the held notice is untouched, so a freshly rendered
 * *Done* is still `hold` — the verdict reads the real notice — but the notice
 * is hidden from this viewer, so the door drawn from `visibleSourceSave` was
 * null. The tap did nothing, visibly, and so did every repeat.
 *
 * What the door may SAY there is the other half: the payload is the original
 * child's, so the sibling's screen gets the ownerless face — no phase, no owner
 * and no Retry — and the same stay-or-leave choice.
 */
describe('a held exit whose notice is hidden from this viewer', () => {
  /** Hidden, and still held: the sibling is active on the original's summary. */
  function siblingLooking() {
    deniedSave()
    fx.noticeHidden = true
    fx.recoveryScope = 'fam-1|london|child|1'
  }

  it('still opens a door for Done instead of swallowing the tap', () => {
    siblingLooking()
    renderMine()
    fireEvent.click(doneButton())

    const d = dialog()
    expect(within(d).getByText(QUEST_EXIT_GUARD_COPY.genericTitle)).toBeInTheDocument()
    expect(within(d).getByText(QUEST_EXIT_GUARD_COPY.genericBody)).toBeInTheDocument()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')
  })

  it('still opens a door for Try another quest', () => {
    siblingLooking()
    renderMine()
    fireEvent.click(tryAnotherButton())
    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.genericTitle)).toBeInTheDocument()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
  })

  it('still opens a door for Back to village, and leaves the journey alone', () => {
    siblingLooking()
    beginTrip()
    renderMine()
    fireEvent.click(villageButton())
    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.genericTitle)).toBeInTheDocument()
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Away)
    expect(path()).toBe('/quest')
  })

  /** Nothing of the owner's: not his phase, not his answers, not his Retry. */
  it('tells the sibling nothing about the original child or his retry', () => {
    siblingLooking()
    renderMine()
    fireEvent.click(doneButton())

    const d = dialog()
    expect(within(d).queryByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry })).toBeNull()
    expect(within(d).queryByText(QUEST_EXIT_GUARD_COPY.failedTitle)).toBeNull()
    expect(within(d).queryByText(QUEST_EXIT_GUARD_COPY.failedBody)).toBeNull()
    expect(d.textContent).not.toContain('Lincoln')
    // And a retained Retry callback cannot re-send the original's payload.
    fireEvent.click(stayButton())
    expect(fx.retrySourceSave).not.toHaveBeenCalled()
  })

  it('says nothing of the owner while his save is merely in flight', () => {
    siblingLooking()
    fx.sourceState = 'saving'
    fx.canRetry = false
    renderMine()
    fireEvent.click(doneButton())

    const d = dialog()
    expect(within(d).getByText(QUEST_EXIT_GUARD_COPY.genericTitle)).toBeInTheDocument()
    expect(within(d).queryByText(QUEST_EXIT_GUARD_COPY.savingTitle)).toBeNull()
  })

  it('closes on Stay, and the exit is a fresh tap again', async () => {
    siblingLooking()
    renderMine()
    fireEvent.click(doneButton())
    fireEvent.click(stayButton())
    await noDialog()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')

    fireEvent.click(doneButton())
    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.genericTitle)).toBeInTheDocument()
  })

  it('takes the deliberate departure', async () => {
    siblingLooking()
    renderMine()
    fireEvent.click(doneButton())
    fireEvent.click(leaveButton())
    await noDialog()
    expect(fx.resetToIntro).toHaveBeenCalledTimes(1)
    expect(path()).toBe('/today')
  })

  /**
   * The phase is read LIVE, not captured at the tap: an acknowledgement while
   * the generic door is open closes it, and nothing departs on its own.
   */
  it('closes itself when the hidden save lands', async () => {
    siblingLooking()
    const view = renderMine()
    fireEvent.click(doneButton())
    expect(dialog()).toBeInTheDocument()

    fx.sourceState = 'saved'
    fx.canRetry = false
    view.rerender(mineElement())

    await noDialog()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')
  })

  /** A retained *Leave anyway* must not depart once the save is acknowledged. */
  it('refuses a retained departure after the hidden save lands', async () => {
    siblingLooking()
    const view = renderMine()
    fireEvent.click(doneButton())
    const leave = retainedOnClick(leaveButton())

    fx.sourceState = 'saved'
    fx.canRetry = false
    view.rerender(mineElement())

    leave()
    await noDialog()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')
  })

  /** And a stale control is still stale: a retired view speaks for nobody. */
  it('does nothing for a handler from a view that is gone', async () => {
    siblingLooking()
    const view = renderMine()
    const staleDone = retainedOnClick(doneButton())

    fx.viewGeneration = 8
    view.rerender(mineElement())

    staleDone()
    await noDialog()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')
  })

  /**
   * Back on the ORIGINAL child's own screen the notice is visible again, and
   * everything his door owes him — the real phase and his Retry — is there.
   */
  it('gives the original child his own phase and Retry back', () => {
    deniedSave()
    renderMine()
    fireEvent.click(doneButton())

    const d = dialog()
    expect(within(d).getByText(QUEST_EXIT_GUARD_COPY.failedTitle)).toBeInTheDocument()
    expect(within(d).queryByText(QUEST_EXIT_GUARD_COPY.genericTitle)).toBeNull()
    fireEvent.click(within(d).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry }))
    expect(fx.retrySourceSave).toHaveBeenCalledTimes(1)
  })
})

/**
 * Correction 1. Sol reproduced an OLD *Done* navigating after the same child
 * re-entered the Mine following a SAVED return. A stale handler is not a clean
 * departure, however healthy the current save looks.
 */
describe('a handler retained from a view that is gone', () => {
  it('does nothing when a new run owns the view, even with the source saved', async () => {
    const view = renderMine()
    const staleDone = retainedOnClick(doneButton())

    fx.viewGeneration = 8
    view.rerender(mineElement())

    staleDone()
    await noDialog()
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

  it('cannot navigate after the save is acknowledged', async () => {
    deniedSave()
    const view = renderMine()
    fireEvent.click(doneButton())
    const leave = retainedOnClick(leaveButton())

    fx.sourceState = 'saved'
    fx.canRetry = false
    view.rerender(mineElement())
    await noDialog()

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
 * Correction 2 — one prompt's callbacks belong to that prompt.
 *
 * The door's Retry, Stay and Leave used to act on whatever the intent ref
 * happened to hold, so a callback captured while prompt A was up could clear,
 * retry or depart for prompt B. And a retired-but-hidden A must not block B
 * from opening at all.
 */
describe('a second prompt, raised after the first was retired', () => {
  it('opens for a fresh exit, and the old prompt cannot touch it', async () => {
    deniedSave()
    const view = renderMine()

    // Prompt A, over the denial. Both of its callbacks are kept in hand.
    fireEvent.click(doneButton())
    const oldStay = retainedOnClick(stayButton())
    const oldLeave = retainedOnClick(leaveButton())

    // The save lands. The door closes, and A is retired — but still sitting in
    // the ref behind it, which is exactly what used to block the next prompt.
    fx.sourceState = 'saved'
    fx.canRetry = false
    view.rerender(mineElement())
    await noDialog()

    // A new run, a new denial, and a fresh exit tap.
    fx.viewGeneration = 9
    fx.runInstanceId = 'run-2'
    deniedSave()
    view.rerender(mineElement())
    fireEvent.click(doneButton())

    // Prompt B is up: the retired A did not stand in its way.
    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.failedTitle)).toBeInTheDocument()

    // A's Stay must not dismiss B…
    oldStay()
    expect(dialog()).toBeInTheDocument()
    // …and A's Leave must not depart for it.
    oldLeave()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(path()).toBe('/quest')

    // B's own Stay still works, and leaves B's screen and retry alone.
    fireEvent.click(stayButton())
    await noDialog()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
    expect(screenRetry()).toHaveLength(1)
  })

  it("does not let an old prompt's Retry re-send under a newer one", async () => {
    deniedSave()
    const view = renderMine()
    fireEvent.click(doneButton())
    const oldRetry = retainedOnClick(
      within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry }),
    )

    fx.sourceState = 'saved'
    fx.canRetry = false
    view.rerender(mineElement())
    await noDialog()

    fx.viewGeneration = 9
    fx.runInstanceId = 'run-2'
    deniedSave()
    view.rerender(mineElement())
    fireEvent.click(doneButton())

    oldRetry()
    expect(fx.retrySourceSave).not.toHaveBeenCalled()
    // B's own Retry is the one that works, for B's own payload.
    fireEvent.click(within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry }))
    expect(fx.retrySourceSave).toHaveBeenCalledTimes(1)
    expect(fx.retrySourceSave).toHaveBeenCalledWith(
      expect.objectContaining({ runInstanceId: 'run-2' }),
    )
  })

  /** A prompt that is still real keeps the first tap, exactly as before. */
  it('keeps a still-live prompt rather than replacing it', async () => {
    deniedSave()
    renderMine()
    // Captured before the door goes up: an open dialog marks the page behind
    // it aria-hidden, so a role query would not find this button.
    const another = tryAnotherButton()
    fireEvent.click(doneButton())
    const firstStay = retainedOnClick(stayButton())

    // A second guarded exit while the first prompt is up changes nothing.
    fireEvent.click(another)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    // And the first prompt's own Stay is still the live one.
    firstStay()
    await noDialog()
    expect(fx.resetToIntro).not.toHaveBeenCalled()
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

  it('is held when the partial was denied, and the card keeps its retry', async () => {
    deniedSave('partial')
    renderMine()
    fireEvent.click(villageButton())

    expect(within(dialog()).getByText(QUEST_EXIT_GUARD_COPY.failedTitle)).toBeInTheDocument()
    fireEvent.click(stayButton())
    await noDialog()
    // The intro's own unsaved card, exactly where it was.
    expect(screenRetry().length).toBeGreaterThan(0)
    expect(path()).toBe('/quest')
  })

  it('lets the child go once a retry has landed, on a fresh tap', async () => {
    deniedSave('partial')
    const view = renderMine()
    fireEvent.click(villageButton())
    fireEvent.click(within(dialog()).getByRole('button', { name: QUEST_EXIT_GUARD_COPY.retry }))
    expect(fx.retrySourceSave).toHaveBeenCalledTimes(1)

    // The retry lands: the door closes and nothing departs on its own.
    fx.sourceState = 'saved'
    fx.canRetry = false
    view.rerender(mineElement())
    await noDialog()
    expect(path()).toBe('/quest')

    fireEvent.click(villageButton())
    expect(path()).not.toBe('/quest')
  })

  it('leaves other intro actions alone', async () => {
    deniedSave('partial')
    renderMine()
    // A mode card is not a departure: it is unguarded and still starts.
    fireEvent.click(screen.getAllByText('Phonics Quest')[0])
    await noDialog()
  })
})
