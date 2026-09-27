import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurriculumSnapshot, WeeklyReview } from '../../core/types'

/**
 * UX-447 / UX-420 — what the page says about a week whose summary could not be
 * put together, and the one door it offers.
 *
 * The owner's own screen (Sunday 2026-09-27, week of 2026-09-20) read
 * *"No workbook positions were saved for this week"*. With FIX-255 deployed the
 * run records the positions before it assembles the week, so the document for
 * that failure carries `status` + `curriculumPositions` + `contextError`, and
 * these tests pin what a parent reads over it — and that the *Try again* is
 * parent-only, fires once, and never appears where a narrative stands.
 */

const mockUseActiveChild = vi.fn()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

const mockUseWeekHours = vi.fn()
vi.mock('./useWeekHours', () => ({
  useWeekHours: (...args: unknown[]) => mockUseWeekHours(...args),
}))

const mockRetry = vi.fn()
vi.mock('./retryWeeklyReview', () => ({
  retryWeeklyReview: (...args: unknown[]) => mockRetry(...args),
}))

const mockReportError = vi.fn()
vi.mock('../../core/observability', () => ({
  ErrorSource: { Handled: 'handled' },
  reportError: (...args: unknown[]) => mockReportError(...args),
}))

import WeekPaceSection from './WeekPaceSection'
import {
  CONTEXT_FAILED_LINE,
  CONTEXT_FAILED_NO_POSITIONS_LINE,
  NARRATIVE_FAILED_LINE,
  NARRATIVE_STALE_LINE,
  POSITIONS_MISSING_LINE,
  WEEK_RETRY_FAILED_LINE,
  WEEK_RETRY_NOTE,
  WEEK_RETRY_NOTE_NO_POSITIONS,
  contextFailed,
  narrativeFailureLine,
  reviewHasPositions,
  weekRetryOffer,
} from './weekHours'

const WEEK = '2026-09-20'
/** Sunday 2026-09-27, 11:28 Central — when the owner looked. */
const OWNER_LOOKED = new Date('2026-09-27T16:28:00Z')

const positions: CurriculumSnapshot = {
  recordedAt: '2026-09-27T05:15:00.000Z',
  weekKey: WEEK,
  positions: [
    { configId: 'w1', name: 'TGTB Math Level 3', currentPosition: 14, totalUnits: 60, unitLabel: 'lesson' },
  ],
}

const contextError = {
  message: 'The week’s records could not be gathered for a summary. The function’s logs have the cause.',
  reason: 'assembly-failed',
  at: '2026-09-27T05:15:02.000Z',
}

/** The document FIX-255 leaves when the assembly throws. */
const assemblyFailed = (withPositions = true): WeeklyReview =>
  ({
    childId: 'c1',
    weekKey: WEEK,
    status: 'snapshot-only',
    ...(withPositions ? { curriculumPositions: positions } : {}),
    contextError,
  }) as unknown as WeeklyReview

function renderWith(doc: WeeklyReview | null, childId = 'c1') {
  return render(
    <WeekPaceSection
      familyId="fam-1"
      childId={childId}
      weekKey={WEEK}
      review={doc}
      reviewFailed={false}
      history={[]}
      historyLoading={false}
      historyFailed={false}
      now={OWNER_LOOKED}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseActiveChild.mockReturnValue({ isChildProfile: false })
  mockUseWeekHours.mockReturnValue({ totalMinutes: 1722, loading: false, error: null })
})

describe('the sentence over a week whose records could not be gathered (UX-447)', () => {
  it('POSITIVE CONTROL — with no status on file, the owner’s sentence is what shows', () => {
    // The pre-FIX-255 document for that failure: nothing at all.
    renderWith(null)
    expect(screen.getByText(POSITIONS_MISSING_LINE)).toBeInTheDocument()
  })

  it('with the positions on file, says so — and stops saying they were not', () => {
    const { container } = renderWith(assemblyFailed())
    expect(screen.getByText(CONTEXT_FAILED_LINE)).toBeInTheDocument()
    expect(container.textContent).not.toContain(POSITIONS_MISSING_LINE)
    // The numbers above are live and still shown.
    expect(screen.getByText('28.7 hours logged this week.')).toBeInTheDocument()
  })

  it('claims nothing about positions when none are on file', () => {
    renderWith(assemblyFailed(false))
    expect(screen.getByText(CONTEXT_FAILED_NO_POSITIONS_LINE)).toBeInTheDocument()
    expect(screen.queryByText(/Its workbook positions were saved/)).not.toBeInTheDocument()
  })

  it('never shows the stored operator sentence to a parent', () => {
    const { container } = renderWith(assemblyFailed())
    expect(container.textContent).not.toContain('function’s logs')
  })
})

describe('narrativeFailureLine is ONE decision over both halves', () => {
  it('a standing narrative wins over a context failure', () => {
    expect(
      narrativeFailureLine({ ...assemblyFailed(), summary: 'Steady week.' } as never),
    ).toBe(NARRATIVE_STALE_LINE)
  })

  it('a context failure outranks an older narrative failure', () => {
    expect(
      narrativeFailureLine({
        ...assemblyFailed(),
        narrativeError: { message: 'x', at: 'y' },
      } as never),
    ).toBe(CONTEXT_FAILED_LINE)
  })

  it('a narrative failure alone is unchanged', () => {
    expect(
      narrativeFailureLine({ narrativeError: { message: 'x', at: 'y' }, contextError: null }),
    ).toBe(NARRATIVE_FAILED_LINE)
  })

  it('reads only a real object as a failure — a written null is a success', () => {
    expect(contextFailed({ contextError: null })).toBe(false)
    expect(contextFailed({ contextError: 'boom' })).toBe(false)
    expect(contextFailed({ contextError })).toBe(true)
    expect(reviewHasPositions({ curriculumPositions: { positions: [] } })).toBe(false)
    expect(reviewHasPositions({ curriculumPositions: positions })).toBe(true)
  })
})

describe('Try again (UX-420)', () => {
  it('is offered only where a failure is recorded and no narrative stands', () => {
    expect(weekRetryOffer(null)).toBeNull()
    expect(weekRetryOffer({ status: 'draft', summary: 'Steady.' } as never)).toBeNull()
    expect(weekRetryOffer({ ...assemblyFailed(), summary: 'Steady.' } as never)).toBeNull()
    expect(
      weekRetryOffer({ narrativeError: { message: 'x', at: 'y' }, wins: ['Phonics'] }),
    ).toBeNull()
    expect(weekRetryOffer(assemblyFailed())).toMatchObject({ label: 'Try again' })
    expect(weekRetryOffer({ narrativeError: { message: 'x', at: 'y' } })).not.toBeNull()
  })

  it('says before the tap that it cannot save positions for a week without them', () => {
    renderWith(assemblyFailed(false))
    expect(screen.getByText(WEEK_RETRY_NOTE_NO_POSITIONS)).toBeInTheDocument()
  })

  it('does not say so where the positions are already on file', () => {
    renderWith(assemblyFailed())
    expect(screen.getByText(WEEK_RETRY_NOTE)).toBeInTheDocument()
    expect(screen.queryByText(WEEK_RETRY_NOTE_NO_POSITIONS)).not.toBeInTheDocument()
  })

  it('does not render for a kid profile', () => {
    mockUseActiveChild.mockReturnValue({ isChildProfile: true })
    renderWith(assemblyFailed())
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('does not render for a week whose narrative stands', () => {
    renderWith({ ...assemblyFailed(), status: 'draft', summary: 'Steady.' } as never)
    expect(screen.getByText(NARRATIVE_STALE_LINE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('does not render on a week with no failure recorded', () => {
    renderWith(null)
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('fires ONCE however many times it is tapped, with the child and week it names', async () => {
    let resolve: () => void = () => undefined
    mockRetry.mockReturnValue(new Promise<void>((r) => (resolve = r)))
    renderWith(assemblyFailed())

    const button = screen.getByRole('button', { name: 'Try again' })
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)

    expect(mockRetry).toHaveBeenCalledTimes(1)
    expect(mockRetry).toHaveBeenCalledWith({ familyId: 'fam-1', childId: 'c1', weekKey: WEEK })
    expect(screen.getByRole('button', { name: 'Asking…' })).toBeDisabled()

    await act(async () => resolve())
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
  })

  it('says so when the call fails, without claiming anything about the records', async () => {
    mockRetry.mockRejectedValue(new Error('internal: Weekly review failed: SECRET'))
    renderWith(assemblyFailed())

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    })

    expect(screen.getByText(WEEK_RETRY_FAILED_LINE)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('SECRET')
    // A handled failure reaches the sink, as its shape and never its text.
    expect(mockReportError).toHaveBeenCalledTimes(1)
    const report = mockReportError.mock.calls[0][0] as { message: string; source: string }
    expect(report.source).toBe('handled')
    expect(JSON.stringify(report)).not.toContain('SECRET')
  })

  it('does not carry one boy’s failed attempt onto the other’s week', async () => {
    mockRetry.mockRejectedValue(new Error('boom'))
    const { rerender } = renderWith(assemblyFailed())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    })
    expect(screen.getByText(WEEK_RETRY_FAILED_LINE)).toBeInTheDocument()

    rerender(
      <WeekPaceSection
        familyId="fam-1"
        childId="c2"
        weekKey={WEEK}
        review={assemblyFailed()}
        reviewFailed={false}
        history={[]}
        historyLoading={false}
        historyFailed={false}
        now={OWNER_LOOKED}
      />,
    )
    expect(screen.queryByText(WEEK_RETRY_FAILED_LINE)).not.toBeInTheDocument()
  })

  it('gates on capability, never on a name', () => {
    const source = readFileSync(join(import.meta.dirname, 'WeekRetryControl.tsx'), 'utf8')
    expect(source).toMatch(/isChildProfile/)
    expect(source).not.toMatch(/isLincoln|'Lincoln'|"Lincoln"|'London'|"London"/)
  })
})
