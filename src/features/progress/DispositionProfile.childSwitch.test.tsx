import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-337 — one boy's disposition narrative must not be read under the other's
 * name.
 *
 * `overrides` and `editingKey` were already cleared on a child change, which is
 * why the cross-child *write* was unreachable and the census recorded a working
 * reset. `result` was not: it was only ever REPLACED, and only when the new
 * child happened to have a fresh cache. So switching to a boy with no cache —
 * or an expired one, or a document that failed to read — left his brother's
 * generated paragraphs on screen under his name.
 *
 * Nothing is written from it, which is why this is a P2 and not a P1. What a
 * parent does with it is worse than a write they can find: they read that
 * London "sticks with a hard problem for twenty minutes" and believe it of the
 * six-year-old.
 *
 * The last case is the positive control: with the three `set…(null)` lines
 * removed, Lincoln's celebration is still on screen under London and the
 * assertion fails.
 */

const CHILDREN = [
  { id: 'lincoln', name: 'Lincoln' },
  { id: 'london', name: 'London' },
]

const activeChildId = vi.fn<() => string>()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    children: CHILDREN,
    activeChildId: activeChildId(),
    activeChild: CHILDREN.find((c) => c.id === activeChildId()),
    setActiveChildId: vi.fn(),
    isLoading: false,
    addChild: vi.fn(),
  }),
}))

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
vi.mock('../../core/ai/useAI', () => ({
  useAI: () => ({ chat: vi.fn(), error: null }),
  TaskType: { Disposition: 'disposition' },
}))
vi.mock('../../core/firebase/firestore', () => ({ db: {} }))
vi.mock('../../components/ChildSelector', () => ({ default: () => null }))

/**
 * Lincoln has a fresh cache; London has none at all — which is the exact
 * asymmetry the defect needed, and the common real case (a narrative is
 * generated on demand, and only one boy's had been).
 */
const LINCOLN_CACHE = {
  generatedAt: new Date().toISOString(),
  result: {
    celebration: 'Lincoln stayed with a hard page for twenty minutes.',
    summary: 'A steady four weeks.',
    nudge: 'Keep the sessions short.',
    parentNote: 'He is asking his own questions now.',
    dispositions: {
      curiosity: { level: 'growing', evidence: 'asked why', narrative: 'n' },
      persistence: { level: 'growing', evidence: 'stayed', narrative: 'n' },
      articulation: { level: 'emerging', evidence: 'explained', narrative: 'n' },
      selfAwareness: { level: 'emerging', evidence: 'noticed', narrative: 'n' },
      ownership: { level: 'growing', evidence: 'chose', narrative: 'n' },
    },
  },
}

vi.mock('firebase/firestore', () => ({
  deleteField: vi.fn(),
  updateDoc: vi.fn(async () => {}),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: vi.fn(async (ref: { path: string }) => ({
    data: () =>
      ref.path.includes('lincoln') ? { dispositionCache: LINCOLN_CACHE } : {},
  })),
}))

import DispositionProfile from './DispositionProfile'

beforeEach(() => {
  activeChildId.mockReturnValue('lincoln')
})

describe('DispositionProfile — a child change clears the narrative (UX-337)', () => {
  it('shows the cached narrative for the child who has one', async () => {
    render(<DispositionProfile />)
    await waitFor(() =>
      expect(screen.getByText(/stayed with a hard page/i)).toBeInTheDocument(),
    )
  })

  it('POSITIVE CONTROL — the other boy’s narrative is gone after a switch', async () => {
    const { rerender } = render(<DispositionProfile />)
    await waitFor(() =>
      expect(screen.getByText(/stayed with a hard page/i)).toBeInTheDocument(),
    )

    activeChildId.mockReturnValue('london')
    rerender(<DispositionProfile />)

    // Without the clear, this sentence is still on screen — under London's
    // name, beside London's own overrides.
    await waitFor(() =>
      expect(screen.queryByText(/stayed with a hard page/i)).not.toBeInTheDocument(),
    )
  })

  it('falls back to the honest empty state rather than to the sibling’s read', async () => {
    const { rerender } = render(<DispositionProfile />)
    await waitFor(() =>
      expect(screen.getByText(/stayed with a hard page/i)).toBeInTheDocument(),
    )

    activeChildId.mockReturnValue('london')
    rerender(<DispositionProfile />)

    // Clearing loses nothing a person made — the narrative is a 24-hour
    // Firestore cache — so the right thing to show while we do not know is the
    // section's own Generate door, not a notice about a loss that isn't one.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /generate learning profile/i }))
        .toBeInTheDocument(),
    )
  })
})
