import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-326 — the three Foundations-shaped sections that used to render in the
 * ProgressPage shell (above all six tabs) now render inside this tab, and the
 * two `?diag=1` panels are REAL here rather than stubbed: the claim being pinned
 * is that the flag still reveals them, from their new home, through their own
 * unchanged gate.
 */

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
vi.mock('../../core/firebase/firebase', () => ({ app: {} }))

const mockCanEdit = vi.fn(() => true)
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => ({ canEdit: mockCanEdit() }),
}))

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'lincoln', name: 'Lincoln' },
    activeChildId: 'lincoln',
    children: [{ id: 'lincoln', name: 'Lincoln' }],
    setActiveChildId: vi.fn(),
    isChildProfile: false,
    isLoading: false,
    addChild: vi.fn(),
  }),
}))
vi.mock('../../core/hooks/useChildren', () => ({
  useChildren: () => ({ children: [{ id: 'lincoln', name: 'Lincoln' }] }),
}))
vi.mock('../../core/hooks/useLearnerModel', () => ({
  useLearnerModel: () => ({ model: null, loading: false }),
}))
vi.mock('./useFoundationsBootstrap', () => ({
  useFoundationsBootstrap: () => ({ bootstrapping: false, failed: false, retry: vi.fn() }),
}))

// Heavy, self-contained children stubbed to markers — their own suites own them.
vi.mock('./DispositionProfile', () => ({ default: () => <div>DISPOSITION_SECTION</div> }))
vi.mock('../../components/ChildSelector', () => ({ default: () => <div>CHILD_SELECTOR</div> }))
vi.mock('../foundations-review/FoundationsReviewSession', () => ({
  default: () => <div>REVIEW_SESSION</div>,
}))
vi.mock('../foundations-review/writeReviewAction', () => ({
  applyAndWriteReviewAction: vi.fn(),
}))
vi.mock('../records/dataReviewExportLoader', () => ({
  loadDataReviewExportInput: vi.fn(),
}))

// Firestore boundaries — the panels must reach none of them on this render.
vi.mock('../../core/firebase/firestore', () => ({
  activityConfigsCollection: () => 'activityConfigs',
  childSkillMapsCollection: () => 'childSkillMaps',
  learnerModelsCollection: () => 'learnerModels',
  sightWordProgressCollection: () => 'sightWordProgress',
  skillSnapshotsCollection: () => 'skillSnapshots',
}))
vi.mock('firebase/firestore', () => ({
  doc: (_c: unknown, id: string) => ({ id }),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: (...args: unknown[]) => args,
  setDoc: vi.fn(),
  where: (...args: unknown[]) => args,
}))
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: () => vi.fn(),
}))

import FoundationsTab from './FoundationsTab'

function renderTab(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/progress${search}`]}>
      <FoundationsTab />
    </MemoryRouter>,
  )
}

const reviewLauncher = () => screen.queryByText('Foundations Review')
const diagPanel = () => screen.queryByText(/Diagnostic — Foundations model/)
const exportPanel = () => screen.queryByText(/Diagnostic — Data review export/)

beforeEach(() => {
  mockCanEdit.mockReturnValue(true)
})

describe('FoundationsTab — the sections UX-326 moved in', () => {
  it('renders the Foundations Review launcher without any flag', async () => {
    renderTab()
    // `FoundationsDiagPanel` registers its loader effect above its own gate, so
    // settle that in-flight read before asserting (pre-existing; it did the same
    // from the shell).
    await waitFor(() => expect(reviewLauncher()).toBeInTheDocument())
  })

  it('keeps both diagnostic panels hidden without ?diag=1', async () => {
    renderTab()
    await waitFor(() => expect(reviewLauncher()).toBeInTheDocument())
    expect(diagPanel()).not.toBeInTheDocument()
    expect(exportPanel()).not.toBeInTheDocument()
  })

  it('reveals BOTH diagnostic panels with ?diag=1', async () => {
    renderTab('?diag=1')
    await waitFor(() => expect(diagPanel()).toBeInTheDocument())
    expect(exportPanel()).toBeInTheDocument()
  })

  it('still refuses both panels to a non-parent, flag or no flag', async () => {
    // The gate is capability FIRST — `?diag=1` was never access control, and
    // the move changed nothing about that.
    mockCanEdit.mockReturnValue(false)
    renderTab('?diag=1')
    await waitFor(() => expect(reviewLauncher()).toBeInTheDocument())
    expect(diagPanel()).not.toBeInTheDocument()
    expect(exportPanel()).not.toBeInTheDocument()
  })
})
