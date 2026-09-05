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

/**
 * The owner's real orphan: an `app` config that carried an App chip in every
 * generated plan and appeared in NO section of this tab.
 */
const FAST_PHONICS: ActivityConfig = {
  id: 'cfg-fast-phonics',
  name: 'Fast Phonics (Reading Eggs)',
  type: ActivityType.App,
  subjectBucket: SubjectBucket.Reading,
  defaultMinutes: 45,
  frequency: ActivityFrequency.Daily,
  childId: 'lincoln',
  sortOrder: 1,
  completed: false,
  scannable: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

/** The other orphaned type — what `addActivity` from Ask AI defaults to. */
const HANDWRITING: ActivityConfig = {
  id: 'cfg-handwriting',
  name: 'Handwriting (while read-aloud)',
  type: ActivityType.Activity,
  subjectBucket: SubjectBucket.LanguageArts,
  defaultMinutes: 20,
  frequency: ActivityFrequency.ThreePerWeek,
  childId: 'lincoln',
  sortOrder: 2,
  completed: false,
  scannable: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const mockDeleteConfig = vi.fn(async (id: string) => void id)
const mockMarkComplete = vi.fn(async (id: string) => void id)
vi.mock('../../core/hooks/useActivityConfigs', () => ({
  useActivityConfigs: () => ({
    configs: [FAST_PHONICS, HANDWRITING],
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

// ── UX-204, end to end ──────────────────────────────────────────────────────
//
// `curriculumGrouping.test.ts` proves the PARTITION places every `ActivityType`.
// This proves the tab renders what the partition placed — the half that was
// actually broken. Before this section existed, both fixtures below rendered
// nowhere at all while planning every school day.

describe('CurriculumTab — the orphaned activity/app types (UX-204)', () => {
  beforeEach(() => {
    mockDeleteConfig.mockReset()
    mockDeleteConfig.mockImplementation(async () => {})
    mockMarkComplete.mockReset()
  })

  it('renders an app config that used to appear on no screen', async () => {
    render(<CurriculumTab />)
    expect(await screen.findByText('Fast Phonics (Reading Eggs)')).toBeInTheDocument()
  })

  it('renders an activity config too, with its minutes and real cadence', async () => {
    render(<CurriculumTab />)
    expect(await screen.findByText('Handwriting (while read-aloud)')).toBeInTheDocument()
    expect(screen.getByText('20m · 3x/week')).toBeInTheDocument()
  })

  it('puts them under a heading that names them', async () => {
    render(<CurriculumTab />)
    expect(await screen.findByText('Apps & Other Activities')).toBeInTheDocument()
  })

  it('says why they are there and what they cost', async () => {
    render(<CurriculumTab />)
    expect(await screen.findByText(/planned every school day and counted in the day budget/))
      .toBeInTheDocument()
  })

  // The whole point of UX-204: these rows were undeletable from anywhere in the
  // app. The row carries the same ⋮ menu the Routine Activities rows have, so
  // the guarded UX-48 delete flow reaches them unchanged.
  it('an orphaned row can now be deleted, through the same guarded flow', async () => {
    const user = userEvent.setup()
    render(<CurriculumTab />)

    const row = (await screen.findByText('Fast Phonics (Reading Eggs)')).closest('li')
    expect(row).toBeTruthy()
    const menuButton = within(row!)
      .getAllByRole('button')
      .find((b) => b.querySelector('svg[data-testid="MoreVertIcon"]'))
    expect(menuButton).toBeTruthy()
    await user.click(menuButton!)

    await user.click(await screen.findByText('Delete permanently'))
    // Still guarded — the menu tap alone writes nothing (UX-48 holds here too).
    const dialog = await screen.findByRole('dialog')
    expect(mockDeleteConfig).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(mockDeleteConfig).toHaveBeenCalledWith('cfg-fast-phonics'))
  })

  it('does not quietly reclassify them as Routine Activities', async () => {
    render(<CurriculumTab />)
    await screen.findByText('Apps & Other Activities')
    // The Routine Activities section renders its own empty state instead of
    // absorbing rows whose heading would then be wrong for them.
    expect(screen.getByText('No routine activities configured.')).toBeInTheDocument()
  })
})
