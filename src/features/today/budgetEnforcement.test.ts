import { describe, expect, it } from 'vitest'

import type { ChecklistItem } from '../../core/types'
import { enforceDailyBudget, resolveDailyBudget } from './budgetEnforcement'

const make = (overrides: Partial<ChecklistItem>): ChecklistItem => ({
  label: 'Item',
  completed: false,
  ...overrides,
})

describe('enforceDailyBudget', () => {
  it('returns checklist unchanged when total is within grace', () => {
    const checklist = [
      make({ label: 'A', plannedMinutes: 60, category: 'must-do' }),
      make({ label: 'B', plannedMinutes: 60, category: 'choose' }),
      make({ label: 'C', plannedMinutes: 60, category: 'choose' }),
    ]
    const result = enforceDailyBudget(checklist, 186)

    expect(result.deferredCount).toBe(0)
    expect(result.activeMinutes).toBe(180)
    expect(result.checklist.every((i) => !i.deferredByBudget)).toBe(true)
  })

  it('allows ~10% grace above budget before trimming', () => {
    // 186 * 1.1 = 204.6 → ceiling 205
    const checklist = [
      make({ label: 'A', plannedMinutes: 100, category: 'must-do' }),
      make({ label: 'B', plannedMinutes: 100, category: 'choose' }),
    ]
    const result = enforceDailyBudget(checklist, 186)

    expect(result.totalMinutes).toBe(200)
    expect(result.deferredCount).toBe(0)
  })

  it('defers lowest-priority items until within budget', () => {
    const checklist = [
      make({ label: 'MustDo A', plannedMinutes: 60, category: 'must-do' }),
      make({ label: 'MustDo B', plannedMinutes: 60, mvdEssential: true }),
      make({ label: 'Rolled C', plannedMinutes: 30, rolledOver: true, rolledOverFrom: '2026-04-18' }),
      make({ label: 'Choose D', plannedMinutes: 60, category: 'choose' }),
      make({ label: 'Choose E', plannedMinutes: 60, category: 'choose' }),
    ]
    const result = enforceDailyBudget(checklist, 186)

    // Effective budget = ceil(186 * 1.1) = 205. Total = 270. Must trim >=65m from lowest priority.
    expect(result.deferredCount).toBeGreaterThanOrEqual(1)
    // Must-Do items are never deferred
    expect(result.checklist[0].deferredByBudget).toBeUndefined()
    expect(result.checklist[1].deferredByBudget).toBeUndefined()
    // Rolled item is protected ahead of Choose
    expect(result.checklist[2].deferredByBudget).toBeUndefined()
    expect(result.activeMinutes).toBeLessThanOrEqual(205)
  })

  it('never defers Must-Do items even when total vastly exceeds budget', () => {
    const checklist = [
      make({ label: 'MustDo A', plannedMinutes: 100, category: 'must-do' }),
      make({ label: 'MustDo B', plannedMinutes: 100, category: 'must-do' }),
      make({ label: 'MustDo C', plannedMinutes: 100, category: 'must-do' }),
      make({ label: 'Choose D', plannedMinutes: 30, category: 'choose' }),
    ]
    const result = enforceDailyBudget(checklist, 120)

    // Only the choose item can be deferred; must-dos stay
    expect(result.checklist[0].deferredByBudget).toBeUndefined()
    expect(result.checklist[1].deferredByBudget).toBeUndefined()
    expect(result.checklist[2].deferredByBudget).toBeUndefined()
    expect(result.checklist[3].deferredByBudget).toBe(true)
  })

  it('prefers keeping rolled items over new Choose items', () => {
    const checklist = [
      make({ label: 'MustDo A', plannedMinutes: 60, category: 'must-do' }),
      make({ label: 'Rolled B', plannedMinutes: 30, rolledOver: true, rolledOverFrom: '2026-04-18' }),
      make({ label: 'Choose C', plannedMinutes: 60, category: 'choose' }),
      make({ label: 'Choose D', plannedMinutes: 60, category: 'choose' }),
    ]
    const result = enforceDailyBudget(checklist, 100)

    expect(result.checklist[1].deferredByBudget).toBeUndefined()
    // Choose items are deferred before rolled items
    const choosesDeferred = result.checklist
      .filter((i) => i.category === 'choose')
      .every((i) => i.deferredByBudget === true)
    expect(choosesDeferred).toBe(true)
  })

  it('aspirational items are the first to be deferred', () => {
    const checklist = [
      make({ label: 'MustDo A', plannedMinutes: 60, category: 'must-do' }),
      make({ label: 'Choose B', plannedMinutes: 60, category: 'choose' }),
      make({ label: 'Focus C', plannedMinutes: 60, aspirational: true }),
    ]
    const result = enforceDailyBudget(checklist, 120)

    // Total = 180, effective = 132. Need to trim 48m.
    // Aspirational goes first (priority 4), then choose if needed.
    expect(result.checklist[2].deferredByBudget).toBe(true)
  })

  it('deferredByBudget flag is set on each deferred item', () => {
    const checklist = [
      make({ label: 'MustDo A', plannedMinutes: 60, category: 'must-do' }),
      make({ label: 'Choose B', plannedMinutes: 200, category: 'choose' }),
    ]
    const result = enforceDailyBudget(checklist, 60)

    const deferred = result.checklist.filter((i) => i.deferredByBudget)
    expect(deferred).toHaveLength(1)
    expect(deferred[0].label).toBe('Choose B')
    expect(result.deferredCount).toBe(1)
  })

  it('clears stale deferredByBudget from prior passes when they fit', () => {
    const checklist = [
      make({ label: 'A', plannedMinutes: 60, category: 'must-do', deferredByBudget: true }),
      make({ label: 'B', plannedMinutes: 60, category: 'choose' }),
    ]
    const result = enforceDailyBudget(checklist, 186)

    expect(result.checklist.every((i) => !i.deferredByBudget)).toBe(true)
  })

  it('returns 0 deferred when budget is 0 or negative', () => {
    const checklist = [make({ label: 'A', plannedMinutes: 60, category: 'choose' })]
    const result = enforceDailyBudget(checklist, 0)

    expect(result.deferredCount).toBe(0)
    expect(result.activeMinutes).toBe(60)
  })
})

describe('resolveDailyBudget', () => {
  it('returns the budget unchanged for normal mode', () => {
    expect(resolveDailyBudget(186, { planType: 'normal' })).toBe(186)
  })

  it('halves the budget in MVD mode', () => {
    expect(resolveDailyBudget(186, { planType: 'mvd' })).toBe(93)
  })

  it('halves the budget when energy is low', () => {
    expect(resolveDailyBudget(186, { energy: 'low' })).toBe(93)
  })

  it('halves the budget when energy is overwhelmed', () => {
    expect(resolveDailyBudget(186, { energy: 'overwhelmed' })).toBe(93)
  })

  it('returns 0 when no budget is configured', () => {
    expect(resolveDailyBudget(undefined)).toBe(0)
    expect(resolveDailyBudget(0)).toBe(0)
  })
})
