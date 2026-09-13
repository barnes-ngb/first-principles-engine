import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUnifiedCapture } from './useUnifiedCapture'
import type { ChecklistItem, DayLog } from '../../core/types'
import { dayLogDocId } from './daylog.model'
import { TodayRowConfigsState } from './todayRowKind'
import type { TodayRowConfigLike } from './todayRowKind'

// ── FEAT-184 / UX-151: two lanes, one gate ──────────────────────────────────
//
// A KID's `Show your work!` keeps the scan and the photo and loses the silent
// writes. A PARENT's capture is byte-for-byte what it was. The gate is the
// actor's capability (`isChildProfile`), read inside the hook — never a name.

// ── Firestore / storage boundary mocks ──────────────────────────────────────
type WriteOp = { op: 'addDoc'; key: string; data: Record<string, unknown> } | { op: 'updateDoc'; data: Record<string, unknown> }
const writes: WriteOp[] = []
// UX-404: the day is a store, because the capture patches its own row on the
// LIVE document rather than handing back the one it started with. Day writes are
// kept OUT of `writes`, which stays the invariant-write snapshot these tests pin.
const daysStore = new Map<string, DayLog>()
const dayWrites: { id: string; data: Record<string, unknown> }[] = []

type Ref = { __key?: string; __id?: string }

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn((col: { __key: string }, data: Record<string, unknown>) => {
    writes.push({ op: 'addDoc', key: col.__key, data })
    return Promise.resolve({ id: `artifact-${writes.length}` })
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
      : Promise.resolve({ exists: () => true, data: () => ({ conceptualBlocks: [] }) }),
  ),
  updateDoc: vi.fn((ref: Ref, data: Record<string, unknown>) => {
    if (ref?.__key === 'days') {
      const id = ref.__id ?? ''
      dayWrites.push({ id, data })
      daysStore.set(id, { ...(daysStore.get(id) as DayLog), ...(data as Partial<DayLog>) })
    } else {
      writes.push({ op: 'updateDoc', data })
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

const TODAY = '2026-09-03'
const DAY_ID = dayLogDocId(TODAY, 'child-1')

function setup(item: Partial<ChecklistItem> = {}, configs: TodayRowConfigLike[] = []) {
  const onMessage = vi.fn()
  const onArtifactCreated = vi.fn()
  daysStore.set(DAY_ID, makeDayLog(item))
  const { result } = renderHook(() =>
    useUnifiedCapture({
      familyId: 'fam-1',
      childId: 'child-1',
      childName: 'London',
      today: TODAY,
      dayLog: makeDayLog(item),
      onMessage,
      onArtifactCreated,
      configs,
      configsState: TodayRowConfigsState.Settled,
    }),
  )
  return { result, onMessage, onArtifactCreated }
}

const matchingConfig: TodayRowConfigLike = { id: 'wb-math', name: 'GATB Math', type: 'workbook', scannable: true }
const file = () => new File(['x'], 'page.jpg', { type: 'image/jpeg' })

/** The row as the capture wrote it to the live day. */
const persistedItem = (): ChecklistItem =>
  (dayWrites.at(-1)!.data.checklist as ChecklistItem[])[0]

beforeEach(() => {
  writes.length = 0
  daysStore.clear()
  dayWrites.length = 0
  actor.isChildProfile = false
  runScanMock.mockReset()
  syncScanToConfigMock.mockReset()
  clearScanMock.mockReset()
  updateSkillMapMock.mockClear()
  runScanMock.mockResolvedValue({ id: 'scan-9', childId: 'child-1', results: worksheetResults, action: 'pending' })
  syncScanToConfigMock.mockResolvedValue({ action: 'updated', configId: 'wb-math', configName: 'GATB Math', position: 12 })
})

describe('parent lane — UX-403: the curriculum route belongs to a workbook row', () => {
  it('a worksheet photo on a row that resolves to NO workbook is evidence and nothing else', async () => {
    // The row matches no config, so `resolveTodayRow` answers `unknown`. This
    // case USED to take the classification path: an untargeted
    // `syncScanToConfig` that fuzzy-matched the cover text and could create or
    // advance a workbook, then `childSkillMaps` and
    // `skillSnapshots.conceptualBlocks`, none of it confirmed. Owner decision
    // (2026-09-13): a photo here writes the artifact and the day-log link.
    const { result } = setup()
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })

    expect(syncScanToConfigMock).not.toHaveBeenCalled() // activityConfigs + workingLevels + learnerModels
    expect(updateSkillMapMock).not.toHaveBeenCalled() // childSkillMaps
    expect(writes.filter((w) => w.op === 'updateDoc' && 'conceptualBlocks' in w.data)).toEqual([])
    // The photo is kept — the one record this row can make.
    expect(writes.some((w) => w.op === 'addDoc' && w.key === 'artifacts')).toBe(true)
    expect(persistedItem()).toMatchObject({
      evidenceArtifactId: 'artifact-1',
      evidenceCollection: 'artifacts',
    })
    // No `scanned` flag, no registration: nothing was registered.
    expect(persistedItem().scanned).toBeUndefined()
    expect(persistedItem().workbookScanRegistration).toBeUndefined()
    // A parent's photo is not flagged for a parent to review.
    expect(persistedItem().pendingScanId).toBeUndefined()
  })

  it('a workbook-linked item still takes the deterministic route (config pinned)', async () => {
    const { result } = setup({}, [matchingConfig])
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })
    expect(syncScanToConfigMock).toHaveBeenCalledWith('child-1', worksheetResults, { targetConfigId: 'wb-math' })
  })

  it('never reaches an UNTARGETED sync — the only curriculum call is a pinned one', async () => {
    // The positive control for the rule: a `syncScanToConfig` call with no
    // `targetConfigId` IS the fuzzy create-or-advance path, so its absence on
    // every row is the property, not an incidental of this fixture.
    for (const configs of [[], [matchingConfig]]) {
      writes.length = 0
      dayWrites.length = 0
      syncScanToConfigMock.mockClear()
      const { result } = setup({}, configs)
      await act(async () => {
        await result.current.handleUnifiedCapture(file(), 0)
      })
      for (const call of syncScanToConfigMock.mock.calls) {
        expect(call[2]).toEqual({ targetConfigId: 'wb-math' })
      }
    }
  })
})

describe('kid lane — the scan runs, the photo is kept, the invariant writes do not run', () => {
  beforeEach(() => {
    actor.isChildProfile = true
  })

  it('a worksheet photo writes the artifact (+ description) and NOTHING to skillSnapshots / activityConfigs / learnerModels / childSkillMaps', async () => {
    const { result, onArtifactCreated, onMessage } = setup()
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
    expect(persistedItem()).toMatchObject({
      evidenceArtifactId: 'artifact-1',
      evidenceCollection: 'artifacts',
      pendingScanId: 'scan-9',
    })
    expect(persistedItem().scanned).toBeUndefined()

    // Warm and short; never a lesson number, never a scan result card.
    expect(onMessage).toHaveBeenCalledWith({ text: 'Work captured!', severity: 'success' })
    expect(clearScanMock).toHaveBeenCalled()
  })

  it('a workbook-linked item does NOT take the deterministic route for a kid — no position advance', async () => {
    const { result } = setup({}, [matchingConfig])
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })
    expect(syncScanToConfigMock).not.toHaveBeenCalled()
    expect(writes.some((w) => w.op === 'addDoc' && w.key === 'artifacts')).toBe(true)
    // Not stamped with a config either — that is lock-in's job on the parent lane.
    expect(persistedItem().workbookConfigId).toBeUndefined()
    expect(persistedItem().workbookScanRegistration).toBeUndefined()
  })

  it('a build photo (not a worksheet) keeps its description and carries no review marker', async () => {
    runScanMock.mockResolvedValue({ id: 'scan-10', childId: 'child-1', results: buildResults, action: 'pending' })
    const { result } = setup()
    await act(async () => {
      await result.current.handleUnifiedCapture(file(), 0)
    })
    const artifactWrite = writes.find((w) => w.op === 'addDoc') as { data: Record<string, unknown> }
    expect(artifactWrite.data.contentNote).toBe('A Lego castle with a working drawbridge')
    expect(persistedItem().pendingScanId).toBeUndefined()
    expect(syncScanToConfigMock).not.toHaveBeenCalled()
    expect(updateSkillMapMock).not.toHaveBeenCalled()
  })
})
