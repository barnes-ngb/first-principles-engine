import { render, screen } from '@testing-library/react'
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
vi.mock('./KidLabView', () => ({ default: () => <div data-testid="kid-lab-view" /> }))
vi.mock('./ConceptArcsSection', () => ({ default: () => <div data-testid="concept-arcs" /> }))
vi.mock('./HoursRoutingAuditPanel', () => ({ default: () => <div data-testid="hours-audit" /> }))
vi.mock('./LabReportForm', () => ({ default: () => <div data-testid="lab-form" /> }))
vi.mock('./LabSuggestions', () => ({ default: () => <div data-testid="lab-suggestions" /> }))
vi.mock('../../components/ArtifactGallery', () => ({ default: () => <div data-testid="gallery" /> }))

import DadLabPage from './DadLabPage'

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

  it('routes Lincoln to the kid view', () => {
    mockUseProfile.mockReturnValue({ profile: UserProfile.Lincoln, canEdit: false })
    render(<DadLabPage />)
    expect(kidView()).toBeInTheDocument()
    expect(parentPage()).toBeNull()
  })

  it('routes London to the kid view', () => {
    mockUseProfile.mockReturnValue({ profile: UserProfile.London, canEdit: false })
    render(<DadLabPage />)
    expect(kidView()).toBeInTheDocument()
    expect(parentPage()).toBeNull()
  })

  it('routes the parent profile to the parent page', () => {
    render(<DadLabPage />)
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
    render(<DadLabPage />)
    expect(kidView()).toBeInTheDocument()
    expect(parentPage()).toBeNull()
    // The diag surface with the `hoursAdjustments` write path is not mounted.
    expect(screen.queryByTestId('hours-audit')).toBeNull()
  })
})
