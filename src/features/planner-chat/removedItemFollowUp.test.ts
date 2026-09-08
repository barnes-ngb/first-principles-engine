import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  findRemovedItemConfig,
  REMOVED_ITEM_DELETE_LABEL,
  REMOVED_ITEM_KEEP_LABEL,
  removedItemFollowUpBody,
  removedItemFollowUpTitle,
} from './removedItemFollowUp'
import {
  buildDeleteActivityPrompt,
  DELETE_ACTIVITY_MENU_LABEL,
} from '../progress/removeActivityCopy'

import type { ActivityConfig } from '../../core/types'

function config(overrides: Partial<ActivityConfig> & { name: string }): ActivityConfig {
  return {
    id: overrides.name.toLowerCase().replace(/\s/g, '-'),
    type: 'activity',
    subjectBucket: 'Reading',
    defaultMinutes: 15,
    frequency: '2x',
    childId: 'lincoln',
    sortOrder: 40,
    completed: false,
    scannable: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  } as ActivityConfig
}

const SIGHT_WORDS = config({ name: 'Sight word games' })
const PRAYER = config({ name: 'Prayer and Scripture', frequency: 'daily', defaultMinutes: 10 })

describe('findRemovedItemConfig (UX-232)', () => {
  it('matches a removed row to the curriculum row it names', () => {
    expect(findRemovedItemConfig({ title: 'Sight word games' }, [SIGHT_WORDS, PRAYER])).toEqual({
      configId: SIGHT_WORDS.id,
      configName: 'Sight word games',
      cadence: '2x/week',
      minutes: 15,
      shared: false,
      activity: {
        name: 'Sight word games',
        currentPosition: undefined,
        totalUnits: undefined,
        unitLabel: undefined,
        completed: false,
      },
    })
  })

  it('normalises the way quickLogLabelKey does — case, punctuation, spacing', () => {
    expect(findRemovedItemConfig({ title: 'sight word games!' }, [SIGHT_WORDS])).not.toBeNull()
    expect(findRemovedItemConfig({ title: '📚 Sight  Word Games' }, [SIGHT_WORDS])).not.toBeNull()
  })

  it('does NOT match a near-name — an offer to delete the wrong row is worse than none', () => {
    // The shared `nameKey` rule is deliberately exact (UX-207): these differ by
    // a real word. This offer ends in a delete of a curriculum row, so a
    // near-match here would have the parent confirming a name they didn't mean.
    const gatb = config({ name: 'The Good and the Beautiful Math' })
    expect(findRemovedItemConfig({ title: 'Good and the Beautiful Math' }, [gatb])).toBeNull()

    // And a row that merely CONTAINS the name is not the row.
    expect(findRemovedItemConfig({ title: 'Sight word games — review' }, [SIGHT_WORDS])).toBeNull()
    expect(findRemovedItemConfig({ title: 'Sight' }, [SIGHT_WORDS])).toBeNull()
  })

  it('offers nothing for an AI-generated row that names a lesson, not a program', () => {
    expect(
      findRemovedItemConfig({ title: 'Math: Lesson 42 — regrouping' }, [SIGHT_WORDS, PRAYER]),
    ).toBeNull()
  })

  it('offers nothing when TWO configs match — which is the owner’s actual situation', () => {
    // A duplicate pair is exactly the case that produced this run, and this
    // feature cannot know which of two identical rows he meant. Picking one
    // would be the app guessing about his curriculum; both are visible on
    // Curriculum, which is where a duplicate gets resolved.
    const duplicate = config({ name: 'Sight word games', id: 'second-copy', defaultMinutes: 20 })
    expect(findRemovedItemConfig({ title: 'Sight word games' }, [SIGHT_WORDS, duplicate])).toBeNull()
  })

  it('skips a completed program — deleting it would destroy the record it was finished', () => {
    const done = config({ name: 'Explode the Code', completed: true })
    expect(findRemovedItemConfig({ title: 'Explode the Code' }, [done])).toBeNull()
  })

  it('still matches when the only OTHER same-named row is completed', () => {
    const done = config({ name: 'Sight word games', id: 'old', completed: true })
    const found = findRemovedItemConfig({ title: 'Sight word games' }, [done, SIGHT_WORDS])
    expect(found?.configId).toBe(SIGHT_WORDS.id)
  })

  it('handles an empty or missing title without offering anything', () => {
    expect(findRemovedItemConfig({ title: '' }, [SIGHT_WORDS])).toBeNull()
    expect(findRemovedItemConfig(null, [SIGHT_WORDS])).toBeNull()
    expect(findRemovedItemConfig(undefined, [SIGHT_WORDS])).toBeNull()
    // A title of pure punctuation keys to '' and must not match a config that
    // also keys to '' — the guard is on the key, not the raw string.
    expect(findRemovedItemConfig({ title: '!!!' }, [config({ name: '???' })])).toBeNull()
  })

  it('offers nothing when the family has no configs', () => {
    expect(findRemovedItemConfig({ title: 'Sight word games' }, [])).toBeNull()
  })

  it('reads the cadence off the shared label map, not a second copy of the enum', () => {
    expect(findRemovedItemConfig({ title: 'Prayer and Scripture' }, [PRAYER])?.cadence).toBe('daily')
    expect(
      findRemovedItemConfig({ title: 'Handwriting' }, [config({ name: 'Handwriting', frequency: '3x' })])
        ?.cadence,
    ).toBe('3x/week')
  })
})

describe('both removal paths offer it (Codex round 3, P1)', () => {
  // The offer began life inline at the end of `handleRemoveItem`'s pre-Apply
  // branch. The applied branch returns before reaching it, so a ✕ after Apply
  // changed the saved day, left Curriculum untouched and said nothing — and the
  // next Redo brought the row back, which is the exact behaviour UX-232 exists
  // to stop. Both branches now route through one `offerCurriculumFollowUp`.
  //
  // The wiring is asserted at the source, because mounting PlannerChatPage to
  // test it would need the whole planner: Firestore, the AI hook, the profile
  // context and an applied week. A source scan is the honest instrument for
  // "did this call site get made", and it fails loudly if either goes missing.
  // `import.meta.dirname` + `join`, as `plannerPlanType.invariant.test.ts` does:
  // this file runs under jsdom in the root suite, where `import.meta.url` is not
  // a `file:` URL and `new URL(...)` would throw at collection time.
  const source = readFileSync(join(import.meta.dirname, 'PlannerChatPage.tsx'), 'utf8')

  it('has exactly one place that raises the offer', () => {
    // One definition, so a third removal path cannot quietly get its own copy
    // with different rules.
    expect(source.match(/const offerCurriculumFollowUp = useCallback/g)).toHaveLength(1)
    expect(source.match(/setRemovedItemFollowUp\(followUp\)/g)).toHaveLength(1)
  })

  it('calls it from the applied branch AND the draft branch', () => {
    expect(source.match(/offerCurriculumFollowUp\(removed\)/g)).toHaveLength(2)
  })

  it('reads the removed row before either branch edits its copy', () => {
    // The applied branch writes the saved day first and mirrors the draft after,
    // so a read taken at offer time would find nothing.
    const readAt = source.indexOf('const removed = currentDraft.days[dayIndex]?.items[itemIndex]')
    const firstOffer = source.indexOf('offerCurriculumFollowUp(removed)')
    expect(readAt).toBeGreaterThan(-1)
    expect(readAt).toBeLessThan(firstOffer)
  })

  it('offers only after a successful live removal, not on a refusal', () => {
    // Nothing about a curriculum row is worth raising when the removal the
    // parent asked for did not land.
    const guard = source.indexOf("if (!outcome || outcome.status !== 'done')")
    const appliedOffer = source.indexOf('offerCurriculumFollowUp(removed)')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(appliedOffer)
  })
})

describe('the copy', () => {
  const followUp = findRemovedItemConfig({ title: 'Sight word games' }, [SIGHT_WORDS])!

  it('names the row that would go, in the title', () => {
    expect(removedItemFollowUpTitle(followUp)).toBe(
      'Remove Sight word games from Curriculum too?',
    )
  })

  it('says what the ✕ actually did — the sentence that would have saved the regenerate', () => {
    const body = removedItemFollowUpBody(followUp)
    // The finding: nothing on screen said the ✕ edits a copy.
    expect(body).toContain("doesn't change Curriculum")
    expect(body).toContain('the next plan will include it again')
    // And the row's own numbers, so "is this the one I mean" is answerable here.
    expect(body).toContain('Sight word games at 15 minutes, 2x/week')
  })

  it('says nothing about a sibling for a row that belongs to one child', () => {
    expect(removedItemFollowUpBody(followUp)).not.toMatch(/other child/i)
  })

  it('names the scope when the row is shared with the sibling', () => {
    // The parent is standing on ONE child's planner. A `childId: 'both'` config
    // plans for the other child too, so confirming here changes a plan they are
    // not looking at — the scope of a destructive act belongs in the ask.
    const sharedRow = findRemovedItemConfig({ title: 'Prayer and Scripture' }, [
      config({ name: 'Prayer and Scripture', childId: 'both', frequency: 'daily', defaultMinutes: 10 }),
    ])!
    expect(sharedRow.shared).toBe(true)
    expect(removedItemFollowUpBody(sharedRow)).toContain('takes it off their plans too')
  })

  it('offers a decline that reads as keeping, not cancelling', () => {
    expect(REMOVED_ITEM_KEEP_LABEL).toBe('Keep it in Curriculum')
    // Neither button says "Apply" — this is not part of Apply.
    expect(REMOVED_ITEM_KEEP_LABEL).not.toMatch(/apply/i)
    expect(REMOVED_ITEM_DELETE_LABEL).not.toMatch(/apply/i)
  })

  it('confirms with Curriculum’s OWN label, not a gentler word for the same write', () => {
    // Codex round 1, P1. `deleteConfig` is a `deleteDoc` with no undo, and
    // FEAT-162 renamed Curriculum's menu entry off "Remove" for exactly that
    // reason. Two routes to one irreversible write must not sit at two levels
    // of honesty.
    expect(REMOVED_ITEM_DELETE_LABEL).toBe(DELETE_ACTIVITY_MENU_LABEL)
    expect(REMOVED_ITEM_DELETE_LABEL).toBe('Delete permanently')
  })

  it('carries the permanent-deletion warning, and names the position at stake', () => {
    // The first cut described minutes and cadence and stopped, so "Remove from
    // Curriculum" read as "stop planning this" while it destroyed a workbook's
    // saved place. The warning is not rewritten here — it is the one
    // `buildDeleteActivityPrompt` already produces for this same delete.
    const workbook = findRemovedItemConfig({ title: 'GATB Math' }, [
      config({
        name: 'GATB Math',
        type: 'workbook',
        currentPosition: 34,
        totalUnits: 120,
        unitLabel: 'lesson',
      }),
    ])!
    const body = removedItemFollowUpBody(workbook)
    const prompt = buildDeleteActivityPrompt(workbook.activity)

    expect(body).toContain(prompt.whatGoes)
    expect(body).toContain(prompt.whatStays)
    expect(body).toContain('lesson 34 of 120')
    expect(body).toContain("There's no undo")
    // And the honest other half — a delete does not rewrite logged days.
    expect(body).toContain('keep their rows, minutes and photos')
    // Plus the gentler path, since this program isn't finished.
    expect(body).toContain('Mark as complete')
  })

  it('drops the gentler path once the program is finished', () => {
    // A completed program can't be "marked complete" as a way out. It is also
    // never offered (see the finder), so this only pins the composition.
    const done = buildDeleteActivityPrompt({ name: 'Explode the Code', completed: true })
    expect(done.gentlerPath).toBeUndefined()
  })

  it('says no undo even for a row with no saved position', () => {
    expect(removedItemFollowUpBody(followUp)).toContain("There's no undo")
  })
})
