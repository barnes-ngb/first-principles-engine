import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChecklistItem, DayBlock, DayLog, WatchVideo } from '../../core/types'
import { DayBlockType, SubjectBucket } from '../../core/types/enums'

const { getDocMock, setDayLogGuardedMock, daysRef } = vi.hoisted(() => ({
  getDocMock: vi.fn(),
  setDayLogGuardedMock:
    vi.fn<(ref: { id: string }, payload: DayLog, context: string) => Promise<void>>(),
  daysRef: { current: new Map<string, DayLog>() },
}))

vi.mock('firebase/firestore', () => ({
  doc: (_collection: unknown, id: string) => ({ id }),
  getDoc: getDocMock,
  collection: vi.fn(),
}))
vi.mock('../../core/firebase/firestore', () => ({
  daysCollection: (familyId: string) => ({ familyId }),
}))
vi.mock('./dayWriteGuard', async () => {
  const actual = await vi.importActual<typeof import('./dayWriteGuard')>('./dayWriteGuard')
  return { ...actual, setDayLogGuarded: setDayLogGuardedMock }
})

import {
  appendChecklistItemToDayLog,
  checklistItemEditLock,
  detachBlocksForItem,
  draftItemChecklistLabel,
  findChecklistItemByLabel,
  liveDayEditLockReason,
  moveItemToLiveDay,
  removeChecklistItemFromDayLog,
  removeItemFromLiveDay,
  swapWatchVideoOnLiveDay,
} from './liveDayEdit'
import { categorizeItems } from './kidQuestGate'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const video = (over: Partial<WatchVideo> = {}): WatchVideo => ({
  id: 'vid-1',
  youtubeId: 'abcdefghijk',
  title: 'How volcanoes work',
  plannedMinutes: 12,
  subjectBucket: SubjectBucket.Science,
  childId: 'c1',
  addedBy: 'parent',
  vettedAt: '2026-08-11T10:00:00.000Z',
  createdAt: '2026-08-11T10:00:00.000Z',
  updatedAt: '2026-08-11T10:00:00.000Z',
  ...over,
})

const watchRow = (over: Partial<ChecklistItem> = {}): ChecklistItem => ({
  label: 'Watch: How volcanoes work (12m)',
  completed: false,
  skillTags: [],
  source: 'manual',
  mvdEssential: false,
  category: 'choose',
  estimatedMinutes: 12,
  subjectBucket: SubjectBucket.Science,
  itemType: 'watch',
  watchVideoId: 'vid-1',
  ...over,
})

const plannerRow = (over: Partial<ChecklistItem> = {}): ChecklistItem => ({
  label: 'GATB Math (30m)',
  completed: false,
  source: 'planner',
  estimatedMinutes: 30,
  subjectBucket: SubjectBucket.Math,
  ...over,
})

const plannerBlock = (over: Partial<DayBlock> = {}): DayBlock => ({
  type: DayBlockType.Math,
  title: 'GATB Math',
  subjectBucket: SubjectBucket.Math,
  plannedMinutes: 30,
  source: 'planner',
  ...over,
})

const day = (over: Partial<DayLog> = {}): DayLog => ({
  childId: 'c1',
  date: '2026-08-11',
  blocks: [],
  checklist: [],
  ...over,
})

function seedDays(entries: Record<string, DayLog>) {
  daysRef.current = new Map(Object.entries(entries))
}

/** The payload written to a given day-doc id, or undefined if it was untouched. */
function payloadFor(docId: string): DayLog | undefined {
  const call = setDayLogGuardedMock.mock.calls.find((c) => c[0].id === docId)
  return call?.[1]
}

beforeEach(() => {
  setDayLogGuardedMock.mockReset()
  setDayLogGuardedMock.mockResolvedValue(undefined)
  getDocMock.mockReset()
  daysRef.current = new Map()
  getDocMock.mockImplementation(async (ref: { id: string }) => ({
    exists: () => daysRef.current.has(ref.id),
    data: () => daysRef.current.get(ref.id),
  }))
})

// ── Pure ─────────────────────────────────────────────────────────────────────

describe('liveDayEdit — the completed-row rule (FEAT-138)', () => {
  it('locks a completed row and leaves an incomplete one alone', () => {
    expect(checklistItemEditLock(plannerRow({ completed: true }))).toBe('completed')
    expect(checklistItemEditLock(plannerRow())).toBeNull()
    expect(checklistItemEditLock(undefined)).toBe('not-found')
  })

  it('says why in plain language, naming the child and offering the un-check path', () => {
    const reason = liveDayEditLockReason('completed', 'Lincoln')
    expect(reason).toContain('Lincoln already did this one')
    expect(reason.toLowerCase()).toContain('un-check')
  })
})

describe('liveDayEdit — parent capability is enforced at the WRITE', () => {
  // `/planner/chat` sits outside `RequireParent`, so a kid deep-link reaches the
  // page. Withholding the affordance is not the gate — this is.
  const seeded = () =>
    seedDays({
      '2026-08-11_c1': day({ checklist: [watchRow()] }),
      '2026-08-13_c1': day({ date: '2026-08-13' }),
    })

  it('refuses a remove without the capability, and writes nothing', async () => {
    seeded()
    const outcome = await removeItemFromLiveDay({
      canEdit: false,
      familyId: 'f1',
      childId: 'c1',
      dateKey: '2026-08-11',
      itemKey: 'Watch: How volcanoes work (12m)::Science',
    })
    expect(outcome).toEqual({ status: 'refused', refusal: 'not-permitted' })
    expect(setDayLogGuardedMock).not.toHaveBeenCalled()
  })

  it('refuses a move without the capability, and writes NEITHER day', async () => {
    seeded()
    const outcome = await moveItemToLiveDay({
      canEdit: false,
      familyId: 'f1',
      childId: 'c1',
      fromDateKey: '2026-08-11',
      toDateKey: '2026-08-13',
      itemKey: 'Watch: How volcanoes work (12m)::Science',
    })
    expect(outcome).toEqual({ status: 'refused', refusal: 'not-permitted' })
    expect(setDayLogGuardedMock).not.toHaveBeenCalled()
  })

  it('refuses a swap without the capability, and writes nothing', async () => {
    seeded()
    const outcome = await swapWatchVideoOnLiveDay({
      canEdit: false,
      familyId: 'f1',
      childId: 'c1',
      dateKey: '2026-08-11',
      itemKey: 'Watch: How volcanoes work (12m)::Science',
      video: video({ id: 'vid-2' }),
    })
    expect(outcome).toEqual({ status: 'refused', refusal: 'not-permitted' })
    expect(setDayLogGuardedMock).not.toHaveBeenCalled()
  })

  it('says so without blaming anyone', () => {
    expect(liveDayEditLockReason('not-permitted')).toContain('grown-up')
    expect(liveDayEditLockReason('not-permitted')).toContain('nothing was changed')
  })
})

/**
 * Codex P2 on PR #1658. Two rows can share an identity, and the common way is
 * not a parent planning the same thing twice: `retainChecklistForApply` keeps a
 * completed row and Apply appends the freshly-planned one with the same title
 * and duration. Taking the first match resolved every live edit to the completed
 * row — so the row the child had NOT done yet read as locked.
 */
describe('liveDayEdit — duplicate labels resolve to the editable row', () => {
  const doneCopy = plannerRow({ completed: true, actualMinutes: 30 })
  const freshCopy = plannerRow()

  it('finds the fresh row, not the retained completed one, by label', () => {
    const found = findChecklistItemByLabel([doneCopy, freshCopy], 'GATB Math (30m)')
    expect(found).toEqual(freshCopy)
    expect(found!.completed).toBe(false)
  })

  it('removes the fresh row and leaves the completed one standing', async () => {
    seedDays({ '2026-08-11_c1': day({ checklist: [doneCopy, freshCopy] }) })
    const outcome = await removeItemFromLiveDay({
      canEdit: true,
      familyId: 'f1',
      childId: 'c1',
      dateKey: '2026-08-11',
      itemKey: 'GATB Math (30m)::Math',
    })
    expect(outcome).toEqual({ status: 'done' })
    expect(payloadFor('2026-08-11_c1')!.checklist).toEqual([doneCopy])
  })

  it('still refuses when EVERY row of that identity is completed', async () => {
    seedDays({ '2026-08-11_c1': day({ checklist: [doneCopy, doneCopy] }) })
    const outcome = await removeItemFromLiveDay({
      canEdit: true,
      familyId: 'f1',
      childId: 'c1',
      dateKey: '2026-08-11',
      itemKey: 'GATB Math (30m)::Math',
    })
    expect(outcome).toEqual({ status: 'refused', refusal: 'completed' })
    expect(setDayLogGuardedMock).not.toHaveBeenCalled()
  })
})

describe('liveDayEdit — the block rule', () => {
  it('takes a planner row’s matching block with it', () => {
    const item = plannerRow()
    expect(detachBlocksForItem([plannerBlock()], item, [])).toEqual([])
  })

  it('never drops a block carrying logged minutes', () => {
    const withMinutes = plannerBlock({ actualMinutes: 30 })
    expect(detachBlocksForItem([withMinutes], plannerRow(), [])).toEqual([withMinutes])
  })

  it('never drops a block another remaining row still claims', () => {
    // `itemMatchesBlock`'s title rule is a substring match, so a block titled
    // "Math" is claimed by two different rows.
    const shared = plannerBlock({ title: 'Math' })
    const remaining = [plannerRow({ label: 'Math Workbook (15m)' })]
    expect(
      detachBlocksForItem([shared], plannerRow({ label: 'Math Facts (10m)' }), remaining),
    ).toEqual([shared])
  })

  it('leaves blocks alone for a manual row', () => {
    const blocks = [plannerBlock()]
    expect(detachBlocksForItem(blocks, plannerRow({ source: 'manual' }), [])).toEqual(blocks)
  })

  it('never edits a block’s plannedMinutes — a block is kept whole or dropped whole', () => {
    const blocks = [plannerBlock(), plannerBlock({ title: 'Reading', type: DayBlockType.Reading })]
    const result = detachBlocksForItem(blocks, plannerRow({ label: 'Reading (20m)' }), [])
    expect(result).toEqual([plannerBlock()])
    expect(result[0].plannedMinutes).toBe(30)
  })
})

describe('liveDayEdit — pure day transforms', () => {
  it('removes exactly one row and leaves the rest of the day untouched', () => {
    const keep = plannerRow({ label: 'Reading (20m)', completed: true, actualMinutes: 20 })
    const source = day({ checklist: [keep, plannerRow()], blocks: [plannerBlock()] })
    const result = removeChecklistItemFromDayLog(source, 1)
    expect(result.checklist).toEqual([keep])
    expect(result.blocks).toEqual([])
    // Input untouched.
    expect(source.checklist).toHaveLength(2)
  })

  it('appends a row verbatim — itemType and watchVideoId survive a move', () => {
    const row = watchRow()
    const result = appendChecklistItemToDayLog(day(), row)
    expect(result.checklist).toEqual([row])
    expect(result.checklist![0].itemType).toBe('watch')
    expect(result.checklist![0].watchVideoId).toBe('vid-1')
  })

  it('joins a draft item to its saved row through the apply-time label', () => {
    const label = draftItemChecklistLabel({ title: 'GATB Math', estimatedMinutes: 30 })
    expect(label).toBe('GATB Math (30m)')
    expect(findChecklistItemByLabel([plannerRow()], label)).toEqual(plannerRow())
  })
})

// ── Writers ──────────────────────────────────────────────────────────────────

describe('removeItemFromLiveDay', () => {
  it('persists the removal to the SAVED day, not a draft', async () => {
    seedDays({ '2026-08-11_c1': day({ checklist: [plannerRow(), watchRow()] }) })
    const outcome = await removeItemFromLiveDay({
      canEdit: true,
      familyId: 'f1',
      childId: 'c1',
      dateKey: '2026-08-11',
      itemKey: 'GATB Math (30m)::Math',
    })
    expect(outcome).toEqual({ status: 'done' })
    expect(payloadFor('2026-08-11_c1')!.checklist).toEqual([watchRow()])
  })

  it('routes through the preservation guard', async () => {
    seedDays({ '2026-08-11_c1': day({ checklist: [plannerRow()] }) })
    await removeItemFromLiveDay({
      canEdit: true,
      familyId: 'f1',
      childId: 'c1',
      dateKey: '2026-08-11',
      itemKey: 'GATB Math (30m)::Math',
    })
    expect(setDayLogGuardedMock.mock.calls[0][2]).toBe('remove-item-from-live-day')
  })

  it('REFUSES a completed row and writes no day doc', async () => {
    seedDays({
      '2026-08-11_c1': day({ checklist: [plannerRow({ completed: true, actualMinutes: 30 })] }),
    })
    const outcome = await removeItemFromLiveDay({
      canEdit: true,
      familyId: 'f1',
      childId: 'c1',
      dateKey: '2026-08-11',
      itemKey: 'GATB Math (30m)::Math',
    })
    expect(outcome).toEqual({ status: 'refused', refusal: 'completed' })
    expect(setDayLogGuardedMock).not.toHaveBeenCalled()
  })
})

describe('moveItemToLiveDay', () => {
  const move = (over: Partial<Parameters<typeof moveItemToLiveDay>[0]> = {}) =>
    moveItemToLiveDay({
      canEdit: true,
      familyId: 'f1',
      childId: 'c1',
      fromDateKey: '2026-08-11',
      toDateKey: '2026-08-13',
      itemKey: 'Watch: How volcanoes work (12m)::Science',
      ...over,
    })

  it('takes the row off the source day and lands it on the target', async () => {
    seedDays({
      '2026-08-11_c1': day({ checklist: [plannerRow(), watchRow()] }),
      '2026-08-13_c1': day({ date: '2026-08-13', checklist: [plannerRow()] }),
    })
    const outcome = await move()
    expect(outcome).toEqual({ status: 'done' })
    expect(payloadFor('2026-08-13_c1')!.checklist).toEqual([plannerRow(), watchRow()])
    expect(payloadFor('2026-08-11_c1')!.checklist).toEqual([plannerRow()])
  })

  it('APPENDS TO THE TARGET BEFORE removing from the source', async () => {
    // This ordering IS the data-loss guard: a mid-failure must leave the row on
    // both days (visible, fixable), never on neither (invisible, lost).
    seedDays({
      '2026-08-11_c1': day({ checklist: [watchRow()] }),
      '2026-08-13_c1': day({ date: '2026-08-13' }),
    })
    await move()
    expect(setDayLogGuardedMock.mock.calls.map((c) => [c[0].id, c[2]])).toEqual([
      ['2026-08-13_c1', 'move-item-to-live-day:append'],
      ['2026-08-11_c1', 'move-item-to-live-day:remove'],
    ])
  })

  it('when the SECOND write fails: the row is on the target and the caller is told', async () => {
    seedDays({
      '2026-08-11_c1': day({ checklist: [watchRow()] }),
      '2026-08-13_c1': day({ date: '2026-08-13' }),
    })
    setDayLogGuardedMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'))
    const outcome = await move()
    expect(outcome).toEqual({ status: 'duplicated' })
    // The write that SUCCEEDED was the append — so the row is on the target and
    // is not lost. (Reversing the order makes the successful write the source
    // removal, and the row would exist nowhere.)
    expect(setDayLogGuardedMock.mock.calls[0][2]).toBe('move-item-to-live-day:append')
    expect(payloadFor('2026-08-13_c1')!.checklist).toEqual([watchRow()])
    // And no rollback was attempted: exactly two writes, both accounted for.
    expect(setDayLogGuardedMock).toHaveBeenCalledTimes(2)
  })

  it('creates the target day when it has no doc yet', async () => {
    seedDays({ '2026-08-11_c1': day({ checklist: [watchRow()] }) })
    await move()
    const created = payloadFor('2026-08-13_c1')!
    expect(created.childId).toBe('c1')
    expect(created.date).toBe('2026-08-13')
    expect(created.checklist).toEqual([watchRow()])
  })

  it('carries a planner row’s block off the source and creates none on the target', async () => {
    seedDays({
      '2026-08-11_c1': day({ checklist: [plannerRow()], blocks: [plannerBlock()] }),
      '2026-08-13_c1': day({ date: '2026-08-13' }),
    })
    await move({ itemKey: 'GATB Math (30m)::Math' })
    expect(payloadFor('2026-08-11_c1')!.blocks).toEqual([])
    expect(payloadFor('2026-08-13_c1')!.blocks).toEqual([])
  })

  it('a moved watch row still lands in the kid’s watch bucket on the target day', async () => {
    seedDays({
      '2026-08-11_c1': day({ checklist: [watchRow()] }),
      '2026-08-13_c1': day({ date: '2026-08-13', checklist: [plannerRow()] }),
    })
    await move()
    const buckets = categorizeItems(payloadFor('2026-08-13_c1')!.checklist!)
    expect(buckets.watch).toHaveLength(1)
    expect(buckets.watch[0].watchVideoId).toBe('vid-1')
    expect(buckets.choose).toHaveLength(0)
  })

  it('REFUSES a completed row and writes NEITHER day doc', async () => {
    seedDays({
      '2026-08-11_c1': day({ checklist: [watchRow({ completed: true, actualMinutes: 12 })] }),
      '2026-08-13_c1': day({ date: '2026-08-13' }),
    })
    const outcome = await move()
    expect(outcome).toEqual({ status: 'refused', refusal: 'completed' })
    expect(setDayLogGuardedMock).not.toHaveBeenCalled()
  })

  it('does nothing when the source and target are the same day', async () => {
    seedDays({ '2026-08-11_c1': day({ checklist: [watchRow()] }) })
    const outcome = await move({ toDateKey: '2026-08-11' })
    expect(outcome).toEqual({ status: 'done' })
    expect(setDayLogGuardedMock).not.toHaveBeenCalled()
  })
})

describe('swapWatchVideoOnLiveDay', () => {
  const replacement = video({ id: 'vid-2', title: 'How glaciers move', plannedMinutes: 8 })

  it('changes the video, the label and the minutes — and nothing else', async () => {
    const other = plannerRow()
    seedDays({ '2026-08-11_c1': day({ checklist: [other, watchRow()] }) })
    const outcome = await swapWatchVideoOnLiveDay({
      canEdit: true,
      familyId: 'f1',
      childId: 'c1',
      dateKey: '2026-08-11',
      itemKey: 'Watch: How volcanoes work (12m)::Science',
      video: replacement,
    })
    expect(outcome).toEqual({ status: 'done' })
    const written = payloadFor('2026-08-11_c1')!.checklist!
    // Position kept: still the SECOND row, not appended to the end.
    expect(written).toHaveLength(2)
    expect(written[0]).toEqual(other)
    expect(written[1].watchVideoId).toBe('vid-2')
    expect(written[1].label).toBe('Watch: How glaciers move (8m)')
    expect(written[1].estimatedMinutes).toBe(8)
    expect(written[1].completed).toBe(false)
    expect(written[1].itemType).toBe('watch')
  })

  it('REFUSES a completed row and writes no day doc', async () => {
    seedDays({
      '2026-08-11_c1': day({ checklist: [watchRow({ completed: true, actualMinutes: 12 })] }),
    })
    const outcome = await swapWatchVideoOnLiveDay({
      canEdit: true,
      familyId: 'f1',
      childId: 'c1',
      dateKey: '2026-08-11',
      itemKey: 'Watch: How volcanoes work (12m)::Science',
      video: replacement,
    })
    expect(outcome).toEqual({ status: 'refused', refusal: 'completed' })
    expect(setDayLogGuardedMock).not.toHaveBeenCalled()
  })

  it('refuses a row that is not a watch row', async () => {
    seedDays({ '2026-08-11_c1': day({ checklist: [plannerRow()] }) })
    const outcome = await swapWatchVideoOnLiveDay({
      canEdit: true,
      familyId: 'f1',
      childId: 'c1',
      dateKey: '2026-08-11',
      itemKey: 'GATB Math (30m)::Math',
      video: replacement,
    })
    expect(outcome.status).toBe('refused')
    expect(setDayLogGuardedMock).not.toHaveBeenCalled()
  })
})
