import { render as renderInTest, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const state = {
  familyId: 'fam-1',
  childrenFamilyId: 'fam-1' as string | null,
  canEdit: true,
  isChildProfile: false,
  profileChildResolved: true as boolean | undefined,
}

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId: LINCOLN.id,
    activeChild: LINCOLN,
    children: [LINCOLN],
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
      return Promise.resolve({ docs: HOURS_DOCS.map((d) => ({ id: d.id, data: () => d.data })), size: 2 })
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
  previewBuildStudioCredit: vi.fn(),
  confirmBuildStudioCredit: vi.fn(),
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

// The real gate; a stub in place of the card body, which has its own test file.
vi.mock('./BuildStudioHoursCard', async () => {
  const actual = await vi.importActual<typeof import('./BuildStudioHoursCard')>('./BuildStudioHoursCard')
  return {
    ...actual,
    default: (p: { familyId: string; childId: string; hoursEntries: unknown[] }) => (
      <div data-testid="bs-card">
        {p.familyId}/{p.childId}/{p.hoursEntries.length}
      </div>
    ),
  }
})

describe('Records — Build Studio rows and section', () => {
  beforeEach(() => {
    state.familyId = 'fam-1'
    state.childrenFamilyId = 'fam-1'
    state.canEdit = true
    state.isChildProfile = false
    state.profileChildResolved = true
  })

  it('a parent: normal rows keep contributing and the section opens for the settled scope', async () => {
    const { default: RecordsPage } = await import('./RecordsPage')
    render(<RecordsPage />)
    expect(await screen.findByTestId('bs-card')).toHaveTextContent('fam-1/lincoln/2')
    expect(screen.getByText(/Hours entries: 2/)).toBeInTheDocument()
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
    expect(await screen.findByText(/Hours entries: 2/)).toBeInTheDocument()
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
  })
})
