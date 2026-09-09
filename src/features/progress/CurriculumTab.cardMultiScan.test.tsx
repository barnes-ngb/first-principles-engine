import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActivityConfig, ScanRecord } from '../../core/types'

/**
 * UX-312 — several pages onto ONE workbook card.
 *
 * Owner, 2026-09-08: *"the card only allows me to do one image at a time — I
 * thought we had multiple image uploads for these curriculums."* The app had
 * multi-capture; this door declined the prop.
 *
 * What these pin: every page is targeted at THIS card, a page naming a
 * different workbook is not applied, and a single file still takes the
 * untouched single-page path (the camera hands over one shot per tap even in
 * multi mode, so that path must not change).
 */

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

const MATH_CARD: ActivityConfig = {
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

vi.mock('../../core/hooks/useActivityConfigs', () => ({
  useActivityConfigs: () => ({
    configs: [MATH_CARD],
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

const scanMock = vi.fn()
vi.mock('../../core/hooks/useScan', () => ({
  useScan: () => ({
    scan: (...args: unknown[]) => scanMock(...args),
    scanning: false,
    lastError: () => 'Scan failed',
    clearScan: vi.fn(),
  }),
}))

const syncMock = vi.fn()
// The real matcher: two names match when they name the same workbook. Here,
// anything containing "Math" is the math card.
vi.mock('../../core/hooks/useScanToActivityConfig', () => ({
  useScanToActivityConfig: () => ({ syncScanToConfig: (...a: unknown[]) => syncMock(...a) }),
  isWorkbookMatch: (a: string, b: string) => a.includes('Math') && b.includes('Math'),
}))
vi.mock('../../core/curriculum/updateSkillMapFromFindings', () => ({
  updateSkillMapFromFindings: vi.fn(),
}))
vi.mock('../../components/ChildSelector', () => ({ default: () => <div>CHILD_SELECTOR</div> }))
vi.mock('../../components/ScanAnalysisPanel', () => ({ default: () => null }))

/**
 * Stand-in picker. `count` is how many files one tap hands over — the gallery
 * can give several, the camera always gives one.
 */
let pickCount = 2
vi.mock('../../components/ScanButton', () => ({
  default: ({ onCaptureFiles }: { onCaptureFiles?: (files: File[]) => void }) => (
    <button
      onClick={() =>
        onCaptureFiles?.(
          Array.from(
            { length: pickCount },
            (_, i) => new File([`p${i}`], `page-${i}.jpg`, { type: 'image/jpeg' }),
          ),
        )
      }
    >
      PICK_PAGES
    </button>
  ),
}))

vi.mock('firebase/firestore', () => ({
  limit: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}))
vi.mock('../../core/firebase/firestore', () => ({ scansCollection: vi.fn(() => ({})) }))

import CurriculumTab from './CurriculumTab'

function record(name: string, lesson: number): ScanRecord {
  return {
    childId: 'lincoln',
    imageUrl: '',
    storagePath: '',
    action: 'pending',
    results: {
      pageType: 'worksheet',
      subject: name,
      specificTopic: '',
      skillsTargeted: [],
      estimatedDifficulty: 'appropriate',
      recommendation: 'do',
      recommendationReason: '',
      estimatedMinutes: 30,
      teacherNotes: '',
      curriculumDetected: {
        provider: 'gatb',
        name,
        lessonNumber: lesson,
        pageNumber: null,
        levelDesignation: null,
      },
    },
    createdAt: '2026-09-08T00:00:00.000Z',
  } as ScanRecord
}

/**
 * Tap the CARD's picker.
 *
 * Two doors on this screen now take several pages — the card (UX-312) and the
 * staging area at the bottom (the pre-existing batch). Both render the mocked
 * `ScanButton`, and the Active Workbooks section renders above the staging
 * area, so the first is the card's.
 */
async function pick() {
  const user = userEvent.setup()
  const buttons = await screen.findAllByText('PICK_PAGES')
  expect(buttons.length).toBeGreaterThan(1)
  await user.click(buttons[0])
}

beforeEach(() => {
  scanMock.mockReset()
  syncMock.mockReset()
  pickCount = 2
  syncMock.mockResolvedValue({
    action: 'updated',
    configId: 'cfg-math',
    configName: 'Math K',
    position: 12,
  })
})

describe('a workbook card takes several pages (UX-312)', () => {
  it('scans every picked page and applies each one to THIS card', async () => {
    pickCount = 3
    scanMock
      .mockResolvedValueOnce(record('Math K', 10))
      .mockResolvedValueOnce(record('Math K', 11))
      .mockResolvedValueOnce(record('Math K', 12))

    render(<CurriculumTab />)
    await pick()

    await waitFor(() => expect(syncMock).toHaveBeenCalledTimes(3))
    // Every page carries the card's id — a batch on a card can never land on
    // the untargeted find-or-create path and invent a second config.
    for (const call of syncMock.mock.calls) {
      expect(call[2]).toEqual({ targetConfigId: 'cfg-math' })
    }
  })

  it('does not apply a page that names a different workbook, and says which', async () => {
    scanMock
      .mockResolvedValueOnce(record('Math K', 10))
      .mockResolvedValueOnce(record('Reading Eggs', 4))

    render(<CurriculumTab />)
    await pick()

    await waitFor(() => expect(syncMock).toHaveBeenCalledTimes(1))
    expect(syncMock.mock.calls[0][1]).toMatchObject({ subject: 'Math K' })
    expect(await screen.findByText(/doesn't look like Math K/i)).toBeInTheDocument()
  })

  it('reports a page that failed to scan without losing the pages that landed', async () => {
    scanMock.mockResolvedValueOnce(record('Math K', 10)).mockResolvedValueOnce(null)

    render(<CurriculumTab />)
    await pick()

    await waitFor(() => expect(syncMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/1 page failed/i)).toBeInTheDocument()
    // The page that DID land is still reported as applied.
    expect(screen.getByText(/Updated Math K/i)).toBeInTheDocument()
  })

  it('sends a single picked file down the untouched single-page path', async () => {
    // The camera returns one shot per tap even in multi mode. That call must
    // keep the single-page behaviour, mismatch prompt and all.
    pickCount = 1
    scanMock.mockResolvedValueOnce(record('Math K', 10))

    render(<CurriculumTab />)
    await pick()

    await waitFor(() => expect(syncMock).toHaveBeenCalledTimes(1))
    expect(syncMock.mock.calls[0][2]).toEqual({ targetConfigId: 'cfg-math' })
  })

  it('raises the single-page mismatch PROMPT rather than skipping, for one file', async () => {
    // One page is the case where we can afford to ask. A batch cannot stop for
    // each page, which is why it reports instead — the two behaviours differ on
    // purpose and this pins both.
    pickCount = 1
    scanMock.mockResolvedValueOnce(record('Reading Eggs', 4))

    render(<CurriculumTab />)
    await pick()

    expect(await screen.findByText(/Curriculum mismatch/i)).toBeInTheDocument()
    expect(syncMock).not.toHaveBeenCalled()
  })
})
