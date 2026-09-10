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
