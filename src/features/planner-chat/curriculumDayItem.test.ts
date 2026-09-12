import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityConfig, DraftWeeklyPlan } from '../../core/types'

const { addLive } = vi.hoisted(() => ({ addLive: vi.fn() }))
vi.mock('../today/liveDayEdit', () => ({ addItemToLiveDay: addLive }))
vi.mock('../../core/firebase/firestore', () => ({}))

import { addCurriculumItemToPlan, buildCurriculumDraftItem, canPlanActivity } from './curriculumDayItem'
import { buildApplyChecklist } from './applyWeekPlan'
import { applyDayTypeToDay } from './plannerDayTypes'
import { DayType } from '../../core/types/enums'

const config: ActivityConfig = {
  id: 'selected', childId: 'c1', name: 'Reading', type: 'workbook', subjectBucket: 'Reading',
  defaultMinutes: 20, frequency: 'daily', sortOrder: 1, scannable: true,
  completed: false, createdAt: '', updatedAt: '',
}
const draft: DraftWeeklyPlan = {
  days: [{ day: 'Monday', timeBudgetMinutes: 120, items: [] }], skipSuggestions: [], minimumWin: '',
}
const input = { canEdit: true, familyId: 'f1', childId: 'c1', weekStart: '2026-09-13', dayIndex: 0, draft, config, applied: false }
beforeEach(() => { addLive.mockReset().mockResolvedValue({ status: 'done' }) })

describe('adding Curriculum to a day', () => {
  it('keeps an addition when a Light day returns to Full', async () => {
    const original = buildCurriculumDraftItem({ ...config, id: 'original' })
    const full = { ...draft.days[0], items: [original] }
    const light = applyDayTypeToDay(full, DayType.Light, [])
    const result = await addCurriculumItemToPlan({ ...input, draft: { ...draft, days: [light] } })
    const added = result.days[0].items.at(-1)!
    const restored = applyDayTypeToDay(result.days[0], DayType.Normal, [])
    expect(restored.items).toEqual([original, added])
    expect(restored.timeBudgetMinutes).toBe(full.timeBudgetMinutes)
    expect(light.setAsideItems).toEqual([original])
    expect(addLive).not.toHaveBeenCalled()
  })

  it.each(['routine', 'app', 'activity'] as const)('preserves %s identity after Apply across duplicates and renames', type => {
    const selected = { ...config, type, scannable: false }
    const item = buildCurriculumDraftItem(selected)
    const renamed = { ...selected, name: 'Renamed resource' }
    const duplicate = { ...selected, id: 'other' }
    const [row] = buildApplyChecklist([item], [duplicate, renamed], new Map())
    expect(row.activityConfigId).toBe(selected.id)
    expect(row.workbookConfigId).toBeUndefined()
    expect(row.strandConfigId).toBeUndefined()
    expect(row.estimatedMinutes).toBe(20)
  })

  it('edits only the draft before Apply, preserving the selected ID and 20 minutes', async () => {
    const result = await addCurriculumItemToPlan(input)
    expect(addLive).not.toHaveBeenCalled()
    expect(draft.days[0].items).toEqual([])
    expect(result.days[0].timeBudgetMinutes).toBe(120)
    expect(result.days[0].items[0]).toMatchObject({ activityConfigId: 'selected', estimatedMinutes: 20, accepted: true, skillTags: [] })
  })

  it('adds to the exact saved child/day through the existing manual lane after Apply', async () => {
    await addCurriculumItemToPlan({ ...input, applied: true })
    expect(addLive).toHaveBeenCalledExactlyOnceWith({
      canEdit: true, familyId: 'f1', childId: 'c1', dateKey: '2026-09-14',
      item: expect.objectContaining({ label: 'Reading (20m)', estimatedMinutes: 20, completed: false, source: 'manual', workbookConfigId: 'selected' }),
    })
    expect(addLive.mock.calls[0][0]).not.toHaveProperty('blocks')
  })

  it('refuses kid writes, sibling resources, retired resources, and Life Days', async () => {
    for (const patch of [
      { canEdit: false }, { childId: 'c2' }, { config: { ...config, completed: true } },
      { draft: { ...draft, days: [{ ...draft.days[0], appliedDayType: 'life' as const }] } },
    ]) await expect(addCurriculumItemToPlan({ ...input, applied: true, ...patch })).rejects.toThrow()
    expect(addLive).not.toHaveBeenCalled()
    expect(canPlanActivity({ ...config, type: 'evaluation' }, 'c1')).toBe(false)
    expect(canPlanActivity({ ...config, childId: 'both' }, 'c1')).toBe(false)
    expect(canPlanActivity({ ...config, type: 'routine', childId: 'both' }, 'c2')).toBe(true)
  })

  it('leaves the draft unchanged when the saved-day write fails', async () => {
    addLive.mockRejectedValue(new Error('offline'))
    await expect(addCurriculumItemToPlan({ ...input, applied: true })).rejects.toThrow('offline')
    expect(draft.days[0].items).toEqual([])
  })

  it('uses the selected identity across duplicate titles, renames, and strand/workbook collisions', () => {
    const item = buildCurriculumDraftItem(config)
    const renamed = { ...config, name: 'New name' }
    const sameName = { ...config, id: 'other' }
    const [row] = buildApplyChecklist([item], [sameName, renamed], new Map())
    expect(row.workbookConfigId).toBe('selected')
    const strand = { ...config, id: 'strand', type: 'strand' as const, scannable: false }
    const [strandRow] = buildApplyChecklist([buildCurriculumDraftItem(strand)], [sameName, strand], new Map())
    expect(strandRow.strandConfigId).toBe('strand')
    expect(strandRow.workbookConfigId).toBeUndefined()
    for (const configs of [[sameName], [sameName, { ...renamed, completed: true }]]) {
      expect(buildApplyChecklist([item], configs, new Map())[0].workbookConfigId).toBeUndefined()
    }
  })
})
