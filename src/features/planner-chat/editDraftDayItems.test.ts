import { describe, expect, it } from 'vitest'

import type { DraftDayPlan, DraftPlanItem } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'
import { editDraftDayItems } from './editDraftDayItems'

const item = (id: string, title: string): DraftPlanItem => ({
  id,
  title,
  subjectBucket: SubjectBucket.Math,
  estimatedMinutes: 20,
  skillTags: [],
  accepted: true,
})

describe('editDraftDayItems — manual draft row edits with setAsideItems (UX-261)', () => {
  it('returns updated items when there is no setAsideItems stash', () => {
    const day: DraftDayPlan = {
      day: 'Monday',
      timeBudgetMinutes: 120,
      items: [item('a', 'Math'), item('b', 'Reading')],
    }
    const newItems = [item('a', 'Math renamed')]
    const result = editDraftDayItems(day, newItems)
    expect(result.items).toEqual(newItems)
    expect(result.setAsideItems).toBeUndefined()
  })

  it('propagates field edits from visible items into the stash', () => {
    const original = item('a', 'Math')
    const stashed = item('a', 'Math')
    const day: DraftDayPlan = {
      day: 'Monday',
      timeBudgetMinutes: 120,
      items: [original],
      setAsideItems: [stashed],
    }
    const edited = { ...original, title: 'Math edited', estimatedMinutes: 30 }
    const result = editDraftDayItems(day, [edited])
    expect(result.items[0].title).toBe('Math edited')
    expect(result.setAsideItems![0].title).toBe('Math edited')
    expect(result.setAsideItems![0].estimatedMinutes).toBe(30)
  })

  it('removes a deleted visible item from the stash too', () => {
    const a = item('a', 'Math')
    const b = item('b', 'Reading')
    const day: DraftDayPlan = {
      day: 'Monday',
      timeBudgetMinutes: 120,
      items: [a, b],
      setAsideItems: [a, b],
    }
    const result = editDraftDayItems(day, [b])
    expect(result.items).toEqual([b])
    expect(result.setAsideItems).toHaveLength(1)
    expect(result.setAsideItems![0].id).toBe('b')
  })

  it('preserves hidden stash-only items unchanged', () => {
    const visible = item('a', 'Math')
    const hidden = item('hidden-1', 'Full-day only')
    const day: DraftDayPlan = {
      day: 'Monday',
      timeBudgetMinutes: 120,
      items: [visible],
      setAsideItems: [hidden, visible],
    }
    const result = editDraftDayItems(day, [visible])
    expect(result.setAsideItems!.find((i) => i.id === 'hidden-1')).toEqual(hidden)
  })

  it('adds a newly added visible item to the stash when it was not in the original items', () => {
    const existing = item('a', 'Math')
    const added = item('new-1', 'Science')
    const day: DraftDayPlan = {
      day: 'Monday',
      timeBudgetMinutes: 120,
      items: [existing],
      setAsideItems: [existing],
    }
    const result = editDraftDayItems(day, [existing, added])
    expect(result.setAsideItems!.some((i) => i.id === 'new-1')).toBe(true)
  })

  it('reorders shared items in the stash to match the visible order', () => {
    const a = item('a', 'Math')
    const b = item('b', 'Reading')
    const hidden = item('h', 'Hidden')
    const day: DraftDayPlan = {
      day: 'Monday',
      timeBudgetMinutes: 120,
      items: [a, b],
      setAsideItems: [a, hidden, b],
    }
    const result = editDraftDayItems(day, [b, a])
    const stashIds = result.setAsideItems!.map((i) => i.id)
    expect(stashIds[0]).toBe('b')
    expect(stashIds[1]).toBe('h')
    expect(stashIds[2]).toBe('a')
  })

  it('does not mutate the input day', () => {
    const a = item('a', 'Math')
    const day: DraftDayPlan = {
      day: 'Monday',
      timeBudgetMinutes: 120,
      items: [a],
      setAsideItems: [a],
    }
    const originalStash = [...day.setAsideItems!]
    editDraftDayItems(day, [{ ...a, title: 'Changed' }])
    expect(day.setAsideItems).toEqual(originalStash)
  })
})
