import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDoc } from 'firebase/firestore'

import { useUnifiedCapture } from './useUnifiedCapture'
import type { ChecklistItem, DayLog } from '../../core/types'
import { dayLogDocId } from './daylog.model'
import { TodayRowConfigsState } from './todayRowKind'
import type { TodayRowConfigLike } from './todayRowKind'

// ── Firestore / storage boundary mocks ──────────────────────────────────────
const addDocCalls: { key: string; data: Record<string, unknown> }[] = []
const updateDocCalls: Record<string, unknown>[] = []
let addDocShouldThrow = false
/** Reject only the first N addDoc calls, then succeed (batch primary-failure test). */
let addDocThrowFirst = 0

// UX-404: the capture no longer hands a whole `dayLog` back — it patches its own
// row on the LIVE document, so the day is a little store here and the assertions
// read what was actually written to it.
const daysStore = new Map<string, DayLog>()
const dayWrites: { id: string; data: Record<string, unknown> }[] = []

type Ref = { __key?: string; __id?: string }

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn((col: { __key: string }, data: Record<string, unknown>) => {
    if (addDocThrowFirst > 0) {
      addDocThrowFirst -= 1
      return Promise.reject(new Error('addDoc failed'))
    }
    if (addDocShouldThrow) return Promise.reject(new Error('addDoc failed'))
    addDocCalls.push({ key: col.__key, data })
    return Promise.resolve({ id: `artifact-${addDocCalls.length}` })
  }),
  doc: vi.fn((col: { __key?: string } | undefined, id?: string) => ({
    __key: col?.__key ?? 'unknown',
    __id: id,
  })),
  getDoc: vi.fn((ref: Ref) =>
    ref?.__key === 'days'
      ? Promise.resolve({
          exists: () => daysStore.has(ref.__id ?? ''),
          data: () => daysStore.get(ref.__id ?? ''),
        })
      : Promise.resolve({ exists: () => false, data: () => ({}) }),
  ),
  updateDoc: vi.fn((ref: Ref, data: Record<string, unknown>) => {
    if (ref?.__key === 'days') {
      const id = ref.__id ?? ''
      dayWrites.push({ id, data })
      daysStore.set(id, { ...(daysStore.get(id) as DayLog), ...(data as Partial<DayLog>) })
    } else {
      updateDocCalls.push(data)
    }
    return Promise.resolve()
  }),
}))

vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: vi.fn(() => ({ __key: 'artifacts' })),
  daysCollection: vi.fn(() => ({ __key: 'days' })),
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

// FEAT-136: let a test force the scan-analysis timeout branch without waiting
// out the real 120s ceiling. Off by default — `withTimeout` stays the real one.
let timeoutScans = false
vi.mock('../foundations-review/uploadTimeout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../foundations-review/uploadTimeout')>()
  return {
    ...actual,
    withTimeout: <T,>(work: (signal: AbortSignal) => Promise<T>, ms: number) =>
      timeoutScans
        ? Promise.reject(new actual.UploadTimeoutError())
        : actual.withTimeout(work, ms),
  }
})

// The hook reads the ACTOR's capability (FEAT-184 / UX-151); this file
// characterises the parent lane, so the actor is a parent throughout.
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({ isChildProfile: false }),
}))

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

const TODAY = '2026-07-10'
const DAY_ID = dayLogDocId(TODAY, 'child-1')

function setup(
  item: Partial<ChecklistItem>,
  configs: TodayRowConfigLike[] = [],
  configsState: TodayRowConfigsState = TodayRowConfigsState.Settled,
) {
  const onMessage = vi.fn()
  const onArtifactCreated = vi.fn()
  daysStore.set(DAY_ID, makeDayLog(item))
  const { result } = renderHook(() =>
    useUnifiedCapture({
      familyId: 'fam-1',
      childId: 'child-1',
      childName: 'Lincoln',
      today: TODAY,
      dayLog: makeDayLog(item),
      onMessage,
      onArtifactCreated,
      configs,
      // These tests are about a family whose curriculum list HAS loaded, unless
      // a case says otherwise.
      configsState,
    }),
  )
  return { result, onMessage, onArtifactCreated }
}

/** The row as the capture actually wrote it to the live day, or `undefined`. */
const writtenRow = (): ChecklistItem | undefined =>
  (dayWrites.at(-1)?.data.checklist as ChecklistItem[] | undefined)?.[0]

/** Did the capture touch the day document at all? */
const wroteToDay = () => dayWrites.length > 0

/** A scannable workbook config whose name matches the 'GATB Math (30m)' item. */
const matchingConfig: TodayRowConfigLike = {
  id: 'wb-math',
  name: 'GATB Math',
  type: 'workbook',
  scannable: true,
}

const file = () => new File(['x'], 'page.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  addDocCalls.length = 0
  updateDocCalls.length = 0
  daysStore.clear()
  dayWrites.length = 0
  addDocShouldThrow = false
  addDocThrowFirst = 0
  timeoutScans = false
  runScanMock.mockReset()
  syncScanToConfigMock.mockReset()
  clearScanMock.mockReset()
})
afterEach(() => vi.clearAllMocks())

describe('useUnifiedCapture — FEAT-62 workbook routing', () => {
  it('routed workbook capture creates an artifact AND registers a scan against the stamped config', async () => {
    runScanMock.mockResolvedValue({ id: 'scan-1', results: worksheetResults })
    syncScanToConfigMock.mockResolvedValue({ action: 'updated', configId: 'wb-math', configName: 'GATB Math', position: 12 })

    const { result, onMessage } = setup({ workbookConfigId: 'wb-math' }, [matchingConfig])
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
    const stamped = writtenRow()!
    expect(stamped.evidenceArtifactId).toBe('artifact-1')
    expect(stamped.evidenceCollection).toBe('artifacts')
    expect(stamped.workbookScanRegistration).toEqual({ configName: 'GATB Math', position: 12 })
    expect(stamped.scanned).toBe(true)
    expect(onMessage).toHaveBeenCalledWith({ text: 'Registered to GATB Math · Lesson 12', severity: 'success' })
  })

  it('analysis failure leaves the artifact intact and reports a plain capture', async () => {
    runScanMock.mockResolvedValue(null) // scan CF failed / unreadable

    const { result, onMessage } = setup({ workbookConfigId: 'wb-math' }, [matchingConfig])
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    // Artifact still created — capture succeeds independent of analysis.
    expect(addDocCalls.some((c) => c.key === 'artifacts')).toBe(true)
    // No position write attempted when there are no results.
    expect(syncScanToConfigMock).not.toHaveBeenCalled()
    const stamped = writtenRow()!
    expect(stamped.evidenceArtifactId).toBe('artifact-1')
    expect(stamped.evidenceCollection).toBe('artifacts')
    expect(stamped.workbookScanRegistration).toBeUndefined()
    expect(onMessage).toHaveBeenCalledWith({ text: 'Work captured!', severity: 'success' })
  })

  it('reports an honest error when the artifact write itself fails', async () => {
    runScanMock.mockResolvedValue({ id: 'scan-1', results: worksheetResults })
    syncScanToConfigMock.mockResolvedValue({ action: 'updated', configName: 'GATB Math', position: 12 })
    addDocShouldThrow = true

    const { result, onMessage } = setup({ workbookConfigId: 'wb-math' }, [matchingConfig])
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    expect(wroteToDay()).toBe(false)
    expect(onMessage).toHaveBeenCalledWith({ text: 'Photo capture failed. Try again.', severity: 'error' })
  })

  it('plain capture on a non-workbook item is unchanged (characterization — artifacts path, no registration)', async () => {
    runScanMock.mockResolvedValue(null) // non-curriculum / failed → artifacts branch

    const { result, onMessage } = setup({ /* no workbookConfigId */ })
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    expect(addDocCalls.some((c) => c.key === 'artifacts')).toBe(true)
    expect(syncScanToConfigMock).not.toHaveBeenCalled()
    const stamped = writtenRow()!
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

    const { result, onMessage } = setup({
      workbookConfigId: 'wb-math',
      evidenceArtifactId: 'artifact-existing',
      evidenceCollection: 'artifacts',
    }, [matchingConfig])
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
    const stamped = writtenRow()!
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

    const { result, onMessage } = setup({
      workbookConfigId: 'wb-math',
      evidenceArtifactId: 'artifact-existing',
      evidenceCollection: 'artifacts',
    }, [matchingConfig])
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0)
    })

    expect(wroteToDay()).toBe(false)
    // FEAT-136: was the generic "Couldn't read the workbook page. The photo is
    // still saved." at severity 'error'. `runScan` resolving null means the scan
    // never produced results at all, so the message now says so and retrying is
    // the right advice — and a saved photo is a warning, not an error.
    expect(onMessage).toHaveBeenCalledWith({
      text: "Couldn't read the workbook page. The photo is saved — try again.",
      severity: 'warning',
    })
    vi.unstubAllGlobals()
  })
})

describe('useUnifiedCapture — FEAT-62 legacy-item fallback (unstamped items)', () => {
  it('routed capture on an unstamped item resolves its config by label, scans it, and stamps workbookConfigId', async () => {
    runScanMock.mockResolvedValue({ id: 'scan-1', results: worksheetResults })
    syncScanToConfigMock.mockResolvedValue({ action: 'updated', configId: 'wb-math', configName: 'GATB Math', position: 12 })

    // No workbookConfigId on the item — it must resolve via the matching config.
    const { result, onMessage } = setup({}, [matchingConfig])
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    // Scan pinned to the resolved workbook, exactly like a stamped item.
    expect(syncScanToConfigMock).toHaveBeenCalledWith(
      'child-1',
      expect.objectContaining({ pageType: 'worksheet' }),
      { targetConfigId: 'wb-math' },
    )
    const stamped = writtenRow()!
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
    const { result, onMessage } = setup(
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
    const stamped = writtenRow()!
    expect(stamped.workbookConfigId).toBe('wb-math')
    expect(stamped.workbookScanRegistration).toEqual({ configName: 'GATB Math', position: 12 })
    expect(stamped.scanned).toBe(true)
    expect(onMessage).toHaveBeenCalledWith({ text: 'Registered to GATB Math · Lesson 12', severity: 'success' })
    vi.unstubAllGlobals()
  })

  it('backfill is a no-op when an unstamped item matches no config (nothing to resolve)', async () => {
    const { result } = setup(
      { evidenceArtifactId: 'artifact-existing', evidenceCollection: 'artifacts' },
      [], // no configs → no resolution
    )
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0)
    })

    // Bails before fetching / scanning / persisting.
    expect(runScanMock).not.toHaveBeenCalled()
    expect(syncScanToConfigMock).not.toHaveBeenCalled()
    expect(wroteToDay()).toBe(false)
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
    const { result, onMessage } = setup({}, [matchingConfig])
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0, ['https://x/orphan.jpg'])
    })

    // No ARTIFACT doc read (we were handed the URI) and no new artifact created.
    // The day document IS read — `UX-404`: the registration is written onto the
    // live row rather than onto the snapshot the button was tapped against.
    expect(
      getDocSpy.mock.calls.filter(([ref]) => (ref as { __key?: string })?.__key !== 'days'),
    ).toHaveLength(0)
    expect(addDocCalls.some((c) => c.key === 'artifacts')).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith('https://x/orphan.jpg')
    expect(syncScanToConfigMock).toHaveBeenCalledWith(
      'child-1',
      expect.objectContaining({ pageType: 'worksheet' }),
      { targetConfigId: 'wb-math' },
    )
    const stamped = writtenRow()!
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

    const { result, onMessage } = setup({ workbookConfigId: 'wb-math' }, [matchingConfig])
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0, ['https://x/p1.jpg', 'https://x/p2.jpg'])
    })

    // Each page analyzed; the latest position is what gets stamped.
    expect(syncScanToConfigMock).toHaveBeenCalledTimes(2)
    const stamped = writtenRow()!
    expect(stamped.workbookScanRegistration).toEqual({ configName: 'GATB Math', position: 13 })
    expect(onMessage).toHaveBeenCalledWith({ text: 'Registered 2 pages to GATB Math · Lesson 13', severity: 'success' })
    vi.unstubAllGlobals()
  })

  it('leaves photos intact with an honest error when every passed page fails to read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob(['img'])) }))
    runScanMock.mockResolvedValue(null) // unreadable

    const { result, onMessage } = setup({}, [matchingConfig])
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0, ['https://x/orphan.jpg'])
    })

    // Nothing registered → no stamp, honest message, photo untouched.
    expect(wroteToDay()).toBe(false)
    expect(addDocCalls.some((c) => c.key === 'artifacts')).toBe(false)
    // FEAT-136: same assertion change as above — reason-specific text, warning.
    expect(onMessage).toHaveBeenCalledWith({
      text: "Couldn't read the workbook page. The photo is saved — try again.",
      severity: 'warning',
    })
    vi.unstubAllGlobals()
  })
})

describe('useUnifiedCapture — FEAT-136: a failed analyze says what actually went wrong', () => {
  /** Stub `fetch` so the backfill loop can pull each page's photo back. */
  function stubPhotoFetch() {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob(['img'], { type: 'image/jpeg' })) }),
    )
  }

  it('timeout → says the scan took too long, not the generic sentence', async () => {
    stubPhotoFetch()
    timeoutScans = true

    const { result, onMessage } = setup({ workbookConfigId: 'wb-math' }, [matchingConfig])
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0, ['https://x/p1.jpg'])
    })

    expect(onMessage).toHaveBeenCalledWith({
      text: 'The scan took too long. The photo is saved — try again.',
      severity: 'warning',
    })
    expect(wroteToDay()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('not-a-worksheet → names the certificate, and never reaches the position writer', async () => {
    stubPhotoFetch()
    // `isWorksheetScan` is false only for a certificate page.
    runScanMock.mockResolvedValue({ id: 'scan-c', results: { pageType: 'certificate' } })

    const { result, onMessage } = setup({ workbookConfigId: 'wb-math' }, [matchingConfig])
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0, ['https://x/p1.jpg'])
    })

    expect(onMessage).toHaveBeenCalledWith({
      text: 'That looks like a certificate, not a workbook page. The photo is saved.',
      severity: 'warning',
    })
    // A failed read must never advance a workbook: `syncScanToConfig` is the
    // ONLY path that writes `currentPosition`, and it is not reached.
    expect(syncScanToConfigMock).not.toHaveBeenCalled()
    expect(wroteToDay()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('no curriculum detected → says it found no workbook page, with the photo hint', async () => {
    stubPhotoFetch()
    runScanMock.mockResolvedValue({ id: 'scan-n', results: worksheetResults })
    syncScanToConfigMock.mockResolvedValue({ action: 'none', reason: 'no-curriculum-detected' })

    const { result, onMessage } = setup({ workbookConfigId: 'wb-math' }, [matchingConfig])
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0, ['https://x/p1.jpg'])
    })

    expect(onMessage).toHaveBeenCalledWith({
      text: "Couldn't find a workbook page in the photo. The photo is saved — try one page, flat and straight on, in good light.",
      severity: 'warning',
    })
    // Nothing registered → no stamp, no position advance.
    expect(wroteToDay()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('config-missing → says the row lost its workbook, and never suggests retaking the photo', async () => {
    stubPhotoFetch()
    runScanMock.mockResolvedValue({ id: 'scan-m', results: worksheetResults })
    // The pinned activity config no longer exists.
    syncScanToConfigMock.mockResolvedValue({ action: 'none', reason: 'target-missing' })

    // A stamp the SETTLED list does not contain is a stale join and resolves to
    // no workbook at all (Codex round 2, P2) — so the case this message exists
    // for is the one where the list has not been read: the stamp is then the
    // honest answer, and `syncScanToConfig` is what discovers the config is gone.
    const { result, onMessage } = setup(
      { workbookConfigId: 'wb-gone' },
      [],
      TodayRowConfigsState.Loading,
    )
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0, ['https://x/p1.jpg'])
    })

    const msg = onMessage.mock.calls.at(-1)![0] as { text: string; severity: string }
    expect(msg.text).toContain("isn't linked to a workbook any more")
    expect(msg.severity).toBe('warning')
    // Sending her back to re-shoot a photo would be useless work — no photo of
    // any quality can register against a workbook that is gone.
    expect(msg.text.toLowerCase()).not.toMatch(/try again|retake|good light|straight on/)
    // And it is NOT reported as the same thing as an unreadable photo.
    expect(msg.text).not.toContain("Couldn't read the workbook page")
    expect(wroteToDay()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('3 pages, 2 read → the count, and the day log records the last successful registration', async () => {
    stubPhotoFetch()
    runScanMock.mockResolvedValue({ id: 'scan-p', results: worksheetResults })
    syncScanToConfigMock
      .mockResolvedValueOnce({ action: 'updated', configId: 'wb-math', configName: 'GATB Math', position: 12 })
      .mockResolvedValueOnce({ action: 'updated', configId: 'wb-math', configName: 'GATB Math', position: 13 })
      .mockResolvedValueOnce({ action: 'none', reason: 'no-curriculum-detected' })

    const { result, onMessage } = setup({ workbookConfigId: 'wb-math' }, [matchingConfig])
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0, [
        'https://x/p1.jpg',
        'https://x/p2.jpg',
        'https://x/p3.jpg',
      ])
    })

    const msg = onMessage.mock.calls.at(-1)![0] as { text: string; severity: string }
    // The count was already being computed and thrown away before FEAT-136.
    expect(msg.text).toContain('2 of 3 pages read')
    expect(msg.text).toContain('GATB Math · Lesson 13')
    expect(msg.text).toContain("1 page couldn't be matched to a lesson")
    expect(msg.severity).toBe('warning')
    // Existing behaviour, now asserted: the last success is what gets stamped.
    const stamped = writtenRow()!
    expect(stamped.workbookScanRegistration).toEqual({ configName: 'GATB Math', position: 13 })
    expect(stamped.scanned).toBe(true)
    vi.unstubAllGlobals()
  })

  it('3 pages, 0 read → no day-log write, photo untouched, and a warning that leads with the count', async () => {
    stubPhotoFetch()
    runScanMock.mockResolvedValue(null)

    const { result, onMessage } = setup({ workbookConfigId: 'wb-math' }, [matchingConfig])
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0, [
        'https://x/p1.jpg',
        'https://x/p2.jpg',
        'https://x/p3.jpg',
      ])
    })

    expect(wroteToDay()).toBe(false)
    // Backfill never creates or removes an artifact — the photo is untouched.
    expect(addDocCalls).toHaveLength(0)
    expect(updateDocCalls).toHaveLength(0)
    const msg = onMessage.mock.calls.at(-1)![0] as { text: string; severity: string }
    expect(msg.text).toContain('None of the 3 pages read.')
    expect(msg.severity).toBe('warning')
    vi.unstubAllGlobals()
  })

  it('one banner, not three, when the pages fail for different reasons', async () => {
    stubPhotoFetch()
    runScanMock
      .mockResolvedValueOnce(null) // no-result
      .mockResolvedValueOnce({ id: 's', results: { pageType: 'certificate' } }) // not-a-worksheet
      .mockResolvedValueOnce(null) // no-result (dominant)

    const { result, onMessage } = setup({ workbookConfigId: 'wb-math' }, [matchingConfig])
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0, [
        'https://x/p1.jpg',
        'https://x/p2.jpg',
        'https://x/p3.jpg',
      ])
    })

    expect(onMessage).toHaveBeenCalledTimes(1)
    const msg = onMessage.mock.calls.at(-1)![0] as { text: string }
    expect(msg.text).toContain('None of the 3 pages read.')
    expect(msg.text).toContain("Couldn't read the workbook page")
    expect(msg.text).not.toContain('certificate')
    vi.unstubAllGlobals()
  })

  it('reads the page but finds no lesson → says nothing advanced, while the write stays exactly as before (Codex P1, PR #1652)', async () => {
    stubPhotoFetch()
    // The real shape of a blurry / angled / two-page-spread photo: the scan
    // prompt always fills `subject`, so the page DOES register — with no lesson
    // number, so the workbook never moves.
    runScanMock.mockResolvedValue({ id: 'scan-nl', results: worksheetResults })
    syncScanToConfigMock.mockResolvedValue({
      action: 'updated',
      configId: 'wb-math',
      configName: 'GATB Math',
      position: null,
    })

    const { result, onMessage } = setup({ workbookConfigId: 'wb-math' }, [matchingConfig])
    await act(async () => {
      await result.current.handleBackfillWorkbookScan(0, ['https://x/spread.jpg'])
    })

    const msg = onMessage.mock.calls.at(-1)![0] as { text: string; severity: string }
    expect(msg.text).toContain('nothing advanced in GATB Math')
    expect(msg.text).toContain('one page, flat and straight on, in good light')
    expect(msg.text).not.toContain('Registered')
    expect(msg.severity).toBe('warning')
    // Reporting only — the stamp is byte-identical to pre-FEAT-136 behaviour.
    // Whether this should stop registering at all is FEAT-137, not decided here.
    const stamped = writtenRow()!
    expect(stamped.workbookScanRegistration).toEqual({ configName: 'GATB Math', position: null })
    expect(stamped.scanned).toBe(true)
    vi.unstubAllGlobals()
  })

  it('a failed read on capture still saves the photo and never advances the workbook', async () => {
    // The capture path's own message is deliberately unchanged (the photo saving
    // IS what the parent asked for), but the rail still holds.
    runScanMock.mockResolvedValue({ id: 'scan-x', results: { pageType: 'certificate' } })

    const { result, onMessage } = setup({ workbookConfigId: 'wb-math' }, [matchingConfig])
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    expect(addDocCalls.some((c) => c.key === 'artifacts')).toBe(true)
    expect(syncScanToConfigMock).not.toHaveBeenCalled()
    const stamped = writtenRow()!
    expect(stamped.workbookScanRegistration).toBeUndefined()
    expect(stamped.scanned).toBeUndefined()
    expect(onMessage).toHaveBeenCalledWith({ text: 'Work captured!', severity: 'success' })
  })
})

describe('useUnifiedCapture — FEAT-108 batch photo capture', () => {
  it('saves photo #1 through the full pipeline, the extras as evidence-only, and one summary toast', async () => {
    // Non-workbook item → artifacts path. #1 links evidence; extras save plain.
    runScanMock.mockResolvedValue(null)

    const { result, onMessage } = setup({ /* no workbookConfigId */ })
    await act(async () => {
      await result.current.handleUnifiedCaptureBatch([file(), file(), file()], 0)
    })

    // Three artifacts written (one per photo).
    expect(addDocCalls.filter((c) => c.key === 'artifacts')).toHaveLength(3)
    // Only photo #1 touches the checklist (evidence link) — extras never persist.
    expect(dayWrites).toHaveLength(1)
    const stamped = writtenRow()!
    expect(stamped.evidenceCollection).toBe('artifacts')
    // One summary toast for the two extras.
    expect(onMessage).toHaveBeenCalledWith({ text: '+2 more pages saved', severity: 'success' })
  })

  it('routes a single-file batch straight through the normal path (no summary toast)', async () => {
    runScanMock.mockResolvedValue(null)

    const { result, onMessage } = setup({})
    await act(async () => {
      await result.current.handleUnifiedCaptureBatch([file()], 0)
    })

    expect(addDocCalls.filter((c) => c.key === 'artifacts')).toHaveLength(1)
    expect(dayWrites).toHaveLength(1)
    // No "+N more" toast for a lone photo.
    expect(onMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('more page') }),
    )
  })

  it('aborts — no extras, no success toast — when photo #1 fails (Codex P1 guard)', async () => {
    // Only photo #1's artifact write fails; the extras WOULD succeed. The batch
    // must still abort so it never saves orphan extras against a lost primary,
    // nor overwrites #1's error with a batch success toast.
    runScanMock.mockResolvedValue(null)
    addDocThrowFirst = 1

    const { result, onMessage } = setup({})
    await act(async () => {
      await result.current.handleUnifiedCaptureBatch([file(), file(), file()], 0)
    })

    // No extra artifacts were attempted (abort before saveEvidenceArtifact).
    expect(addDocCalls.filter((c) => c.key === 'artifacts')).toHaveLength(0)
    expect(wroteToDay()).toBe(false)
    // The primary's honest error stands; no batch success toast.
    expect(onMessage).toHaveBeenCalledWith({ text: 'Photo capture failed. Try again.', severity: 'error' })
    expect(onMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('more page') }),
    )
  })
})

// ── FEAT-141: every captured image keeps a short content note ────────────────
//
// Nathan, 2026-08-13: "We need to analyze every image and keep that
// description… the image analysis should include the other information at
// capture for context."
//
// The rail these cases exist to hold: the note rides on the analysis pass that
// ALREADY ran on this path. A capture must never fail, block, or change shape
// because a note could not be produced.
describe('useUnifiedCapture — FEAT-141 content notes at capture', () => {
  /** The artifacts branch: a photo the scan pass read but did not classify as curriculum. */
  const nonCurriculumResults = {
    pageType: 'other',
    subject: '',
    specificTopic: '',
    skillsTargeted: [],
    estimatedDifficulty: 'appropriate',
    recommendation: 'do',
    recommendationReason: '',
    estimatedMinutes: 0,
    teacherNotes: '',
    contentNote: 'Lego castle with a working drawbridge',
  }

  it('stores the note the classification pass returned on the artifact', async () => {
    runScanMock.mockResolvedValue({ id: 'scan-1', results: nonCurriculumResults })

    const { result } = setup({ /* no workbookConfigId → artifacts path */ })
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    const artifact = addDocCalls.find((c) => c.key === 'artifacts')!
    expect(artifact.data.contentNote).toBe('Lego castle with a working drawbridge')
  })

  it('hands the capture context to the same analysis call — no second round-trip', async () => {
    runScanMock.mockResolvedValue({ id: 'scan-1', results: nonCurriculumResults })

    const { result } = setup({ subjectBucket: 'Math' } as Partial<ChecklistItem>)
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    expect(runScanMock).toHaveBeenCalledTimes(1)
    expect(runScanMock).toHaveBeenCalledWith(
      expect.any(File),
      'fam-1',
      'child-1',
      { itemLabel: 'GATB Math', subjectBucket: 'Math' },
    )
  })

  it('clamps an over-long note at write (≤140 chars, ellipsis)', async () => {
    runScanMock.mockResolvedValue({
      id: 'scan-1',
      results: { ...nonCurriculumResults, contentNote: 'word '.repeat(60) },
    })

    const { result } = setup({})
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    const note = addDocCalls.find((c) => c.key === 'artifacts')!.data.contentNote as string
    expect(note.length).toBeLessThanOrEqual(140)
    expect(note.endsWith('…')).toBe(true)
  })

  it('a failed analysis pass leaves the capture intact and simply note-less', async () => {
    runScanMock.mockResolvedValue(null) // pass failed / unreadable

    const { result, onMessage } = setup({})
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    // The capture write still happened — that is the whole rail.
    const artifact = addDocCalls.find((c) => c.key === 'artifacts')!
    expect(artifact).toBeDefined()
    expect(artifact.data.contentNote).toBeUndefined()
    expect(writtenRow()!.evidenceArtifactId).toBe('artifact-1')
    expect(onMessage).toHaveBeenCalledWith({ text: 'Work captured!', severity: 'success' })
  })

  it('a timed-out workbook analysis still saves the photo, with no note', async () => {
    timeoutScans = true

    const { result } = setup({ workbookConfigId: 'wb-math' }, [matchingConfig])
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    const artifact = addDocCalls.find((c) => c.key === 'artifacts')!
    expect(artifact).toBeDefined()
    expect(artifact.data.contentNote).toBeUndefined()
    expect(writtenRow()!.evidenceArtifactId).toBe('artifact-1')
  })

  it('the workbook path derives its note from the analysis it already ran', async () => {
    runScanMock.mockResolvedValue({ id: 'scan-1', results: worksheetResults })
    syncScanToConfigMock.mockResolvedValue({
      action: 'updated',
      configId: 'wb-math',
      configName: 'GATB Math',
      position: 12,
    })

    const { result } = setup({ workbookConfigId: 'wb-math' }, [matchingConfig])
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    expect(runScanMock).toHaveBeenCalledTimes(1) // no extra AI call for the note
    const artifact = addDocCalls.find((c) => c.key === 'artifacts')!
    expect(artifact.data.contentNote).toBe('GATB Math Lesson 12 — addition')
  })
})
