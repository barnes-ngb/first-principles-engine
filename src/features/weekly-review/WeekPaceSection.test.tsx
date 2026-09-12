import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurriculumSnapshot, WeekEvidence, WeeklyReview } from '../../core/types'

// ── Mocks at the boundaries ─────────────────────────────────────────────────
// The section's only reach is the three range reads behind `useWeekHours`.
// Stub the hook so these tests exercise the SENTENCES and the audience gate,
// not the network. Nothing here writes — this is a read-side surface.
const mockUseActiveChild = vi.fn()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

const mockUseWeekHours = vi.fn()
vi.mock('./useWeekHours', () => ({
  useWeekHours: (...args: unknown[]) => mockUseWeekHours(...args),
}))

import WeekPaceSection from './WeekPaceSection'

// ── Fixtures ────────────────────────────────────────────────────────────────

const AUG_17 = '2026-08-17T01:00:00.000Z'
const SEP_07 = '2026-09-07T01:00:00.000Z'

const snapshot = (
  recordedAt: string,
  currentPosition: number,
  completed = false,
): CurriculumSnapshot => ({
  recordedAt,
  weekKey: recordedAt.slice(0, 10),
  positions: [
    {
      configId: 'w1',
      name: 'TGTB Math',
      currentPosition,
      totalUnits: 60,
      unitLabel: 'lesson',
      ...(completed ? { completed: true } : {}),
    },
  ],
})

// A review the cron GENERATED. `status` is the marker `reviewWasGenerated`
// reads — the reflection merge writes no status, so presence of one is what
// separates "the cron ran" from "a parent answered on Saturday".
const review = (curriculumPositions?: CurriculumSnapshot): WeeklyReview =>
  ({
    childId: 'c1',
    weekKey: '2026-08-30',
    status: 'draft',
    curriculumPositions,
  }) as unknown as WeeklyReview

/** A week's evidence summary, as the Cloud Function assembles it. */
const evidenceOf = (
  created: number,
  sessions: number,
  taught: number,
): WeekEvidence => ({
  books: {
    booksCreated: Array.from({ length: created }, (_, i) => ({
      id: `b${i}`,
      title: `Book ${i}`,
      pages: 6,
      isAiGenerated: false,
    })),
    booksCompleted: [],
    readingSessions: { count: sessions, totalMinutes: 40, booksRead: [] },
  },
  teachBacks: {
    count: taught,
    bySubject: {},
    audioCount: taught,
    textCount: 0,
    examples: [],
  },
})

/**
 * An instant on the Saturday of the week these fixtures name (`2026-08-30` →
 * Sep 5), in Central.
 *
 * The default `now` for every render below, because "Saturday, before the
 * overnight save" is the state this suite was written for and the state the
 * promise sentence is true in (UX-407). A test about the OTHER branch passes its
 * own later instant. The `Z` is deliberate: the sentence's boundary is read in
 * America/Chicago whatever the runner's zone, so these fixtures name absolute
 * moments rather than local ones.
 */
const WEEK_SATURDAY = new Date('2026-09-05T18:00:00Z') // 1pm Central, Saturday

/** Render with an explicit review document — including `null`, the Saturday case. */
function renderWithReview(
  doc: WeeklyReview | null,
  priors: CurriculumSnapshot[] = [],
  historyState: {
    loading?: boolean
    failed?: boolean
    reviewFailed?: boolean
    now?: Date
  } = {},
) {
  return render(
    <WeekPaceSection
      familyId="fam-1"
      childId="c1"
      weekKey="2026-08-30"
      review={doc}
      reviewFailed={historyState.reviewFailed ?? false}
      history={priors.map((s) => review(s))}
      historyLoading={historyState.loading ?? false}
      historyFailed={historyState.failed ?? false}
      now={historyState.now ?? WEEK_SATURDAY}
    />,
  )
}

function renderSection(
  current?: CurriculumSnapshot,
  priors: CurriculumSnapshot[] = [],
  historyState: { loading?: boolean; failed?: boolean; now?: Date } = {},
) {
  return render(
    <WeekPaceSection
      familyId="fam-1"
      childId="c1"
      weekKey="2026-08-30"
      review={review(current)}
      reviewFailed={false}
      history={priors.map((s) => review(s))}
      historyLoading={historyState.loading ?? false}
      historyFailed={historyState.failed ?? false}
      now={historyState.now ?? WEEK_SATURDAY}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseActiveChild.mockReturnValue({ isChildProfile: false })
  mockUseWeekHours.mockReturnValue({ totalMinutes: 288, loading: false, error: null })
})

// ── The audience rule — the run's central invariant ─────────────────────────

describe('WeekPaceSection is parent-only (UX-213)', () => {
  it('renders for a parent profile', () => {
    renderSection()
    expect(screen.getByText('4.8 hours logged this week.')).toBeInTheDocument()
  })

  it('renders nothing at all for a child profile', () => {
    mockUseActiveChild.mockReturnValue({ isChildProfile: true })
    const { container } = renderSection(snapshot(SEP_07, 14), [snapshot(AUG_17, 10)])
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText(/hours logged/)).not.toBeInTheDocument()
    expect(screen.queryByText(/in 3 weeks/)).not.toBeInTheDocument()
  })

  it('costs a child profile zero Firestore reads — the gate is above the hook', () => {
    mockUseActiveChild.mockReturnValue({ isChildProfile: true })
    renderSection(snapshot(SEP_07, 14), [snapshot(AUG_17, 10)])
    expect(mockUseWeekHours).not.toHaveBeenCalled()
  })

  it('gates on capability, never on a name', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'WeekPaceSection.tsx'),
      'utf8',
    )
    expect(source).not.toMatch(/isLincoln|'Lincoln'|"Lincoln"|'London'|"London"/)
  })
})

// ── The hours line (UX-211) ─────────────────────────────────────────────────

describe('the hours line states a number with no target', () => {
  it('names which count it is, so it reconciles with the Records page', () => {
    renderSection()
    expect(
      screen.getByText(
        'Counted the same way as the Records page and the compliance pack.',
      ),
    ).toBeInTheDocument()
  })

  it('shows no bar, no percentage and no ratio', () => {
    const { container } = renderSection(snapshot(SEP_07, 14), [snapshot(AUG_17, 10)])
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
    expect(container.querySelector('.MuiLinearProgress-root')).toBeNull()
    expect(container.textContent).not.toMatch(/%/)
    expect(container.textContent).not.toMatch(/\d\s*\/\s*\d/)
  })

  it('says so plainly when nothing was logged', () => {
    mockUseWeekHours.mockReturnValue({ totalMinutes: 0, loading: false, error: null })
    renderSection()
    expect(screen.getByText('No hours logged this week.')).toBeInTheDocument()
  })

  it('never presents a failed read as an affirmative zero', () => {
    // A network, permission or index failure leaves the source arrays empty and
    // would otherwise fold to "No hours logged this week." — a records claim
    // made on no records.
    mockUseWeekHours.mockReturnValue({
      totalMinutes: 0,
      loading: false,
      error: new Error('permission-denied'),
    })
    renderSection()
    expect(screen.queryByText('No hours logged this week.')).not.toBeInTheDocument()
    expect(
      screen.getByText('Couldn’t read this week’s hours. Try again in a moment.'),
    ).toBeInTheDocument()
    // And it does not claim to be the compliance count while it has no count.
    expect(screen.queryByText(/Counted the same way/)).not.toBeInTheDocument()
  })
})

// ── The four states of the rate line (UX-213) ───────────────────────────────

describe('the observed-rate line, in each state', () => {
  it('no snapshot at all — says nothing about coverage', () => {
    const { container } = renderSection(undefined, [])
    expect(container.textContent).not.toMatch(/lesson|rate needs/i)
  })

  it('one snapshot — reports the rate as unknown rather than estimating', () => {
    renderSection(snapshot(SEP_07, 14), [])
    expect(
      screen.getByText('First week recorded — a rate needs two.'),
    ).toBeInTheDocument()
  })

  it('some progress — states what was covered over how long', () => {
    renderSection(snapshot(SEP_07, 14), [snapshot(AUG_17, 10)])
    expect(
      screen.getByText(
        'TGTB Math — lesson 14 of 60. 4 lessons in 3 weeks (since Aug 17).',
      ),
    ).toBeInTheDocument()
  })

  it('zero progress — states it plainly, and never as a failure', () => {
    const { container } = renderSection(snapshot(SEP_07, 10), [snapshot(AUG_17, 10)])
    expect(
      screen.getByText(
        'TGTB Math — lesson 10 of 60. No lessons covered in 3 weeks (since Aug 17).',
      ),
    ).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/behind|should|must|falling|failed/i)
  })

  it('says nothing about a rate while the earlier weeks are still loading', () => {
    // The history arrives asynchronously, so an empty list means "not yet",
    // not "there are none" — flashing "First week recorded" on every page load
    // of a child who has months of snapshots would make the line untrustworthy.
    const { container } = renderSection(snapshot(SEP_07, 14), [], { loading: true })
    expect(container.textContent).not.toMatch(/rate needs two/)
    expect(screen.getByText('4.8 hours logged this week.')).toBeInTheDocument()
  })

  it('reports a failed history read as unavailable, never as a first week', () => {
    const { container } = renderSection(snapshot(SEP_07, 14), [], { failed: true })
    expect(container.textContent).not.toMatch(/rate needs two/)
    expect(
      screen.getByText(
        'Couldn’t read the earlier weeks, so there’s no rate to show yet.',
      ),
    ).toBeInTheDocument()
  })
})

// ── The evidence counts (UX-219) ────────────────────────────────────────────

describe('the week’s evidence counts sit under the hours', () => {
  it('lists what the week produced', () => {
    renderWithReview({
      childId: 'c1',
      weekKey: '2026-08-30',
      evidence: evidenceOf(2, 3, 2),
    } as unknown as WeeklyReview)
    expect(
      screen.getByText('2 books made · 3 reading sessions · 2 teach-backs.'),
    ).toBeInTheDocument()
  })

  it('states a genuinely empty week plainly, never hidden and never red', () => {
    const { container } = renderWithReview({
      childId: 'c1',
      weekKey: '2026-08-30',
      evidence: evidenceOf(0, 0, 0),
    } as unknown as WeeklyReview)
    expect(
      screen.getByText('No books or teach-backs logged this week.'),
    ).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/behind|should|target|goal|%/i)
  })

  it('says nothing at all when the week has no summary yet', () => {
    // Absence is not zero. The cron assembles `evidence`; before it runs there
    // is nothing to report, and "No books this week" would be a claim.
    const { container } = renderWithReview(null)
    expect(container.textContent).not.toMatch(/No books or teach-backs/)
    expect(container.textContent).not.toMatch(/books made|teach-back/)
  })
})

// ── Before the overnight cron has fired (UX-219 / UX-263) ──────────────────

describe('the Saturday state — the week is named before its review exists', () => {
  it('still states the hours, which are folded live and never came from the doc', () => {
    renderWithReview(null)
    expect(screen.getByText('4.8 hours logged this week.')).toBeInTheDocument()
  })

  it('says when the positions land, rather than claiming a first week', () => {
    const { container } = renderWithReview(null, [snapshot(AUG_17, 10)])
    expect(
      screen.getByText(
        'This week’s workbook positions haven’t been recorded yet — they’re saved overnight, once Saturday is over.',
      ),
    ).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/rate needs two/)
  })

  it('does not show the pending line once a snapshot exists', () => {
    const { container } = renderSection(snapshot(SEP_07, 14), [snapshot(AUG_17, 10)])
    expect(container.textContent).not.toMatch(/haven’t been recorded yet/)
  })

  // ── UX-407: the promise expires ───────────────────────────────────────────
  //
  // The owner read *"they're saved overnight, once Saturday is over"* on a
  // FRIDAY EVENING about a week whose Saturday had passed six days earlier. The
  // sentence was not early, it was false, and it would have been false every
  // time the page was opened. UX-406's selector makes it worse: a parent can
  // now name a week whose Saturday is a fortnight back.

  it('stops promising the overnight save once that Saturday has passed', () => {
    const { container } = renderWithReview(null, [snapshot(AUG_17, 10)], {
      // The week is 2026-08-30 (Saturday Sep 5). This is the owner's own Friday
      // evening, 8:30pm Central.
      now: new Date('2026-09-12T01:30:00Z'),
    })
    expect(container.textContent).not.toMatch(/saved overnight, once Saturday is over/)
    expect(
      screen.getByText(
        'No workbook positions were saved for this week, so there’s no coverage rate to show. The hours and evidence above are read live and aren’t affected.',
      ),
    ).toBeInTheDocument()
  })

  it('still states the hours on a week whose snapshot never arrived', () => {
    // The whole point of the replacement sentence: the numbers above it are
    // folded live from the records and were never in that document.
    renderWithReview(null, [], { now: new Date('2026-09-12T01:30:00Z') })
    expect(screen.getByText('4.8 hours logged this week.')).toBeInTheDocument()
  })

  it('says neither sentence once the cron has written the week', () => {
    const { container } = renderSection(snapshot(SEP_07, 14), [snapshot(AUG_17, 10)], {
      now: new Date('2026-09-12T01:30:00Z'),
    })
    expect(container.textContent).not.toMatch(/haven’t been recorded yet/)
    expect(container.textContent).not.toMatch(/No workbook positions were saved/)
  })

  it('never promises the overnight save to a review that exists without a snapshot', () => {
    // Codex round 1, P2. `loadCurriculumSnapshot` omits `curriculumPositions`
    // when the child has no positioned workbook config, and again when the
    // config read throws — the cron HAS run in both cases and nothing more is
    // coming, so this promise would be repeated every week and never come true.
    const { container } = renderWithReview({
      childId: 'c1',
      weekKey: '2026-08-30',
      status: 'draft',
    } as unknown as WeeklyReview)
    expect(container.textContent).not.toMatch(/saved overnight, once Saturday is over/)
    // And it makes no other claim about coverage either.
    expect(container.textContent).not.toMatch(/rate needs two|lesson/i)
  })

  it('still promises the overnight save after a parent answers on Saturday', () => {
    // Codex round 3, P2. `writeWeekReflection` CREATES the document when the
    // answer is saved before the cron runs, so a non-null review stopped
    // meaning "generated" — and keying on presence would have made the only
    // explanation of the missing rate vanish the moment the parent used the
    // page. `status` is the marker, and the reflection merge writes none.
    const { container } = renderWithReview({
      childId: 'c1',
      weekKey: '2026-08-30',
      reflection: { answer: 'about-right', answeredAt: '2026-09-05T18:00:00.000Z' },
    } as unknown as WeeklyReview)
    expect(container.textContent).toMatch(/saved overnight, once Saturday is over/)
  })

  it('never presents a failed review read as "the cron hasn’t run"', () => {
    // Codex round 3, P2, the other direction: a dropped listener leaves the
    // review null with loading finished, which is indistinguishable from the
    // Saturday case unless the caller says which it was.
    const { container } = renderWithReview(null, [], { reviewFailed: true })
    expect(container.textContent).not.toMatch(/saved overnight, once Saturday is over/)
    expect(
      screen.getByText(
        'Couldn’t read this week’s review, so there’s nothing to say about coverage yet.',
      ),
    ).toBeInTheDocument()
  })

  it('renders nothing for a child profile even with no document', () => {
    mockUseActiveChild.mockReturnValue({ isChildProfile: true })
    const { container } = renderWithReview(null)
    expect(container).toBeEmptyDOMElement()
    expect(mockUseWeekHours).not.toHaveBeenCalled()
  })
})

// ── Nothing below the audience line reaches a kid surface ───────────────────

const FEATURES_DIR = join(import.meta.dirname, '..')
const KID_SURFACE_DIRS = ['today', 'quest', 'avatar', 'books', 'monthly-review', 'workshop']

function sourcesUnder(dir: string): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push({ file: full, text: readFileSync(full, 'utf8') })
      }
    }
  }
  walk(dir)
  return out
}

describe('the parent-only rate reaches no kid-facing surface', () => {
  it('is imported nowhere under the kid feature directories', () => {
    for (const name of KID_SURFACE_DIRS) {
      for (const { file, text } of sourcesUnder(join(FEATURES_DIR, name))) {
        expect(text, `${file} imports the parent rate`).not.toMatch(
          /WeekPaceSection|computeObservedCoverage|selectBaselineSnapshot/,
        )
      }
    }
  })

  it('leaves the child-facing coverage engine exactly as it was', () => {
    const pace = readFileSync(
      join(FEATURES_DIR, 'planner-chat', 'pace.logic.ts'),
      'utf8',
    )
    // The ignored required-pace params stay ignored — this run did not
    // re-enable them, and `calculatePace` still says only what is covered.
    expect(pace).toContain('_requiredPerWeek')
    expect(pace).toContain('_plannedPerWeek')
    expect(pace).toMatch(/No pace pressure, no deadline math/)
    // Still underscore-prefixed everywhere they appear, which is how this
    // codebase spells "declared and deliberately unread".
    expect(pace).not.toMatch(/(?<!_)requiredPerWeek/)
    expect(pace).not.toMatch(/(?<!_)plannedPerWeek/)
  })

  it('keeps PaceGaugePanel unmounted, as it has been', () => {
    for (const { file, text } of sourcesUnder(FEATURES_DIR)) {
      if (file.endsWith('PaceGaugePanel.tsx')) continue
      expect(text, `${file} mounts PaceGaugePanel`).not.toMatch(/PaceGaugePanel/)
    }
  })
})

// ── The sentence's clock advances without a reload (UX-407, round 2) ────────

describe('the positions sentence corrects itself at the deadline', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stops promising the save once the deadline passes, with no reload', () => {
    vi.useFakeTimers()
    // Mounted at 11pm Central on the Saturday — an hour and a quarter before the
    // save is due at 00:15 CT Sunday.
    const mountedAt = new Date('2026-09-06T04:00:00Z')
    vi.setSystemTime(mountedAt)
    renderWithReview(null, [], { now: mountedAt })
    expect(screen.getByText(/saved overnight, once Saturday is over/)).toBeInTheDocument()

    // The tab is left open across the deadline. The page's WEEK is unchanged —
    // only this sentence's clock moves.
    act(() => {
      vi.advanceTimersByTime(90 * 60 * 1000)
    })

    expect(screen.queryByText(/saved overnight, once Saturday is over/)).not.toBeInTheDocument()
    expect(screen.getByText(/No workbook positions were saved for this week/)).toBeInTheDocument()
  })

  it('re-reads the clock when the tab comes back', () => {
    vi.useFakeTimers()
    const mountedAt = new Date('2026-09-06T04:00:00Z')
    vi.setSystemTime(mountedAt)
    renderWithReview(null, [], { now: mountedAt })
    expect(screen.getByText(/saved overnight, once Saturday is over/)).toBeInTheDocument()

    // A phone leaves by switching apps and never unmounts, so the timer is not
    // the only route back — this is the common one.
    vi.setSystemTime(new Date('2026-09-06T06:00:00Z'))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(screen.getByText(/No workbook positions were saved for this week/)).toBeInTheDocument()
  })

  it('schedules nothing once the deadline is already past', () => {
    vi.useFakeTimers()
    const late = new Date('2026-09-12T01:30:00Z') // the owner's Friday
    vi.setSystemTime(late)
    renderWithReview(null, [], { now: late })
    expect(screen.getByText(/No workbook positions were saved for this week/)).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
  })
})
