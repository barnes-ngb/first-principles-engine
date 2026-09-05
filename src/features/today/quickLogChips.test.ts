/**
 * FEAT-199 — the quick-log chips come from the family, not from the code.
 *
 * The regression guard comes first and matters most: a family that has flagged
 * nothing must see EXACTLY the six chips Kid Today showed before this run, in
 * the order it showed them. Everything else here is what the flag buys.
 */
import { describe, expect, it } from 'vitest'

import type { ActivityConfig } from '../../core/types'
import { expectKidWording } from '../../test/kidReadability'
import {
  DEFAULT_QUICK_LOG_CHIPS,
  OTHER_QUICK_LOG_CHIP,
  QUICK_LOG_MAX_CHIPS,
  quickLogLabelKey,
  resolveQuickLogChips,
} from './quickLogChips'

/** The six labels+subjects that were written into `KidExtraLogger` on `main`. */
const BEFORE_THIS_RUN = [
  { label: '📖 Reading Eggs', subject: 'Reading' },
  { label: '🔢 Math App', subject: 'Math' },
  { label: '📚 Reading', subject: 'Reading' },
  { label: '✏️ Writing', subject: 'LanguageArts' },
  { label: '🔬 Science', subject: 'Science' },
  { label: '🎮 Other', subject: 'Other' },
]

function config(over: Partial<ActivityConfig>): ActivityConfig {
  return {
    id: over.id ?? 'cfg-1',
    name: 'Activity',
    type: 'routine',
    subjectBucket: 'Other',
    defaultMinutes: 15,
    frequency: 'daily',
    childId: 'both',
    sortOrder: 1,
    completed: false,
    scannable: false,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
    ...over,
  }
}

describe('resolveQuickLogChips — the no-configs regression guard', () => {
  it('shows exactly the six chips Kid Today showed before FEAT-199, in order', () => {
    const chips = resolveQuickLogChips([])
    expect(chips.map((c) => ({ label: c.label, subject: c.subject }))).toEqual(BEFORE_THIS_RUN)
  })

  it('shows the same six when the family has configs but has flagged none', () => {
    // The shape every family really has: `ensureDefaultActivityConfigs` seeds
    // roughly fourteen of these on first load, none of them quick-log.
    const seeded = [
      config({ id: 'a', name: 'Prayer and Scripture' }),
      config({ id: 'b', name: 'Knowledge Mine', sortOrder: 81 }),
      config({ id: 'c', name: 'Fluency Practice', sortOrder: 82 }),
      config({ id: 'd', name: 'Language arts workbook', type: 'workbook', childId: 'kid-1' }),
    ]
    expect(resolveQuickLogChips(seeded).map((c) => c.label)).toEqual(
      BEFORE_THIS_RUN.map((c) => c.label),
    )
  })

  it('ignores a flagged config that has been completed', () => {
    const retired = config({ id: 'x', name: 'Packing boxes', quickLog: true, completed: true })
    expect(resolveQuickLogChips([retired]).map((c) => c.label)).toEqual(
      BEFORE_THIS_RUN.map((c) => c.label),
    )
  })
})

describe('resolveQuickLogChips — what the family adds', () => {
  it('puts flagged configs first, by their own sortOrder, defaults after', () => {
    const chips = resolveQuickLogChips([
      config({ id: 'p', name: 'Packing boxes', sortOrder: 20, quickLog: true }),
      config({ id: 'q', name: 'Independent play', sortOrder: 10, quickLog: true }),
    ])
    expect(chips.slice(0, 2).map((c) => c.label)).toEqual(['Independent play', 'Packing boxes'])
    expect(chips[2].label).toBe('📖 Reading Eggs')
    expect(chips.slice(0, 2).every((c) => c.fromFamily)).toBe(true)
  })

  it('logs a PracticalArts activity as PracticalArts, not Other', () => {
    // The owner's ask, and the one behaviour no chip on `main` could produce:
    // every chip carried one of five buckets and packing had nowhere to land.
    const chips = resolveQuickLogChips([
      config({ id: 'p', name: 'Packing boxes', subjectBucket: 'PracticalArts', quickLog: true }),
    ])
    const packing = chips.find((c) => c.label === 'Packing boxes')
    expect(packing?.subject).toBe('PracticalArts')
    expect(packing?.subject).not.toBe('Other')
  })

  it('carries each config its own bucket, not one shared default', () => {
    const chips = resolveQuickLogChips([
      config({ id: 'p', name: 'Packing boxes', subjectBucket: 'PracticalArts', sortOrder: 1, quickLog: true }),
      config({ id: 'r', name: 'Yard time', subjectBucket: 'PE', sortOrder: 2, quickLog: true }),
      config({ id: 's', name: 'Piano', subjectBucket: 'Music', sortOrder: 3, quickLog: true }),
    ])
    expect(chips.slice(0, 3).map((c) => c.subject)).toEqual(['PracticalArts', 'PE', 'Music'])
  })

  it('gives every chip a distinct, stable key', () => {
    const chips = resolveQuickLogChips([
      config({ id: 'p', name: 'Packing boxes', quickLog: true }),
      config({ id: 'q', name: 'Independent play', sortOrder: 2, quickLog: true }),
    ])
    expect(new Set(chips.map((c) => c.key)).size).toBe(chips.length)
    expect(chips[0].key).toBe('config:p')
  })

  it('does not show a family label the defaults already say', () => {
    const chips = resolveQuickLogChips([
      config({ id: 'r', name: 'Reading', subjectBucket: 'Reading', quickLog: true }),
    ])
    expect(chips.filter((c) => quickLogLabelKey(c.label) === 'reading')).toHaveLength(1)
    expect(chips[0].fromFamily).toBe(true)
  })

  it('drops an unnamed config rather than showing a blank chip', () => {
    const chips = resolveQuickLogChips([config({ id: 'blank', name: '   ', quickLog: true })])
    expect(chips.map((c) => c.label)).toEqual(BEFORE_THIS_RUN.map((c) => c.label))
  })
})

describe('resolveQuickLogChips — the cap and the escape hatch', () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    config({ id: `c${i}`, name: `Activity ${i}`, sortOrder: i, quickLog: true }),
  )

  it('never shows more than the cap, however many are flagged', () => {
    expect(resolveQuickLogChips(many)).toHaveLength(QUICK_LOG_MAX_CHIPS)
  })

  it('keeps Other last even when the cap is full', () => {
    const chips = resolveQuickLogChips(many)
    expect(chips[chips.length - 1]).toEqual(OTHER_QUICK_LOG_CHIP)
    expect(chips.filter((c) => c.label === OTHER_QUICK_LOG_CHIP.label)).toHaveLength(1)
  })

  it('keeps Other last in the ordinary case too', () => {
    for (const configs of [[], [config({ id: 'p', name: 'Packing boxes', quickLog: true })], many]) {
      const chips = resolveQuickLogChips(configs)
      expect(chips[chips.length - 1].label).toBe(OTHER_QUICK_LOG_CHIP.label)
    }
  })

  it('lets family chips win the cap — that is the point of the feature', () => {
    const chips = resolveQuickLogChips(many)
    expect(chips.slice(0, QUICK_LOG_MAX_CHIPS - 1).every((c) => c.fromFamily)).toBe(true)
  })

  it('shows a single Other when a family names a config "Other"', () => {
    const chips = resolveQuickLogChips([config({ id: 'o', name: 'Other', quickLog: true })])
    expect(chips.filter((c) => quickLogLabelKey(c.label) === 'other')).toHaveLength(1)
    expect(chips[chips.length - 1]).toEqual(OTHER_QUICK_LOG_CHIP)
  })

  it('fits a phone row: the cap is small enough to wrap, not scroll', () => {
    // The row is a wrapping flex Stack of ~7rem chips; ten is two lines on a
    // 360px phone. This pins the number so a later "just add a few more"
    // cannot quietly turn the picker into a wall of text.
    expect(QUICK_LOG_MAX_CHIPS).toBeLessThanOrEqual(10)
    expect(QUICK_LOG_MAX_CHIPS).toBeGreaterThanOrEqual(DEFAULT_QUICK_LOG_CHIPS.length)
  })
})

describe('the default chip labels a kid reads', () => {
  it('holds the FEAT-178 kid readability bar', () => {
    for (const chip of DEFAULT_QUICK_LOG_CHIPS) {
      expectKidWording(chip.label, `quick-log default chip "${chip.label}"`)
    }
  })

  it('is byte-for-byte what Kid Today offered before this run', () => {
    // These labels are written into `days.checklist[].label`, so they are a
    // stored data shape: renaming one forks a family's history (FEAT-186).
    expect(DEFAULT_QUICK_LOG_CHIPS.map((c) => ({ label: c.label, subject: c.subject }))).toEqual(
      BEFORE_THIS_RUN,
    )
  })
})
