import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActivityConfig } from '../../core/types'

/**
 * UX-314 — "Set lesson" on the ⋮ menu.
 *
 * What these pin: the door exists for a workbook, it is closed to a kid profile
 * at the WRITE and not only in the menu, it writes through the shared
 * `updatePosition` lane, and it does NOT appear on a strand (whose count is an
 * increment written only by a captured session).
 */

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))

let isChildProfile = false
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId: 'lincoln',
    activeChild: { id: 'lincoln', name: 'Lincoln' },
    children: [{ id: 'lincoln', name: 'Lincoln' }],
    setActiveChildId: vi.fn(),
    isChildProfile,
    isLoading: false,
    addChild: vi.fn(),
  }),
}))

const BOOK: ActivityConfig = {
  id: 'cfg-math',
  name: 'Math K',
  type: 'workbook',
  subjectBucket: 'Math',
  defaultMinutes: 20,
  frequency: 'daily',
  childId: 'lincoln',
  sortOrder: 1,
  completed: false,
  scannable: true,
  currentPosition: 8,
  totalUnits: 60,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as ActivityConfig

const STRAND: ActivityConfig = {
  ...BOOK,
  id: 'cfg-history',
  name: 'History',
  type: 'strand',
  scannable: false,
  unitLabel: 'session',
  totalUnits: undefined,
} as ActivityConfig

let configs: ActivityConfig[] = [BOOK]
const updatePositionMock = vi.fn()
vi.mock('../../core/hooks/useActivityConfigs', () => ({
  useActivityConfigs: () => ({
    configs,
    loading: false,
    error: null,
    addConfig: vi.fn(),
    updateConfig: vi.fn(),
    deleteConfig: vi.fn(),
    markComplete: vi.fn(),
    updatePosition: (...a: unknown[]) => updatePositionMock(...a),
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
  useScan: () => ({
    scan: vi.fn(),
    scanning: false,
    lastError: () => null,
    clearScan: vi.fn(),
  }),
}))
vi.mock('../../core/hooks/useScanToActivityConfig', () => ({
  useScanToActivityConfig: () => ({ syncScanToConfig: vi.fn() }),
  isWorkbookMatch: () => true,
}))
vi.mock('../../core/curriculum/updateSkillMapFromFindings', () => ({
  updateSkillMapFromFindings: vi.fn(),
}))
vi.mock('../../components/ChildSelector', () => ({ default: () => <div>CHILD_SELECTOR</div> }))
vi.mock('../../components/ScanAnalysisPanel', () => ({ default: () => null }))
vi.mock('../../components/ScanButton', () => ({ default: () => <div>SCAN_BUTTON</div> }))
vi.mock('firebase/firestore', () => ({
  limit: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}))
vi.mock('../../core/firebase/firestore', () => ({ scansCollection: vi.fn(() => ({})) }))

import CurriculumTab from './CurriculumTab'

/** Open the ⋮ menu on the first row that has one. */
async function openRowMenu() {
  const user = userEvent.setup()
  const buttons = await screen.findAllByTestId('MoreVertIcon')
  await user.click(buttons[0].closest('button')!)
  return user
}

beforeEach(() => {
  isChildProfile = false
  configs = [BOOK]
  updatePositionMock.mockReset()
  updatePositionMock.mockResolvedValue(undefined)
})

describe('Set lesson by hand (UX-314)', () => {
  it('offers the door on a workbook row', async () => {
    render(<CurriculumTab />)
    await openRowMenu()
    expect(await screen.findByText('Set lesson')).toBeInTheDocument()
  })

  it('writes the typed position through the shared updatePosition lane', async () => {
    render(<CurriculumTab />)
    const user = await openRowMenu()
    await user.click(await screen.findByText('Set lesson'))

    const field = await screen.findByLabelText('Current lesson')
    await user.clear(field)
    await user.type(field, '14')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updatePositionMock).toHaveBeenCalledWith('cfg-math', 14))
    // Both numbers, because she is overriding what the app believed.
    expect(await screen.findByText(/lesson 8 → 14/)).toBeInTheDocument()
  })

  it('writes a position BELOW the current one', async () => {
    render(<CurriculumTab />)
    const user = await openRowMenu()
    await user.click(await screen.findByText('Set lesson'))

    const field = await screen.findByLabelText('Current lesson')
    await user.clear(field)
    await user.type(field, '3')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updatePositionMock).toHaveBeenCalledWith('cfg-math', 3))
  })

  it('refuses a position past the end without writing anything', async () => {
    render(<CurriculumTab />)
    const user = await openRowMenu()
    await user.click(await screen.findByText('Set lesson'))

    const field = await screen.findByLabelText('Current lesson')
    await user.clear(field)
    await user.type(field, '61')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/past the end/i)).toBeInTheDocument()
    expect(updatePositionMock).not.toHaveBeenCalled()
  })

  it('is closed to a kid profile — the menu item is not offered', async () => {
    isChildProfile = true
    render(<CurriculumTab />)
    await openRowMenu()
    expect(screen.queryByText('Set lesson')).not.toBeInTheDocument()
  })

  it('is not offered on a strand — its count is written only by a session', async () => {
    configs = [STRAND]
    render(<CurriculumTab />)
    await openRowMenu()
    expect(screen.queryByText('Set lesson')).not.toBeInTheDocument()
  })
})
