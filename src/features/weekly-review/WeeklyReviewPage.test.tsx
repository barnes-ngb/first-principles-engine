import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WeeklyReview } from '../../core/types'

/**
 * UX-218 / UX-219 — the week is a log, not a report.
 *
 * Two things are asserted here that no unit test below the page can see:
 *
 *   1. **The narrative is gone from the page**, and the page has no empty
 *      state and no generate button. A blank card under a bold heading is the
 *      defect this run retired, so the check is an ABSENCE — a source scan,
 *      because a section can only be missing, never rendered-as-nothing.
 *   2. **The audience gate did not slip.** UX-213/214 gated `WeekPaceSection`
 *      and `WeekReflectionCard`; removing the narrative left `WeekInEvidence`
 *      and the adjustments un-gated, so the gate moved up to the page. A child
 *      profile must render nothing AND cost nothing.
 */

// ── Mocks at the boundaries ─────────────────────────────────────────────────

const mockUseActiveChild = vi.fn()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

const mockUseFamilyId = vi.fn(() => 'fam-1')
vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => mockUseFamilyId(),
  useAuth: () => ({ familyId: 'fam-1' }),
}))

// The child selector reaches auth + avatar Firestore of its own; it is not what
// this file is about.
vi.mock('../../components/ChildSelector', () => ({
  default: () => <div data-testid="child-selector" />,
}))

const mockUseWeekHours = vi.fn()
vi.mock('./useWeekHours', () => ({
  useWeekHours: (...args: unknown[]) => mockUseWeekHours(...args),
}))

const mockUseHistory = vi.fn()
vi.mock('./useWeeklyReviewHistory', () => ({
  useWeeklyReviewHistory: (...args: unknown[]) => mockUseHistory(...args),
}))

// UX-388's rollup reads three collections of its own; its own test file owns
// that. Here it stands in for the section, so the page's ORDER and the page's
// audience gate are what is being asserted.
const mockUseWeekBySubject = vi.fn()
vi.mock('./useWeekBySubject', () => ({
  useWeekBySubject: (...args: unknown[]) => mockUseWeekBySubject(...args),
}))

// One document, delivered synchronously. `null` is the Saturday case: the
// overnight cron has not written anything for the week the page names.
let currentDoc: WeeklyReview | null = null
/** When true the listener errors instead of delivering — the dropped-read case. */
let listenerFails = false
const mockOnSnapshot = vi.fn(
  (
    _ref: unknown,
    next: (snap: unknown) => void,
    onError: (err: unknown) => void,
  ) => {
    if (listenerFails) {
      onError(new Error('permission-denied'))
      return () => {}
    }
    next({
      exists: () => currentDoc !== null,
      data: () => currentDoc,
      id: 'doc-1',
    })
    return () => {}
  },
)
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: (
    ...args: [unknown, (snap: unknown) => void, (err: unknown) => void]
  ) => mockOnSnapshot(...args),
  runTransaction: vi.fn(),
}))

vi.mock('../../core/firebase/firestore', () => ({
  db: {},
  weeklyReviewsCollection: vi.fn(() => ({})),
  weeklyReviewDocId: (weekKey: string, childId: string) => `${weekKey}_${childId}`,
}))

import WeeklyReviewPage, { WeeklyReviewContent } from './WeeklyReviewPage'

// ── Fixtures ────────────────────────────────────────────────────────────────

const PARENT = {
  children: [{ id: 'c1', name: 'Lincoln' }],
  activeChildId: 'c1',
  activeChild: { id: 'c1', name: 'Lincoln' },
  setActiveChildId: vi.fn(),
  isLoading: false,
  addChild: vi.fn(),
  isChildProfile: false,
}

const withNarrative = (): WeeklyReview =>
  ({
    childId: 'c1',
    weekKey: '2026-08-30',
    status: 'draft',
    celebration: 'Lincoln read three chapters without a break!',
    summary: 'A steady week with strong reading momentum.',
    wins: ['Finished the phonics unit'],
    growthAreas: ['Math facts still slow'],
    recommendations: ['Try shorter math blocks'],
    paceAdjustments: [],
  }) as unknown as WeeklyReview

beforeEach(() => {
  vi.clearAllMocks()
  currentDoc = null
  listenerFails = false
  mockUseActiveChild.mockReturnValue(PARENT)
  mockUseFamilyId.mockReturnValue('fam-1')
  mockUseWeekHours.mockReturnValue({ totalMinutes: 288, loading: false, error: null })
  mockUseHistory.mockReturnValue({ reviews: [], loading: false, failed: false })
  mockUseWeekBySubject.mockReturnValue({
    subjects: [
      {
        subjectBucket: 'Reading',
        label: 'Reading',
        totalMinutes: 240,
        items: [{ key: 'a', name: 'Fast Phonics', count: 4 }],
        sourcesWithoutItem: [],
        artifactCount: 1,
        topics: [],
      },
    ],
    loading: false,
    hoursFailed: false,
    evidenceFailed: false,
  })
})

// ── The audience rule ───────────────────────────────────────────────────────

describe('the page is parent-only (UX-219)', () => {
  it('renders the week for a parent profile', () => {
    render(<WeeklyReviewPage />)
    expect(screen.getByText('Weekly Review')).toBeInTheDocument()
    expect(screen.getByText('4.8 hours logged this week.')).toBeInTheDocument()
  })

  it('embeds the existing weekly content without a duplicate title or child selector', () => {
    render(<WeeklyReviewPage embedded />)
    expect(screen.queryByText('Weekly Review')).not.toBeInTheDocument()
    expect(screen.queryByTestId('child-selector')).not.toBeInTheDocument()
    expect(screen.getByText('4.8 hours logged this week.')).toBeInTheDocument()
    expect(screen.getByText('The Week by Subject')).toBeInTheDocument()
  })

  it('uses the supplied child data instead of loading a separate stale child list', () => {
    const child = { id: 'c3', name: 'New child' }
    render(<WeeklyReviewContent embedded childContext={{
      ...PARENT, children: [child], activeChildId: child.id, activeChild: child,
    }} />)
    expect(mockUseWeekHours).toHaveBeenCalledWith('fam-1', 'c3', expect.any(String))
    expect(mockUseHistory).toHaveBeenCalledWith('fam-1', 'c3', expect.any(String))
  })

  it('renders nothing at all for a child profile', () => {
    mockUseActiveChild.mockReturnValue({ ...PARENT, isChildProfile: true })
    const { container } = render(<WeeklyReviewPage />)
    expect(container).toBeEmptyDOMElement()
  })

  it('costs a child profile zero Firestore reads — the gate is above the hooks', () => {
    mockUseActiveChild.mockReturnValue({ ...PARENT, isChildProfile: true })
    render(<WeeklyReviewPage />)
    expect(mockOnSnapshot).not.toHaveBeenCalled()
    expect(mockUseWeekHours).not.toHaveBeenCalled()
    expect(mockUseHistory).not.toHaveBeenCalled()
    expect(mockUseWeekBySubject).not.toHaveBeenCalled()
  })

  it('gates on capability, never on a name', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'WeeklyReviewPage.tsx'),
      'utf8',
    )
    expect(source).not.toMatch(/isLincoln|'Lincoln'|"Lincoln"|'London'|"London"/)
  })
})

// ── The narrative is gone ───────────────────────────────────────────────────

describe('the AI narrative no longer renders here (UX-219)', () => {
  it('shows none of the five narrative sections, even when the doc still carries them', () => {
    currentDoc = withNarrative()
    render(<WeeklyReviewPage />)

    for (const heading of [
      "This Week's Celebration",
      'Week Summary',
      'Wins',
      'Growth Areas',
      'Recommendations for Next Week',
    ]) {
      expect(screen.queryByText(heading)).not.toBeInTheDocument()
    }
    // Nor the stored prose itself, under any heading.
    expect(
      screen.queryByText(/Lincoln read three chapters/),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/steady week with strong/)).not.toBeInTheDocument()
  })

  it('offers nothing to generate, and no review status to close', () => {
    currentDoc = withNarrative()
    render(<WeeklyReviewPage />)
    expect(screen.queryByText(/Regenerate/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Generate Now/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Mark as Reviewed/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Pending Review')).not.toBeInTheDocument()
  })

  it('reads none of the narrative fields in source', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'WeeklyReviewPage.tsx'),
      'utf8',
    )
    for (const field of [
      'review.celebration',
      'review.summary',
      'review.wins',
      'review.growthAreas',
      'review.recommendations',
    ]) {
      expect(source, `${field} is still rendered`).not.toContain(field)
    }
    // The narrative is still WRITTEN — the monthly book and Shelly Chat read it
    // server-side — so nothing here may call the manual generator either.
    expect(source).not.toContain('generateWeeklyReviewNow')
  })
})

// ── There is no empty state, because nothing left can be empty ──────────────

describe('a week with nothing in it is still a week (UX-219)', () => {
  it('renders the log rather than a "No Review Yet" card', () => {
    currentDoc = null
    mockUseWeekHours.mockReturnValue({ totalMinutes: 0, loading: false, error: null })
    render(<WeeklyReviewPage />)

    expect(screen.queryByText('No Review Yet')).not.toBeInTheDocument()
    expect(screen.getByText('No hours logged this week.')).toBeInTheDocument()
    expect(
      screen.getByText('Was that enough this week?'),
    ).toBeInTheDocument()
  })

  it('names the school week by its dates, the FEAT-196 way', () => {
    // Sat Sep 5, 2026 — the week that just finished is Aug 31–Sep 4. Under the
    // old Sun–Sat rule this same Saturday read "Week of Aug 23 - Aug 29", which
    // is the bug the owner reported (UX-218).
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 8, 5, 9, 0, 0))
    try {
      render(<WeeklyReviewPage />)
      // The planner's own formatter spaces the dash when the week crosses a
      // month boundary — this is that string, not a second copy of the rule.
      expect(screen.getByText('Week of Aug 31 – Sep 4')).toBeInTheDocument()
      expect(screen.queryByText(/Aug 23/)).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('never renders a dropped review read as a quiet Saturday', () => {
    // Codex round 3, P2. Without the explicit failure state, an errored
    // listener leaves `review` null with loading finished — which the pending
    // line would have reported as "the cron hasn't run yet", a claim about the
    // server made on nothing from it.
    listenerFails = true
    render(<WeeklyReviewPage />)
    expect(
      screen.getByText(
        'Couldn’t read this week’s review, so there’s nothing to say about coverage yet.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/saved overnight, once Saturday is over/)).not.toBeInTheDocument()
  })

  it('shows no adjustments section when the review has none', () => {
    currentDoc = withNarrative()
    render(<WeeklyReviewPage />)
    expect(screen.queryByText('Pace Adjustments')).not.toBeInTheDocument()
  })

  it('never tells a parent nothing on the page is AI-written', () => {
    // Codex round 1, P2. Pace Adjustments IS weekly AI output, and it is the
    // section a parent might act on — so a blanket "nothing here is written by
    // AI" would give exactly the wrong provenance for the only thing that has
    // one.
    const { container } = render(<WeeklyReviewPage />)
    expect(container.textContent).not.toMatch(/[Nn]othing here is written by AI/)
  })

  it('names the pace adjustments as AI-written, where the parent acts on them', () => {
    currentDoc = {
      ...withNarrative(),
      paceAdjustments: [
        {
          id: 'a1',
          area: 'Math',
          currentPace: '1 lesson/day',
          suggestedPace: '2 lessons/day',
          rationale: 'Finishing early most days.',
          decision: 'pending',
        },
      ],
    } as unknown as WeeklyReview
    render(<WeeklyReviewPage />)
    expect(
      screen.getByText(/Written by the weekly review AI from what was logged/),
    ).toBeInTheDocument()
  })

  it('puts the by-subject rollup FIRST, above the log, and removes nothing (UX-388)', () => {
    // Owner, 2026-09-11: the week summary by topic, *"above the log, as the
    // first thing you see."* Order is the whole of the ask — a rollup below
    // five day cards is a rollup nobody reaches on a phone — and it is the one
    // property no unit test below the page can see.
    const { container } = render(<WeeklyReviewPage />)
    const text = container.textContent ?? ''
    const rollup = text.indexOf('The Week by Subject')
    const hours = text.indexOf('Hours and Coverage')
    const question = text.indexOf('Was that enough this week?')

    expect(rollup).toBeGreaterThanOrEqual(0)
    // Nothing below it moved or went away.
    expect(hours).toBeGreaterThan(rollup)
    expect(question).toBeGreaterThan(hours)
    expect(screen.getByText('4.8 hours logged this week.')).toBeInTheDocument()
  })

  it('shows the adjustments section, with its Apply button, when there are some', () => {
    currentDoc = {
      ...withNarrative(),
      paceAdjustments: [
        {
          id: 'a1',
          area: 'Math',
          currentPace: '1 lesson/day',
          suggestedPace: '2 lessons/day',
          rationale: 'Finishing early most days.',
          decision: 'pending',
        },
      ],
    } as unknown as WeeklyReview
    render(<WeeklyReviewPage />)
    expect(screen.getByText('Pace Adjustments')).toBeInTheDocument()
    expect(screen.getByText('Apply 0 Adjustments')).toBeInTheDocument()
  })
})

// ── UX-406: which week, and the state that must move with it ───────────────
//
// Owner, Friday 2026-09-11: *"the days here isn't updated — I added time in
// artefacts and it didn't change it for packing and independent play."* The page
// was showing the week before the one he had logged in, and had no control to
// move. The default is unchanged (UX-218); what is new is the tap.

describe('the week selector (UX-406)', () => {
  const nowSpy = () => vi.useFakeTimers().setSystemTime(new Date('2026-09-11T20:30:00'))

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders both weeks, named by their school days', () => {
    nowSpy()
    render(<WeeklyReviewPage />)
    expect(screen.getByTestId('review-week-selector')).toBeInTheDocument()
    expect(screen.getByText('Last week')).toBeInTheDocument()
    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(screen.getByText('Aug 31 – Sep 4')).toBeInTheDocument()
    expect(screen.getByText('Sep 7–11 · in progress')).toBeInTheDocument()
  })

  it('defaults to the last completed school week — UX-218, unchanged', () => {
    nowSpy()
    render(<WeeklyReviewPage />)
    expect(screen.getByText('Week of Aug 31 – Sep 4')).toBeInTheDocument()
    // And that is the document it subscribes to.
    expect(mockUseWeekHours).toHaveBeenCalledWith('fam-1', 'c1', '2026-08-30')
  })

  it('reads the week he had just logged when he taps This week', () => {
    nowSpy()
    render(<WeeklyReviewPage />)

    fireEvent.click(screen.getByText('This week'))

    expect(screen.getByText('Week of Sep 7–11')).toBeInTheDocument()
    expect(mockUseWeekHours).toHaveBeenCalledWith('fam-1', 'c1', '2026-09-06')
    expect(mockUseWeekBySubject).toHaveBeenCalledWith('fam-1', 'c1', '2026-09-06')
  })

  it('renders the selector on the embedded Review tab too', () => {
    nowSpy()
    render(<WeeklyReviewContent childContext={PARENT} embedded />)
    expect(screen.getByTestId('review-week-selector')).toBeInTheDocument()
    // The shell owns the title and the child selector; the week control is
    // neither, and is the one the owner's report asked for.
    expect(screen.queryByTestId('child-selector')).not.toBeInTheDocument()
  })

  it('does not carry one week’s review, ticks or loading state onto another', () => {
    // Codex rounds 2 and 3 on UX-218 found exactly this class when the week was
    // allowed to change mid-session: `review`, `isLoading` and `decisionDraft`
    // stayed keyed to the old week. Making the week changeable is precisely what
    // UX-406 does, so the reset is keyed on (child, week) together.
    nowSpy()
    currentDoc = withNarrative()
    render(<WeeklyReviewPage />)

    const before = mockOnSnapshot.mock.calls.length
    fireEvent.click(screen.getByText('This week'))

    // A fresh subscription was opened for the new week's document.
    expect(mockOnSnapshot.mock.calls.length).toBeGreaterThan(before)
    expect(screen.getByText('Week of Sep 7–11')).toBeInTheDocument()
  })

  it('never gates a week behind a name', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'reviewWeekSelection.ts'),
      'utf8',
    )
    expect(source).not.toMatch(/isLincoln|'Lincoln'|"Lincoln"|'London'|"London"/)
  })
})
