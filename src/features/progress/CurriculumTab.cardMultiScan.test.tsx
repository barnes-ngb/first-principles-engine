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

let activeChildId = 'lincoln'
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId,
    activeChild: { id: activeChildId, name: activeChildId },
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

const buildCertPreviewMock = vi.fn()
const applyCertUpdateMock = vi.fn()
vi.mock('../../core/hooks/useCertificateProgress', () => ({
  useCertificateProgress: () => ({
    buildPreview: (...a: unknown[]) => buildCertPreviewMock(...a),
    applyUpdate: (...a: unknown[]) => applyCertUpdateMock(...a),
    preview: null,
    applying: false,
    applied: null,
    error: null,
    clearState: vi.fn(),
  }),
}))

/** A classified UX-311 reason, as `useScan.lastError()` would carry it. */
const CLASSIFIED_REASON = 'The AI would not analyse this picture'

const scanMock = vi.fn()
vi.mock('../../core/hooks/useScan', () => ({
  useScan: () => ({
    scan: (...args: unknown[]) => scanMock(...args),
    scanning: false,
    lastError: () => CLASSIFIED_REASON,
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

function certificateRecord(name = 'Math K'): ScanRecord {
  return {
    childId: 'lincoln',
    imageUrl: '',
    storagePath: '',
    action: 'pending',
    results: {
      pageType: 'certificate',
      curriculum: 'gatb',
      curriculumName: name,
      level: 'Level K',
      milestone: 'Unit 3 complete',
      lessonRange: '1-30',
      skillsCovered: [],
      wordsRead: [],
      date: '2026-09-08',
      childName: 'Lincoln',
      suggestedSnapshotUpdate: {
        masteredSkills: [],
        recommendedStartLevel: null,
        notes: '',
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
  buildCertPreviewMock.mockReset()
  buildCertPreviewMock.mockResolvedValue(undefined)
  applyCertUpdateMock.mockReset()
  applyCertUpdateMock.mockResolvedValue(undefined)
  activeChildId = 'lincoln'
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

  it('keeps a certificate’s confirm card when it arrives beside another page', async () => {
    // Codex round 1, P2. `processScanBatch` marks every non-worksheet page
    // `skipped`, which is right for the staging area and wrong for a card: the
    // identical file picked ALONE opens the confirm dialog, so picking it with
    // one other page must not report it as "not recognized".
    scanMock
      .mockResolvedValueOnce(record('Math K', 10))
      .mockResolvedValueOnce(certificateRecord())

    render(<CurriculumTab />)
    await pick()

    await waitFor(() => expect(buildCertPreviewMock).toHaveBeenCalledTimes(1))
    // Targeted at THIS card, as the single-page path is.
    expect(buildCertPreviewMock.mock.calls[0][3]).toEqual({ targetConfigId: 'cfg-math' })
    expect(await screen.findByText(/1 certificate to confirm/i)).toBeInTheDocument()
    expect(screen.queryByText(/not recognized/i)).not.toBeInTheDocument()
    // The worksheet page beside it still landed.
    expect(syncMock).toHaveBeenCalledTimes(1)
  })

  it('does NOT claim a certificate for a different book', async () => {
    // Codex round 2, P1. `applyUpdate` deliberately writes to its
    // `targetConfigId` regardless of the certificate's own name, so claiming a
    // Reading Eggs certificate in a Math K batch would write its milestone and
    // skills onto Math K. Unclaimed, it reports as unrecognized — which is the
    // honest answer for this door, and the safe one.
    scanMock
      .mockResolvedValueOnce(record('Math K', 10))
      .mockResolvedValueOnce(certificateRecord('Reading Eggs'))

    render(<CurriculumTab />)
    await pick()

    await waitFor(() => expect(syncMock).toHaveBeenCalledTimes(1))
    expect(buildCertPreviewMock).not.toHaveBeenCalled()
    expect(await screen.findByText(/1 page not recognized/i)).toBeInTheDocument()
  })

  it('names the classified scan reason for a failed page, not a generic one', async () => {
    // Codex round 1, P2. `useScan` reports an unusable analysis by RETURNING a
    // record with `results: null` — not by returning null — so testing the
    // record alone let the batch report "No analysis returned" and throw away
    // the UX-311 diagnosis on the one page that needed it.
    scanMock
      .mockResolvedValueOnce(record('Math K', 10))
      .mockResolvedValueOnce({ ...record('Math K', 11), results: null })

    render(<CurriculumTab />)
    await pick()

    expect(await screen.findByText(new RegExp(CLASSIFIED_REASON, 'i'))).toBeInTheDocument()
    expect(screen.queryByText(/No analysis returned/i)).not.toBeInTheDocument()
  })

  it('confirms a certificate against the child it was SCANNED for', async () => {
    // Codex round 2, P1. `handleConfirmCertificate` paired the card captured
    // when the scan ran with whatever `activeChildId` was when Confirm was
    // tapped — so switching the selector mid-flight wrote the position onto the
    // old child's card and the mastered skills into the NEW child's snapshot.
    //
    // The re-render is what makes this discriminating: without it the stale
    // closure still holds the original child and the buggy code passes too.
    pickCount = 1
    scanMock.mockResolvedValueOnce(certificateRecord('Math K'))

    const { rerender } = render(<CurriculumTab />)
    await pick()
    await waitFor(() => expect(buildCertPreviewMock).toHaveBeenCalledTimes(1))

    activeChildId = 'london'
    rerender(<CurriculumTab />)

    await userEvent.setup().click(await screen.findByRole('button', { name: /Confirm Update/i }))

    await waitFor(() => expect(applyCertUpdateMock).toHaveBeenCalledTimes(1))
    expect(applyCertUpdateMock.mock.calls[0][1]).toBe('lincoln')
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
