import { describe, expect, it } from 'vitest'

import { collectHoursContributions } from '../../../functions/src/shared/hoursContributions'
import type { ChecklistItem, DayLog } from '../../core/types'
import { DayBlockType, SubjectBucket } from '../../core/types/enums'
import { findDayPreservationViolations } from './dayWriteGuard'
import {
  LIFE_DAY_BLOCK_TITLE,
  LIFE_DAY_CHIPS,
  LIFE_DAY_DEFAULT_MINUTES,
  LIFE_DAY_MINUTE_CHOICES,
  findLifeDayBlock,
  lifeDayMinutes,
  lifeDayMinutesLabel,
  recordedLifeDayChipIds,
  toggleLifeDayChip,
  withLifeDayMinutes,
  withLifeDayNote,
} from './lifeDay'

const CHILD = 'lincoln'
const DATE = '2026-09-07'

/** A day with real planned work already on it — the thing a relabel must not destroy. */
function plannedDay(): DayLog {
  const checklist: ChecklistItem[] = [
    {
      label: 'Math Workbook p.42 (25m)',
      completed: true,
      estimatedMinutes: 25,
      subjectBucket: SubjectBucket.Math,
      source: 'planner',
      evidenceArtifactId: 'artifact-1',
    },
    {
      label: 'Read Aloud (20m)',
      completed: false,
      estimatedMinutes: 20,
      subjectBucket: SubjectBucket.Reading,
      source: 'planner',
    },
  ]
  return {
    childId: CHILD,
    date: DATE,
    blocks: [
      {
        type: DayBlockType.Math,
        title: 'Math Workbook p.42',
        subjectBucket: SubjectBucket.Math,
        location: 'Home',
        actualMinutes: 25,
      },
    ],
    checklist,
  }
}

/** An empty day — nothing was planned, which is the ordinary Life Day case. */
function emptyDay(): DayLog {
  return { childId: CHILD, date: DATE, blocks: [], checklist: [] }
}

describe('the default amount', () => {
  it('is two hours — the bottom of the owner range, deliberately', () => {
    expect(LIFE_DAY_DEFAULT_MINUTES).toBe(120)
  })

  it('is what an unmarked day reads as, before the parent touches anything', () => {
    expect(lifeDayMinutes(emptyDay())).toBe(120)
  })

  it('is one of the offered amounts, so the default is reachable again', () => {
    expect(LIFE_DAY_MINUTE_CHOICES).toContain(LIFE_DAY_DEFAULT_MINUTES)
  })

  it('offers a zero, so a day whose time is already logged can record none', () => {
    expect(LIFE_DAY_MINUTE_CHOICES).toContain(0)
    expect(lifeDayMinutesLabel(0)).toBe('None')
  })

  it('spans the owner range with one tap each', () => {
    expect(LIFE_DAY_MINUTE_CHOICES).toContain(120)
    expect(LIFE_DAY_MINUTE_CHOICES).toContain(180)
    expect(lifeDayMinutesLabel(120)).toBe('2h')
    expect(lifeDayMinutesLabel(90)).toBe('1h 30m')
  })
})

describe('recording the time', () => {
  it('writes one block carrying the minutes', () => {
    const day = withLifeDayMinutes(emptyDay(), 120)
    const block = findLifeDayBlock(day)
    expect(block?.actualMinutes).toBe(120)
    expect(block?.title).toBe(LIFE_DAY_BLOCK_TITLE)
    expect(lifeDayMinutes(day)).toBe(120)
  })

  it('is editable — a second amount updates the SAME block, never appends one', () => {
    const twice = withLifeDayMinutes(withLifeDayMinutes(emptyDay(), 120), 180)
    expect(twice.blocks).toHaveLength(1)
    expect(lifeDayMinutes(twice)).toBe(180)
  })

  it('respects an explicit zero as a choice rather than treating it as absent', () => {
    const day = withLifeDayMinutes(emptyDay(), 0)
    expect(lifeDayMinutes(day)).toBe(0)
  })

  it('never disturbs blocks that were already on the day', () => {
    const before = plannedDay()
    const after = withLifeDayMinutes(before, 120)
    expect(after.blocks).toHaveLength(2)
    expect(after.blocks[0]).toEqual(before.blocks[0])
    expect(after.checklist).toEqual(before.checklist)
  })
})

describe('recording what happened', () => {
  const packing = LIFE_DAY_CHIPS[0]
  const outside = LIFE_DAY_CHIPS[2]

  it('records a chip with a single tap and no minutes step', () => {
    const day = toggleLifeDayChip(emptyDay(), packing)
    expect(recordedLifeDayChipIds(day).has(packing.id)).toBe(true)
    const item = day.checklist?.find((i) => i.label === packing.label)
    expect(item?.completed).toBe(true)
    // The whole point: the block is the day's time, a chip carries none.
    expect(item?.estimatedMinutes).toBe(0)
  })

  it('un-records by un-checking, keeping the row so nothing is dropped', () => {
    const on = toggleLifeDayChip(emptyDay(), packing)
    const off = toggleLifeDayChip(on, packing)
    expect(recordedLifeDayChipIds(off).has(packing.id)).toBe(false)
    expect(off.checklist).toHaveLength(1)
    expect(off.checklist?.[0].completed).toBe(false)
  })

  it('toggles back on without duplicating the row', () => {
    let day = toggleLifeDayChip(emptyDay(), packing)
    day = toggleLifeDayChip(day, packing)
    day = toggleLifeDayChip(day, packing)
    expect(day.checklist).toHaveLength(1)
    expect(recordedLifeDayChipIds(day).has(packing.id)).toBe(true)
  })

  it('records several independently', () => {
    const day = toggleLifeDayChip(toggleLifeDayChip(emptyDay(), packing), outside)
    const ids = recordedLifeDayChipIds(day)
    expect(ids.has(packing.id)).toBe(true)
    expect(ids.has(outside.id)).toBe(true)
    expect(ids.size).toBe(2)
  })

  it('covers what the owner described', () => {
    const ids = LIFE_DAY_CHIPS.map((c) => c.id)
    expect(ids).toEqual([
      'packing',
      'building',
      'outside',
      'tablet',
      'helping',
      'reading',
    ])
  })
})

describe('the optional line', () => {
  it('stores what was written', () => {
    expect(withLifeDayNote(emptyDay(), '  Built a fort.  ').retro).toBe('Built a fort.')
  })

  it('is never required — an empty one leaves nothing behind', () => {
    const written = withLifeDayNote(emptyDay(), 'something')
    expect(withLifeDayNote(written, '   ').retro).toBeUndefined()
  })
})

describe('hours — the block counts, the chips do not', () => {
  /** The one counting path, unmodified by this feature. */
  const count = (day: DayLog) =>
    collectHoursContributions([day], [], [], CHILD).reduce((n, c) => n + c.minutes, 0)

  it('counts the recorded block as real hours through the existing fold', () => {
    const day = withLifeDayMinutes(emptyDay(), 120)
    expect(count(day)).toBe(120)
  })

  it('does not inflate the day when every chip is tapped', () => {
    let day = withLifeDayMinutes(emptyDay(), 120)
    for (const chip of LIFE_DAY_CHIPS) day = toggleLifeDayChip(day, chip)
    // Six completed checklist items, and the day is still two hours. If a chip
    // ever carried minutes this would read 120 + 6 × something.
    expect(count(day)).toBe(120)
  })

  it('follows the parent when they raise or lower the amount', () => {
    expect(count(withLifeDayMinutes(emptyDay(), 180))).toBe(180)
    expect(count(withLifeDayMinutes(emptyDay(), 0))).toBe(0)
  })

  it('leaves work already completed that day counting exactly as it did', () => {
    const before = plannedDay()
    const planned = count(before)
    expect(planned).toBe(25)
    // Marking the day a Life Day and recording two hours adds those two hours
    // and changes nothing about the 25 minutes already logged.
    let after = withLifeDayMinutes(before, 120)
    after = toggleLifeDayChip(after, LIFE_DAY_CHIPS[1])
    expect(count(after)).toBe(planned + 120)
  })
})

describe('a day is not destroyed by relabelling it', () => {
  it('preserves an existing checklist through the whole Life Day flow', () => {
    const before = plannedDay()
    let after = withLifeDayMinutes(before, 120)
    after = toggleLifeDayChip(after, LIFE_DAY_CHIPS[0])
    after = toggleLifeDayChip(after, LIFE_DAY_CHIPS[2])
    after = withLifeDayNote(after, 'Packed the kitchen together.')

    // Every planned row survives, byte for byte, including its evidence.
    for (const item of before.checklist ?? []) {
      expect(after.checklist).toContainEqual(item)
    }
    expect(before.blocks[0]).toEqual(after.blocks[0])
  })

  it('passes the repo own day-write preservation guard at every step', () => {
    const before = plannedDay()
    const steps: DayLog[] = []
    let day = before
    for (const next of [
      () => withLifeDayMinutes(day, 120),
      () => toggleLifeDayChip(day, LIFE_DAY_CHIPS[0]),
      () => toggleLifeDayChip(day, LIFE_DAY_CHIPS[0]), // un-record
      () => withLifeDayMinutes(day, 60),
      () => withLifeDayNote(day, 'A long day, but a real one.'),
    ]) {
      const after = next()
      steps.push(after)
      // No dropped completion, no dropped evidence, no dropped logged minutes.
      expect(findDayPreservationViolations(day, after)).toEqual([])
      day = after
    }
    expect(steps).toHaveLength(5)
  })

  it('writes the exact raw shape the monthly book fixture assumes', () => {
    // The seam: `functions/src/ai/tasks/monthlyReviewLifeDay.test.ts` proves a
    // month of Life Days is not a gap in the book, using a hand-written raw
    // `days` document. This pins that fixture to what the client actually
    // writes, from the client's end — the two must not drift.
    let day = withLifeDayMinutes(emptyDay(), 120)
    day = toggleLifeDayChip(day, LIFE_DAY_CHIPS[0])

    expect(day.blocks[0]).toMatchObject({
      type: 'Other',
      title: 'Life Day',
      subjectBucket: 'Other',
      location: 'Home',
      source: 'manual',
      actualMinutes: 120,
    })
    expect(day.checklist?.[0]).toMatchObject({
      label: '📦 Packing',
      completed: true,
      estimatedMinutes: 0,
      subjectBucket: 'PracticalArts',
      source: 'manual',
    })
  })

  it('survives the round trip out of a Life Day and back', () => {
    // Switching type writes only `dailyPlans.planType`; the day doc is never
    // rewritten. Modelled here as the identity it is.
    const before = plannedDay()
    const marked = withLifeDayMinutes(before, 120)
    const unmarked = marked // relabelling touches no day field
    expect(unmarked.checklist).toEqual(before.checklist)
    expect(findDayPreservationViolations(marked, unmarked)).toEqual([])
  })
})
