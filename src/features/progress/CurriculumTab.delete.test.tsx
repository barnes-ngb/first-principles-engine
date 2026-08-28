import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActivityConfig } from '../../core/types'
import { ActivityFrequency, ActivityType, SubjectBucket } from '../../core/types/enums'

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId: 'lincoln',
    activeChild: { id: 'lincoln', name: 'Lincoln' },
    children: [{ id: 'lincoln', name: 'Lincoln' }],
    setActiveChildId: vi.fn(),
    isChildProfile: false,
    isLoading: false,
    addChild: vi.fn(),
  }),
}))

const WORKBOOK: ActivityConfig = {
  id: 'cfg-1',
  name: 'GATB Math',
  type: ActivityType.Workbook,
  subjectBucket: SubjectBucket.Math,
  defaultMinutes: 20,
  frequency: ActivityFrequency.Daily,
  childId: 'lincoln',
  sortOrder: 0,
  completed: false,
  scannable: true,
  currentPosition: 12,
  totalUnits: 40,
  unitLabel: 'lesson',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const mockDeleteConfig = vi.fn(async (id: string) => void id)
const mockMarkComplete = vi.fn(async (id: string) => void id)
vi.mock('../../core/hooks/useActivityConfigs', () => ({
  useActivityConfigs: () => ({
    configs: [WORKBOOK],
    loading: false,
    error: null,
    addConfig: vi.fn(),
    updateConfig: vi.fn(),
    deleteConfig: (id: string) => mockDeleteConfig(id),
    markComplete: (id: string) => mockMarkComplete(id),
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

// Firestore is never touched: the recent-scans subscription is a no-op here.
vi.mock('firebase/firestore', () => ({
  limit: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}))
vi.mock('../../core/firebase/firestore', () => ({ scansCollection: vi.fn(() => ({})) }))

import CurriculumTab from './CurriculumTab'

/** Open the program's three-dot overflow menu. */
async function openOverflowMenu(user: ReturnType<typeof userEvent.setup>) {
  const buttons = screen.getAllByRole('button')
  // The card's overflow trigger is the only MoreVert button on a single-config tab.
  const menuButton = buttons.find((b) => b.querySelector('svg[data-testid="MoreVertIcon"]'))
  expect(menuButton).toBeTruthy()
  await user.click(menuButton!)
}

describe('CurriculumTab — the destructive tap (UX-48)', () => {
  beforeEach(() => {
    mockDeleteConfig.mockReset()
    mockDeleteConfig.mockImplementation(async () => {})
    mockMarkComplete.mockReset()
  })

  it('the menu names what the tap does — no bare "Remove"', async () => {
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await openOverflowMenu(user)
    expect(await screen.findByText('Delete permanently')).toBeInTheDocument()
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
  })

  it('the tap opens a confirm dialog and writes NOTHING on its own', async () => {
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await openOverflowMenu(user)
    await user.click(await screen.findByText('Delete permanently'))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    // The whole point: the menu tap used to reach `deleteDoc` directly.
    expect(mockDeleteConfig).not.toHaveBeenCalled()
  })

  it('the dialog names the position that goes, what stays, and the gentler path', async () => {
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await openOverflowMenu(user)
    await user.click(await screen.findByText('Delete permanently'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('lesson 12 of 40')
    expect(dialog).toHaveTextContent(/no undo/)
    expect(dialog).toHaveTextContent(/doesn't change your records/)
    expect(dialog).toHaveTextContent(/Mark as complete/)
  })

  it('Cancel leaves the program alone', async () => {
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await openOverflowMenu(user)
    await user.click(await screen.findByText('Delete permanently'))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(mockDeleteConfig).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('confirming inside the dialog is what deletes', async () => {
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await openOverflowMenu(user)
    await user.click(await screen.findByText('Delete permanently'))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))

    await waitFor(() => expect(mockDeleteConfig).toHaveBeenCalledWith('cfg-1'))
  })

  it('a REJECTED delete says so — the failure is no longer silent', async () => {
    mockDeleteConfig.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await openOverflowMenu(user)
    await user.click(await screen.findByText('Delete permanently'))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))

    expect(
      await screen.findByText(/still in your curriculum and nothing was lost/),
    ).toBeInTheDocument()
    // And it never claims the delete happened.
    expect(screen.queryByText(/"GATB Math" deleted/)).not.toBeInTheDocument()
  })
})
