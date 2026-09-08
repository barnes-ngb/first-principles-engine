import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActivityConfig, DayLog } from '../../core/types'
import { ActivityFrequency, ActivityType, DayBlockType, SubjectBucket } from '../../core/types/enums'
import { collectHoursContributions } from '../../features/records/records.logic'

const mockIsChildProfile = vi.fn(() => false)

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId: 'lincoln',
    activeChild: { id: 'lincoln', name: 'Lincoln' },
    children: [{ id: 'lincoln', name: 'Lincoln' }],
    setActiveChildId: vi.fn(),
    isChildProfile: mockIsChildProfile(),
    isLoading: false,
    addChild: vi.fn(),
  }),
}))

/** The publisher's name on the cover — the string a photo of it will say. */
const COVER_NAME = 'Simply Good and Beautiful Math K — Course Book'

const WORKBOOK: ActivityConfig = {
  id: 'cfg-1',
  name: COVER_NAME,
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

const mockUpdateConfig = vi.fn(async (id: string, updates: Partial<ActivityConfig>) => {
  void id
  void updates
})
vi.mock('../../core/hooks/useActivityConfigs', () => ({
  useActivityConfigs: () => ({
    configs: [WORKBOOK],
    loading: false,
    error: null,
    addConfig: vi.fn(),
    updateConfig: (id: string, updates: Partial<ActivityConfig>) => mockUpdateConfig(id, updates),
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

async function openOverflowMenu(user: ReturnType<typeof userEvent.setup>) {
  const menuButton = screen
    .getAllByRole('button')
    .find((b) => b.querySelector('svg[data-testid="MoreVertIcon"]'))
  expect(menuButton).toBeTruthy()
  await user.click(menuButton!)
}

/** Rename the one workbook on the tab to `next`, through the real UI. */
async function renameTo(user: ReturnType<typeof userEvent.setup>, next: string) {
  await openOverflowMenu(user)
  await user.click(await screen.findByText('Rename'))
  const field = await screen.findByLabelText('Name')
  await user.clear(field)
  await user.type(field, next)
  await user.click(screen.getByRole('button', { name: 'Save' }))
}

beforeEach(() => {
  mockUpdateConfig.mockClear()
  mockIsChildProfile.mockReturnValue(false)
})

describe('CurriculumTab — rename (UX-279)', () => {

  it('renames, and keeps the cover name as an alternate', async () => {
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await renameTo(user, 'Math K')

    await waitFor(() => expect(mockUpdateConfig).toHaveBeenCalledTimes(1))
    expect(mockUpdateConfig).toHaveBeenCalledWith('cfg-1', {
      name: 'Math K',
      aliases: [COVER_NAME],
    })
  })

  it('writes the name and the alternates and NOTHING else', async () => {
    // The whole safety argument for renaming rests on this: `name` is a join
    // key in three places and a stored record in a fourth, and a rename that
    // reached any field but these two would be editing one of those.
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await renameTo(user, 'Math K')

    await waitFor(() => expect(mockUpdateConfig).toHaveBeenCalled())
    const [, updates] = mockUpdateConfig.mock.calls[0]
    expect(Object.keys(updates).sort()).toEqual(['aliases', 'name'])
  })

  it('adds an alternate WITHOUT a rename — the commonest thing she will do', async () => {
    // The cover's full title belongs on a row she never renames. If reaching
    // Save required changing the name, that would be impossible.
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await openOverflowMenu(user)
    await user.click(await screen.findByText('Rename'))

    await user.type(await screen.findByLabelText('Add another name'), 'SGAB Math K')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockUpdateConfig).toHaveBeenCalledTimes(1))
    expect(mockUpdateConfig).toHaveBeenCalledWith('cfg-1', {
      name: COVER_NAME, // unchanged
      aliases: ['SGAB Math K'],
    })
  })

  it('a save that changes neither the name nor the alternates writes nothing', async () => {
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await openOverflowMenu(user)
    await user.click(await screen.findByText('Rename'))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('stays open and says what is still true when the write fails', async () => {
    // Codex round 1, P2. Closing on the tap and voiding the promise left a
    // rejected write with no error, no retry and the edits discarded — and the
    // parent reading the unchanged row as her rename having been ignored.
    mockUpdateConfig.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await renameTo(user, 'Math K')

    expect(await screen.findByText(/still called what it was/i)).toBeInTheDocument()
    // The dialog is still open, with her typing intact.
    expect(screen.getByLabelText('Name')).toHaveValue('Math K')
  })

  it('Escape does not close the dialog over a write still in flight', async () => {
    // Codex round 2, P2. `saving` disabled the buttons but not MUI's own close
    // routes, so a backdrop click or Escape unmounted the dialog mid-write and
    // the rejection landed on nothing.
    let rejectWrite: (err: Error) => void = () => {}
    mockUpdateConfig.mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectWrite = reject }),
    )
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await renameTo(user, 'Math K')

    await user.keyboard('{Escape}')
    expect(screen.getByLabelText('Name')).toBeInTheDocument()

    rejectWrite(new Error('offline'))
    expect(await screen.findByText(/still called what it was/i)).toBeInTheDocument()
  })

  it('is parent-only, on capability', async () => {
    mockIsChildProfile.mockReturnValue(true)
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await openOverflowMenu(user)
    expect(await screen.findByText('Mark as complete')).toBeInTheDocument()
    expect(screen.queryByText('Rename')).not.toBeInTheDocument()
  })
})

describe('a rename is never retroactive (UX-279)', () => {
  // The day's record was written as `"{name} ({minutes}m)"` on the day it
  // happened. Renaming the program does not change what happened, and a records
  // app that rewrote its own records on a relabel would be the worst version of
  // this feature. Asserted by folding the days through the canonical counting
  // path — the same `collectHoursContributions` the Records page and the
  // compliance pack use — before and after the rename.
  const dayLogs = (): DayLog[] => [
    {
      childId: 'lincoln',
      date: '2026-09-01',
      blocks: [
        {
          type: DayBlockType.Math,
          subjectBucket: SubjectBucket.Math,
          actualMinutes: 25,
          location: 'Home',
        },
      ],
      checklist: [
        { id: 'i1', label: `${COVER_NAME} (20m)`, estimatedMinutes: 20, completed: true },
      ],
    } as DayLog,
  ]

  it('leaves every logged label and every recorded minute byte-identical', async () => {
    const before = dayLogs()
    const beforeJson = JSON.stringify(before)
    const beforeFold = collectHoursContributions(before, [], [], 'lincoln')

    mockUpdateConfig.mockClear()
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await renameTo(user, 'Math K')
    await waitFor(() => expect(mockUpdateConfig).toHaveBeenCalled())

    // The day the rename ran beside is the same object it was.
    expect(JSON.stringify(before)).toBe(beforeJson)
    expect(before[0].checklist?.[0].label).toBe(`${COVER_NAME} (20m)`)
    expect(collectHoursContributions(before, [], [], 'lincoln')).toEqual(beforeFold)

    // POSITIVE CONTROL — without this, "nothing changed" could be vacuously
    // true of a fold that reads neither the label nor the minutes.
    const rewritten = dayLogs()
    rewritten[0].checklist![0].label = 'Math K (20m)'
    rewritten[0].blocks![0].actualMinutes = 26
    expect(JSON.stringify(rewritten)).not.toBe(beforeJson)
    expect(collectHoursContributions(rewritten, [], [], 'lincoln')).not.toEqual(beforeFold)
  })

  it('the rename write reaches exactly one document, and it is the config', async () => {
    mockUpdateConfig.mockClear()
    const user = userEvent.setup()
    render(<CurriculumTab />)
    await renameTo(user, 'Math K')

    await waitFor(() => expect(mockUpdateConfig).toHaveBeenCalledTimes(1))
    expect(mockUpdateConfig.mock.calls[0][0]).toBe('cfg-1')
  })
})
