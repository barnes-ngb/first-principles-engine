import { describe, expect, it } from 'vitest'

import type { ActivityConfig } from '../../core/types/planning'
import { COMPLETED_NAME_REFUSAL, EMPTY_NAME_REFUSAL, planRename } from './renameActivity'

/** The publisher's name on the cover. */
const COVER_NAME = 'Simply Good and Beautiful Math K — Course Book'

const config = (over: Partial<ActivityConfig> = {}): ActivityConfig =>
  ({
    id: 'cfg-math',
    name: COVER_NAME,
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
    expect(plan.aliases).toEqual([COVER_NAME])
    expect(plan.carriesOldName).toBe(true)
    expect(plan.refusal).toBe('')
  })

  it('appends the old name to alternates it already had', () => {
    const plan = planRename(config({ aliases: ['SGAB Math'] }), 'Math K')
    expect(plan.aliases).toEqual(['SGAB Math', COVER_NAME])
  })

  it('writes nothing when neither the name nor the alternates changed', () => {
    const plan = planRename(config({ name: 'Math K', aliases: [COVER_NAME] }), 'Math K')
    expect(plan.name).toBeNull()
    expect(plan.aliases).toBeNull()
  })

  it('saves an added alternate on its own, with the name left as it was', () => {
    // The commonest thing she will do is put the cover's full title on a row
    // she never renames. Requiring a rename to reach the save would make that
    // impossible.
    const plan = planRename(config({ name: 'Math K', aliases: [COVER_NAME] }), 'Math K', [
      COVER_NAME,
      'SGAB Math',
    ])
    expect(plan.name).toBe('Math K')
    expect(plan.aliases).toEqual([COVER_NAME, 'SGAB Math'])
    expect(plan.carriesOldName).toBe(false)
    // Nothing was renamed, so there is nothing to warn about renaming ONTO.
    expect(plan.duplicateNotice).toBe('')
  })

  it('saves a REMOVED alternate too', () => {
    const plan = planRename(config({ name: 'Math K', aliases: [COVER_NAME] }), 'Math K', [])
    expect(plan.name).toBe('Math K')
    expect(plan.aliases).toEqual([])
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
    const plan = planRename(config(), 'Math K', undefined, siblings)
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
    expect(planRename(config(), 'Math K', undefined, siblings).duplicateNotice).toContain('You already have')
  })

  it('notices a collision an ADDED alternate would create, with no rename', () => {
    // Codex round 3, P2. This is the collision that costs something: both rows
    // then match the same scanned page and the lookup's `.find(...)` updates
    // whichever comes back first — a position written to the wrong workbook,
    // which is what the alternates exist to prevent. It was un-warned twice
    // over: the notice was suppressed unless the display name changed, and it
    // compared only that name.
    const sibling = {
      id: 'cfg-other',
      name: 'Mathseeds',
      childId: 'lincoln',
      defaultMinutes: 20,
      frequency: 'daily' as const,
    }
    const plan = planRename(config({ name: 'Math K' }), 'Math K', ['Mathseeds'], [sibling])
    expect(plan.name).toBe('Math K')
    expect(plan.duplicateNotice).toContain('You already have "Mathseeds"')
  })

  it("sees a sibling's publisher slot too, because the scan lookup does", () => {
    const sibling = {
      id: 'cfg-other',
      name: 'Reading',
      curriculum: 'Mathseeds',
      childId: 'lincoln',
      defaultMinutes: 20,
      frequency: 'daily' as const,
    }
    expect(
      planRename(config({ name: 'Math K' }), 'Math K', ['Mathseeds'], [sibling]).duplicateNotice,
    ).toContain('You already have')
  })

  it('can be told NOT to carry the old name', () => {
    // Carrying is a default, not a rule: a parent correcting a typo in a name
    // nobody ever scanned should not be made to keep the typo. The dialog's
    // delete control on that chip is what sets this.
    const plan = planRename(config(), 'Math K', undefined, [], { carryOldName: false })
    expect(plan.name).toBe('Math K')
    expect(plan.carriesOldName).toBe(false)
    expect(plan.aliases).toEqual([])
  })

  it('never notices itself, or a completed sibling', () => {
    const self = { id: 'cfg-math', name: 'Math K', childId: 'lincoln', defaultMinutes: 30, frequency: 'daily' as const }
    const done = { id: 'cfg-old', name: 'Math K', completed: true, childId: 'lincoln', defaultMinutes: 30, frequency: 'daily' as const }
    expect(planRename(config(), 'Math K', undefined, [self, done]).duplicateNotice).toBe('')
  })
})
