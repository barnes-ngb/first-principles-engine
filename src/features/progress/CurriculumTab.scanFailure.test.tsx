import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ScanRecord } from '../../core/types'

/**
 * UX-275 — the Curriculum door used to catch a scan failure, send the real
 * reason to `console.error`, show "Scan failed — please try again", and then
 * clear the staged photos in a `finally` regardless of outcome. The reason and
 * the pictures both went in the bin.
 *
 * These pin the three things a parent needs: the reason on screen, the photos
 * still there, and one tap to try again.
 */

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))

let activeChildId = 'lincoln'
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChildId,
    activeChild: { id: activeChildId, name: activeChildId },
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

vi.mock('../../core/hooks/useActivityConfigs', () => ({
  useActivityConfigs: () => ({
    configs: [],
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

const HEIC_REASON =
  "Can't read this picture — it's a HEIC file, and the scanner needs a JPEG, PNG, GIF or WebP."

const scanMock = vi.fn()
vi.mock('../../core/hooks/useScan', () => ({
  useScan: () => ({
    scan: (...args: unknown[]) => scanMock(...args),
    scanning: false,
    lastError: () => HEIC_REASON,
    clearScan: vi.fn(),
  }),
}))

const syncMock = vi.fn()
vi.mock('../../core/hooks/useScanToActivityConfig', () => ({
  useScanToActivityConfig: () => ({ syncScanToConfig: (...a: unknown[]) => syncMock(...a) }),
  isWorkbookMatch: () => false,
}))
vi.mock('../../core/curriculum/updateSkillMapFromFindings', () => ({
  updateSkillMapFromFindings: vi.fn(),
}))
vi.mock('../../components/ChildSelector', () => ({ default: () => <div>CHILD_SELECTOR</div> }))
vi.mock('../../components/ScanAnalysisPanel', () => ({ default: () => null }))

// UX-326 moved the certificate door into this tab, and it renders a ScanButton
// of its own — which would make the stand-in picker below ambiguous. It is a
// marker here; its own suites own it, and its placement is pinned in
// `CurriculumTab.certificateDoor.test.tsx`.
vi.mock('./CertificateScanSection', () => ({ default: () => <div>CERTIFICATE_DOOR</div> }))

// A stand-in for the real picker: one tap stages two photos.
vi.mock('../../components/ScanButton', () => ({
  default: ({ onCaptureFiles }: { onCaptureFiles?: (files: File[]) => void }) => (
    <button
      onClick={() =>
        onCaptureFiles?.([
          new File(['a'], 'page-a.heic', { type: 'image/heic' }),
          new File(['b'], 'page-b.jpg', { type: 'image/jpeg' }),
        ])
      }
    >
      STAGE_TWO
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

function worksheetRecord(): ScanRecord {
  return {
    childId: 'lincoln',
    imageUrl: '',
    storagePath: '',
    action: 'pending',
    results: {
      pageType: 'worksheet',
      subject: 'math',
      specificTopic: '',
      skillsTargeted: [],
      estimatedDifficulty: 'appropriate',
      recommendation: 'do',
      recommendationReason: '',
      estimatedMinutes: 30,
      teacherNotes: '',
      curriculumDetected: {
        provider: 'gatb',
        name: 'GATB Math',
        lessonNumber: 9,
        pageNumber: null,
        levelDesignation: null,
      },
    },
  }
}

/** jsdom has no object URLs; the component makes and revokes them for previews. */
beforeEach(() => {
  let n = 0
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => `blob:page-${n++}`),
    revokeObjectURL: vi.fn(),
  })
  activeChildId = 'lincoln'
  scanMock.mockReset()
  syncMock.mockReset()
  syncMock.mockResolvedValue({
    action: 'updated',
    configId: 'c1',
    configName: 'GATB Math',
    position: 9,
  })
})

async function stageAndScan(user: ReturnType<typeof userEvent.setup>) {
  const view = render(<CurriculumTab />)
  await user.click(screen.getByText('STAGE_TWO'))
  await user.click(await screen.findByRole('button', { name: /Scan 2 pages/i }))
  return view
}

describe('CurriculumTab — a failed batch keeps its reason and its photos (UX-275)', () => {
  it('names the reason instead of "please try again"', async () => {
    const user = userEvent.setup()
    scanMock.mockResolvedValue(null) // every page fails
    await stageAndScan(user)

    expect(await screen.findByText(/HEIC/)).toBeInTheDocument()
    expect(screen.queryByText(/please try again/i)).not.toBeInTheDocument()
  })

  it('leaves the failed photos staged, with one tap to retry', async () => {
    const user = userEvent.setup()
    scanMock.mockResolvedValue(null)
    await stageAndScan(user)

    await waitFor(() =>
      expect(screen.getByText(/2 pages didn’t go through|2 pages didn't go through/)).toBeInTheDocument(),
    )
    expect(screen.getByAltText('Page 1')).toBeInTheDocument()
    expect(screen.getByAltText('Page 2')).toBeInTheDocument()

    scanMock.mockClear()
    await user.click(screen.getByRole('button', { name: /Retry failed pages/i }))
    await waitFor(() => expect(scanMock).toHaveBeenCalledTimes(2))
  })

  it('keeps only the page that failed when the rest landed', async () => {
    const user = userEvent.setup()
    scanMock.mockImplementation(async (file: File) =>
      file.name.endsWith('.heic') ? null : worksheetRecord(),
    )
    await stageAndScan(user)

    // The good page is applied and gone; the bad one is still on screen.
    await waitFor(() => expect(screen.queryByAltText('Page 2')).not.toBeInTheDocument())
    expect(screen.getByAltText('Page 1')).toBeInTheDocument()
    expect(screen.getByText(/1 page didn’t go through|1 page didn't go through/)).toBeInTheDocument()
    expect(screen.getByText(/GATB Math/)).toBeInTheDocument()
    expect(screen.getByText(/1 page failed/)).toBeInTheDocument()
  })

  it('never carries a retained batch to another child (Codex round 1, P1)', async () => {
    const user = userEvent.setup()
    scanMock.mockResolvedValue(null)
    const view = await stageAndScan(user)

    // Two of Lincoln's pages failed and are still staged.
    await waitFor(() => expect(screen.getByAltText('Page 1')).toBeInTheDocument())
    expect(scanMock).toHaveBeenCalledTimes(2)
    expect(scanMock.mock.calls.every((c) => c[2] === 'lincoln')).toBe(true)

    // The parent switches to the other child. The photos go; nothing is written.
    scanMock.mockClear()
    activeChildId = 'london'
    view.rerender(<CurriculumTab />)

    await waitFor(() => expect(screen.queryByAltText('Page 1')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Retry failed pages/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Scan \d+ pages?/i })).not.toBeInTheDocument()
    expect(await screen.findByText(/picked for another child/i)).toBeInTheDocument()
    expect(scanMock).not.toHaveBeenCalled()
    expect(syncMock).not.toHaveBeenCalled()
  })

  it('discards a batch whose child changed mid-scan (Codex round 2, P1)', async () => {
    const user = userEvent.setup()
    // Hold the first page's scan open so the switch lands mid-batch.
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let switched = false
    scanMock.mockImplementation(async () => {
      if (!switched) {
        switched = true
        activeChildId = 'london'
        view.rerender(<CurriculumTab />)
        await held
      }
      return null // every page fails, so all would be retained
    })

    const view = render(<CurriculumTab />)
    await user.click(screen.getByText('STAGE_TWO'))
    await user.click(await screen.findByRole('button', { name: /Scan 2 pages/i }))
    release()

    // The completion is discarded: no photos, no retry, nothing left to write
    // to the child who is now on screen.
    await waitFor(() => expect(screen.queryByAltText('Page 1')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Retry failed pages/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Scan \d+ pages?/i })).not.toBeInTheDocument()
    // The writes this batch DID make used the child it started with.
    expect(scanMock.mock.calls.every((c) => c[2] === 'lincoln')).toBe(true)
  })

  it('clears every photo when they all landed', async () => {
    const user = userEvent.setup()
    scanMock.mockResolvedValue(worksheetRecord())
    await stageAndScan(user)

    await waitFor(() => expect(screen.queryByAltText('Page 1')).not.toBeInTheDocument())
    expect(screen.queryByText(/didn’t go through|didn't go through/)).not.toBeInTheDocument()
  })
})
