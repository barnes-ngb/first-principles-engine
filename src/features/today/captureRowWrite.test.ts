import { beforeEach, describe, expect, it, vi } from 'vitest'

import { captureRowWriteNotice, patchChecklistRow, writeCaptureRow } from './captureRowWrite'
import { dayLogDocId } from './daylog.model'
import { findDayPreservationViolations } from './dayWriteGuard'
import type { ChecklistItem, DayLog } from '../../core/types'
import { collectHoursContributions } from '../../../functions/src/shared/hoursContributions'

// ── UX-404 ──────────────────────────────────────────────────────────────────
//
// A capture used to write the WHOLE day as it stood when the camera opened, so a
// box ticked during the upload came back unticked — and with it the block
// `actualMinutes` that tick credited and the `xpTotal` it awarded. The rule is
// now: the capture writes only its own row, onto the document as it stands at
// WRITE time.
//
// This is attribution-shaped on the `hours` rail (`DOC-25`): no number is
// computed differently, so the arithmetic is pinned below with a positive
// control rather than asserted.

type Ref = { __key?: string; __id?: string }

const daysStore = new Map<string, DayLog>()
const updateDocCalls: { ref: Ref; data: Record<string, unknown> }[] = []
let updateShouldThrow = false

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((col: { __key?: string } | undefined, id?: string) => ({
    __key: col?.__key ?? 'unknown',
    __id: id,
  })),
  getDoc: vi.fn((ref: Ref) =>
    Promise.resolve({
      exists: () => daysStore.has(ref.__id ?? ''),
      data: () => daysStore.get(ref.__id ?? ''),
    }),
  ),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn((ref: Ref, data: Record<string, unknown>) => {
    if (updateShouldThrow) return Promise.reject(new Error('rejected'))
    updateDocCalls.push({ ref, data })
    const id = ref.__id ?? ''
    daysStore.set(id, { ...(daysStore.get(id) as DayLog), ...(data as Partial<DayLog>) })
    return Promise.resolve()
  }),
  deleteDoc: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../core/firebase/firestore', () => ({
  daysCollection: vi.fn(() => ({ __key: 'days' })),
}))

const FAMILY = 'fam-1'
const CHILD = 'child-1'
const DATE = '2026-09-13'
const DAY_ID = dayLogDocId(DATE, CHILD)

const row = (over: Partial<ChecklistItem> = {}): ChecklistItem =>
  ({ label: 'GATB Math (30m)', completed: false, ...over }) as ChecklistItem

/**
 * The day as it STOOD WHEN THE CAPTURE STARTED — the photo's row untouched, and
 * the neighbouring row not yet ticked.
 */
const dayAtCaptureStart = (): DayLog =>
  ({
    childId: CHILD,
    date: DATE,
    checklist: [
      row({ label: 'GATB Math (30m)' }),
      row({ label: 'Handwriting (15m)' }),
    ],
    blocks: [
      { id: 'blk-hand', type: 'core', title: 'Handwriting', plannedMinutes: 15 },
    ],
    xpTotal: 0,
  }) as unknown as DayLog

/**
 * The same day, ten seconds later: the parent ticked *Handwriting* while the
 * photo was uploading, which credited its block's minutes and awarded XP.
 */
const dayAfterTheTick = (): DayLog =>
  ({
    childId: CHILD,
    date: DATE,
    checklist: [
      row({ label: 'GATB Math (30m)' }),
      row({ label: 'Handwriting (15m)', completed: true }),
    ],
    blocks: [
      { id: 'blk-hand', type: 'core', title: 'Handwriting', plannedMinutes: 15, actualMinutes: 15 },
    ],
    xpTotal: 10,
  }) as unknown as DayLog

beforeEach(() => {
  daysStore.clear()
  updateDocCalls.length = 0
  updateShouldThrow = false
})

describe('patchChecklistRow', () => {
  it('patches the named row and returns every other row BY REFERENCE', () => {
    const rows = [row({ label: 'A' }), row({ label: 'B', completed: true })]
    const next = patchChecklistRow(rows, 'B::', { evidenceArtifactId: 'art-1' })!
    expect(next[1]).toMatchObject({ label: 'B', completed: true, evidenceArtifactId: 'art-1' })
    // Untouched rows are the same objects, not rebuilt copies — a rebuild is how
    // a field nobody thought about gets dropped.
    expect(next[0]).toBe(rows[0])
  })

  it('answers null when the day no longer holds the row (a rename, a delete)', () => {
    expect(patchChecklistRow([row({ label: 'A' })], 'Gone::', { scanned: true })).toBeNull()
  })
})

describe('writeCaptureRow — the capture writes only its own row', () => {
  it('a tick that lands between capture-start and capture-write SURVIVES', async () => {
    // Stored: the tick already landed. In hand: the pre-tick snapshot.
    daysStore.set(DAY_ID, dayAfterTheTick())

    const outcome = await writeCaptureRow({
      familyId: FAMILY,
      childId: CHILD,
      dateKey: DATE,
      itemKey: 'GATB Math (30m)::',
      patch: { evidenceArtifactId: 'art-1', evidenceCollection: 'artifacts' },
      context: 'test',
    })

    expect(outcome).toEqual({ status: 'done' })
    const stored = daysStore.get(DAY_ID)!
    expect(stored.checklist![1].completed).toBe(true)
    expect(stored.checklist![0].evidenceArtifactId).toBe('art-1')
  })

  it('writes the checklist and nothing else — blocks and xpTotal are not in the payload', async () => {
    daysStore.set(DAY_ID, dayAfterTheTick())
    await writeCaptureRow({
      familyId: FAMILY,
      childId: CHILD,
      dateKey: DATE,
      itemKey: 'GATB Math (30m)::',
      patch: { evidenceArtifactId: 'art-1' },
      context: 'test',
    })
    expect(Object.keys(updateDocCalls[0].data).sort()).toEqual(['checklist', 'updatedAt'])
    const stored = daysStore.get(DAY_ID)!
    expect(stored.blocks).toEqual(dayAfterTheTick().blocks)
    expect(stored.xpTotal).toBe(10)
  })

  it('POSITIVE CONTROL — the old whole-document write loses the tick, the minutes and the XP', () => {
    // What the capture used to do: `{ ...dayLog, checklist: patched }`, where
    // `dayLog` is the snapshot from capture time. Written out here so the
    // assertions above are pinning a real difference, not a tautology.
    const stale = dayAtCaptureStart()
    const staleWrite = {
      ...stale,
      checklist: stale.checklist!.map((r, i) =>
        i === 0 ? { ...r, evidenceArtifactId: 'art-1' } : r,
      ),
    }
    const live = dayAfterTheTick()
    expect(staleWrite.checklist[1].completed).toBe(false)
    expect(staleWrite.blocks![0].actualMinutes).toBeUndefined()
    expect(staleWrite.xpTotal).toBe(0)
    // And the guard would NOT have caught it: no entity disappears, only values
    // go backwards on retained ones — deliberately not a violation.
    expect(findDayPreservationViolations(live, staleWrite)).toEqual([])
  })

  it('the hours fold is byte-unchanged by the capture write', async () => {
    daysStore.set(DAY_ID, dayAfterTheTick())
    const before = collectHoursContributions([dayAfterTheTick() as never], [], [], CHILD)
    await writeCaptureRow({
      familyId: FAMILY,
      childId: CHILD,
      dateKey: DATE,
      itemKey: 'GATB Math (30m)::',
      patch: { evidenceArtifactId: 'art-1', scanned: true },
      context: 'test',
    })
    const after = collectHoursContributions([daysStore.get(DAY_ID) as never], [], [], CHILD)
    expect(after).toEqual(before)
    // The positive control for THAT: the stale write really does move the number.
    const stale = dayAtCaptureStart()
    const staleAfter = collectHoursContributions([stale as never], [], [], CHILD)
    expect(staleAfter).not.toEqual(before)
  })

  it('refuses — and says so — when the row is gone, the day is gone, or the write fails', async () => {
    expect(
      await writeCaptureRow({
        familyId: FAMILY, childId: CHILD, dateKey: DATE,
        itemKey: 'anything::', patch: {}, context: 'test',
      }),
    ).toEqual({ status: 'refused', reason: 'no-day' })

    daysStore.set(DAY_ID, dayAfterTheTick())
    expect(
      await writeCaptureRow({
        familyId: FAMILY, childId: CHILD, dateKey: DATE,
        itemKey: 'Renamed mid-upload::', patch: {}, context: 'test',
      }),
    ).toEqual({ status: 'refused', reason: 'row-gone' })

    updateShouldThrow = true
    expect(
      await writeCaptureRow({
        familyId: FAMILY, childId: CHILD, dateKey: DATE,
        itemKey: 'GATB Math (30m)::', patch: {}, context: 'test',
      }),
    ).toEqual({ status: 'failed' })
  })

  it('every refusal has a sentence, and success has none', () => {
    expect(captureRowWriteNotice({ status: 'done' })).toBeNull()
    for (const outcome of [
      { status: 'refused', reason: 'row-gone' } as const,
      { status: 'refused', reason: 'no-day' } as const,
      { status: 'failed' } as const,
    ]) {
      const notice = captureRowWriteNotice(outcome)!
      expect(notice).toBeTruthy()
      // The photo really is saved by the time this runs, so every sentence says
      // so first — `UX-351`'s rule: never report a lost photo that is not lost.
      expect(notice.toLowerCase()).toContain('photo saved')
    }
  })
})
