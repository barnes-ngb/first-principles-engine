import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDoc } from 'firebase/firestore'

import { useUnifiedCapture } from './useUnifiedCapture'
import type { ChecklistItem, DayLog } from '../../core/types'
import type { WorkbookConfigLike } from '../../core/utils/workbookMatching'

// ── Firestore / storage boundary mocks ──────────────────────────────────────
const addDocCalls: { key: string; data: Record<string, unknown> }[] = []
const updateDocCalls: Record<string, unknown>[] = []
let addDocShouldThrow = false

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn((col: { __key: string }, data: Record<string, unknown>) => {
    if (addDocShouldThrow) return Promise.reject(new Error('addDoc failed'))
    addDocCalls.push({ key: col.__key, data })
    return Promise.resolve({ id: `artifact-${addDocCalls.length}` })
  }),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
  updateDoc: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
    updateDocCalls.push(data)
    return Promise.resolve()
  }),
}))

vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: vi.fn(() => ({ __key: 'artifacts' })),
  skillSnapshotsCollection: vi.fn(() => ({ __key: 'skillSnapshots' })),
}))

vi.mock('../../core/firebase/upload', () => ({
  generateFilename: vi.fn((ext: string) => `file.${ext}`),
  uploadArtifactFile: vi.fn(() => Promise.resolve({ downloadUrl: 'https://x/file.jpg' })),
}))

// Downscale is a no-op passthrough in tests (returns the input file).
vi.mock('../../core/utils/downscaleImage', () => ({
  downscaleImage: vi.fn((file: File) => Promise.resolve(file)),
}))

// Non-workbook curriculum-scan side effects — no-op so the characterization
// path doesn't need real skill-map / blocker infrastructure.
vi.mock('../../core/curriculum/updateSkillMapFromFindings', () => ({
  updateSkillMapFromFindings: vi.fn(() => Promise.resolve()),
}))
vi.mock('./scanBlocker', () => ({ detectBlockersFromScan: vi.fn(() => []) }))

// ── Scan hooks ──────────────────────────────────────────────────────────────
const runScanMock = vi.fn()
const syncScanToConfigMock = vi.fn()
const clearScanMock = vi.fn()

vi.mock('../../core/hooks/useScan', () => ({
  useScan: () => ({
    scan: runScanMock,
    recordAction: vi.fn(),
    scanResult: null,
    scanning: false,
    error: null,
    clearScan: clearScanMock,
  }),
}))
vi.mock('../../core/hooks/useScanToActivityConfig', () => ({
  useScanToActivityConfig: () => ({ syncScanToConfig: syncScanToConfigMock }),
}))

// ── Fixtures ────────────────────────────────────────────────────────────────
const worksheetResults = {
  pageType: 'worksheet',
  subject: 'Math',
  specificTopic: 'addition',
  skillsTargeted: [],
  estimatedDifficulty: 'appropriate',
  recommendation: 'do',
  recommendationReason: '',
  estimatedMinutes: 20,
  teacherNotes: '',
  curriculumDetected: { provider: 'gatb', name: 'GATB Math', lessonNumber: 12, pageNumber: null, levelDesignation: null },
}

function makeDayLog(item: Partial<ChecklistItem>): DayLog {
  const checklist: ChecklistItem[] = [
    { label: 'GATB Math (30m)', completed: true, ...item },
  ]
  return { checklist } as unknown as DayLog
}

function setup(item: Partial<ChecklistItem>, configs: WorkbookConfigLike[] = []) {
  const persistDayLogImmediate = vi.fn()
  const onMessage = vi.fn()
  const onArtifactCreated = vi.fn()
  const { result } = renderHook(() =>
    useUnifiedCapture({
      familyId: 'fam-1',
      childId: 'child-1',
      childName: 'Lincoln',
      today: '2026-07-10',
      dayLog: makeDayLog(item),
      persistDayLogImmediate,
      onMessage,
      onArtifactCreated,
      configs,
    }),
  )
  return { result, persistDayLogImmediate, onMessage, onArtifactCreated }
}

/** A scannable workbook config whose name matches the 'GATB Math (30m)' item. */
const matchingConfig: WorkbookConfigLike = {
  id: 'wb-math',
  name: 'GATB Math',
  type: 'workbook',
  scannable: true,
}

const file = () => new File(['x'], 'page.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  addDocCalls.length = 0
  updateDocCalls.length = 0
  addDocShouldThrow = false
  runScanMock.mockReset()
  syncScanToConfigMock.mockReset()
  clearScanMock.mockReset()
})
afterEach(() => vi.clearAllMocks())

describe('useUnifiedCapture — FEAT-62 workbook routing', () => {
  it('routed workbook capture creates an artifact AND registers a scan against the stamped config', async () => {
    runScanMock.mockResolvedValue({ id: 'scan-1', results: worksheetResults })
    syncScanToConfigMock.mockResolvedValue({ action: 'updated', configId: 'wb-math', configName: 'GATB Math', position: 12 })

    const { result, persistDayLogImmediate, onMessage } = setup({ workbookConfigId: 'wb-math' })
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    // Artifact created (evidence).
    expect(addDocCalls.some((c) => c.key === 'artifacts')).toBe(true)
    // Scan pinned to the stamped workbook (targetConfigId), not fuzzy-matched.
    expect(syncScanToConfigMock).toHaveBeenCalledWith(
      'child-1',
      expect.objectContaining({ pageType: 'worksheet' }),
      { targetConfigId: 'wb-math' },
    )
    // Item stamped: artifact evidence + registration for the visibility line.
    const persisted = persistDayLogImmediate.mock.calls.at(-1)![0] as DayLog
    const stamped = persisted.checklist![0]
    expect(stamped.evidenceArtifactId).toBe('artifact-1')
    expect(stamped.evidenceCollection).toBe('artifacts')
    expect(stamped.workbookScanRegistration).toEqual({ configName: 'GATB Math', position: 12 })
    expect(stamped.scanned).toBe(true)
    expect(onMessage).toHaveBeenCalledWith({ text: 'Registered to GATB Math · Lesson 12', severity: 'success' })
  })

  it('analysis failure leaves the artifact intact and reports a plain capture', async () => {
    runScanMock.mockResolvedValue(null) // scan CF failed / unreadable

    const { result, persistDayLogImmediate, onMessage } = setup({ workbookConfigId: 'wb-math' })
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    // Artifact still created — capture succeeds independent of analysis.
    expect(addDocCalls.some((c) => c.key === 'artifacts')).toBe(true)
    // No position write attempted when there are no results.
    expect(syncScanToConfigMock).not.toHaveBeenCalled()
    const stamped = (persistDayLogImmediate.mock.calls.at(-1)![0] as DayLog).checklist![0]
    expect(stamped.evidenceArtifactId).toBe('artifact-1')
    expect(stamped.evidenceCollection).toBe('artifacts')
    expect(stamped.workbookScanRegistration).toBeUndefined()
    expect(onMessage).toHaveBeenCalledWith({ text: 'Work captured!', severity: 'success' })
  })

  it('reports an honest error when the artifact write itself fails', async () => {
    runScanMock.mockResolvedValue({ id: 'scan-1', results: worksheetResults })
    syncScanToConfigMock.mockResolvedValue({ action: 'updated', configName: 'GATB Math', position: 12 })
    addDocShouldThrow = true

    const { result, persistDayLogImmediate, onMessage } = setup({ workbookConfigId: 'wb-math' })
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    expect(persistDayLogImmediate).not.toHaveBeenCalled()
    expect(onMessage).toHaveBeenCalledWith({ text: 'Photo capture failed. Try again.', severity: 'error' })
  })

  it('plain capture on a non-workbook item is unchanged (characterization — artifacts path, no registration)', async () => {
    runScanMock.mockResolvedValue(null) // non-curriculum / failed → artifacts branch

    const { result, persistDayLogImmediate, onMessage } = setup({ /* no workbookConfigId */ })
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    expect(addDocCalls.some((c) => c.key === 'artifacts')).toBe(true)
    expect(syncScanToConfigMock).not.toHaveBeenCalled()
    const stamped = (persistDayLogImmediate.mock.calls.at(-1)![0] as DayLog).checklist![0]
    expect(stamped.evidenceCollection).toBe('artifacts')
    expect(stamped.workbookScanRegistration).toBeUndefined()
    expect(onMessage).toHaveBeenCalledWith({ text: 'Work captured!', severity: 'success' })
  })

  it('backfill re-analyzes a stranded artifact photo and registers it without creating a new artifact', async () => {
    // The saved artifact is fetched back and re-scanned.
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uri: 'https://x/saved.jpg' }),
    } as never)
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ blob: () => Promise.resolve(new Blob(['img'], { type: 'image/jpeg' })) })
    vi.stubGlobal('fetch', fetchMock)
    runScanMock.mockResolvedValue({ id: 'scan-2', results: worksheetResults })
    syncScanToConfigMock.mockResolvedValue({ action: 'updated', configName: 'GATB Math', position: 12 })

    const { result, persistDayLogImmediate, onMessage } = setup({
      workbookConfigId: 'wb-math',
      evidenceArtifactId: 'artifact-existing',
      evidenceCollection: 'artifacts',
    })
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0)
    })

    // No NEW artifact — backfill only registers the scan.
    expect(addDocCalls.some((c) => c.key === 'artifacts')).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith('https://x/saved.jpg')
    expect(syncScanToConfigMock).toHaveBeenCalledWith(
      'child-1',
      expect.objectContaining({ pageType: 'worksheet' }),
      { targetConfigId: 'wb-math' },
    )
    const stamped = (persistDayLogImmediate.mock.calls.at(-1)![0] as DayLog).checklist![0]
    expect(stamped.workbookScanRegistration).toEqual({ configName: 'GATB Math', position: 12 })
    expect(stamped.scanned).toBe(true)
    expect(onMessage).toHaveBeenCalledWith({ text: 'Registered to GATB Math · Lesson 12', severity: 'success' })
    vi.unstubAllGlobals()
  })

  it('backfill leaves the photo intact and reports honestly when analysis fails', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uri: 'https://x/saved.jpg' }),
    } as never)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob(['img'])) }))
    runScanMock.mockResolvedValue(null) // unreadable

    const { result, persistDayLogImmediate, onMessage } = setup({
      workbookConfigId: 'wb-math',
      evidenceArtifactId: 'artifact-existing',
      evidenceCollection: 'artifacts',
    })
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0)
    })

    expect(persistDayLogImmediate).not.toHaveBeenCalled()
    expect(onMessage).toHaveBeenCalledWith({
      text: "Couldn't read the workbook page. The photo is still saved.",
      severity: 'error',
    })
    vi.unstubAllGlobals()
  })
})

describe('useUnifiedCapture — FEAT-62 legacy-item fallback (unstamped items)', () => {
  it('routed capture on an unstamped item resolves its config by label, scans it, and stamps workbookConfigId', async () => {
    runScanMock.mockResolvedValue({ id: 'scan-1', results: worksheetResults })
    syncScanToConfigMock.mockResolvedValue({ action: 'updated', configId: 'wb-math', configName: 'GATB Math', position: 12 })

    // No workbookConfigId on the item — it must resolve via the matching config.
    const { result, persistDayLogImmediate, onMessage } = setup({}, [matchingConfig])
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    // Scan pinned to the resolved workbook, exactly like a stamped item.
    expect(syncScanToConfigMock).toHaveBeenCalledWith(
      'child-1',
      expect.objectContaining({ pageType: 'worksheet' }),
      { targetConfigId: 'wb-math' },
    )
    const stamped = (persistDayLogImmediate.mock.calls.at(-1)![0] as DayLog).checklist![0]
    // Resolution is made permanent — the id is stamped onto the item.
    expect(stamped.workbookConfigId).toBe('wb-math')
    expect(stamped.workbookScanRegistration).toEqual({ configName: 'GATB Math', position: 12 })
    expect(stamped.scanned).toBe(true)
    expect(onMessage).toHaveBeenCalledWith({ text: 'Registered to GATB Math · Lesson 12', severity: 'success' })
  })

  it('backfill on an unstamped item resolves its config by label, scans it, and stamps workbookConfigId', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uri: 'https://x/saved.jpg' }),
    } as never)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob(['img'], { type: 'image/jpeg' })) }))
    runScanMock.mockResolvedValue({ id: 'scan-2', results: worksheetResults })
    syncScanToConfigMock.mockResolvedValue({ action: 'updated', configId: 'wb-math', configName: 'GATB Math', position: 12 })

    // Unstamped legacy item with a stranded artifact photo.
    const { result, persistDayLogImmediate, onMessage } = setup(
      { evidenceArtifactId: 'artifact-existing', evidenceCollection: 'artifacts' },
      [matchingConfig],
    )
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0)
    })

    // No new artifact — backfill only registers the scan.
    expect(addDocCalls.some((c) => c.key === 'artifacts')).toBe(false)
    expect(syncScanToConfigMock).toHaveBeenCalledWith(
      'child-1',
      expect.objectContaining({ pageType: 'worksheet' }),
      { targetConfigId: 'wb-math' },
    )
    const stamped = (persistDayLogImmediate.mock.calls.at(-1)![0] as DayLog).checklist![0]
    expect(stamped.workbookConfigId).toBe('wb-math')
    expect(stamped.workbookScanRegistration).toEqual({ configName: 'GATB Math', position: 12 })
    expect(stamped.scanned).toBe(true)
    expect(onMessage).toHaveBeenCalledWith({ text: 'Registered to GATB Math · Lesson 12', severity: 'success' })
    vi.unstubAllGlobals()
  })

  it('backfill is a no-op when an unstamped item matches no config (nothing to resolve)', async () => {
    const { result, persistDayLogImmediate } = setup(
      { evidenceArtifactId: 'artifact-existing', evidenceCollection: 'artifacts' },
      [], // no configs → no resolution
    )
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0)
    })

    // Bails before fetching / scanning / persisting.
    expect(runScanMock).not.toHaveBeenCalled()
    expect(syncScanToConfigMock).not.toHaveBeenCalled()
    expect(persistDayLogImmediate).not.toHaveBeenCalled()
  })
})

describe('useUnifiedCapture — FEAT-62 polish: display-parity backfill (owner cohort)', () => {
  it('backfills a display-resolved photo on a link-less legacy item (no evidenceArtifactId)', async () => {
    // The owner's exact cohort: no evidenceArtifactId on the row; the caller
    // passes the URI the page can already display (planItem/title join).
    const getDocSpy = vi.mocked(getDoc)
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ blob: () => Promise.resolve(new Blob(['img'], { type: 'image/jpeg' })) })
    vi.stubGlobal('fetch', fetchMock)
    runScanMock.mockResolvedValue({ id: 'scan-9', results: worksheetResults })
    syncScanToConfigMock.mockResolvedValue({ action: 'updated', configId: 'wb-math', configName: 'GATB Math', position: 12 })

    // No evidenceArtifactId — resolution must come from the passed URI + config match.
    const { result, persistDayLogImmediate, onMessage } = setup({}, [matchingConfig])
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0, ['https://x/orphan.jpg'])
    })

    // No doc read (we were handed the URI) and no new artifact created.
    expect(getDocSpy).not.toHaveBeenCalled()
    expect(addDocCalls.some((c) => c.key === 'artifacts')).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith('https://x/orphan.jpg')
    expect(syncScanToConfigMock).toHaveBeenCalledWith(
      'child-1',
      expect.objectContaining({ pageType: 'worksheet' }),
      { targetConfigId: 'wb-math' },
    )
    const stamped = (persistDayLogImmediate.mock.calls.at(-1)![0] as DayLog).checklist![0]
    expect(stamped.workbookConfigId).toBe('wb-math')
    expect(stamped.workbookScanRegistration).toEqual({ configName: 'GATB Math', position: 12 })
    expect(stamped.scanned).toBe(true)
    expect(onMessage).toHaveBeenCalledWith({ text: 'Registered to GATB Math · Lesson 12', severity: 'success' })
    vi.unstubAllGlobals()
  })

  it('"analyze all" scans every passed page and reports the count + last position', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob(['img'], { type: 'image/jpeg' })) }),
    )
    runScanMock.mockResolvedValue({ id: 'scan-10', results: worksheetResults })
    syncScanToConfigMock
      .mockResolvedValueOnce({ action: 'updated', configId: 'wb-math', configName: 'GATB Math', position: 12 })
      .mockResolvedValueOnce({ action: 'updated', configId: 'wb-math', configName: 'GATB Math', position: 13 })

    const { result, persistDayLogImmediate, onMessage } = setup({ workbookConfigId: 'wb-math' })
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0, ['https://x/p1.jpg', 'https://x/p2.jpg'])
    })

    // Each page analyzed; the latest position is what gets stamped.
    expect(syncScanToConfigMock).toHaveBeenCalledTimes(2)
    const stamped = (persistDayLogImmediate.mock.calls.at(-1)![0] as DayLog).checklist![0]
    expect(stamped.workbookScanRegistration).toEqual({ configName: 'GATB Math', position: 13 })
    expect(onMessage).toHaveBeenCalledWith({ text: 'Registered 2 pages to GATB Math · Lesson 13', severity: 'success' })
    vi.unstubAllGlobals()
  })

  it('leaves photos intact with an honest error when every passed page fails to read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob(['img'])) }))
    runScanMock.mockResolvedValue(null) // unreadable

    const { result, persistDayLogImmediate, onMessage } = setup({}, [matchingConfig])
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0, ['https://x/orphan.jpg'])
    })

    // Nothing registered → no stamp, honest error, photo untouched.
    expect(persistDayLogImmediate).not.toHaveBeenCalled()
    expect(addDocCalls.some((c) => c.key === 'artifacts')).toBe(false)
    expect(onMessage).toHaveBeenCalledWith({
      text: "Couldn't read the workbook page. The photo is still saved.",
      severity: 'error',
    })
    vi.unstubAllGlobals()
  })
})
