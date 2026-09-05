import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurriculumSnapshot, WeeklyReview } from '../../core/types'

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

const review = (curriculumPositions?: CurriculumSnapshot): WeeklyReview =>
  ({ childId: 'c1', weekKey: '2026-08-30', curriculumPositions } as unknown as WeeklyReview)

function renderSection(
  current?: CurriculumSnapshot,
  priors: CurriculumSnapshot[] = [],
  historyState: { loading?: boolean; failed?: boolean } = {},
) {
  return render(
    <WeekPaceSection
      familyId="fam-1"
      childId="c1"
      weekKey="2026-08-30"
      review={review(current)}
      history={priors.map((s) => review(s))}
      historyLoading={historyState.loading ?? false}
      historyFailed={historyState.failed ?? false}
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
