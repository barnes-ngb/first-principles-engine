import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks at the boundaries ────────────────────────────────────────────────
// `?diag=1` is a surface flag, not access control — force it open so the tests
// exercise the CAPABILITY gate rather than the query parameter.
const mockSearchParams = vi.fn(() => new URLSearchParams('diag=1'))
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams()],
}))

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))

const mockUseProfile = vi.fn()
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => mockUseProfile(),
}))

vi.mock('../../core/hooks/useChildren', () => ({
  useChildren: () => ({ children: [{ id: 'lincoln', name: 'Lincoln' }] }),
}))

// The loader is the only Firestore reach; stub it so the gate tests never touch
// the network. A gated render must not call it at all.
const mockLoad = vi.fn()
vi.mock('./dataReviewExportLoader', () => ({
  loadDataReviewExportInput: (...args: unknown[]) => mockLoad(...args),
}))

import DataReviewExportPanel from './DataReviewExportPanel'

const downloadButton = () =>
  screen.queryByRole('button', { name: /Download review export/i })

describe('DataReviewExportPanel — parent capability gate', () => {
  beforeEach(() => {
    mockLoad.mockReset()
    mockSearchParams.mockReturnValue(new URLSearchParams('diag=1'))
  })

  // Codex review (PR #1624, P1): `/progress` sits OUTSIDE the `RequireParent`
  // block in `app/router.tsx`, so a kid profile that types `/progress?diag=1`
  // reaches this component. The export carries every child's birthdate, parent
  // notes, assessment data, and artifact media URLs — `?diag=1` alone is not a
  // gate.
  it('renders nothing for a non-parent profile even with ?diag=1', () => {
    mockUseProfile.mockReturnValue({ canEdit: false })
    const { container } = render(<DataReviewExportPanel />)
    expect(container).toBeEmptyDOMElement()
    expect(downloadButton()).toBeNull()
  })

  it('renders the export controls for a parent profile', () => {
    mockUseProfile.mockReturnValue({ canEdit: true })
    render(<DataReviewExportPanel />)
    expect(downloadButton()).not.toBeNull()
    expect(screen.getByText(/Data review export/i)).toBeInTheDocument()
  })

  it('still renders nothing for a parent without ?diag=1', () => {
    mockUseProfile.mockReturnValue({ canEdit: true })
    mockSearchParams.mockReturnValue(new URLSearchParams(''))
    const { container } = render(<DataReviewExportPanel />)
    expect(container).toBeEmptyDOMElement()
  })

  it('defaults the scope checkbox to OFF (full history is the default)', () => {
    mockUseProfile.mockReturnValue({ canEdit: true })
    render(<DataReviewExportPanel />)
    const checkbox = screen.getByRole('checkbox', {
      name: /Current school year only/i,
    })
    expect(checkbox).not.toBeChecked()
  })

  it('reads nothing until the parent asks for an export', () => {
    mockUseProfile.mockReturnValue({ canEdit: true })
    render(<DataReviewExportPanel />)
    expect(mockLoad).not.toHaveBeenCalled()
  })
})
