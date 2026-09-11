import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ActivityConfig } from '../../core/types'
import { ActivityFrequency, ActivityType, SubjectBucket } from '../../core/types/enums'

/**
 * UX-326 / UX-319 — the certificate door moved down from the ProgressPage shell
 * into this tab, immediately above the staging area it duplicates.
 *
 * It went to Curriculum rather than to Foundations with the other three because
 * UX-315 has already decided its destination: it is to be MERGED into that
 * staging door. What this file pins is the ordering UX-319 asked for — a
 * per-child WRITE control now sits BELOW the thing that names and changes the
 * child, not above it.
 */

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId: 'lincoln',
    activeChild: { id: 'lincoln', name: 'Lincoln' },
    // Two children, so the tab's own selector renders (it is gated on > 1).
    children: [
      { id: 'lincoln', name: 'Lincoln' },
      { id: 'london', name: 'London' },
    ],
    setActiveChildId: vi.fn(),
    isChildProfile: false,
    isLoading: false,
    addChild: vi.fn(),
  }),
}))

const WORKBOOK: ActivityConfig = {
  id: 'cfg-math',
  name: 'Math K',
  type: ActivityType.Workbook,
  subjectBucket: SubjectBucket.Math,
  defaultMinutes: 30,
  frequency: ActivityFrequency.Daily,
  childId: 'lincoln',
  sortOrder: 1,
  completed: false,
  scannable: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

vi.mock('../../core/hooks/useActivityConfigs', () => ({
  useActivityConfigs: () => ({
    configs: [WORKBOOK],
    loading: false,
    error: null,
    addConfig: vi.fn(),
    updateConfig: vi.fn(),
    deleteConfig: vi.fn(),
    markComplete: vi.fn(),
    updatePosition: vi.fn(),
    reorder: vi.fn(),
  }),
}))
vi.mock('../../core/hooks/useCertificateProgress', () => ({
  useCertificateProgress: () => ({
    buildPreview: vi.fn(),
    applyUpdate: vi.fn(),
    preview: null,
    applying: false,
    applied: null,
    error: null,
    clearState: vi.fn(),
  }),
}))
vi.mock('../../core/hooks/useScan', () => ({
  useScan: () => ({ scan: vi.fn(), scanning: false, clearScan: vi.fn() }),
}))
vi.mock('../../core/hooks/useScanToActivityConfig', () => ({
  useScanToActivityConfig: () => ({ syncScanToConfig: vi.fn() }),
  isWorkbookMatch: () => false,
}))
vi.mock('../../core/curriculum/updateSkillMapFromFindings', () => ({
  updateSkillMapFromFindings: vi.fn(),
}))
vi.mock('../../components/ChildSelector', () => ({ default: () => <div>CHILD_SELECTOR</div> }))
vi.mock('../../components/ScanButton', () => ({ default: () => <div>SCAN_BUTTON</div> }))
vi.mock('../../components/ScanAnalysisPanel', () => ({ default: () => null }))
// The door itself is a marker — its own suites own its behaviour, and this
// change moved it without touching it.
vi.mock('./CertificateScanSection', () => ({ default: () => <div>CERTIFICATE_DOOR</div> }))

vi.mock('firebase/firestore', () => ({
  limit: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}))
vi.mock('../../core/firebase/firestore', () => ({ scansCollection: vi.fn(() => ({})) }))

import CurriculumTab from './CurriculumTab'

describe('CurriculumTab — the certificate door (UX-326 / UX-319)', () => {
  it('renders the door, with its unchanged heading', async () => {
    render(<CurriculumTab />)
    expect(await screen.findByText('Scan Certificate or Progress Report')).toBeInTheDocument()
    expect(screen.getByText('CERTIFICATE_DOOR')).toBeInTheDocument()
  })

  it('puts it BELOW the child selector and ABOVE the staging area', async () => {
    const { container } = render(<CurriculumTab />)
    await screen.findByText('Scan Certificate or Progress Report')
    const text = container.textContent ?? ''

    const selector = text.indexOf('CHILD_SELECTOR')
    const door = text.indexOf('Scan Certificate or Progress Report')
    const staging = text.indexOf('Add to Curriculum')

    expect(selector).toBeGreaterThanOrEqual(0)
    expect(door).toBeGreaterThan(selector)
    expect(staging).toBeGreaterThan(door)
  })
})


it('keeps workbooks ahead of scan history and lets the parent expand and collapse history', async () => {
  const user = userEvent.setup()
  const { container } = render(<CurriculumTab />)
  const history = await screen.findByRole('button', { name: 'This week’s scans (0)' })
  expect(history).toHaveAttribute('aria-expanded', 'false')
  const text = container.textContent ?? ''
  expect(text.indexOf('Active Workbooks')).toBeGreaterThanOrEqual(0)
  expect(text.indexOf('Active Workbooks')).toBeLessThan(text.indexOf('This week’s scans'))
  await user.click(history)
  expect(history).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('No scans this week yet')).toBeVisible()
  await user.click(history)
  expect(history).toHaveAttribute('aria-expanded', 'false')
})
