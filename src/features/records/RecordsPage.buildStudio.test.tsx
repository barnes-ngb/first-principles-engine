import { act, fireEvent, render as renderInTest, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  RELOAD_NUDGE_MS,
  RELOAD_RETRY_BASE_MS,
  RELOAD_RETRY_MAX_MS,
} from './recordsReloadRetry'

const render = (element: ReactElement) => renderInTest(element, { wrapper: MemoryRouter })
vi.mock('./dataReviewExportChildren', () => ({ loadReviewExportChildren: async () => [] }))

/**
 * Parent Records × Build Studio credit rows.
 *
 *   • A child profile that reaches /records directly sees neither the section nor
 *     the credited rows in the shared `hoursEntries` slice (so not in the totals
 *     or the exports that consume it); a parent keeps them as normal rows.
 *   • The section is withheld until the family, child and Records read all agree,
 *     even when two families happen to use the same child id.
 */

const LINCOLN = { id: 'lincoln', name: 'Lincoln' }
const LONDON = { id: 'london', name: 'London' }

const state = {
  familyId: 'fam-1',
  childrenFamilyId: 'fam-1' as string | null,
  canEdit: true,
  isChildProfile: false,
  profileChildResolved: true as boolean | undefined,
  child: LINCOLN as { id: string; name: string },
  // Hours-read controls for the automatic-refresh retry tests.
  failHours: false,
  holdHours: false,
  heldReleases: [] as Array<() => void>,
  extraHours: [] as Array<{ id: string; data: Record<string, unknown> }>,
}

/** One entry per family-1 hours read the page started, answered or not. */
const hoursReadsByFamily: unknown[] = []

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId: state.child.id,
    activeChild: state.child,
    children: [LINCOLN, LONDON],
    childrenFamilyId: state.childrenFamilyId,
    setActiveChildId: vi.fn(),
    isChildProfile: state.isChildProfile,
    isLoading: false,
    addChild: vi.fn(),
    profileChildResolved: state.profileChildResolved,
  }),
}))
vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => state.familyId,
  useAuth: () => ({ familyId: state.familyId, profile: 'parents' }),
}))
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: state.canEdit ? 'parents' : 'lincoln', canEdit: state.canEdit }),
}))

const prov = {
  schema: 1,
  receiptId: 'lincoln.apple-dash-starter.v-aaa111',
  kind: 'freeBuild',
  projectId: 'apple-dash-starter',
  versionId: 'v-aaa111',
  versionDocId: 'lincoln__apple-dash-starter__v-aaa111',
  admittedMinutes: 15,
  workAtMs: 1,
  timeZone: 'America/Chicago',
}
const HOURS_DOCS = [
  { id: 'h-normal', data: { childId: 'lincoln', date: '2026-11-10', minutes: 30, subjectBucket: 'Math', source: 'manual' } },
  {
    id: 'bsc.lincoln.apple-dash-starter.v-aaa111',
    data: {
      childId: 'lincoln',
      date: '2026-11-20',
      minutes: 15,
      subjectBucket: 'PracticalArts',
      source: 'build-studio-credit',
      buildStudioCredit: prov,
    },
  },
]

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  deleteDoc: vi.fn(async () => {}),
  doc: vi.fn(() => ({})),
  getDocs: vi.fn((c: { kind?: string; fam?: string }) => {
    if (c.kind === 'hours') {
      // Another family's read never answers in this test.
      if (c.fam !== 'fam-1') return new Promise(() => {})
      hoursReadsByFamily.push(c.fam)
      const snapshot = () => {
        const docs = [...HOURS_DOCS, ...state.extraHours]
        return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })), size: docs.length }
      }
      if (state.failHours) return Promise.reject(new Error('offline'))
      if (state.holdHours) {
        return new Promise((resolve) => {
          state.heldReleases.push(() => resolve(snapshot()))
        })
      }
      return Promise.resolve(snapshot())
    }
    return Promise.resolve({ docs: [], size: 0, empty: true })
  }),
  query: vi.fn((c: unknown) => c),
  updateDoc: vi.fn(async () => {}),
  where: vi.fn(() => ({})),
  writeBatch: vi.fn(() => ({ set: vi.fn(), commit: vi.fn(async () => {}) })),
  collection: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(() => 'ts'),
}))

vi.mock('../../core/firebase/firestore', () => {
  const c = (kind: string) => (fam: string) => ({ kind, fam })
  return {
    db: {},
    artifactsCollection: c('artifacts'),
    dadLabReportsCollection: c('dadlab'),
    daysCollection: c('days'),
    evaluationsCollection: c('evals'),
    hoursAdjustmentsCollection: c('adj'),
    hoursCollection: c('hours'),
  }
})
vi.mock('../../core/firebase/migrateHoursAdjustments', () => ({
  migrateUnattributedAdjustments: vi.fn(async () => 0),
}))
vi.mock('../../core/firebase/buildStudioHoursCreditWrites', () => ({
  correctBuildStudioCreditHours: vi.fn(),
  readBuildStudioCreditedVersion: vi.fn(),
}))

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

// The real gate (from the logic file, unmocked); a stub in place of the card body,
// which has its own test file.
const settleResults: boolean[] = []
// The newest callback a card was handed, kept so a test can call it after unmount.
let heldOnChanged: (() => Promise<boolean>) | null = null
vi.mock('./BuildStudioHoursCard', () => ({
  default: (p: {
    familyId: string
    childId: string
    hoursEntries: unknown[]
    onChanged: () => Promise<boolean>
  }) => (
    <div data-testid="bs-card" ref={() => { heldOnChanged = p.onChanged }}>
      {p.familyId}/{p.childId}/{p.hoursEntries.length}
      {/* What the automatic worker calls after a credit settles. */}
      <button onClick={() => void p.onChanged().then((ok) => settleResults.push(ok))}>settled</button>
    </div>
  ),
}))

describe('Records — Build Studio rows and section', () => {
  beforeEach(() => {
    state.familyId = 'fam-1'
    state.childrenFamilyId = 'fam-1'
    state.canEdit = true
    state.isChildProfile = false
    state.profileChildResolved = true
    state.child = LINCOLN
    state.failHours = false
    state.holdHours = false
    state.heldReleases = []
    state.extraHours = []
    hoursReadsByFamily.length = 0
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a parent: normal rows keep contributing and the section opens for the settled scope', async () => {
    const { default: RecordsPage } = await import('./RecordsPage')
    render(<RecordsPage />)
    expect(await screen.findByTestId('bs-card')).toHaveTextContent('fam-1/lincoln/2')
    expect(screen.getByText(/Hours entries: 2/)).toBeInTheDocument()
  })

  it('a settled automatic credit re-reads Records for the active family and range', async () => {
    const { getDocs } = await import('firebase/firestore')
    const hoursReads = () =>
      vi.mocked(getDocs).mock.calls.filter((c) => (c[0] as { kind?: string }).kind === 'hours').length
    settleResults.length = 0
    const { default: RecordsPage } = await import('./RecordsPage')
    render(<RecordsPage />)
    const settled = await screen.findByRole('button', { name: 'settled' })
    const before = hoursReads()
    await userEvent.click(settled)
    await waitFor(() => expect(settleResults).toEqual([true]))
    expect(hoursReads()).toBeGreaterThan(before)
  })

  it('a card callback first invoked after Records unmounted starts no read', async () => {
    const { default: RecordsPage } = await import('./RecordsPage')
    const { unmount } = render(<RecordsPage />)
    await screen.findByTestId('bs-card')
    expect(heldOnChanged).not.toBeNull()
    const late = heldOnChanged!
    const before = hoursReadsByFamily.length
    unmount()
    await expect(late()).resolves.toBe(false)
    expect(hoursReadsByFamily.length).toBe(before)
  })

  it('a child profile on direct /records: no section, and the rows are dropped from the shared slice', async () => {
    state.canEdit = false
    state.isChildProfile = true
    const { default: RecordsPage } = await import('./RecordsPage')
    render(<RecordsPage />)
    expect(await screen.findByText(/Hours entries: 1/)).toBeInTheDocument()
    expect(screen.queryByTestId('bs-card')).not.toBeInTheDocument()
  })

  it('identity that was not affirmatively proven opens nothing', async () => {
    state.profileChildResolved = undefined
    const { default: RecordsPage } = await import('./RecordsPage')
    render(<RecordsPage />)
    // Without a settled parent capability the credit row is not counted either.
    expect(await screen.findByText(/Hours entries: 1/)).toBeInTheDocument()
    expect(screen.queryByTestId('bs-card')).not.toBeInTheDocument()
  })

  it('withholds the section while the family changes, even with the same child id', async () => {
    const { default: RecordsPage } = await import('./RecordsPage')
    const { rerender } = render(<RecordsPage />)
    expect(await screen.findByTestId('bs-card')).toBeInTheDocument()

    // Family 2 is now current (and its children list matches); its hours read is
    // still in flight, so the array in hand is family 1's.
    state.familyId = 'fam-2'
    state.childrenFamilyId = 'fam-2'
    rerender(<RecordsPage />)
    await waitFor(() => expect(screen.queryByTestId('bs-card')).not.toBeInTheDocument())
    expect(screen.queryByText(/fam-1\/lincoln/)).not.toBeInTheDocument()
    // The old family's credit (same short child id) is not in generic output.
    expect(screen.queryByText(/Hours entries: 2/)).not.toBeInTheDocument()
  })

  // ── A settled credit whose Records re-read fails is retried, with no second job ──
  describe('automatic refresh retry', () => {
    const EXTRA = [
      { id: 'h-new', data: { childId: 'lincoln', date: '2026-11-12', minutes: 20, subjectBucket: 'Math', source: 'manual' } },
    ]
    const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
    const reads = () => hoursReadsByFamily.length

    /** Mount, let the first read land, then take over the clock and settle once. */
    async function mountAndSettle(opts: { failing: boolean }) {
      settleResults.length = 0
      const { default: RecordsPage } = await import('./RecordsPage')
      const view = render(<RecordsPage />)
      const settled = await screen.findByRole('button', { name: 'settled' })
      vi.useFakeTimers()
      state.failHours = opts.failing
      fireEvent.click(settled)
      await advance(0)
      return { ...view, RecordsPage, settled }
    }

    it('retries an initial refresh rejection on its own, and stops once it succeeds', async () => {
      await mountAndSettle({ failing: true })
      expect(settleResults).toEqual([false]) // the caller still gets its immediate answer
      const afterFail = reads()
      state.failHours = false
      state.extraHours = EXTRA
      await advance(RELOAD_RETRY_BASE_MS - 1)
      expect(reads()).toBe(afterFail)
      await advance(1)
      expect(reads()).toBe(afterFail + 1)
      expect(screen.getByText(/Hours entries: 3/)).toBeInTheDocument() // the retry applied it
      await advance(RELOAD_RETRY_MAX_MS * 3)
      expect(reads()).toBe(afterFail + 1) // nothing retained any more
    })

    it('duplicate failures keep ONE timer, and the delay backs off to a ceiling', async () => {
      const { settled } = await mountAndSettle({ failing: true })
      fireEvent.click(settled) // a second trigger while the first is retained
      await advance(0)
      const afterTwo = reads()
      await advance(RELOAD_RETRY_BASE_MS)
      expect(reads()).toBe(afterTwo + 1) // one retry, not two
      // Third failure in a row: 5s · 2^2.
      await advance(RELOAD_RETRY_BASE_MS * 4 - 1)
      expect(reads()).toBe(afterTwo + 1)
      await advance(1)
      expect(reads()).toBe(afterTwo + 2)
      // Far on, the cadence is capped, never faster and never stopped.
      await advance(RELOAD_RETRY_MAX_MS * 10)
      const gaps = reads() - (afterTwo + 2)
      expect(gaps).toBeGreaterThanOrEqual(9)
      expect(gaps).toBeLessThanOrEqual(11)
    })

    it('never starts a retry beside a read already in flight', async () => {
      await mountAndSettle({ failing: true })
      const afterFail = reads()
      state.failHours = false
      state.holdHours = true
      await advance(RELOAD_RETRY_BASE_MS) // the retry starts and is held
      expect(reads()).toBe(afterFail + 1)
      await advance(RELOAD_RETRY_MAX_MS * 3)
      expect(reads()).toBe(afterFail + 1) // no overlapping retry while it is out
      state.holdHours = false
      state.extraHours = EXTRA
      act(() => state.heldReleases.splice(0).forEach((release) => release()))
      await advance(0)
      expect(screen.getByText(/Hours entries: 3/)).toBeInTheDocument()
      await advance(RELOAD_RETRY_MAX_MS * 3)
      expect(reads()).toBe(afterFail + 1) // success cleared it
    })

    it('survives a selected-child switch in the same family and range', async () => {
      const { rerender, RecordsPage } = await mountAndSettle({ failing: true })
      const afterFail = reads()
      state.child = LONDON
      state.failHours = false
      state.extraHours = [{ id: 'h-london', data: { ...EXTRA[0].data, childId: 'london' } }]
      rerender(<RecordsPage />)
      await advance(RELOAD_RETRY_BASE_MS)
      expect(reads()).toBe(afterFail + 1)
      expect(screen.getByTestId('bs-card')).toHaveTextContent('fam-1/london/1')
    })

    it('a reconnect retries after a short settle instead of waiting out the delay', async () => {
      await mountAndSettle({ failing: true })
      const afterFail = reads()
      state.failHours = false
      await advance(RELOAD_RETRY_BASE_MS - 1_000) // still waiting
      act(() => {
        window.dispatchEvent(new Event('online'))
      })
      await advance(RELOAD_NUDGE_MS - 1)
      expect(reads()).toBe(afterFail)
      await advance(1)
      expect(reads()).toBe(afterFail + 1)
    })

    it('drops the retry when the family changes', async () => {
      const { rerender, RecordsPage } = await mountAndSettle({ failing: true })
      const afterFail = reads()
      state.familyId = 'fam-2'
      state.childrenFamilyId = 'fam-2'
      rerender(<RecordsPage />)
      await advance(RELOAD_RETRY_MAX_MS * 5)
      expect(reads()).toBe(afterFail) // no further family-1 read, from a retired retry
    })

    it('drops the retry when the page goes away', async () => {
      const { unmount } = await mountAndSettle({ failing: true })
      const afterFail = reads()
      unmount()
      await advance(RELOAD_RETRY_MAX_MS * 5)
      expect(reads()).toBe(afterFail)
    })

    it('an older read that answers after a newer failed one applies nothing and keeps the retry', async () => {
      const { settled } = await mountAndSettle({ failing: false }) // one good read: 2 rows
      settleResults.length = 0
      state.extraHours = EXTRA
      state.holdHours = true
      fireEvent.click(settled) // A: its fetch is held
      await advance(0)
      state.holdHours = false
      state.failHours = true
      fireEvent.click(settled) // B, newer: fails and is retained
      await advance(0)
      const afterB = reads()
      state.failHours = false
      act(() => state.heldReleases.splice(0).forEach((release) => release())) // A answers late, with a success
      await advance(0)
      expect(settleResults).toEqual([false, false]) // B failed; A was superseded
      expect(screen.getByText(/Hours entries: 2/)).toBeInTheDocument() // A did not apply
      await advance(RELOAD_RETRY_BASE_MS) // B's retry was not consumed by A's success
      expect(reads()).toBe(afterB + 1)
      expect(screen.getByText(/Hours entries: 3/)).toBeInTheDocument()
      await advance(RELOAD_RETRY_MAX_MS * 3)
      expect(reads()).toBe(afterB + 1)
    })

    it('an older read cannot overwrite a newer successful one', async () => {
      const { settled } = await mountAndSettle({ failing: false })
      settleResults.length = 0
      state.holdHours = true
      fireEvent.click(settled) // A held: it will carry the OLD data (2 rows)
      await advance(0)
      state.holdHours = false
      state.extraHours = EXTRA
      fireEvent.click(settled) // B: newer, succeeds with 3 rows
      await advance(0)
      expect(screen.getByText(/Hours entries: 3/)).toBeInTheDocument()
      state.extraHours = [] // A's snapshot is taken as it answers: make it the stale one
      act(() => state.heldReleases.splice(0).forEach((release) => release()))
      await advance(0)
      expect(settleResults).toEqual([true, false])
      expect(screen.getByText(/Hours entries: 3/)).toBeInTheDocument() // not rolled back to 2
    })

    it('does not apply a retry read that answers after the parent capability changed', async () => {
      const { rerender, RecordsPage } = await mountAndSettle({ failing: true })
      const afterFail = reads()
      state.failHours = false
      state.holdHours = true
      state.extraHours = [
        { id: 'x1', data: { ...EXTRA[0].data } },
        { id: 'x2', data: { ...EXTRA[0].data } },
        { id: 'x3', data: { ...EXTRA[0].data } },
      ]
      await advance(RELOAD_RETRY_BASE_MS)
      expect(reads()).toBe(afterFail + 1) // the retry is out, held
      // The profile becomes a child's: a different identity for the same family and range.
      state.canEdit = false
      state.isChildProfile = true
      rerender(<RecordsPage />)
      state.holdHours = false
      act(() => state.heldReleases.splice(0).forEach((release) => release()))
      await advance(0)
      // The late answer (1 + 3 rows) was not applied over the child's view.
      expect(screen.getByText(/Hours entries: 1/)).toBeInTheDocument()
      expect(screen.queryByText(/Hours entries: 4/)).not.toBeInTheDocument()
      await advance(RELOAD_RETRY_MAX_MS * 3)
      expect(reads()).toBe(afterFail + 1) // and it is not retried under the new identity
    })
  })
})
