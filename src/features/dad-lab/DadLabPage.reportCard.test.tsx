import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DadLabReport } from '../../core/types'
import { UserProfile } from '../../core/types/enums'

// ── Mocks at the boundaries ────────────────────────────────────────────────
// The unit under test is what a lab CARD says a report holds (UX-85). Every
// data hook is stubbed; `mockReports` is the list the page renders.

let mockReports: DadLabReport[] = []

// Pin "today" to the month the fixtures live in (FEAT-170). The page opens a
// completed-labs month group by default only when it IS the current month
// (`todayKey().slice(0, 7)`, DadLabPage.tsx), and the group renders inside
// `<Collapse unmountOnExit>` — so with the real clock these cards were mounted
// in August 2026 and gone on September 1, and four assertions below fired at
// midnight with no code change. Mocking the clock SOURCE (not timers) keeps
// React Testing Library's queries synchronous and matches the file's idiom;
// `formatDateShort` and the rest of the module stay real.
const FIXTURE_DAY = vi.hoisted(() => '2026-08-22')
vi.mock('../../core/utils/dateKey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/utils/dateKey')>()),
  todayKey: () => FIXTURE_DAY,
}))

vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: UserProfile.Parents, canEdit: true }),
}))
vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
vi.mock('../../core/hooks/useChildren', () => ({
  useChildren: () => ({
    children: [
      { id: 'c-lincoln', name: 'Lincoln' },
      { id: 'c-london', name: 'London' },
    ],
  }),
}))
vi.mock('./useDadLabReports', () => ({
  useDadLabReports: () => ({
    reports: mockReports,
    loading: false,
    saveReport: vi.fn(),
    updateStatus: vi.fn(),
    deleteReport: vi.fn(),
  }),
}))
vi.mock('./useConceptArcs', () => ({ useConceptArcs: () => ({ arcs: [] }) }))
vi.mock('./useCalibrationSources', () => ({
  useCalibrationSources: () => ({ sources: [], loaded: true }),
}))
vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({ chat: vi.fn() }),
  TaskType: { Chat: 'chat' },
}))
vi.mock('./KidLabView', () => ({ default: () => <div data-testid="kid-lab-view" /> }))
vi.mock('./ConceptArcsSection', () => ({ default: () => <div data-testid="concept-arcs" /> }))
vi.mock('./HoursRoutingAuditPanel', () => ({ default: () => <div data-testid="hours-audit" /> }))
vi.mock('./LabReportForm', () => ({ default: () => <div data-testid="lab-form" /> }))
vi.mock('./LabSuggestions', () => ({ default: () => <div data-testid="lab-suggestions" /> }))

// The gallery stub echoes the ids it was handed, so the card's thumbnail strip
// is assertable without any Firestore artifact resolution.
vi.mock('../../components/ArtifactGallery', () => ({
  default: ({ artifactIds }: { artifactIds: string[] }) => (
    <div data-testid="gallery" data-ids={artifactIds.join(',')} />
  ),
}))

import DadLabPage from './DadLabPage'

// Fixture timestamps are DATA (createdAt/updatedAt); the clock the page reads
// is pinned above so both describe the same day.
const NOW = `${FIXTURE_DAY}T00:00:00.000Z`

function completedReport(overrides: Partial<DadLabReport>): DadLabReport {
  return {
    id: 'lab-aug-22',
    date: FIXTURE_DAY,
    weekKey: '2026-W34',
    title: 'Balloon Lab',
    labType: 'science',
    question: 'Why does it pop?',
    description: '',
    status: 'complete',
    childReports: {},
    subjectTags: ['Science'],
    totalMinutes: 45,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function renderPage() {
  const router = createMemoryRouter([{ path: '/', element: <DadLabPage /> }])
  render(<RouterProvider router={router} />)
}

/** The ids the card's thumbnail strip was actually asked to render. */
const galleryIds = () =>
  screen.queryAllByTestId('gallery').map((el) => el.getAttribute('data-ids') ?? '')

beforeEach(() => {
  mockReports = []
})

// UX-85 — confirmed live on Nathan's Aug 22 lab: the overview card showed no
// thumbnails and no artifact count while the detail view was full of photos,
// because those photos live in `beats` and the card read only
// `childReports[*].artifacts`. FEAT-156 routes uploads to beats, so every lab
// from here on would have looked empty.
describe('DadLabPage — a completed lab card counts every artifact it has (UX-85)', () => {
  it('counts and shows beat photos on a report whose child reports are empty', () => {
    mockReports = [
      completedReport({
        childReports: {},
        beats: {
          predict: { items: [{ artifactId: 'art-p', child: 'both' }] },
          try: { items: [{ artifactId: 'art-t', child: 'c-lincoln' }] },
          saw: { items: [{ artifactId: 'art-s', child: 'both' }] },
        },
      }),
    ]
    renderPage()

    expect(screen.getByText(/3 artifacts/)).toBeInTheDocument()
    expect(galleryIds()).toContain('art-p,art-t,art-s')
  })

  it('de-dupes an id referenced from both a child report and a beat', () => {
    mockReports = [
      completedReport({
        childReports: { lincoln: { artifacts: ['art-shared'] } },
        beats: {
          predict: { items: [{ artifactId: 'art-shared', child: 'c-lincoln' }] },
          try: { items: [{ artifactId: 'art-beat', child: 'both' }] },
          saw: { items: [] },
        },
      }),
    ]
    renderPage()

    // Two distinct artifacts, not three.
    expect(screen.getByText(/2 artifacts/)).toBeInTheDocument()
    expect(screen.queryByText(/3 artifacts/)).toBeNull()
    expect(galleryIds()).toContain('art-shared,art-beat')
  })

  it('keeps the four-thumbnail cap while the count reports the true total', () => {
    mockReports = [
      completedReport({
        childReports: { lincoln: { artifacts: ['art-1', 'art-2'] } },
        beats: {
          predict: { items: [{ artifactId: 'art-3', child: 'both' }] },
          try: { items: [{ artifactId: 'art-4', child: 'both' }] },
          saw: { items: [{ artifactId: 'art-5', child: 'both' }] },
        },
      }),
    ]
    renderPage()

    expect(screen.getByText(/5 artifacts/)).toBeInTheDocument()
    expect(galleryIds()).toContain('art-1,art-2,art-3,art-4')
  })

  it('renders no strip and no count when the report has no artifacts anywhere', () => {
    // Characterization: unchanged behaviour, including for a report that has
    // beats with writing lines but no captures.
    mockReports = [
      completedReport({
        childReports: { lincoln: { prediction: 'it pops', artifacts: [] } },
        beats: {
          predict: { text: 'pop', items: [] },
          try: { items: [] },
          saw: { items: [] },
        },
      }),
    ]
    renderPage()

    expect(screen.queryByText(/artifact/i)).toBeNull()
    expect(screen.queryByTestId('gallery')).toBeNull()
  })

  it('still counts a legacy report from its child reports alone', () => {
    // Pre-FEAT-56 reports have no `beats` at all — unchanged behaviour.
    mockReports = [
      completedReport({
        childReports: {
          lincoln: { artifacts: ['art-a'] },
          london: { artifacts: ['art-b'] },
        },
      }),
    ]
    renderPage()

    expect(screen.getByText(/2 artifacts/)).toBeInTheDocument()
    expect(galleryIds()).toContain('art-a,art-b')
  })
})

// The active-lab card carries the same report-level count, and had the same bug.
describe('DadLabPage — an active lab card counts every artifact it has (UX-85)', () => {
  it('counts beat captures on a lab that is still running', () => {
    mockReports = [
      completedReport({
        id: 'lab-active',
        status: 'active',
        childReports: {},
        beats: {
          predict: { items: [{ artifactId: 'art-p', child: 'both' }] },
          try: { items: [{ artifactId: 'art-t', child: 'both' }] },
          saw: { items: [] },
        },
      }),
    ]
    renderPage()

    expect(screen.getByText(/2 artifacts/)).toBeInTheDocument()
  })
})
