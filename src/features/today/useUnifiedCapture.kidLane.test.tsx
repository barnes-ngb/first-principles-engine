import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUnifiedCapture } from './useUnifiedCapture'
import type { ChecklistItem, DayLog } from '../../core/types'
import type { WorkbookConfigLike } from '../../core/utils/workbookMatching'

// ── FEAT-184 / UX-151: two lanes, one gate ──────────────────────────────────
//
// A KID's `Show your work!` keeps the scan and the photo and loses the silent
// writes. A PARENT's capture is byte-for-byte what it was. The gate is the
// actor's capability (`isChildProfile`), read inside the hook — never a name.

// ── Firestore / storage boundary mocks ──────────────────────────────────────
type WriteOp = { op: 'addDoc'; key: string; data: Record<string, unknown> } | { op: 'updateDoc'; data: Record<string, unknown> }
const writes: WriteOp[] = []

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn((col: { __key: string }, data: Record<string, unknown>) => {
    writes.push({ op: 'addDoc', key: col.__key, data })
    return Promise.resolve({ id: `artifact-${writes.length}` })
  }),
  doc: vi.fn((col: { __key?: string } | undefined) => ({ __key: col?.__key ?? 'unknown' })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => true, data: () => ({ conceptualBlocks: [] }) })),
  updateDoc: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
    writes.push({ op: 'updateDoc', data })
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

vi.mock('../../core/utils/downscaleImage', () => ({
  downscaleImage: vi.fn((file: File) => Promise.resolve(file)),
}))

// The two invariant side-writes the SCANS path fans out to. Spied, not
// no-op'd silently: the assertions below are about whether they were reached.
const updateSkillMapMock = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve())
vi.mock('../../core/curriculum/updateSkillMapFromFindings', () => ({
  updateSkillMapFromFindings: (...args: unknown[]) => updateSkillMapMock(...args),
}))
// A detected blocker on every curriculum scan, so the `skillSnapshots`
// `conceptualBlocks` merge is REACHABLE in both lanes and the gate is what
// decides it.
vi.mock('./scanBlocker', () => ({
  detectBlockersFromScan: vi.fn(() => [
    { id: 'blk-1', skill: 'addition', status: 'active', firstSeen: '2026-09-03', evidence: [] },
  ]),
}))

// ── The actor ───────────────────────────────────────────────────────────────
const actor = { isChildProfile: false }
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({ isChildProfile: actor.isChildProfile }),
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
  skillsTargeted: [{ skill: 'addition', level: 'grade 1', alignsWithSnapshot: 'ahead' }],
  estimatedDifficulty: 'appropriate',
  recommendation: 'do',
  recommendationReason: '',
  estimatedMinutes: 20,
  teacherNotes: '',
  curriculumDetected: { provider: 'gatb', name: 'GATB Math', lessonNumber: 12, pageNumber: null, levelDesignation: null },
}

/** A photo of a build — the case the owner named: not a worksheet, worth describing. */
const buildResults = {
  pageType: 'other',
  subject: 'Science',
  specificTopic: '',
  skillsTargeted: [],
  estimatedDifficulty: 'appropriate',
  recommendation: 'do',
  recommendationReason: '',
  estimatedMinutes: 0,
  teacherNotes: '',
  contentNote: 'A Lego castle with a working drawbridge',
}

function makeDayLog(item: Partial<ChecklistItem>): DayLog {
  const checklist: ChecklistItem[] = [{ label: 'GATB Math (30m)', completed: true, ...item }]
  return { checklist } as unknown as DayLog
}

function setup(item: Partial<ChecklistItem> = {}, configs: WorkbookConfigLike[] = []) {
  const persistDayLogImmediate = vi.fn()
  const onMessage = vi.fn()
  const onArtifactCreated = vi.fn()
  const { result } = renderHook(() =>
    useUnifiedCapture({
      familyId: 'fam-1',
      childId: 'child-1',
      childName: 'London',
      today: '2026-09-03',
      dayLog: makeDayLog(item),
      persistDayLogImmediate,
      onMessage,
      onArtifactCreated,
      configs,
    }),
  )
  return { result, persistDayLogImmediate, onMessage, onArtifactCreated }
}

const matchingConfig: WorkbookConfigLike = { id: 'wb-math', name: 'GATB Math', type: 'workbook', scannable: true }
const file = () => new File(['x'], 'page.jpg', { type: 'image/jpeg' })

const persistedItem = (persist: ReturnType<typeof vi.fn>) =>
  (persist.mock.calls[0][0] as DayLog).checklist![0]

beforeEach(() => {
  writes.length = 0
  actor.isChildProfile = false
  runScanMock.mockReset()
  syncScanToConfigMock.mockReset()
  clearScanMock.mockReset()
  updateSkillMapMock.mockClear()
  runScanMock.mockResolvedValue({ id: 'scan-9', childId: 'child-1', results: worksheetResults, action: 'pending' })
  syncScanToConfigMock.mockResolvedValue({ action: 'updated', configId: 'wb-math', configName: 'GATB Math', position: 12 })
})

describe('parent lane — the write set is byte-for-byte what it was', () => {
  it('a worksheet photo takes the SCANS path: config sync, skill map, blocker merge, scans evidence', async () => {
    const { result, persistDayLogImmediate } = setup()
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    expect(syncScanToConfigMock).toHaveBeenCalledTimes(1)
    expect(syncScanToConfigMock).toHaveBeenCalledWith('child-1', worksheetResults)
    expect(updateSkillMapMock).toHaveBeenCalledTimes(1)
    // The exact write set — the snapshot this test pins pre- and post-fix.
    expect(writes).toEqual([
      {
        op: 'updateDoc',
        data: expect.objectContaining({
          conceptualBlocks: [expect.objectContaining({ id: 'blk-1' })],
          blocksUpdatedAt: expect.any(String),
        }),
      },
    ])
    // No artifact: the scan doc IS the evidence on the parent lane.
    expect(writes.some((w) => w.op === 'addDoc')).toBe(false)
    expect(persistedItem(persistDayLogImmediate)).toMatchObject({
      evidenceArtifactId: 'scan-9',
      evidenceCollection: 'scans',
      scanned: true,
    })
    expect(persistedItem(persistDayLogImmediate).pendingScanId).toBeUndefined()
  })

  it('a workbook-linked item still takes the deterministic route (config pinned)', async () => {
    const { result } = setup({}, [matchingConfig])
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })
    expect(syncScanToConfigMock).toHaveBeenCalledWith('child-1', worksheetResults, { targetConfigId: 'wb-math' })
  })
})

describe('kid lane — the scan runs, the photo is kept, the invariant writes do not run', () => {
  beforeEach(() => {
    actor.isChildProfile = true
  })

  it('a worksheet photo writes the artifact (+ description) and NOTHING to skillSnapshots / activityConfigs / learnerModels / childSkillMaps', async () => {
    const { result, persistDayLogImmediate, onArtifactCreated, onMessage } = setup()
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    // The scan still ran — one paid call, the description is worth having.
    expect(runScanMock).toHaveBeenCalledTimes(1)
    // The photo is the kid's own work: an artifact, carrying what the scan said.
    const artifactWrite = writes.find((w) => w.op === 'addDoc')
    expect(artifactWrite).toBeDefined()
    expect(artifactWrite).toMatchObject({ key: 'artifacts' })
    expect((artifactWrite as { data: Record<string, unknown> }).data.contentNote).toBe('GATB Math Lesson 12 — addition')
    expect(onArtifactCreated).toHaveBeenCalledTimes(1)

    // The five doors behind the one gate: none reached.
    expect(syncScanToConfigMock).not.toHaveBeenCalled() // activityConfigs + workingLevels + learnerModels
    expect(updateSkillMapMock).not.toHaveBeenCalled() // childSkillMaps
    const snapshotWrites = writes.filter((w) => w.op === 'updateDoc' && 'conceptualBlocks' in w.data)
    expect(snapshotWrites).toEqual([]) // skillSnapshots.conceptualBlocks
    // The only updateDoc is the artifact's own `uri` stamp.
    expect(writes.filter((w) => w.op === 'updateDoc').map((w) => Object.keys(w.data))).toEqual([['uri']])

    // The item links the ARTIFACT, and carries the "review this" marker.
    expect(persistedItem(persistDayLogImmediate)).toMatchObject({
      evidenceArtifactId: 'artifact-1',
      evidenceCollection: 'artifacts',
      pendingScanId: 'scan-9',
    })
    expect(persistedItem(persistDayLogImmediate).scanned).toBeUndefined()

    // Warm and short; never a lesson number, never a scan result card.
    expect(onMessage).toHaveBeenCalledWith({ text: 'Work captured!', severity: 'success' })
    expect(clearScanMock).toHaveBeenCalled()
  })

  it('a workbook-linked item does NOT take the deterministic route for a kid — no position advance', async () => {
    const { result, persistDayLogImmediate } = setup({}, [matchingConfig])
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })
    expect(syncScanToConfigMock).not.toHaveBeenCalled()
    expect(writes.some((w) => w.op === 'addDoc' && w.key === 'artifacts')).toBe(true)
    // Not stamped with a config either — that is lock-in's job on the parent lane.
    expect(persistedItem(persistDayLogImmediate).workbookConfigId).toBeUndefined()
    expect(persistedItem(persistDayLogImmediate).workbookScanRegistration).toBeUndefined()
  })

  it('a build photo (not a worksheet) keeps its description and carries no review marker', async () => {
    runScanMock.mockResolvedValue({ id: 'scan-10', childId: 'child-1', results: buildResults, action: 'pending' })
    const { result, persistDayLogImmediate } = setup()
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })
    const artifactWrite = writes.find((w) => w.op === 'addDoc') as { data: Record<string, unknown> }
    expect(artifactWrite.data.contentNote).toBe('A Lego castle with a working drawbridge')
    expect(persistedItem(persistDayLogImmediate).pendingScanId).toBeUndefined()
    expect(syncScanToConfigMock).not.toHaveBeenCalled()
    expect(updateSkillMapMock).not.toHaveBeenCalled()
  })
})
