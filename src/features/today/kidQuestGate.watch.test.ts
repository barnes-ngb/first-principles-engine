import { describe, expect, it } from 'vitest'

import type { ChecklistItem } from '../../core/types'
import { categorizeItems, computeQuestProgress, isDayAllDone } from './kidQuestGate'

function quest(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return { label: 'Quest', completed: false, category: 'must-do', ...overrides }
}

/** A watch row exactly as `watchDayItem.ts` builds it: `choose` + not MVD-essential. */
function watchRow(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    label: 'Watch: Revolution war (12m)',
    completed: false,
    category: 'choose',
    itemType: 'watch',
    watchVideoId: 'v1',
    estimatedMinutes: 12,
    ...overrides,
  }
}

describe('categorizeItems — a planned video gets its own bucket (FEAT-134)', () => {
  it('puts a watch row in `watch`, never in `mustDo` or `choose`', () => {
    const { mustDo, choose, watch } = categorizeItems([
      quest({ label: 'Prayer' }),
      watchRow(),
      quest({ label: 'Art', category: 'choose' }),
    ])
    expect(watch.map((i) => i.label)).toEqual(['Watch: Revolution war (12m)'])
    expect(mustDo.map((i) => i.label)).toEqual(['Prayer'])
    expect(choose.map((i) => i.label)).toEqual(['Art'])
  })

  it('buckets on itemType, not category — a row with a MISSING category is still a watch row', () => {
    const { mustDo, choose, watch } = categorizeItems([
      quest({ label: 'Prayer' }),
      watchRow({ category: undefined }),
    ])
    expect(watch).toHaveLength(1)
    expect(mustDo.map((i) => i.label)).toEqual(['Prayer'])
    expect(choose).toHaveLength(0)
  })

  it('buckets on itemType, not category — a row wrongly tagged `must-do` is still a watch row', () => {
    const { mustDo, choose, watch } = categorizeItems([
      quest({ label: 'Prayer' }),
      watchRow({ category: 'must-do', mvdEssential: true }),
    ])
    expect(watch).toHaveLength(1)
    expect(mustDo.map((i) => i.label)).toEqual(['Prayer'])
    expect(choose).toHaveLength(0)
  })

  it('a legacy uncategorized day with a watch row keeps its categorized bucketing', () => {
    // The mixed shape: non-watch items predate categorization, but the video
    // carries `category: 'choose'` (watchDayItem.ts always stamps it). That tag
    // is what flips `hasCategories` true, so the day takes the categorized
    // branch and mvdEssential still decides the quests. Probing only the
    // non-watch items would drop this day into the "first 3 are must-do"
    // fallback — the two essentials would lose must-do status and A/B/C would
    // gain it, moving the quest count and the Workshop gate with them.
    const { mustDo, choose, watch } = categorizeItems([
      quest({ label: 'A', category: undefined }),
      quest({ label: 'B', category: undefined }),
      quest({ label: 'C', category: undefined }),
      quest({ label: 'D-essential', category: undefined, mvdEssential: true }),
      quest({ label: 'E-essential', category: undefined, mvdEssential: true }),
      quest({ label: 'F', category: undefined }),
      watchRow(),
    ])
    expect(mustDo.map((i) => i.label)).toEqual(['D-essential', 'E-essential'])
    expect(choose).toHaveLength(0)
    expect(watch.map((i) => i.label)).toEqual(['Watch: Revolution war (12m)'])
  })

  it('on the uncategorized fallback path a watch row is still not swept into the first-3 must-dos', () => {
    // No `category` anywhere → the "first 3 are must-do" fallback. The video sits
    // at index 1, so pre-FEAT-134 it would have become a required quest.
    const { mustDo, choose, watch } = categorizeItems([
      quest({ label: 'A', category: undefined }),
      watchRow({ category: undefined }),
      quest({ label: 'B', category: undefined }),
      quest({ label: 'C', category: undefined }),
      quest({ label: 'D', category: undefined }),
    ])
    expect(watch).toHaveLength(1)
    expect(mustDo.map((i) => i.label)).toEqual(['A', 'B', 'C'])
    expect(choose.map((i) => i.label)).toEqual(['D'])
  })
})

describe('computeQuestProgress — a video moves no counter (FEAT-134)', () => {
  // Lincoln's reported day: 11 quests, 1 done, plus one planned video.
  const elevenQuests = Array.from({ length: 11 }, (_, i) =>
    quest({ label: `Quest ${i + 1}`, completed: i === 0 }),
  )

  it('leaves the quest count and the Workshop gate exactly as they were without the video', () => {
    const withVideo = computeQuestProgress([...elevenQuests, watchRow()])
    const withoutVideo = computeQuestProgress(elevenQuests)

    expect(withVideo.mustDo).toHaveLength(11) // footer reads "1 of 11 quests done"
    expect(withVideo.mustDoCompleted).toBe(1)
    expect(withVideo.mustDoRemaining).toBe(withoutVideo.mustDoRemaining)
    expect(withVideo.gateThreshold).toBe(withoutVideo.gateThreshold)
    expect(withVideo.gateUnlocked).toBe(withoutVideo.gateUnlocked)
    expect(withVideo.mustDoDone).toBe(false)
  })

  it('keeps the video out of the craft pool, so it can never consume a craft slot', () => {
    const p = computeQuestProgress([...elevenQuests, watchRow(), quest({ label: 'Art', category: 'choose' })])
    expect(p.choose.map((i) => i.label)).toEqual(['Art'])
    expect(p.choose.some((i) => i.itemType === 'watch')).toBe(false)
    expect(p.watch).toHaveLength(1)
  })

  it('an unwatched video cannot hold `allDone` false — it is optional', () => {
    // Every quest done, the video untouched. `choose` holds only the video's
    // former slot, so even if the kid had selected everything selectable, the
    // day still finishes. Pre-fix the video sat in `choose` and, once selected,
    // held the day (and its bonus XP) open until it was watched.
    const done = elevenQuests.map((i) => ({ ...i, completed: true }))
    const p = computeQuestProgress([...done, watchRow()])

    expect(p.choose).toHaveLength(0)
    expect(
      isDayAllDone({
        mustDoDone: p.mustDoDone,
        isMvd: false,
        choose: p.choose,
        selectedChoiceItems: p.choose,
      }),
    ).toBe(true)
  })
})
