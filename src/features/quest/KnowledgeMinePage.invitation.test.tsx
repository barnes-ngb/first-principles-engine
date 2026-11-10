import { act, fireEvent, render, screen } from '@testing-library/react'
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
    startQuest: fx.startQuest,
    resumeSession: fx.resumeSession,
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

function renderMine() {
  return render(
    <MemoryRouter initialEntries={['/quest']}>
      <KnowledgeMinePage />
    </MemoryRouter>,
  )
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
