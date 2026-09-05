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
  BUILT_IN_CAPTURE_GROUPS,
  DEFAULT_QUICK_LOG_CHIPS,
  FAMILY_CAPTURE_GROUP_LABEL,
  familyQuickLogActivities,
  resolveCapturePresetGroups,
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

// ── UX-184: the capture panel is the OTHER quick-log surface ─────────────────
//
// FEAT-199 made `KidExtraLogger`'s row family-defined and left
// `UnifiedCaptureCard`'s "Quick logs" panel — nearer the top of the same page —
// hardcoded. The owner flagged Packing and Independent play, looked at the panel
// he came to first, and reported them missing.

/** The eight presets `UnifiedCaptureCard` rendered before this run, in order. */
const CAPTURE_BEFORE_THIS_RUN = [
  { group: 'Creative', label: 'Lego build', subjectBucket: 'PracticalArts', suggestedMinutes: 45 },
  { group: 'Creative', label: 'Baking / cooking', subjectBucket: 'PracticalArts', suggestedMinutes: 30 },
  { group: 'Creative', label: 'Drawing / art', subjectBucket: 'Art', suggestedMinutes: 30 },
  { group: 'Creative', label: 'Music practice', subjectBucket: 'Music', suggestedMinutes: 20 },
  { group: 'Creative', label: 'Reading session', subjectBucket: 'Reading', suggestedMinutes: 30 },
  { group: 'Active', label: 'Nature / park', subjectBucket: 'Science', suggestedMinutes: 45 },
  { group: 'Active', label: 'Sports / PE', subjectBucket: 'PE', suggestedMinutes: 45 },
  { group: 'Active', label: 'Zoo / museum trip', subjectBucket: 'Science', suggestedMinutes: 120 },
]

function flatten(groups: readonly { label: string; presets: readonly { label: string; subjectBucket: string; suggestedMinutes: number }[] }[]) {
  return groups.flatMap((g) =>
    g.presets.map((p) => ({
      group: g.label,
      label: p.label,
      subjectBucket: p.subjectBucket,
      suggestedMinutes: p.suggestedMinutes,
    })),
  )
}

describe('resolveCapturePresetGroups — the no-configs regression guard', () => {
  it('shows exactly the eight presets the capture panel showed before this run', () => {
    expect(flatten(resolveCapturePresetGroups([]))).toEqual(CAPTURE_BEFORE_THIS_RUN)
  })

  it('adds no group at all when the family has flagged nothing', () => {
    const groups = resolveCapturePresetGroups([
      config({ id: 'a', name: 'Prayer and Scripture' }),
      config({ id: 'b', name: 'Fluency Practice' }),
    ])
    expect(groups.map((g) => g.label)).toEqual(['Creative', 'Active'])
  })

  it('keeps the built-in labels byte-for-byte — they are a stored data shape', () => {
    // The capture form writes the preset label into the artifact title and the
    // hours note, so a rename here forks a family's history (FEAT-186's rule,
    // restated for this surface).
    expect(flatten(BUILT_IN_CAPTURE_GROUPS)).toEqual(CAPTURE_BEFORE_THIS_RUN)
  })
})

describe('resolveCapturePresetGroups — what the flag buys on this surface', () => {
  it('offers the owner’s two activities, in his own words, first', () => {
    const groups = resolveCapturePresetGroups([
      config({ id: 'pack', name: 'Packing', subjectBucket: 'PracticalArts', defaultMinutes: 30, quickLog: true, sortOrder: 2 }),
      config({ id: 'play', name: 'Independent play', subjectBucket: 'Other', defaultMinutes: 45, quickLog: true, sortOrder: 1 }),
    ])
    expect(groups[0].label).toBe(FAMILY_CAPTURE_GROUP_LABEL)
    expect(groups[0].presets.map((p) => p.label)).toEqual(['Independent play', 'Packing'])
    expect(groups.map((g) => g.label)).toEqual([FAMILY_CAPTURE_GROUP_LABEL, 'Creative', 'Active'])
  })

  it('takes the subject from the config, never from the name', () => {
    // The whole point of FEAT-199: "Packing" is PracticalArts because the parent
    // said so. Guessed from its letters it would land in Other, which is what a
    // season of real practical work used to read back as.
    const [family] = resolveCapturePresetGroups([
      config({ id: 'pack', name: 'Packing', subjectBucket: 'PracticalArts', quickLog: true }),
    ])
    expect(family.presets[0].subjectBucket).toBe('PracticalArts')
  })

  it('suggests the config’s own minutes, and invents none', () => {
    const [family] = resolveCapturePresetGroups([
      config({ id: 'pack', name: 'Packing', defaultMinutes: 35, quickLog: true }),
    ])
    expect(family.presets[0].suggestedMinutes).toBe(35)
  })

  it('carries no emoji on a family chip — an emoji would be a guess', () => {
    const [family] = resolveCapturePresetGroups([
      config({ id: 'pack', name: 'Packing', quickLog: true }),
    ])
    expect(family.presets[0].emoji).toBeUndefined()
    expect(family.presets[0].fromFamily).toBe(true)
  })

  it('drops a family chip that duplicates a built-in, keeping the built-in', () => {
    const groups = resolveCapturePresetGroups([
      config({ id: 'r', name: 'Reading session', subjectBucket: 'Reading', quickLog: true }),
    ])
    expect(groups.map((g) => g.label)).toEqual(['Creative', 'Active'])
    expect(flatten(groups)).toEqual(CAPTURE_BEFORE_THIS_RUN)
  })

  it('skips completed and unflagged configs, exactly as the row does', () => {
    const groups = resolveCapturePresetGroups([
      config({ id: 'done', name: 'Old workbook', quickLog: true, completed: true }),
      config({ id: 'off', name: 'Handwriting' }),
    ])
    expect(groups.map((g) => g.label)).toEqual(['Creative', 'Active'])
  })

  it('caps the family group, and never drops a built-in to make room', () => {
    const many = Array.from({ length: QUICK_LOG_MAX_CHIPS + 5 }, (_, i) =>
      config({ id: `c${i}`, name: `Thing ${i}`, quickLog: true, sortOrder: i }),
    )
    const groups = resolveCapturePresetGroups(many)
    expect(groups[0].presets).toHaveLength(QUICK_LOG_MAX_CHIPS)
    // The eight built-ins are untouched: dropping "Zoo / museum trip" from a
    // parent's capture card to fit a family chip would trade a regression for a
    // feature.
    expect(flatten(groups.slice(1))).toEqual(CAPTURE_BEFORE_THIS_RUN)
  })

  it('holds the family group heading to the kid readability bar', () => {
    // A kid reads this heading on Kid Today.
    expectKidWording(FAMILY_CAPTURE_GROUP_LABEL, 'family capture group heading')
  })
})

describe('familyQuickLogActivities — the one shared answer', () => {
  it('is what BOTH surfaces are built from, so a flag lands on both', () => {
    const configs = [
      config({ id: 'pack', name: 'Packing', subjectBucket: 'PracticalArts', defaultMinutes: 30, quickLog: true, sortOrder: 1 }),
    ]
    const activities = familyQuickLogActivities(configs)
    expect(activities).toEqual([
      { id: 'pack', label: 'Packing', subject: 'PracticalArts', minutes: 30 },
    ])
    // The logger's row…
    expect(resolveQuickLogChips(configs).map((c) => c.label)).toContain('Packing')
    // …and the capture panel.
    expect(flatten(resolveCapturePresetGroups(configs)).map((p) => p.label)).toContain('Packing')
  })

  it('narrows an off-type stored duration instead of passing NaN to a form field', () => {
    // `defaultMinutes` is typed `number` but comes from unvalidated Firestore.
    for (const bad of [undefined, null, 'twenty', NaN]) {
      const [activity] = familyQuickLogActivities([
        config({ id: 'x', name: 'Packing', quickLog: true, defaultMinutes: bad as unknown as number }),
      ])
      expect(activity.minutes).toBe(0)
    }
  })

  it('drops a nameless config rather than offering a blank chip', () => {
    expect(familyQuickLogActivities([config({ id: 'x', name: '   ', quickLog: true })])).toEqual([])
  })

  it('de-dupes by label letters, so one word is never two chips', () => {
    const activities = familyQuickLogActivities([
      config({ id: 'a', name: 'Packing', quickLog: true, sortOrder: 1 }),
      config({ id: 'b', name: 'packing!', quickLog: true, sortOrder: 2 }),
    ])
    expect(activities.map((a) => a.id)).toEqual(['a'])
  })

  it('holds no surface-specific rule of its own — no cap, no defaults', () => {
    const many = Array.from({ length: QUICK_LOG_MAX_CHIPS + 5 }, (_, i) =>
      config({ id: `c${i}`, name: `Thing ${i}`, quickLog: true, sortOrder: i }),
    )
    expect(familyQuickLogActivities(many)).toHaveLength(QUICK_LOG_MAX_CHIPS + 5)
  })
})
