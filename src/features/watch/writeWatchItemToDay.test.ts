import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChecklistItem, DayLog, WatchVideo } from '../../core/types'

import { SubjectBucket } from '../../core/types/enums'

const { getDocMock, setDayLogGuardedMock, snapRef } = vi.hoisted(() => ({
  getDocMock: vi.fn(),
  setDayLogGuardedMock:
    vi.fn<(ref: { id: string }, payload: DayLog, context: string) => Promise<void>>(),
  snapRef: { current: null as DayLog | null },
}))

vi.mock('firebase/firestore', () => ({
  doc: (_collection: unknown, id: string) => ({ id }),
  getDoc: getDocMock,
  collection: vi.fn(),
}))
vi.mock('../../core/firebase/firestore', () => ({
  daysCollection: (familyId: string) => ({ familyId }),
}))
vi.mock('../today/dayWriteGuard', () => ({
  setDayLogGuarded: setDayLogGuardedMock,
}))

import { writeWatchItemToDay } from './writeWatchItemToDay'

const video: WatchVideo = {
  id: 'vid-1',
  youtubeId: 'abcdefghijk',
  title: 'How volcanoes work',
  plannedMinutes: 12,
  subjectBucket: SubjectBucket.Science,
  childId: 'c1',
  addedBy: 'parent',
  vettedAt: '2026-07-27T10:00:00.000Z',
  createdAt: '2026-07-27T10:00:00.000Z',
  updatedAt: '2026-07-27T10:00:00.000Z',
}

const completedItem: ChecklistItem = {
  label: 'GATB Math (30m)',
  completed: true,
  estimatedMinutes: 30,
  actualMinutes: 30,
  evidenceArtifactId: 'artifact-1',
  source: 'planner',
}

function existingDay(checklist: ChecklistItem[]): DayLog {
  return { childId: 'c1', date: '2026-07-27', blocks: [], checklist }
}

function writtenPayload(): DayLog {
  return setDayLogGuardedMock.mock.calls[0][1]
}

beforeEach(() => {
  setDayLogGuardedMock.mockClear()
  getDocMock.mockReset()
  snapRef.current = null
  getDocMock.mockImplementation(async () => ({
    exists: () => snapRef.current !== null,
    data: () => snapRef.current,
  }))
})

/**
 * FEAT-132: the planner's post-Apply "Add a video" writes into the SAVED day.
 * The whole point of this module is that the video is not lost to a dead draft,
 * so these assertions are about what actually reaches Firestore.
 */
describe('writeWatchItemToDay (FEAT-132)', () => {
  it('appends a real watch row to the saved day', async () => {
    snapRef.current = existingDay([completedItem])
    await writeWatchItemToDay({ familyId: 'f1', childId: 'c1', dateKey: '2026-07-27', video })

    expect(setDayLogGuardedMock).toHaveBeenCalledTimes(1)
    const added = writtenPayload().checklist![1]
    expect(added.itemType).toBe('watch')
    expect(added.watchVideoId).toBe('vid-1')
    expect(added.label).toBe('Watch: How volcanoes work (12m)')
    expect(added.estimatedMinutes).toBe(12)
  })

  it('targets the right day document', async () => {
    snapRef.current = existingDay([])
    await writeWatchItemToDay({ familyId: 'f1', childId: 'c1', dateKey: '2026-07-29', video })
    expect(setDayLogGuardedMock.mock.calls[0][0].id).toBe('2026-07-29_c1')
  })

  it('preserves completed work, its minutes, and its evidence', async () => {
    snapRef.current = existingDay([completedItem])
    await writeWatchItemToDay({ familyId: 'f1', childId: 'c1', dateKey: '2026-07-27', video })
    expect(writtenPayload().checklist![0]).toEqual(completedItem)
  })

  it('routes through the preservation guard, not a raw setDoc', async () => {
    snapRef.current = existingDay([])
    await writeWatchItemToDay({ familyId: 'f1', childId: 'c1', dateKey: '2026-07-27', video })
    // The guard's context string is what shows up in a violation log.
    expect(setDayLogGuardedMock.mock.calls[0][2]).toBe('add-watch-item-to-day')
  })

  it('creates the day when it has no doc yet (a plannable day with no plan)', async () => {
    snapRef.current = null
    await writeWatchItemToDay({ familyId: 'f1', childId: 'c1', dateKey: '2026-07-27', video })
    const payload = writtenPayload()
    expect(payload.childId).toBe('c1')
    expect(payload.date).toBe('2026-07-27')
    expect(payload.checklist).toHaveLength(1)
    expect(payload.checklist![0].watchVideoId).toBe('vid-1')
  })

  it('writes no block, no hours, and no XP — adding a row is not watching it', async () => {
    snapRef.current = existingDay([completedItem])
    await writeWatchItemToDay({ familyId: 'f1', childId: 'c1', dateKey: '2026-07-27', video })
    const payload = writtenPayload()
    expect(payload.blocks).toEqual([])
    expect(payload.checklist![1].completed).toBe(false)
    expect(payload.checklist![1].actualMinutes).toBeUndefined()
  })
})
