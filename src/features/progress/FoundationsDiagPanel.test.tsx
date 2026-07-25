import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LearnerModel } from '../../core/types/learnerModel'

// ── Mocks at the boundaries ────────────────────────────────────────────────
// `?diag=1` is a surface flag, not access control — force it open so the gate
// tests exercise the CAPABILITY, not the query parameter.
const mockSearchParams = vi.fn(() => new URLSearchParams('diag=1'))
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams()],
}))

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))

// Parent capability (FEAT-122). Defaults to a parent so the pre-existing
// behaviour suites below are unchanged; the gate suite drives it per test.
const mockUseProfile = vi.fn(() => ({ canEdit: true }))
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => mockUseProfile(),
}))

const mockUseChildren = vi.fn()
vi.mock('../../core/hooks/useChildren', () => ({
  useChildren: () => mockUseChildren(),
}))

vi.mock('../../core/firebase/firebase', () => ({ app: {} }))

// Collections resolve to opaque markers; `doc(marker, id)` returns a ref carrying
// the id so the mocked `getDoc` can look the model up per child.
vi.mock('../../core/firebase/firestore', () => ({
  activityConfigsCollection: () => 'activityConfigs',
  childSkillMapsCollection: () => 'childSkillMaps',
  learnerModelsCollection: () => 'learnerModels',
  sightWordProgressCollection: () => 'sightWordProgress',
  skillSnapshotsCollection: () => 'skillSnapshots',
}))

// A per-child store the mocked `getDoc` reads from — set by each test.
let modelsByChild: Record<string, LearnerModel | null> = {}

// Spied so a gated render can be asserted to reach Firestore ZERO times.
const { mockGetDoc, mockGetDocs } = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockGetDocs: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  doc: (_col: unknown, id: string) => ({ id }),
  getDoc: async (ref: { id: string }) => {
    mockGetDoc(ref)
    const model = modelsByChild[ref.id] ?? null
    return { exists: () => model != null, data: () => model }
  },
  getDocs: async (...args: unknown[]) => {
    mockGetDocs(...args)
    return { docs: [] }
  },
  query: (...args: unknown[]) => args,
  setDoc: vi.fn(async () => undefined),
  where: (...args: unknown[]) => args,
}))

const { mockSynthesize } = vi.hoisted(() => ({ mockSynthesize: vi.fn() }))
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: () => mockSynthesize,
}))

import FoundationsDiagPanel from './FoundationsDiagPanel'

function modelWith(
  childId: string,
  conceptStates: LearnerModel['conceptStates'],
): LearnerModel {
  return { ...minimalModel(childId), conceptStates }
}

function minimalModel(childId: string): LearnerModel {
  return {
    childId,
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: {},
    modalityCalibration: {
      reading: { note: '' },
      writing: { note: '' },
      math: { note: '' },
    },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }
}

const synthBtn = () =>
  screen.getByRole('button', {
    name: /Generate synthesis|Synthesizing/i,
  }) as HTMLButtonElement

describe('FoundationsDiagPanel — synthesis button gate', () => {
  beforeEach(() => {
    modelsByChild = {}
    mockSynthesize.mockReset()
    mockUseChildren.mockReturnValue({
      children: [{ id: 'lincoln', name: 'Lincoln' }],
    })
  })

  it('enables "Generate synthesis (AI)" when a model document already exists (loaded on mount)', async () => {
    modelsByChild = { lincoln: minimalModel('lincoln') }
    render(<FoundationsDiagPanel />)
    // On mount the effect loads the existing model → button enables.
    await waitFor(() => expect(synthBtn()).toBeEnabled())
  })

  it('disables the button with a "Seed the model first." hint when no model exists', async () => {
    modelsByChild = { lincoln: null }
    render(<FoundationsDiagPanel />)
    // No model document → stays disabled.
    await waitFor(() => expect(synthBtn()).toBeDisabled())
    // The disabled button is wrapped so the tooltip still fires on hover.
    await userEvent.hover(synthBtn().parentElement as HTMLElement)
    expect(await screen.findByText('Seed the model first.')).toBeInTheDocument()
  })

  it('keeps the button disabled while a synthesis is in flight', async () => {
    modelsByChild = { lincoln: minimalModel('lincoln') }
    // Never resolves → the in-flight guard holds.
    mockSynthesize.mockReturnValue(new Promise(() => {}))
    render(<FoundationsDiagPanel />)
    await waitFor(() => expect(synthBtn()).toBeEnabled())

    await userEvent.click(synthBtn())
    // synthesizing:true → disabled + label flips.
    await waitFor(() => expect(synthBtn()).toBeDisabled())
    expect(synthBtn()).toHaveTextContent('Synthesizing…')
  })

  it('surfaces the callable failure detail in the panel error line (no opaque "failed")', async () => {
    modelsByChild = { lincoln: minimalModel('lincoln') }
    // A failed synthesis now carries the underlying error class + message.
    mockSynthesize.mockResolvedValue({
      data: {
        success: false,
        status: 'failed',
        detail: 'NotFoundError: model: claude-opus-4-8 not found',
      },
    })
    render(<FoundationsDiagPanel />)
    await waitFor(() => expect(synthBtn()).toBeEnabled())

    await userEvent.click(synthBtn())

    // The detail is rendered alongside the failure line — end-to-end from the
    // mocked model-call rejection to the panel's error state.
    expect(
      await screen.findByText(
        'Synthesis returned no result (status: failed) — NotFoundError: model: claude-opus-4-8 not found.',
      ),
    ).toBeInTheDocument()
  })
})

describe('FoundationsDiagPanel — post-sync refetch', () => {
  beforeEach(() => {
    modelsByChild = {}
    mockSynthesize.mockReset()
    mockUseChildren.mockReturnValue({
      children: [{ id: 'lincoln', name: 'Lincoln' }],
    })
  })

  const syncBtn = () =>
    screen.getByRole('button', {
      name: /Sync curriculum positions|Syncing/i,
    }) as HTMLButtonElement

  it('updates the rendered state counts after a successful sync from the changed model', async () => {
    // Mount loads a model with a single solid concept (Forming: 0).
    modelsByChild = {
      lincoln: modelWith('lincoln', {
        'reading.print.x': { state: 'solid', evidence: [] },
      }),
    }
    render(<FoundationsDiagPanel />)
    await waitFor(() => expect(screen.getByText('Forming: 0')).toBeInTheDocument())

    // The sync "writes" a forming concept; the refetch must reflect it without
    // a reload. (No tracked workbooks → the loop is a no-op, then it refetches.)
    modelsByChild = {
      lincoln: modelWith('lincoln', {
        'reading.print.x': { state: 'solid', evidence: [] },
        'math.regrouping': { state: 'forming', evidence: [] },
      }),
    }
    await userEvent.click(syncBtn())

    await waitFor(() => expect(screen.getByText('Forming: 1')).toBeInTheDocument())
  })
})

// FEAT-122 — `/progress` sits OUTSIDE the `RequireParent` block in
// `app/router.tsx`, so a kid profile that types `/progress?diag=1` reaches this
// component. Unlike the sibling `DataReviewExportPanel` (FEAT-120, a read-only
// leak), this panel's buttons re-seed `learnerModels`, sync workbook positions,
// and fire a paid AI callable — so `?diag=1` alone is not a gate.
describe('FoundationsDiagPanel — parent capability gate (FEAT-122)', () => {
  beforeEach(() => {
    modelsByChild = { lincoln: minimalModel('lincoln') }
    mockSynthesize.mockReset()
    mockGetDoc.mockClear()
    mockGetDocs.mockClear()
    mockSearchParams.mockReturnValue(new URLSearchParams('diag=1'))
    mockUseProfile.mockReturnValue({ canEdit: true })
    mockUseChildren.mockReturnValue({
      children: [{ id: 'lincoln', name: 'Lincoln' }],
    })
  })

  afterEach(() => {
    // Restore the file-wide defaults so suite order can't leak a gate setting.
    mockSearchParams.mockReturnValue(new URLSearchParams('diag=1'))
    mockUseProfile.mockReturnValue({ canEdit: true })
  })

  it('renders nothing for a non-parent profile even with ?diag=1', () => {
    mockUseProfile.mockReturnValue({ canEdit: false })
    const { container } = render(<FoundationsDiagPanel />)
    expect(container).toBeEmptyDOMElement()
    expect(
      screen.queryByText(/Diagnostic — Foundations model/i),
    ).toBeNull()
  })

  it('exposes no seed / sync / synthesis control to a non-parent profile', () => {
    mockUseProfile.mockReturnValue({ canEdit: false })
    render(<FoundationsDiagPanel />)
    // The three write paths: re-seed, workbook position sync, paid AI synthesis.
    expect(screen.queryByRole('button', { name: /Seed/i })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /Sync curriculum positions/i }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: /Generate synthesis/i }),
    ).toBeNull()
  })

  it('reads no Firestore document at all for a non-parent profile', async () => {
    mockUseProfile.mockReturnValue({ canEdit: false })
    render(<FoundationsDiagPanel />)
    // The mount effect is gated too — a kid profile costs zero reads.
    await waitFor(() => expect(mockGetDoc).not.toHaveBeenCalled())
    expect(mockGetDocs).not.toHaveBeenCalled()
  })

  it('renders the panel for a parent profile with ?diag=1', async () => {
    render(<FoundationsDiagPanel />)
    expect(
      screen.getByText(/Diagnostic — Foundations model/i),
    ).toBeInTheDocument()
    await waitFor(() => expect(synthBtn()).toBeEnabled())
  })

  it('still renders nothing for a parent without ?diag=1', async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams(''))
    const { container } = render(<FoundationsDiagPanel />)
    // A parent's mount effect still loads the model; await it so the assertion
    // covers the settled render, not just the first paint.
    await waitFor(() => expect(mockGetDoc).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
