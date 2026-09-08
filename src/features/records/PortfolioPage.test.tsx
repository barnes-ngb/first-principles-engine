import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Artifact, Child } from '../../core/types'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'

// ── Mocks at the boundaries ────────────────────────────────────────────────
// The page's only reach is two `getDocs` reads (artifacts + Dad Lab reports).
// Stub Firestore entirely so these tests exercise the SELECTION predicate, not
// the network. Nothing here writes — FEAT-123 is a read-side change.
const { artifactsRef, reportsRef, getDocsMock } = vi.hoisted(() => ({
  artifactsRef: { current: [] as Artifact[] },
  reportsRef: { current: [] as unknown[] },
  getDocsMock: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  query: (ref: unknown) => ref,
  where: vi.fn(),
}))

vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
}))

vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: () => ({ __collection: 'artifacts' }),
  dadLabReportsCollection: () => ({ __collection: 'dadLabReports' }),
}))

vi.mock('../../core/firebase/storage', () => ({ storage: {} }))

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))

const mockUseActiveChild = vi.fn()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

import PortfolioPage from './PortfolioPage'

// ── Fixtures ───────────────────────────────────────────────────────────────

const child = (id: string, name: string) => ({ id, name }) as Child

const CHILDREN = [child('lincoln', 'Lincoln'), child('london', 'London')]

const artifact = (over: Partial<Artifact> & { id: string; childId: string }): Artifact => ({
  title: over.id,
  type: EvidenceType.Photo,
  createdAt: '2026-07-11T10:00:00.000Z',
  uri: `https://example.test/${over.id}.jpg`,
  tags: {
    engineStage: EngineStage.Build,
    domain: 'science',
    subjectBucket: SubjectBucket.Science,
    location: 'Home',
  },
  ...over,
})

/**
 * One fixture month: a solo artifact for each boy, plus a whole-family Dad Lab
 * capture written the way `LabReportForm.captureBeatArtifact` writes it.
 */
const MONTH: Artifact[] = [
  artifact({ id: 'lincoln-drawing', childId: 'lincoln', title: "Lincoln's drawing" }),
  artifact({ id: 'london-story', childId: 'london', title: "London's story" }),
  artifact({
    id: 'lab-rocket',
    childId: 'both',
    title: 'Dad Lab photo - Balloon rockets',
    tags: {
      engineStage: EngineStage.Build,
      domain: 'dad-lab',
      subjectBucket: SubjectBucket.Science,
      location: 'Home',
    },
  }),
]

const renderFor = (activeChildId: string) => {
  mockUseActiveChild.mockReturnValue({
    activeChildId,
    activeChild: CHILDREN.find((c) => c.id === activeChildId),
    children: CHILDREN,
  })
  return render(<PortfolioPage />)
}

/**
 * Titles rendered in the artifact grid, in render order.
 *
 * Waits on the grid's ROWS, not on the summary line: the page renders
 * "0 artifacts for …" before the month's load effect resolves, so waiting on
 * that line races the load and can read the empty state as the answer.
 * One checkbox per row makes the wait a real signal.
 */
const gridTitles = async (): Promise<string[]> => {
  await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0))
  return MONTH.map((a) => a.title).filter((t) => screen.queryByText(t) != null)
}

beforeEach(() => {
  artifactsRef.current = MONTH
  reportsRef.current = []
  getDocsMock.mockReset()
  getDocsMock.mockImplementation((ref: { __collection?: string }) => {
    const rows =
      ref?.__collection === 'artifacts' ? artifactsRef.current : reportsRef.current
    return Promise.resolve({
      docs: rows.map((row) => ({
        id: (row as { id?: string }).id ?? 'auto',
        data: () => row,
      })),
    })
  })
})

// ─── FEAT-123 ───────────────────────────────────────────────────────────────

describe('PortfolioPage — whole-family artifacts in the month grid', () => {
  it("shows the family lab capture in Lincoln's grid alongside his own work", async () => {
    renderFor('lincoln')
    expect(await gridTitles()).toEqual([
      "Lincoln's drawing",
      'Dad Lab photo - Balloon rockets',
    ])
  })

  it("shows the same capture in London's grid", async () => {
    renderFor('london')
    expect(await gridTitles()).toEqual([
      "London's story",
      'Dad Lab photo - Balloon rockets',
    ])
  })

  // Characterization of the whole widening: the difference between the old
  // exact-`childId` predicate and the new one is EXACTLY the 'both' artifact,
  // in both directions. Nothing crosses between the boys.
  it('adds only the shared artifact, and leaks nothing between the boys', async () => {
    renderFor('lincoln')
    const lincolnTitles = await gridTitles()
    expect(lincolnTitles).not.toContain("London's story")

    const before = MONTH.filter((a) => a.childId === 'lincoln').map((a) => a.title)
    const added = lincolnTitles.filter((t) => !before.includes(t))
    const removed = before.filter((t) => !lincolnTitles.includes(t))
    expect(added).toEqual(['Dad Lab photo - Balloon rockets'])
    expect(removed).toEqual([])
  })

  it('annotates the shared artifact as Family, and a solo one with the kid’s name', async () => {
    renderFor('lincoln')
    await gridTitles()

    const sharedRow = screen
      .getByText('Dad Lab photo - Balloon rockets')
      .closest('.MuiStack-root')?.parentElement as HTMLElement
    expect(within(sharedRow).getByText('Family')).toBeInTheDocument()
    expect(within(sharedRow).queryByText('Lincoln')).toBeNull()

    const soloRow = screen
      .getByText("Lincoln's drawing")
      .closest('.MuiStack-root')?.parentElement as HTMLElement
    expect(within(soloRow).getByText('Lincoln')).toBeInTheDocument()
    expect(within(soloRow).queryByText('Family')).toBeNull()
  })

  it('counts the shared artifact as selectable — the export button is reachable', async () => {
    // Before FEAT-123 a month of nothing but lab captures rendered an empty
    // grid with nothing to select. Now every one of them is a real row.
    artifactsRef.current = MONTH.filter((a) => a.childId === 'both')
    renderFor('lincoln')
    await waitFor(() =>
      expect(screen.getByText(/1 artifacts? for Lincoln/i)).toBeInTheDocument(),
    )
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  })
})

// ── UX-285: a captured link is openable, not a clipped string ────────────────
//
// A strand session's "the video we watched" (UX-283) stores an EXTERNAL address
// in `uri` and a copy in `content`. The card drew media for Photo and Audio
// only, so the address reached the screen through `content` alone — one
// truncated, no-wrap, unselectable line, and nothing to tap.
describe('a video artifact records a link the parent can open', () => {
  const LINK = 'https://example.test/watch?v=abc'
  const videoArtifact = artifact({
    id: 'egypt-video',
    childId: 'lincoln',
    title: 'Ancient Egypt',
    type: EvidenceType.Video,
    uri: LINK,
    content: LINK,
  })

  beforeEach(() => {
    artifactsRef.current = [videoArtifact]
  })

  it('renders it as a real link to the address', async () => {
    renderFor('lincoln')
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0))

    const link = screen.getByRole('link', { name: /open link/i })
    expect(link).toHaveAttribute('href', LINK)
  })

  it('opens it away from the app, without handing over the referrer', async () => {
    renderFor('lincoln')
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0))

    const link = screen.getByRole('link', { name: /open link/i })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
  })

  it('does not also print the same address as a clipped line', async () => {
    renderFor('lincoln')
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0))

    // `content` holds a copy of the URL; showing it beside the link is noise,
    // not a second fact.
    expect(screen.queryByText(LINK)).toBeNull()
  })

  it('still shows a real note beside the link', async () => {
    artifactsRef.current = [
      artifact({
        id: 'egypt-video-2',
        childId: 'lincoln',
        title: 'Ancient Egypt',
        type: EvidenceType.Video,
        uri: LINK,
        content: 'we watched this after lunch',
      }),
    ]
    renderFor('lincoln')
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0))

    expect(screen.getByText('we watched this after lunch')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open link/i })).toBeInTheDocument()
  })

  it('renders no link for a video artifact carrying no address', async () => {
    artifactsRef.current = [
      artifact({
        id: 'egypt-video-3',
        childId: 'lincoln',
        title: 'Ancient Egypt',
        type: EvidenceType.Video,
        uri: undefined,
        content: undefined,
      }),
    ]
    renderFor('lincoln')
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0))

    expect(screen.queryByRole('link', { name: /open link/i })).toBeNull()
  })
})
