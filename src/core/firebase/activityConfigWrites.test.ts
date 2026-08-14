import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
// Firestore primitives only. Everything under test here is the REAL write core —
// these tests exist to pin the exact documents Progress → Curriculum writes, so
// that "a chat confirm card performs the same write" is a claim about payloads
// rather than about a function name.

const updateDoc = vi.fn()
const batchSet = vi.fn()
const batchCommit = vi.fn()
const doc = vi.fn((_collection: unknown, id?: string) => ({ __doc: id ?? 'generated-id', id: id ?? 'generated-id' }))

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => doc(args[0], args[1] as string | undefined),
  updateDoc: (...args: unknown[]) => updateDoc(...args),
  writeBatch: () => ({ set: batchSet, commit: batchCommit }),
}))

vi.mock('./firestore', () => ({
  activityConfigsCollection: vi.fn(() => ({ __collection: 'activityConfigs' })),
  db: { __db: true },
}))

const syncWorkbookPositionToModel = vi.fn()
vi.mock('../foundations/workbookPositionSync', () => ({
  syncWorkbookPositionToModel: (...args: unknown[]) => syncWorkbookPositionToModel(...args),
}))

import {
  addActivityConfig,
  assertWorkbookOwner,
  completeActivityConfig,
  isWorkbookOwnerInvalid,
  setActivityConfigPosition,
  syncActivityPositionToModel,
  WORKBOOK_OWNER_REASON,
} from './activityConfigWrites'
import type { NewActivityConfig } from './activityConfigWrites'

const NEW_CONFIG: NewActivityConfig = {
  name: 'Khan Academy math',
  type: 'app',
  subjectBucket: 'Math',
  defaultMinutes: 20,
  frequency: 'daily',
  childId: 'lincoln',
  sortOrder: 4,
  scannable: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  updateDoc.mockResolvedValue(undefined)
  batchCommit.mockResolvedValue(undefined)
  syncWorkbookPositionToModel.mockResolvedValue({ status: 'ok' })
})

// ── The DATA-08 owner rule ───────────────────────────────────────────────────

describe('the workbook owner rule (DATA-08)', () => {
  it('flags only a shared workbook', () => {
    expect(isWorkbookOwnerInvalid('workbook', 'both')).toBe(true)
    expect(isWorkbookOwnerInvalid('workbook', 'lincoln')).toBe(false)
    expect(isWorkbookOwnerInvalid('routine', 'both')).toBe(false)
    expect(isWorkbookOwnerInvalid('formation', 'both')).toBe(false)
    expect(isWorkbookOwnerInvalid(undefined, 'both')).toBe(false)
  })

  it('throws the one shared message', () => {
    expect(() => assertWorkbookOwner('workbook', 'both')).toThrow(WORKBOOK_OWNER_REASON)
    expect(() => assertWorkbookOwner('workbook', 'lincoln')).not.toThrow()
  })
})

// ── addActivityConfig ────────────────────────────────────────────────────────

describe('addActivityConfig', () => {
  it('writes the doc with its own id, completed:false and both timestamps', async () => {
    const id = await addActivityConfig('fam1', NEW_CONFIG)

    expect(batchSet).toHaveBeenCalledTimes(1)
    const [, payload] = batchSet.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload).toMatchObject({
      ...NEW_CONFIG,
      id,
      completed: false,
    })
    expect(typeof payload.createdAt).toBe('string')
    expect(payload.updatedAt).toBe(payload.createdAt)
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('carries the optional workbook fields through untouched', async () => {
    await addActivityConfig('fam1', {
      ...NEW_CONFIG,
      type: 'workbook',
      scannable: true,
      totalUnits: 140,
      currentPosition: 98,
      unitLabel: 'lesson',
    })
    const [, payload] = batchSet.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload).toMatchObject({ totalUnits: 140, currentPosition: 98, unitLabel: 'lesson' })
  })

  // The backstop behind the chat's parse gate and its resolution gate.
  it('refuses a shared workbook and writes nothing', async () => {
    await expect(
      addActivityConfig('fam1', { ...NEW_CONFIG, type: 'workbook', childId: 'both' }),
    ).rejects.toThrow(WORKBOOK_OWNER_REASON)
    expect(batchSet).not.toHaveBeenCalled()
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('allows a shared non-workbook', async () => {
    await addActivityConfig('fam1', { ...NEW_CONFIG, type: 'routine', childId: 'both' })
    const [, payload] = batchSet.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload).toMatchObject({ childId: 'both' })
  })
})

// ── completeActivityConfig ───────────────────────────────────────────────────

describe('completeActivityConfig', () => {
  it('sets completed, completedDate and updatedAt — and nothing else', async () => {
    await completeActivityConfig('fam1', 'cfg1')

    expect(updateDoc).toHaveBeenCalledTimes(1)
    const [, payload] = updateDoc.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(Object.keys(payload).sort()).toEqual(['completed', 'completedDate', 'updatedAt'])
    expect(payload.completed).toBe(true)
    expect(typeof payload.completedDate).toBe('string')
    expect(payload.updatedAt).toBe(payload.completedDate)
  })

  it('targets the named doc in the family collection', async () => {
    await completeActivityConfig('fam1', 'cfg-gatb')
    expect(doc).toHaveBeenCalledWith({ __collection: 'activityConfigs' }, 'cfg-gatb')
  })

  // Retire, don't delete: nothing here removes a document, and nothing anywhere
  // writes `completed: false` back onto an existing one.
  it('never deletes', async () => {
    await completeActivityConfig('fam1', 'cfg1')
    expect(batchSet).not.toHaveBeenCalled()
  })
})

// ── setActivityConfigPosition ────────────────────────────────────────────────

describe('setActivityConfigPosition', () => {
  it('writes only currentPosition and updatedAt', async () => {
    await setActivityConfigPosition('fam1', 'cfg1', 107)

    const [, payload] = updateDoc.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(Object.keys(payload).sort()).toEqual(['currentPosition', 'updatedAt'])
    expect(payload.currentPosition).toBe(107)
  })

  it('fires the FEAT-63 learner-model sync for a per-child workbook', async () => {
    await setActivityConfigPosition('fam1', 'cfg1', 107, {
      childId: 'lincoln',
      name: 'GATB Math 3',
    })
    expect(syncWorkbookPositionToModel).toHaveBeenCalledTimes(1)
    expect(syncWorkbookPositionToModel).toHaveBeenCalledWith(
      'fam1',
      'lincoln',
      { workbookName: 'GATB Math 3', position: 107, via: 'manual' },
      expect.any(String),
    )
  })

  it('does not sync a shared config, an unnamed one, or one with no target', async () => {
    await setActivityConfigPosition('fam1', 'cfg1', 5, { childId: 'both', name: 'Shared' })
    await setActivityConfigPosition('fam1', 'cfg1', 5, { childId: 'lincoln' })
    await setActivityConfigPosition('fam1', 'cfg1', 5)
    expect(syncWorkbookPositionToModel).not.toHaveBeenCalled()
    // …but the position itself is still written every time.
    expect(updateDoc).toHaveBeenCalledTimes(3)
  })

  it('falls back to `curriculum` when the config has no name', async () => {
    await setActivityConfigPosition('fam1', 'cfg1', 12, {
      childId: 'lincoln',
      curriculum: 'GATB',
    })
    expect(syncWorkbookPositionToModel).toHaveBeenCalledWith(
      'fam1',
      'lincoln',
      expect.objectContaining({ workbookName: 'GATB' }),
      expect.any(String),
    )
  })

  it('prefers the name over the curriculum when both are present', async () => {
    syncActivityPositionToModel(
      'fam1',
      { childId: 'lincoln', name: 'GATB Math 3', curriculum: 'GATB' },
      5,
    )
    expect(syncWorkbookPositionToModel).toHaveBeenCalledWith(
      'fam1',
      'lincoln',
      expect.objectContaining({ workbookName: 'GATB Math 3' }),
      expect.any(String),
    )
  })

  it('no-ops the sync without a familyId', () => {
    syncActivityPositionToModel('', { childId: 'lincoln', name: 'GATB' }, 5)
    expect(syncWorkbookPositionToModel).not.toHaveBeenCalled()
  })
})
