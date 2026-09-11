import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActivityConfig } from '../../core/types'
import { ActivityFrequency, ActivityType, SubjectBucket } from '../../core/types/enums'

/**
 * UX-354 — a row typed in on the wrong child can be moved.
 *
 * Owner, 2026-09-11: *"Shelly added content for Lincoln on London's page"*, with
 * no way to move it. `AddActivityDialog` stamps the LIVE `childId` on every row
 * it creates, and the ⋮ menu's *Assign to a child* was gated on
 * `type === 'workbook'` — one of seven `ActivityType` members — so a routine had
 * to be deleted and retyped.
 *
 * POSITIVE CONTROL: restore `menuConfig?.type === 'workbook'` on the menu item
 * and the first case below fails with no *Assign to a child* to click.
 */

const mockIsChildProfile = vi.fn(() => false)

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId: 'london',
    activeChild: { id: 'london', name: 'London' },
    children: [
      { id: 'lincoln', name: 'Lincoln' },
      { id: 'london', name: 'London' },
    ],
    setActiveChildId: vi.fn(),
    isChildProfile: mockIsChildProfile(),
    isLoading: false,
    addChild: vi.fn(),
  }),
}))

/** The row the report is about: a routine, on the wrong child. */
const ROUTINE: ActivityConfig = {
  id: 'cfg-routine',
  name: 'Sight word games',
  type: ActivityType.Routine,
  subjectBucket: SubjectBucket.Reading,
  defaultMinutes: 10,
  frequency: ActivityFrequency.Daily,
  childId: 'london',
  sortOrder: 0,
  completed: false,
  scannable: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

/** A strand with days behind it — the one row that does not move. */
const STRAND: ActivityConfig = {
  ...ROUTINE,
  id: 'cfg-strand',
  name: 'History',
  type: ActivityType.Strand,
  childId: 'lincoln',
  currentPosition: 14,
  unitLabel: 'session',
  subjectBucket: SubjectBucket.SocialStudies,
  sortOrder: 1,
}

const configs: ActivityConfig[] = [ROUTINE]
const mockUpdateConfig = vi.fn(async (id: string, updates: Partial<ActivityConfig>) => {
  void id
  void updates
})

vi.mock('../../core/hooks/useActivityConfigs', () => ({
  useActivityConfigs: () => ({
    configs,
    loading: false,
    error: null,
    addConfig: vi.fn(),
    updateConfig: (id: string, updates: Partial<ActivityConfig>) =>
      mockUpdateConfig(id, updates),
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
  useScan: () => ({ scan: vi.fn(), scanning: false, clearScan: vi.fn(), lastError: () => null }),
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
vi.mock('firebase/firestore', () => ({
  limit: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}))
vi.mock('../../core/firebase/firestore', () => ({ scansCollection: vi.fn(() => ({})) }))

import CurriculumTab from './CurriculumTab'

async function openReassign(user: ReturnType<typeof userEvent.setup>) {
  const menuButton = screen
    .getAllByRole('button')
    .find((b) => b.querySelector('svg[data-testid="MoreVertIcon"]'))
  expect(menuButton).toBeTruthy()
  await user.click(menuButton!)
  await user.click(await screen.findByText('Assign to a child'))
}

beforeEach(() => {
  mockUpdateConfig.mockClear()
  mockIsChildProfile.mockReturnValue(false)
  configs.splice(0, configs.length, ROUTINE)
})

describe('CurriculumTab — assign to a child (UX-354)', () => {
  it('moves a ROUTINE, which could not be moved at all before', async () => {
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await openReassign(user)

    expect(await screen.findByText(/Who is “Sight word games” for\?/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Lincoln' }))

    await waitFor(() => expect(mockUpdateConfig).toHaveBeenCalledTimes(1))
    // Exactly the owner field. Nothing else about the row is rewritten.
    expect(mockUpdateConfig).toHaveBeenCalledWith('cfg-routine', { childId: 'lincoln' })
  })

  it('offers “Both kids” for a routine — and never for a workbook (DATA-08)', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<CurriculumTab />)
    await openReassign(user)
    expect(screen.getByRole('button', { name: 'Both kids' })).toBeTruthy()
    unmount()

    configs.splice(0, configs.length, {
      ...ROUTINE,
      id: 'cfg-wb',
      name: 'GATB Math K',
      type: ActivityType.Workbook,
      scannable: true,
      currentPosition: 12,
      totalUnits: 40,
      unitLabel: 'lesson',
    })
    render(<CurriculumTab />)
    await openReassign(user)
    expect(screen.queryByRole('button', { name: 'Both kids' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Lincoln' })).toBeTruthy()
  })

  it('tells a parent WHY a recorded strand stays put, rather than hiding the item', async () => {
    configs.splice(0, configs.length, STRAND)
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await openReassign(user)

    expect(
      await screen.findByText(/Lincoln has 14 sessions recorded on this one/),
    ).toBeTruthy()
    // No destination to tap: the refusal is the whole dialog.
    expect(screen.queryByRole('button', { name: 'London' })).toBeNull()
    expect(mockUpdateConfig).not.toHaveBeenCalled()
  })

  it('says the row is unchanged when the move fails', async () => {
    mockUpdateConfig.mockRejectedValueOnce(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await openReassign(user)
    await user.click(screen.getByRole('button', { name: 'Lincoln' }))

    // An uncaught rejection used to close nothing and say nothing, leaving the
    // parent believing the move landed — UX-351's defect on a second surface.
    expect(await screen.findByText(/still where it was/)).toBeTruthy()
  })

  it('is parent-only — a kid profile is never offered the item', async () => {
    mockIsChildProfile.mockReturnValue(true)
    const user = userEvent.setup()
    render(<CurriculumTab />)
    const menuButton = screen
      .getAllByRole('button')
      .find((b) => b.querySelector('svg[data-testid="MoreVertIcon"]'))
    await user.click(menuButton!)

    expect(screen.queryByText('Assign to a child')).toBeNull()
  })
})
