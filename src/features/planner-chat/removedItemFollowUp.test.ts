import { describe, expect, it } from 'vitest'

import {
  findRemovedItemConfig,
  REMOVED_ITEM_DELETE_LABEL,
  REMOVED_ITEM_KEEP_LABEL,
  removedItemFollowUpBody,
  removedItemFollowUpTitle,
} from './removedItemFollowUp'

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
    expect(REMOVED_ITEM_DELETE_LABEL).toBe('Remove from Curriculum')
    // Neither button says "Apply" — this is not part of Apply.
    expect(REMOVED_ITEM_KEEP_LABEL).not.toMatch(/apply/i)
    expect(REMOVED_ITEM_DELETE_LABEL).not.toMatch(/apply/i)
  })
})
