import { describe, expect, it } from 'vitest'

import type { ActivityConfig } from '../../core/types/planning'
import { COMPLETED_NAME_REFUSAL, EMPTY_NAME_REFUSAL, planRename } from './renameActivity'

const config = (over: Partial<ActivityConfig> = {}): ActivityConfig =>
  ({
    id: 'cfg-math',
    name: 'Simply Good and Beautiful Math K — Course Book',
    type: 'workbook',
    subjectBucket: 'Math',
    defaultMinutes: 30,
    frequency: 'daily',
    childId: 'lincoln',
    sortOrder: 1,
    completed: false,
    scannable: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...over,
  }) as ActivityConfig

describe('planRename', () => {
  it("keeps the old name as an alternate, so the cover still finds it", () => {
    const plan = planRename(config(), 'Math K')
    expect(plan.name).toBe('Math K')
    expect(plan.aliases).toEqual(['Simply Good and Beautiful Math K — Course Book'])
    expect(plan.carriesOldName).toBe(true)
    expect(plan.refusal).toBe('')
  })

  it('appends the old name to alternates it already had', () => {
    const plan = planRename(config({ aliases: ['SGAB Math'] }), 'Math K')
    expect(plan.aliases).toEqual(['SGAB Math', 'Simply Good and Beautiful Math K — Course Book'])
  })

  it('writes nothing when the name is unchanged', () => {
    const plan = planRename(config({ name: 'Math K' }), 'Math K')
    expect(plan.name).toBeNull()
    expect(plan.aliases).toBeNull()
  })

  it('re-spelling is a real rename but spends no alternate slot', () => {
    // `nameKey` cannot tell "math k" from "Math K", so every matcher answers
    // exactly as before — storing the old spelling would waste a capped slot on
    // a name that already matches.
    const plan = planRename(config({ name: 'math k' }), 'Math K')
    expect(plan.name).toBe('Math K')
    expect(plan.carriesOldName).toBe(false)
    expect(plan.aliases).toEqual([])
  })

  it('trims, and refuses an empty name', () => {
    expect(planRename(config(), '  Math K  ').name).toBe('Math K')
    const empty = planRename(config(), '   ')
    expect(empty.name).toBeNull()
    expect(empty.refusal).toBe(EMPTY_NAME_REFUSAL)
  })

  it('refuses a completed program — its name is part of a closed record', () => {
    const plan = planRename(config({ completed: true }), 'Math K')
    expect(plan.name).toBeNull()
    expect(plan.refusal).toBe(COMPLETED_NAME_REFUSAL)
  })

  it('notices a live sibling with the same name — and still allows the save', () => {
    const siblings = [
      { id: 'cfg-other', name: 'Math K', childId: 'lincoln', defaultMinutes: 20, frequency: 'daily' as const },
    ]
    const plan = planRename(config(), 'Math K', siblings)
    expect(plan.duplicateNotice).toContain('You already have "Math K"')
    expect(plan.duplicateNotice).toContain('20m')
    expect(plan.name).toBe('Math K') // a notice, never a block
  })

  it("notices a sibling that answers to the name through an ALTERNATE", () => {
    const siblings = [
      {
        id: 'cfg-other',
        name: 'Math (Lincoln)',
        aliases: ['Math K'],
        childId: 'lincoln',
        defaultMinutes: 20,
        frequency: 'daily' as const,
      },
    ]
    expect(planRename(config(), 'Math K', siblings).duplicateNotice).toContain('You already have')
  })

  it('never notices itself, or a completed sibling', () => {
    const self = { id: 'cfg-math', name: 'Math K', childId: 'lincoln', defaultMinutes: 30, frequency: 'daily' as const }
    const done = { id: 'cfg-old', name: 'Math K', completed: true, childId: 'lincoln', defaultMinutes: 30, frequency: 'daily' as const }
    expect(planRename(config(), 'Math K', [self, done]).duplicateNotice).toBe('')
  })
})
