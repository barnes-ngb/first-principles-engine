import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserProfile } from '../../core/types/enums'

// ── Mocks at the boundaries ────────────────────────────────────────────────
// The page's own decision (kid view vs parent page) is the unit under test, so
// every data hook and heavy child is stubbed.

const mockUseProfile = vi.fn(() => ({
  profile: UserProfile.Parents as UserProfile | null,
  canEdit: true,
}))
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => mockUseProfile(),
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
    reports: [],
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

// Heavy children — identity only; their own suites cover their behaviour.
// `KidLabView` echoes the child it was handed: that child is the key it reads
// and writes `childReports` / artifacts under, so the routing tests can assert
// WHOSE lab data an admitted profile would reach.
vi.mock('./KidLabView', () => ({
  default: ({ child }: { child: { id: string; name: string } }) => (
    <div data-testid="kid-lab-view" data-child-id={child.id} data-child-name={child.name} />
  ),
}))
vi.mock('./ConceptArcsSection', () => ({ default: () => <div data-testid="concept-arcs" /> }))
vi.mock('./HoursRoutingAuditPanel', () => ({ default: () => <div data-testid="hours-audit" /> }))
// The form stub exposes its UX-82 unattached-uploads channel so the page's
// Back guard can be exercised without the real upload machinery.
vi.mock('./LabReportForm', () => ({
  default: ({
    onUnattachedUploadsChange,
  }: {
    onUnattachedUploadsChange?: (count: number) => void
  }) => (
    <div data-testid="lab-form">
      <button onClick={() => onUnattachedUploadsChange?.(1)}>report-unattached</button>
    </div>
  ),
}))
vi.mock('./LabSuggestions', () => ({ default: () => <div data-testid="lab-suggestions" /> }))
vi.mock('../../components/ArtifactGallery', () => ({ default: () => <div data-testid="gallery" /> }))

import DadLabPage from './DadLabPage'

/** The page calls `useBlocker` (UX-82's navigation guard), which needs a data
 * router — render inside a memory router, with a second route to navigate to. */
function renderPage() {
  const router = createMemoryRouter([
    { path: '/', element: <DadLabPage /> },
    { path: '/elsewhere', element: <div data-testid="elsewhere" /> },
  ])
  render(<RouterProvider router={router} />)
  return router
}

const kidView = () => screen.queryByTestId('kid-lab-view')
/** The parent page's headline action — present only on the parent branch. */
const parentPage = () => screen.queryByRole('button', { name: /Plan a Lab/i })

// FEAT-124 — `/dad-lab` sits OUTSIDE the `RequireParent` block in
// `app/router.tsx`, so this page decides kid-vs-parent itself. It used to
// enumerate names (`profile === Lincoln || profile === London`); the gate is now
// the `canEdit` capability (ARCH-41/42/43: capability, never a name). With the
// three real profiles the rendering is unchanged — the fourth-profile case below
// is the one the enumeration got wrong.
describe('DadLabPage — capability routing (FEAT-124)', () => {
  beforeEach(() => {
    mockUseProfile.mockReturnValue({ profile: UserProfile.Parents, canEdit: true })
  })

  it('routes Lincoln to the kid view, on his own child record', () => {
    mockUseProfile.mockReturnValue({ profile: UserProfile.Lincoln, canEdit: false })
    renderPage()
    expect(kidView()).toBeInTheDocument()
    expect(kidView()).toHaveAttribute('data-child-id', 'c-lincoln')
    expect(parentPage()).toBeNull()
  })

  it('routes London to the kid view, on his own child record', () => {
    mockUseProfile.mockReturnValue({ profile: UserProfile.London, canEdit: false })
    renderPage()
    expect(kidView()).toBeInTheDocument()
    expect(kidView()).toHaveAttribute('data-child-id', 'c-london')
    expect(parentPage()).toBeNull()
  })

  it('routes the parent profile to the parent page', () => {
    renderPage()
    expect(parentPage()).toBeInTheDocument()
    expect(kidView()).toBeNull()
  })

  it('routes ANY non-parent profile to the kid view — not just the two known names', () => {
    // The point of the run: a hypothetical fourth profile that is neither
    // Lincoln nor London and cannot edit. The name enumeration admitted it to
    // the parent page (and to the `?diag=1` hours-adjustment write path);
    // the capability gate does not. This assertion fails against the old
    // predicate and passes against `!canEdit`.
    mockUseProfile.mockReturnValue({
      profile: 'grandma' as UserProfile,
      canEdit: false,
    })
    renderPage()
    expect(kidView()).toBeInTheDocument()
    expect(parentPage()).toBeNull()
    // The diag surface with the `hoursAdjustments` write path is not mounted.
    expect(screen.queryByTestId('hours-audit')).toBeNull()
  })

  it('resolves an admitted profile to its OWN child, never falling back to London', () => {
    // Codex P2 on this PR: routing on capability admits profiles the old
    // Lincoln/London ternary could not name, and that ternary resolved every
    // non-Lincoln profile to London — so a future third kid would have read and
    // written London's `childReports` and artifacts. Identity is now derived
    // from the profile itself.
    mockUseProfile.mockReturnValue({
      profile: 'grandma' as UserProfile,
      canEdit: false,
    })
    renderPage()
    expect(kidView()).toHaveAttribute('data-child-id', 'grandma')
    expect(kidView()).toHaveAttribute('data-child-name', 'Grandma')
    expect(kidView()).not.toHaveAttribute('data-child-id', 'c-london')
  })
})

describe('DadLabPage — Back is guarded while uploads are unattached (UX-82)', () => {
  beforeEach(() => {
    mockUseProfile.mockReturnValue({ profile: UserProfile.Parents, canEdit: true })
  })

  it('warns before leaving, and only "Leave anyway" abandons the form', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()

    await user.click(screen.getByRole('button', { name: /Plan a Lab/i }))
    expect(screen.getByTestId('lab-form')).toBeInTheDocument()

    // The form reports an unattached upload; Back now asks instead of leaving.
    await user.click(screen.getByText('report-unattached'))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText(/aren't attached to this report yet/i)).toBeInTheDocument()
    expect(screen.getByTestId('lab-form')).toBeInTheDocument()

    // Keep editing stays on the form…
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByTestId('lab-form')).toBeInTheDocument()

    // …and Leave anyway is the explicit way out. (Wait out the dialog's close
    // transition — while it runs, aria-modal hides the page's buttons.)
    const back = await screen.findByRole('button', { name: 'Back' })
    await user.click(back)
    await user.click(screen.getByRole('button', { name: 'Leave anyway' }))
    expect(screen.queryByTestId('lab-form')).toBeNull()
    expect(parentPage()).toBeInTheDocument()
  }, 20000)

  it('Back leaves immediately when nothing is unattached', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()

    await user.click(screen.getByRole('button', { name: /Plan a Lab/i }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.queryByTestId('lab-form')).toBeNull()
    expect(parentPage()).toBeInTheDocument()
  }, 20000)

  it('blocks an SPA route change (nav tap) while uploads are unattached', async () => {
    // Codex P2 on PR #1693: the shell's NavLinks never fire beforeunload and
    // bypass the Back button — the router blocker must hold the door.
    const user = userEvent.setup({ delay: null })
    const router = renderPage()

    await user.click(screen.getByRole('button', { name: /Plan a Lab/i }))
    await user.click(screen.getByText('report-unattached'))

    await act(async () => {
      await router.navigate('/elsewhere')
    })

    // Held: still on the form, with the same dialog asking.
    expect(screen.getByTestId('lab-form')).toBeInTheDocument()
    expect(
      await screen.findByText(/aren't attached to this report yet/i),
    ).toBeInTheDocument()

    // Leave anyway releases the blocked navigation.
    await user.click(screen.getByRole('button', { name: 'Leave anyway' }))
    expect(await screen.findByTestId('elsewhere')).toBeInTheDocument()
  }, 20000)
})
