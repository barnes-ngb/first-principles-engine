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

/** Titles rendered in the artifact grid, in render order. */
const gridTitles = async (): Promise<string[]> => {
  await waitFor(() =>
    expect(screen.getByText(/artifacts for/i).textContent).toMatch(/\d+ artifacts?/),
  )
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
