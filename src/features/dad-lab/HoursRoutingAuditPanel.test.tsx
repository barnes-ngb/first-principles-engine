import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DadLabReport } from '../../core/types'

// ── Mocks at the boundaries ────────────────────────────────────────────────
// `?diag=1` is a surface flag, not access control — force it open so the gate
// tests exercise the CAPABILITY, not the query parameter.
const mockSearchParams = vi.fn(() => new URLSearchParams('diag=1'))
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams()],
}))

// Parent capability (FEAT-124). Defaults to a parent; the gate suite drives it.
const mockUseProfile = vi.fn(() => ({ canEdit: true }))
vi.mock('../../core/profile/useProfile', () => ({
  useProfile: () => mockUseProfile(),
}))

vi.mock('../../core/firebase/firestore', () => ({
  hoursAdjustmentsCollection: () => 'hoursAdjustments',
}))

// Spied so a gated render can be asserted to reach Firestore ZERO times.
const { mockAddDoc, mockGetDocs } = vi.hoisted(() => ({
  mockAddDoc: vi.fn(),
  mockGetDocs: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: async (...args: unknown[]) => {
    mockAddDoc(...args)
    return { id: 'adj-1' }
  },
  getDocs: async (...args: unknown[]) => {
    mockGetDocs(...args)
    return { docs: [] }
  },
}))

import HoursRoutingAuditPanel from './HoursRoutingAuditPanel'

/** A completed lab with EMPTY `subjectTags` — the headline audit row, the one
 *  tier that carries the `hoursAdjustments` write path. */
const EMPTY_TAGS_REPORT: DadLabReport = {
  id: 'lab-1',
  date: '2026-07-01',
  weekKey: '2026-W27',
  title: 'Volcano Lab',
  labType: 'science',
  question: 'Why does it erupt?',
  description: '',
  status: 'complete',
  childReports: {},
  subjectTags: [],
  totalMinutes: 60,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
}

const CHILDREN = [
  { id: 'c-lincoln', name: 'Lincoln' },
  { id: 'c-london', name: 'London' },
]

const renderPanel = () =>
  render(
    <HoursRoutingAuditPanel
      familyId="fam-1"
      reports={[EMPTY_TAGS_REPORT]}
      children={CHILDREN}
    />,
  )

// FEAT-124 — `/dad-lab` sits OUTSIDE the `RequireParent` block in
// `app/router.tsx`. `DadLabPage` also routes non-parents to `KidLabView`, but
// this panel's safety must not depend on that routing decision (FEAT-122's
// precedent): the gate holds wherever the panel is mounted. The stakes are a
// write path — the Confirm buttons append `hoursAdjustments` entries that feed
// MO compliance totals.
describe('HoursRoutingAuditPanel — parent capability gate (FEAT-124)', () => {
  beforeEach(() => {
    mockAddDoc.mockClear()
    mockGetDocs.mockClear()
    mockSearchParams.mockReturnValue(new URLSearchParams('diag=1'))
    mockUseProfile.mockReturnValue({ canEdit: true })
  })

  afterEach(() => {
    // Restore the file-wide defaults so suite order can't leak a gate setting.
    mockSearchParams.mockReturnValue(new URLSearchParams('diag=1'))
    mockUseProfile.mockReturnValue({ canEdit: true })
  })

  it('renders nothing for a non-parent profile even with ?diag=1', () => {
    mockUseProfile.mockReturnValue({ canEdit: false })
    const { container } = renderPanel()
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText(/Diagnostic — Hours routing audit/i)).toBeNull()
  })

  it('exposes no hours-adjustment write control to a non-parent profile', async () => {
    mockUseProfile.mockReturnValue({ canEdit: false })
    renderPanel()
    // Assert on the SETTLED render: an ungated panel starts in its loading
    // state and only reveals the Confirm proposals once the adjustments read
    // resolves, so a first-paint-only assertion would pass vacuously.
    await waitFor(() => expect(screen.queryByText(/Loading adjustments/i)).toBeNull())
    expect(screen.queryByRole('button', { name: /Confirm/i })).toBeNull()
    expect(mockAddDoc).not.toHaveBeenCalled()
  })

  it('reads no Firestore document at all for a non-parent profile', async () => {
    mockUseProfile.mockReturnValue({ canEdit: false })
    renderPanel()
    // The mount effect is gated too — a kid profile costs zero reads.
    await waitFor(() => expect(mockGetDocs).not.toHaveBeenCalled())
  })

  it('renders the panel for a parent profile with ?diag=1', async () => {
    renderPanel()
    expect(screen.getByText(/Diagnostic — Hours routing audit/i)).toBeInTheDocument()
    // The mount read resolves and the empty-tags row's Confirm proposal shows.
    await waitFor(() => expect(mockGetDocs).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: /Confirm/i })).toBeInTheDocument()
  })

  it('still renders nothing for a parent without ?diag=1', () => {
    mockSearchParams.mockReturnValue(new URLSearchParams(''))
    const { container } = renderPanel()
    expect(container).toBeEmptyDOMElement()
    expect(mockGetDocs).not.toHaveBeenCalled()
  })
})
