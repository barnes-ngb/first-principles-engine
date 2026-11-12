import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LibraryReturnDestination,
  LibraryReturnFocus,
  LibraryReturnOrigin,
  beginLibraryReturnFlow,
  endLibraryReturnFlow,
  getLibraryIdentityEpoch,
  getLibraryReturnFlow,
} from '../avatar/stonebridge/libraryReturnFlow'
import {
  MINE_MATH_DIG_LABEL,
  MINE_READING_DIG_LABEL,
  MINE_RETURN_LABEL,
} from '../avatar/stonebridge/libraryReturnCopy'
import { QuestScreen } from './questTypes'
import KnowledgeMinePage from './KnowledgeMinePage'

/**
 * The Mine's half of the village trip (UX-493) — arrival, revalidation, exits.
 *
 * Everything the hub needs to run is stubbed: this file is about the trip, not
 * about quests. What is REAL is the journey store, the pure selector and the
 * page's own gates, which is where the defects were.
 */

const fx = vi.hoisted(() => ({
  screen: 'intro' as string,
  startQuest: vi.fn(),
  resumeSession: vi.fn(),
  resetToIntro: vi.fn(),
  activeChild: { id: 'lincoln', name: 'Lincoln' } as { id: string; name: string } | undefined,
  activeChildId: null as string | null,
  childrenFamilyId: 'fam-1' as string | null | undefined,
  isChildProfile: true,
  profile: 'lincoln' as string | null,
  childrenLoading: false,
  childrenLoadFailed: false,
  snapshot: null as unknown,
  snapshotLoaded: true,
  model: null as unknown,
  modelLoading: false,
}))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
  useAuth: () => ({ familyId: 'fam-1' }),
}))

vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: fx.profile }),
}))

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: fx.activeChild,
    activeChildId: fx.activeChildId ?? fx.activeChild?.id ?? '',
    childrenFamilyId: fx.childrenFamilyId,
    children: [{ id: 'lincoln', name: 'Lincoln' }],
    setActiveChildId: () => {},
    isChildProfile: fx.isChildProfile,
    isLoading: fx.childrenLoading,
    loadFailed: fx.childrenLoadFailed,
  }),
}))

vi.mock('../../core/hooks/useChildSkillSnapshot', () => ({
  useChildSkillSnapshot: () => ({ snapshot: fx.snapshot, loaded: fx.snapshotLoaded }),
}))

vi.mock('../../core/hooks/useLearnerModel', () => ({
  useLearnerModel: () => ({ model: fx.model, loading: fx.modelLoading }),
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
    // UX-494 — the save/recovery surface the page now reads. Idle here: this
    // file's subject is the village invitation, and an idle save notice renders
    // nothing at all.
    sourceSave: { state: 'idle', canRetry: false },
    visibleSourceSave: { state: 'idle', canRetry: false },
    // UX-496 — what an exit control may do. Nothing is owed here, so every
    // exit in this file behaves exactly as it did before the guard.
    questExitVerdict: () => ({ kind: 'clear' as const }),
    graphSync: { state: 'idle' },
    recoveryScope: 'fam-1|lincoln|child|1',
    recoveryEpoch: 1,
    viewGeneration: 0,
    resumeReloadNonce: 0,
    questDomain: 'reading',
    retrySourceSave: async () => 'nothing-pending' as const,
    retryGraphProjection: async () => 'identity-mismatch' as const,
    startQuest: fx.startQuest,
    resumeSession: fx.resumeSession,
    // *Start fresh instead* shares the intro action lane now, so it is the
    // hook's own door. No test here taps it.
    discardPartial: async () => 'missing' as const,
    resetToIntro: fx.resetToIntro,
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

// The hub's own screens and its resume query: not this file's subject.
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
  getDocs: async () => ({ docs: [] }),
  query: () => ({}),
  updateDoc: async () => {},
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  // UX-494 — *Start fresh instead* is a guarded transaction now. No test here
  // taps it; the import has to resolve.
  runTransaction: async () => undefined,
}))

/** Reading-calibrated. */
const READING_CALIBRATED = { childId: 'lincoln', prioritySkills: [], workingLevels: { phonics: 3 } }

/** A model whose queue is waiting on the one supported reading concept. */
const CVC_QUEUED = {
  childId: 'lincoln',
  openQuestions: [
    { conceptId: 'reading.phonics.cvc', question: 'see this?', routedTo: 'quest', reason: 'queued' },
  ],
  synthesisStaleAt: null,
}

/** The village's offer, as the journey carries it. */
const READING_SUGGESTION = {
  conceptId: 'reading.phonics.cvc',
  domain: 'reading' as const,
  questMode: 'phonics' as const,
  label: MINE_READING_DIG_LABEL,
  source: 'ask' as const,
}

function beginTrip(suggestion: unknown = READING_SUGGESTION) {
  return beginLibraryReturnFlow({
    familyId: 'fam-1',
    childId: 'lincoln',
    missionId: '',
    origin: LibraryReturnOrigin.Town,
    destination: LibraryReturnDestination.Mine,
    focus: LibraryReturnFocus.SquareInvitation,
    suggestion: suggestion as never,
    observedEpoch: getLibraryIdentityEpoch(),
  })
}

/** Both domains calibrated by real evidence — so the OFFER can change mode. */
const BOTH_CALIBRATED = {
  childId: 'lincoln',
  prioritySkills: [],
  workingLevels: { phonics: 3, math: 1 },
}

/** The same model shape, waiting on the supported MATH concept instead. */
const MATH_QUEUED = {
  childId: 'lincoln',
  openQuestions: [
    {
      conceptId: 'math.operations.addWithin20',
      question: 'see this?',
      routedTo: 'quest',
      reason: 'queued',
    },
  ],
  synthesisStaleAt: null,
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

/**
 * The `onClick` a RENDERED card is holding — captured, then invoked later.
 *
 * The defect was a handler captured while the offer was on screen and invoked
 * after the offer went away inside the SAME identity and the SAME live journey.
 * Clicking the node afterwards proves nothing (React has detached it), so the
 * retained callback is read off the element and called directly, which is what
 * the hostile case did when it reached a real `startQuest` and a real AI call.
 */
function retainedOnClick(node: HTMLElement): () => void {
  const key = Object.keys(node).find((k) => k.startsWith('__reactProps$'))
  const props = (node as unknown as Record<string, { onClick?: () => void }>)[key!]
  const onClick = props?.onClick
  expect(typeof onClick).toBe('function')
  return onClick!
}

function suggestedCard() {
  return screen.getByRole('button', { name: new RegExp(MINE_READING_DIG_LABEL) })
}

beforeEach(() => {
  fx.screen = QuestScreen.Intro
  fx.startQuest.mockClear()
  fx.activeChild = { id: 'lincoln', name: 'Lincoln' }
  fx.activeChildId = null
  fx.childrenFamilyId = 'fam-1'
  fx.isChildProfile = true
  fx.profile = 'lincoln'
  fx.childrenLoading = false
  fx.childrenLoadFailed = false
  fx.snapshot = READING_CALIBRATED
  fx.snapshotLoaded = true
  fx.model = CVC_QUEUED
  fx.modelLoading = false
  endLibraryReturnFlow()
})

afterEach(() => {
  endLibraryReturnFlow()
})

describe('arriving on a village trip', () => {
  it('offers the suggested mode and the one way back', () => {
    beginTrip()
    renderMine()
    expect(suggestedCard()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })).toBeInTheDocument()
    // Every calibrated choice is still there, and nothing has started.
    expect(screen.getAllByText('Phonics Quest').length).toBeGreaterThan(0)
    expect(screen.getByText('Comprehension Quest')).toBeInTheDocument()
    expect(fx.startQuest).not.toHaveBeenCalled()
  })

  it('the offer’s tap is the mode’s ordinary Start, once', () => {
    beginTrip()
    renderMine()
    fireEvent.click(suggestedCard())
    expect(fx.startQuest).toHaveBeenCalledTimes(1)
    expect(fx.startQuest).toHaveBeenCalledWith('reading', 'phonics')
  })

  it('a direct arrival is the ordinary Mine — no offer, no way back', () => {
    renderMine()
    expect(screen.queryByRole('button', { name: new RegExp(MINE_READING_DIG_LABEL) })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })).not.toBeInTheDocument()
    expect(screen.getByText('Phonics Quest')).toBeInTheDocument()
  })

  it('revalidates: an offer this page no longer recommends is not shown', () => {
    beginTrip()
    // The source moved while the child walked over: nothing is recommended now.
    fx.model = null
    renderMine()
    expect(screen.queryByRole('button', { name: new RegExp(MINE_READING_DIG_LABEL) })).not.toBeInTheDocument()
    // The trip's way back is still the trip's — the suggestion went quiet, not
    // the journey.
    expect(screen.getByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })).toBeInTheDocument()
  })

  it('and a mode mismatch is not shown either', () => {
    beginTrip({ ...READING_SUGGESTION, domain: 'math', questMode: 'math' })
    renderMine()
    expect(screen.queryByRole('button', { name: new RegExp(MINE_READING_DIG_LABEL) })).not.toBeInTheDocument()
  })
})

describe('the trip is refused for a scope that cannot be vouched for', () => {
  it('a parent profile', () => {
    beginTrip()
    fx.isChildProfile = false
    renderMine()
    expect(screen.queryByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })).not.toBeInTheDocument()
  })

  it('an answered children list from another family', () => {
    beginTrip()
    fx.childrenFamilyId = 'fam-other'
    renderMine()
    expect(screen.queryByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })).not.toBeInTheDocument()
  })

  it('a resolved id that is not the resolved child', () => {
    beginTrip()
    fx.activeChildId = 'london'
    renderMine()
    expect(screen.queryByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })).not.toBeInTheDocument()
  })

  it('an unsettled or failed children read', () => {
    beginTrip()
    fx.childrenLoadFailed = true
    const { unmount } = renderMine()
    expect(screen.queryByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })).not.toBeInTheDocument()
    unmount()

    fx.childrenLoadFailed = false
    fx.childrenLoading = true
    renderMine()
    expect(screen.queryByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })).not.toBeInTheDocument()
  })
})

describe('a retained Start is rejected, not honoured', () => {
  it('when the journey has ended under it — no quest, no AI call', () => {
    beginTrip()
    renderMine()
    const card = suggestedCard()

    // The journey is over: a role change, a switch, a readiness change — each
    // ends it through the same store. The handler this card was drawn with is
    // still in hand.
    act(() => {
      endLibraryReturnFlow()
    })
    fireEvent.click(card)
    expect(fx.startQuest).not.toHaveBeenCalled()
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('after a role change to a parent — the case that called the AI', () => {
    beginTrip()
    renderMine()
    const card = suggestedCard()

    // The role change is an identity movement: it ends the journey through the
    // same store, and the card's handler is still in hand.
    fx.profile = 'parents'
    fx.isChildProfile = false
    act(() => {
      endLibraryReturnFlow()
    })
    fireEvent.click(card)
    expect(fx.startQuest).not.toHaveBeenCalled()
  })

  it('when the offer itself has gone quiet under it', () => {
    beginTrip()
    renderMine()
    const card = suggestedCard()

    // Fresh evidence: this page's own read no longer recommends that mode, so
    // the card it was drawn for is not a card that may start anything.
    fx.model = null
    act(() => {
      endLibraryReturnFlow()
      beginTrip()
    })
    fireEvent.click(card)
    expect(fx.startQuest).not.toHaveBeenCalled()
  })
})

describe('a retained Start inside the SAME identity and the SAME journey', () => {
  /**
   * The hole the epoch and generation checks cannot see.
   *
   * Nothing moves: same family, child, profile, epoch, and the same live Mine
   * journey of the same generation. Only the page's own READ changes, which is
   * what retires the offer — and a handler captured before that must not start
   * a real quest or call the AI.
   */
  function captureThenCommit(next: () => void) {
    beginTrip()
    const { rerender } = renderMine()
    const retained = retainedOnClick(suggestedCard())
    const generation = getLibraryReturnFlow()?.generation
    next()
    act(() => {
      rerender(mineElement())
    })
    // The journey really is untouched: this is not the generation case again.
    expect(getLibraryReturnFlow()?.generation).toBe(generation)
    return retained
  }

  it('is refused after the model is REMOVED — no quest, no AI call', () => {
    const retained = captureThenCommit(() => {
      fx.model = null
    })
    expect(
      screen.queryByRole('button', { name: new RegExp(MINE_READING_DIG_LABEL) }),
    ).not.toBeInTheDocument()
    retained()
    expect(fx.startQuest).not.toHaveBeenCalled()
  })

  it('is refused after a FAILED model read, which arrives as nothing', () => {
    const retained = captureThenCommit(() => {
      fx.model = null
      fx.modelLoading = false
    })
    retained()
    expect(fx.startQuest).not.toHaveBeenCalled()
  })

  it('is refused while the read goes UNSETTLED again, mid-reload', () => {
    const retained = captureThenCommit(() => {
      fx.modelLoading = true
    })
    retained()
    expect(fx.startQuest).not.toHaveBeenCalled()
  })

  it('is refused after the SUPPORTED offer changed to the other mode', () => {
    fx.snapshot = BOTH_CALIBRATED
    const retained = captureThenCommit(() => {
      fx.model = MATH_QUEUED
    })
    retained()
    expect(fx.startQuest).not.toHaveBeenCalled()
  })

  it('but a still-valid tap starts the mode exactly once', () => {
    const retained = captureThenCommit(() => {})
    retained()
    expect(fx.startQuest).toHaveBeenCalledTimes(1)
    expect(fx.startQuest).toHaveBeenCalledWith('reading', 'phonics')
  })

  it('and the ordinary section cards are untouched by any of it', () => {
    renderMine()
    fireEvent.click(screen.getByText('Comprehension Quest'))
    expect(fx.startQuest).toHaveBeenCalledWith('reading', 'comprehension')
  })
})

/**
 * UX-495 — WHAT the suggested Start hands the hook when the offer is the one
 * the addition pilot may run on.
 *
 * The page's job is exactly two things: derive the offer's identity from the
 * SAME settled read the agreement came from, and add the scope and the journey.
 * Everything else — the level, the calibration, the queue, the model — is
 * revalidated inside the Start, which has its own file. When the pilot falls
 * away, the ordinary mode-only suggestion must be completely unchanged, which
 * is what the two-argument calls below assert.
 */
describe('the suggested Start’s pilot request', () => {
  const GENERATION = '2026-11-10T08:00:00.000Z'

  /** A fresh synthesis whose next move is the supported math concept, by quest. */
  const MATH_SYNTHESIS = {
    childId: 'lincoln',
    openQuestions: [],
    synthesisStaleAt: null,
    synthesis: {
      whatMattersNext: [
        {
          conceptId: 'math.operations.addWithin20',
          kidName: 'Adding to 20',
          why: 'He is adding within 20.',
          suggestedVehicle: 'quest',
        },
      ],
      narrative: '',
      openQuestionsSummary: [],
      generatedAt: GENERATION,
    },
  }

  /**
   * The village's offer, as the journey carries it — WITH the generation the
   * town's own read attached to it (UX-495).
   */
  const MATH_SUGGESTION = {
    conceptId: 'math.operations.addWithin20',
    domain: 'math' as const,
    questMode: 'math' as const,
    label: MINE_MATH_DIG_LABEL,
    source: 'synthesis' as const,
    synthesisGeneratedAt: GENERATION,
  }

  /** The same model, re-generated: same concept, same mode, new generation. */
  const GENERATION_B = '2026-11-11T07:00:00.000Z'
  const MATH_SYNTHESIS_B = {
    ...MATH_SYNTHESIS,
    synthesis: { ...MATH_SYNTHESIS.synthesis, generatedAt: GENERATION_B },
  }

  function mathCard() {
    return screen.getByRole('button', { name: new RegExp(MINE_MATH_DIG_LABEL) })
  }

  beforeEach(() => {
    fx.snapshot = BOTH_CALIBRATED
    fx.model = MATH_SYNTHESIS
  })

  it('carries the offer, the scope and the journey — and a live-journey verifier', () => {
    beginTrip(MATH_SUGGESTION)
    const generation = getLibraryReturnFlow()!.generation
    renderMine()
    fireEvent.click(mathCard())

    expect(fx.startQuest).toHaveBeenCalledTimes(1)
    const [domain, mode, pilot] = fx.startQuest.mock.calls[0] as [
      string,
      string,
      { tripStillLive: () => boolean } & Record<string, unknown>,
    ]
    expect(domain).toBe('math')
    expect(mode).toBe('math')
    expect(pilot).toMatchObject({
      familyId: 'fam-1',
      childId: 'lincoln',
      conceptId: 'math.operations.addWithin20',
      domain: 'math',
      questMode: 'math',
      offerSource: 'synthesis',
      synthesisGeneratedAt: GENERATION,
      tripGeneration: generation,
    })
    // The verifier reads the STORE, so it answers for the journey as it is now.
    expect(pilot.tripStillLive()).toBe(true)
    act(() => {
      endLibraryReturnFlow()
    })
    expect(pilot.tripStillLive()).toBe(false)
  })

  /**
   * The defect this round fixes. A same-concept synthesis **B** arrived while
   * the child walked to the Mine: the concept, the mode and the source are all
   * unchanged, so the offer still agrees — and the pilot used to run on B's
   * advice under A's offer. The generations are compared instead.
   */
  it('sends no request when a NEW synthesis generation arrived on the way here', () => {
    fx.model = MATH_SYNTHESIS_B
    beginTrip(MATH_SUGGESTION)
    renderMine()
    // The mode is still offered, and its ordinary Start still runs.
    fireEvent.click(mathCard())
    expect(fx.startQuest).toHaveBeenCalledWith('math', 'math')
  })

  it('sends no request when the trip carries no generation at all', () => {
    beginTrip({ ...MATH_SUGGESTION, synthesisGeneratedAt: undefined })
    renderMine()
    fireEvent.click(mathCard())
    expect(fx.startQuest).toHaveBeenCalledWith('math', 'math')
  })

  it('sends no request when the village’s offer came from the QUEUE', () => {
    fx.model = MATH_QUEUED
    beginTrip({ ...MATH_SUGGESTION, source: 'ask' })
    renderMine()
    fireEvent.click(mathCard())
    // The ordinary suggested Start, byte-for-byte as before.
    expect(fx.startQuest).toHaveBeenCalledWith('math', 'math')
  })

  it('sends no request when the synthesis has no usable generation', () => {
    fx.model = {
      ...MATH_SYNTHESIS,
      synthesis: { ...MATH_SYNTHESIS.synthesis, generatedAt: '   ' },
    }
    beginTrip(MATH_SUGGESTION)
    renderMine()
    fireEvent.click(mathCard())
    expect(fx.startQuest).toHaveBeenCalledWith('math', 'math')
  })

  it('sends no request when the village and this page name different concepts', () => {
    beginTrip({ ...MATH_SUGGESTION, conceptId: 'math.something.else' })
    renderMine()
    fireEvent.click(mathCard())
    expect(fx.startQuest).toHaveBeenCalledWith('math', 'math')
  })

  it('drops the pilot — and keeps the mode-only Start — when the synthesis moved under a retained tap', () => {
    beginTrip(MATH_SUGGESTION)
    const { rerender } = renderMine()
    const retained = retainedOnClick(mathCard())

    // A regenerated synthesis: the mode is still offered, the generation is not.
    fx.model = {
      ...MATH_SYNTHESIS,
      synthesis: { ...MATH_SYNTHESIS.synthesis, generatedAt: '2026-11-11T07:00:00.000Z' },
    }
    act(() => {
      rerender(mineElement())
    })
    retained()

    expect(fx.startQuest).toHaveBeenCalledTimes(1)
    expect(fx.startQuest).toHaveBeenCalledWith('math', 'math')
  })
})

describe('the new child-facing text is readable, not the legacy pixel font', () => {
  it('the way back is plain and at least 14px on its 44px target', () => {
    beginTrip()
    renderMine()
    const back = screen.getByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })
    const style = getComputedStyle(back)
    expect(parseFloat(style.fontSize)).toBeGreaterThanOrEqual(14)
    expect(style.fontFamily).not.toMatch(/Press Start 2P/)
  })

  it('the suggested card’s own words are plain and at least 14px', () => {
    beginTrip()
    renderMine()
    const label = screen.getByText(MINE_READING_DIG_LABEL)
    const description = within(suggestedCard()).getByText('Phonics Quest')
    // The chip's size is set on its root; the label span inherits it.
    const chip = screen.getByText('From your village').closest('.MuiChip-root')
    expect(chip).not.toBeNull()
    for (const node of [label, description, chip as HTMLElement]) {
      const style = getComputedStyle(node)
      expect(parseFloat(style.fontSize)).toBeGreaterThanOrEqual(14)
      expect(style.fontFamily).not.toMatch(/Press Start 2P/)
    }
  })

  it('and it does not repeat the reward teaser the ordinary cards carry', () => {
    beginTrip()
    renderMine()
    const teasers = screen.getAllByText('Earn diamonds 💎')
    // One per ordinary enabled card, and none on the invitation.
    expect(within(suggestedCard()).queryByText('Earn diamonds 💎')).not.toBeInTheDocument()
    expect(teasers.length).toBeGreaterThan(0)
  })

  it('while an ordinary card keeps its existing font', () => {
    renderMine()
    const style = getComputedStyle(screen.getByText('Comprehension Quest'))
    expect(style.fontFamily).toMatch(/Press Start 2P/)
  })
})

describe('the fluency summary', () => {
  it('offers the same one way back', () => {
    beginTrip()
    fx.screen = QuestScreen.FluencySummary
    renderMine()
    expect(screen.getByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })).toBeInTheDocument()
    // The fluency screens keep their own existing exit.
    expect(screen.getByRole('button', { name: '← Back to mine' })).toBeInTheDocument()
  })

  it('but a fluency session still in progress does not', () => {
    beginTrip()
    fx.screen = QuestScreen.FluencyPassage
    renderMine()
    expect(screen.queryByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '← Back to mine' })).toBeInTheDocument()
  })

  it('and a direct fluency summary is untouched', () => {
    fx.screen = QuestScreen.FluencySummary
    renderMine()
    expect(screen.queryByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })).not.toBeInTheDocument()
  })
})

describe('the general summary', () => {
  it('offers the way back for this trip only', () => {
    beginTrip()
    fx.screen = QuestScreen.Summary
    const { unmount } = renderMine()
    expect(screen.getByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })).toBeInTheDocument()
    unmount()

    endLibraryReturnFlow()
    renderMine()
    expect(screen.queryByRole('button', { name: `🏰 ${MINE_RETURN_LABEL}` })).not.toBeInTheDocument()
  })
})
