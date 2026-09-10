import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-329 — the Historical Hours dialog must not write one child's typed
 * backfill as another child's compliance record.
 *
 * This is the most serious surface in the UX-324 class: `handleSaveBackfill`
 * and `handleSaveQuickEstimate` both read the LIVE `activeChildId`, the dialog
 * stays mounted across a child change, and the quick-estimate path writes one
 * `hoursAdjustments` document per subject per month — so a single tap after a
 * switch could file a school year of hours against the wrong child, in the
 * collection the compliance pack and `collectHoursContributions` read.
 *
 * The positive control is the last case in each block: with the reset removed,
 * the typed figures survive the switch and Save is live, so the assertions
 * below fail. That is what makes them evidence rather than description.
 */

// ── Mocks at the boundaries ─────────────────────────────────────────────────

const mockUseActiveChild = vi.fn()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
  useAuth: () => ({ familyId: 'fam-1', profile: 'parents' }),
}))

vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: 'parents', canEdit: true }),
}))

/** Every write this page can make, so a leak is visible rather than silent. */
const addDoc = vi.fn()
vi.mock('firebase/firestore', () => ({
  addDoc: (ref: unknown, data: unknown) => addDoc(ref, data),
  deleteDoc: vi.fn(async () => {}),
  doc: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [], size: 0, empty: true })),
  query: vi.fn(() => ({})),
  updateDoc: vi.fn(async () => {}),
  where: vi.fn(() => ({})),
  writeBatch: vi.fn(() => ({ set: vi.fn(), commit: vi.fn(async () => {}) })),
  collection: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(() => 'ts'),
}))

// The real module calls `initializeFirestore` at import time.
vi.mock('../../core/firebase/firestore', () => ({
  db: {},
  artifactsCollection: () => ({}),
  dadLabReportsCollection: () => ({}),
  daysCollection: () => ({}),
  evaluationsCollection: () => ({}),
  hoursAdjustmentsCollection: () => ({}),
  hoursCollection: () => ({}),
}))

vi.mock('../../core/firebase/migrateHoursAdjustments', () => ({
  migrateUnattributedAdjustments: vi.fn(async () => 0),
}))

// Sibling sections that reach Firestore, jsPDF or the network of their own.
// None of them is what this file is about.
vi.mock('./ComplianceDashboard', () => ({ default: () => <div /> }))
vi.mock('./MonthlyTrend', () => ({ default: () => <div /> }))
vi.mock('./QuickAddHours', () => ({ default: () => <div /> }))
vi.mock('./ChapterResponsesTab', () => ({ default: () => <div /> }))
vi.mock('./EvaluationHistoryTab', () => ({ default: () => <div /> }))
vi.mock('./PortfolioPage', () => ({ default: () => <div /> }))
vi.mock('./compliancePackArchive', () => ({
  describeArchiveResult: () => '',
  requestCompliancePackArchive: vi.fn(async () => ({})),
}))

const LINCOLN = { id: 'lincoln', name: 'Lincoln' }
const LONDON = { id: 'london', name: 'London' }

function setActive(child: { id: string; name: string }) {
  mockUseActiveChild.mockReturnValue({
    activeChildId: child.id,
    activeChild: child,
    children: [LINCOLN, LONDON],
    setActiveChildId: vi.fn(),
    isChildProfile: false,
    isLoading: false,
    addChild: vi.fn(),
  })
}

/** Open the dialog and type a per-month backfill for the active child. */
async function typeMonthlyBackfill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /add historical hours/i }))
  const month = screen.getByLabelText(/^month$/i)
  await user.type(month, '2025-09')
  const readingHours = screen.getAllByRole('spinbutton')[0]
  await user.type(readingHours, '20')
}

describe('RecordsPage — a child switch does not re-target typed historical hours', () => {
  beforeEach(() => {
    addDoc.mockClear()
    setActive(LINCOLN)
  })

  it('clears the per-month draft and says the figures were not saved', async () => {
    const user = userEvent.setup()
    const { default: RecordsPage } = await import('./RecordsPage')
    const { rerender } = render(<RecordsPage />)

    await typeMonthlyBackfill(user)
    expect(screen.getByDisplayValue('2025-09')).toBeInTheDocument()

    // The header switches child; the page re-renders with the dialog open.
    setActive(LONDON)
    rerender(<RecordsPage />)

    expect(screen.queryByDisplayValue('2025-09')).not.toBeInTheDocument()
    expect(screen.getByText(/weren't saved|weren’t saved/i)).toBeInTheDocument()
    // Both children are named: "it wasn't saved" alone leaves the parent with
    // the question this defect exists around.
    expect(screen.getByText(/Lincoln/)).toBeInTheDocument()
  })

  it('leaves Save Historical Hours unreachable after the switch', async () => {
    const user = userEvent.setup()
    const { default: RecordsPage } = await import('./RecordsPage')
    const { rerender } = render(<RecordsPage />)

    await typeMonthlyBackfill(user)
    expect(screen.getByRole('button', { name: /save historical hours/i })).toBeEnabled()

    setActive(LONDON)
    rerender(<RecordsPage />)

    // POSITIVE CONTROL — before the fix this button stayed enabled with
    // Lincoln's figures behind it and wrote them as London's adjustments.
    expect(screen.getByRole('button', { name: /save historical hours/i })).toBeDisabled()
    expect(addDoc).not.toHaveBeenCalled()
  })

  it('clears the quick-estimate range, which could misattribute many months at once', async () => {
    const user = userEvent.setup()
    const { default: RecordsPage } = await import('./RecordsPage')
    const { rerender } = render(<RecordsPage />)

    await user.click(screen.getByRole('button', { name: /add historical hours/i }))
    await user.click(screen.getByRole('button', { name: /quick estimate/i }))
    await user.type(screen.getByLabelText(/start month/i), '2024-09')
    await user.type(screen.getByLabelText(/end month/i), '2025-05')
    await user.type(screen.getByLabelText(/hours per school day/i), '3')
    expect(screen.getByRole('button', { name: /save quick estimate/i })).toBeEnabled()

    setActive(LONDON)
    rerender(<RecordsPage />)

    // POSITIVE CONTROL — nine months × five subjects is 45 adjustment
    // documents; before the fix one tap here filed all of them under London.
    expect(screen.getByRole('button', { name: /save quick estimate/i })).toBeDisabled()
    expect(screen.queryByDisplayValue('2024-09')).not.toBeInTheDocument()
    expect(addDoc).not.toHaveBeenCalled()
  })

  /**
   * Codex round 1, P1 — `estimateDaysPerWeek` has a real default, so it was
   * left out of the emptiness test AND, by mistake, out of the reset. A school
   * week set for one child then priced the next child's compliance hours.
   */
  it('restores days-per-week, so one child’s week cannot price another’s hours', async () => {
    const user = userEvent.setup()
    const { default: RecordsPage } = await import('./RecordsPage')
    const { rerender } = render(<RecordsPage />)

    await user.click(screen.getByRole('button', { name: /add historical hours/i }))
    await user.click(screen.getByRole('button', { name: /quick estimate/i }))
    const days = screen.getByLabelText(/days per week/i)
    await user.clear(days)
    await user.type(days, '5')
    expect(screen.getByDisplayValue('5')).toBeInTheDocument()

    setActive(LONDON)
    rerender(<RecordsPage />)

    // POSITIVE CONTROL — before the fix this stayed at 5, and a fresh range
    // typed for London was costed on Lincoln's week.
    expect(screen.getByLabelText(/days per week/i)).toHaveValue(4)
    // Changing only this field is still a typed draft, so the loss is stated.
    expect(screen.getByText(/weren't saved|weren’t saved/i)).toBeInTheDocument()
  })

  it('says nothing when there was no typed draft to lose', async () => {
    const { default: RecordsPage } = await import('./RecordsPage')
    const { rerender } = render(<RecordsPage />)

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /add historical hours/i }))

    setActive(LONDON)
    rerender(<RecordsPage />)

    // An untouched dialog needs no announcement — a notice that fires on every
    // switch is one nobody reads by the time it matters.
    expect(screen.queryByText(/weren't saved|weren’t saved/i)).not.toBeInTheDocument()
  })

  it('still writes for the child on screen once figures are typed for them', async () => {
    const user = userEvent.setup()
    const { default: RecordsPage } = await import('./RecordsPage')
    const { rerender } = render(<RecordsPage />)

    await typeMonthlyBackfill(user)
    setActive(LONDON)
    rerender(<RecordsPage />)

    // London's own figures, typed for London, are written for London — the
    // reset closes a hole, it does not disable the feature.
    const month = screen.getByLabelText(/^month$/i)
    await user.type(month, '2025-10')
    await user.type(screen.getAllByRole('spinbutton')[0], '12')
    await user.click(screen.getByRole('button', { name: /save historical hours/i }))

    expect(addDoc).toHaveBeenCalled()
    const written = addDoc.mock.calls.map(
      (c) => c[1] as unknown as { childId: string; minutes: number },
    )
    expect(written.every((w) => w.childId === 'london')).toBe(true)
    // No hours math changed: 12 hours is still 720 minutes.
    expect(written.some((w) => w.minutes === 720)).toBe(true)
  })
})

/**
 * UX-340 (FIX-223) — the SECOND editor on this page's hours rail.
 *
 * UX-329 fixed the *Add Historical Hours* dialog above and filed the
 * always-visible **Manual Hours Adjustment** form as a P1 it could not touch,
 * because the owner's authorisation named the dialog specifically. `DOC-25`'s
 * attribution-only pre-authorisation is what unblocks it.
 *
 * The form's *Attribute to* selector is re-synced to the newly active child by
 * an effect, while the typed minutes and reason stand — so a switch silently
 * re-pointed a filled adjustment. The POSITIVE CONTROL is each block's final
 * assertion: remove the render-time reset and they fail, because Lincoln's
 * minutes reach `addDoc` as London's row.
 */
describe('RecordsPage — a child switch does not re-target a typed hours adjustment', () => {
  beforeEach(() => {
    addDoc.mockClear()
    setActive(LINCOLN)
  })

  async function typeAdjustment(user: ReturnType<typeof userEvent.setup>, minutes: string) {
    await user.type(screen.getByLabelText(/minutes/i), minutes)
    await user.type(screen.getByLabelText(/reason/i), 'Missed co-op session')
  }

  it('clears the typed adjustment and names whose it was', async () => {
    const user = userEvent.setup()
    const { default: RecordsPage } = await import('./RecordsPage')
    const { rerender } = render(<RecordsPage />)

    await typeAdjustment(user, '45')
    expect(screen.getByRole('button', { name: /add adjustment/i })).toBeEnabled()

    setActive(LONDON)
    rerender(<RecordsPage />)

    // POSITIVE CONTROL — before the reset the minutes and reason survived and
    // the button stayed live, with the attribution silently moved to London.
    expect(screen.getByLabelText(/minutes/i)).toHaveValue(null)
    expect(screen.getByLabelText(/reason/i)).toHaveValue('')
    expect(screen.getByRole('button', { name: /add adjustment/i })).toBeDisabled()

    const notice = screen.getByText(/wasn't saved|wasn’t saved/i)
    expect(notice).toBeInTheDocument()
    expect(notice.textContent).toContain('Lincoln')
    expect(notice.textContent).toContain('London')
    expect(addDoc).not.toHaveBeenCalled()
  })

  it('says nothing when there was no typed adjustment to lose', async () => {
    const { default: RecordsPage } = await import('./RecordsPage')
    const { rerender } = render(<RecordsPage />)

    setActive(LONDON)
    rerender(<RecordsPage />)

    // A notice that fires on every switch is one nobody reads by the time it
    // matters — and on this rail a false "wasn't saved" invites entering the
    // same hours twice (UX-329's own round-4 finding, one form over).
    expect(screen.queryByText(/wasn't saved|wasn’t saved/i)).not.toBeInTheDocument()
  })

  it('writes the child on screen, with the minutes exactly as typed', async () => {
    const user = userEvent.setup()
    const { default: RecordsPage } = await import('./RecordsPage')
    const { rerender } = render(<RecordsPage />)

    await typeAdjustment(user, '45')
    setActive(LONDON)
    rerender(<RecordsPage />)

    await typeAdjustment(user, '30')
    await user.click(screen.getByRole('button', { name: /add adjustment/i }))

    expect(addDoc).toHaveBeenCalledTimes(1)
    const written = addDoc.mock.calls[0][1] as unknown as {
      childId: string
      minutes: number
      reason: string
    }
    expect(written.childId).toBe('london')
    // No hours math changed: the typed figure is written through untouched —
    // not re-based, not rounded, not bucketed. `DOC-25` term 1, asserted.
    expect(written.minutes).toBe(30)
    expect(written.reason).toBe('Missed co-op session')
  })
})
