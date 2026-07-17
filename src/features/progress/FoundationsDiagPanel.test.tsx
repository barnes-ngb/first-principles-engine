import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LearnerModel } from '../../core/types/learnerModel'

// ── Mocks at the boundaries ────────────────────────────────────────────────
// The panel is `?diag=1`-gated; force it open.
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams('diag=1')],
}))

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))

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

vi.mock('firebase/firestore', () => ({
  doc: (_col: unknown, id: string) => ({ id }),
  getDoc: async (ref: { id: string }) => {
    const model = modelsByChild[ref.id] ?? null
    return { exists: () => model != null, data: () => model }
  },
  getDocs: async () => ({ docs: [] }),
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
})
