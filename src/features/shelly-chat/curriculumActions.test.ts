import { describe, expect, it } from 'vitest'

import { WORKBOOK_OWNER_REASON } from '../../core/firebase/activityConfigWrites'
import type { ChatAction } from '../../core/types'
import type { CurriculumAction } from './curriculumActions'
import {
  CURRICULUM_NOTICES,
  curriculumActionFootnote,
  describeAddActivityShape,
  describeCurriculumAction,
  isCurriculumAction,
  nextActivitySortOrder,
  resolveCurriculumAction,
} from './curriculumActions'
import type { ChatActivityConfig } from './useShellyChatActions'

// ── Fixtures ────────────────────────────────────────────────────────────────

const gatb: ChatActivityConfig = {
  id: 'cfg-gatb',
  name: 'GATB Math 3',
  childId: 'lincoln',
  defaultMinutes: 20,
  type: 'workbook',
  currentPosition: 98,
  totalUnits: 140,
  unitLabel: 'lesson',
  sortOrder: 2,
}

/** A shared routine — legitimately `'both'`, and with no position to set. */
const morningRoutine: ChatActivityConfig = {
  id: 'cfg-morning',
  name: 'Morning formation',
  childId: 'both',
  defaultMinutes: 10,
  type: 'routine',
  sortOrder: 1,
}

const finished: ChatActivityConfig = {
  id: 'cfg-done',
  name: 'Explode the Code 3',
  childId: 'lincoln',
  defaultMinutes: 15,
  type: 'workbook',
  currentPosition: 60,
  totalUnits: 60,
  completed: true,
  sortOrder: 3,
}

const CONFIGS = [morningRoutine, gatb, finished]

const complete = (activityConfigId: string, childId = 'lincoln'): CurriculumAction => ({
  kind: 'markActivityComplete',
  childId,
  activityConfigId,
})

const setPosition = (
  activityConfigId: string,
  position: number,
  childId = 'lincoln',
): CurriculumAction => ({
  kind: 'setActivityPosition',
  childId,
  activityConfigId,
  position,
})

const addActivity = (overrides: Partial<Extract<CurriculumAction, { kind: 'addActivity' }>> = {}) =>
  ({
    kind: 'addActivity',
    childId: 'lincoln',
    name: 'Khan Academy math',
    type: 'app',
    subjectBucket: 'Math',
    defaultMinutes: 20,
    frequency: 'daily',
    ...overrides,
  }) as Extract<CurriculumAction, { kind: 'addActivity' }>

// ── The narrowing ───────────────────────────────────────────────────────────

describe('isCurriculumAction', () => {
  it('matches exactly the three curriculum kinds', () => {
    expect(isCurriculumAction(addActivity())).toBe(true)
    expect(isCurriculumAction(complete('cfg-gatb'))).toBe(true)
    expect(isCurriculumAction(setPosition('cfg-gatb', 107))).toBe(true)
  })

  it('does not claim the neighbouring kinds', () => {
    const others: ChatAction[] = [
      { kind: 'addSightWord', childId: 'lincoln', word: 'the' },
      { kind: 'setActivityMinutes', childId: 'lincoln', activityConfigId: 'cfg-gatb', minutes: 30 },
      { kind: 'removeItemFromDay', childId: 'lincoln', dateKey: '2026-08-12', itemKey: 'k' },
      { kind: 'addPrioritySkill', childId: 'lincoln', skill: 'inference' },
    ]
    for (const action of others) {
      expect(isCurriculumAction(action), `kind=${action.kind}`).toBe(false)
    }
  })
})

// ── The parent gate ─────────────────────────────────────────────────────────

describe('resolveCurriculumAction — parent gate', () => {
  // `/chat` is nav-gated, not route-gated, so a kid profile can reach it by URL.
  it('refuses every curriculum kind for a non-parent, with the gate reason', () => {
    for (const action of [
      addActivity(),
      complete('cfg-gatb'),
      setPosition('cfg-gatb', 107),
    ]) {
      const result = resolveCurriculumAction(action, CONFIGS, false)
      expect(result.ok, `kind=${action.kind}`).toBe(false)
      if (!result.ok) expect(result.notice).toBe(CURRICULUM_NOTICES.notPermitted)
    }
  })
})

// ── Resolution against the live configs ─────────────────────────────────────

describe('resolveCurriculumAction — a hallucinated id never becomes a card', () => {
  it('drops an id no config carries, and says why', () => {
    for (const action of [complete('cfg-nope'), setPosition('cfg-nope', 12)]) {
      const result = resolveCurriculumAction(action, CONFIGS, true)
      expect(result.ok, `kind=${action.kind}`).toBe(false)
      if (!result.ok) expect(result.notice).toBe(CURRICULUM_NOTICES.notFound)
    }
  })

  it('drops a config the acting child does not own', () => {
    const result = resolveCurriculumAction(complete('cfg-gatb', 'london'), CONFIGS, true)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.notice).toBe(CURRICULUM_NOTICES.notFound)
  })

  it("resolves a shared ('both') config for either child", () => {
    for (const childId of ['lincoln', 'london']) {
      const result = resolveCurriculumAction(complete('cfg-morning', childId), CONFIGS, true)
      expect(result.ok, `childId=${childId}`).toBe(true)
    }
  })

  it('resolves a real, running config and hands back the config itself', () => {
    const result = resolveCurriculumAction(setPosition('cfg-gatb', 107), CONFIGS, true)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.resolved.config).toBe(gatb)
  })
})

describe('resolveCurriculumAction — a finished program is refused BY NAME', () => {
  // The point of the FEAT-143 subscription change: a completed config used to be
  // filtered out upstream, so a proposal against one refused as "that didn't
  // match one of your activities" — false, about an activity the parent can see
  // in Curriculum's Completed list.
  it('refuses both existing-config kinds against a completed config', () => {
    for (const action of [complete('cfg-done'), setPosition('cfg-done', 12)]) {
      const result = resolveCurriculumAction(action, CONFIGS, true)
      expect(result.ok, `kind=${action.kind}`).toBe(false)
      if (!result.ok) {
        expect(result.notice).toContain('Explode the Code 3')
        expect(result.notice).toContain('already marked finished')
        expect(result.notice).not.toBe(CURRICULUM_NOTICES.notFound)
      }
    }
  })

  it('never quotes a doc id back at the parent', () => {
    const result = resolveCurriculumAction(complete('cfg-done'), CONFIGS, true)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.notice).not.toContain('cfg-done')
  })
})

describe('resolveCurriculumAction — setActivityPosition bounds', () => {
  it('refuses a config that tracks no position, and names it', () => {
    const result = resolveCurriculumAction(setPosition('cfg-morning', 3), CONFIGS, true)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.notice).toContain('Morning formation')
      expect(result.notice).toContain("doesn't track a lesson or page number")
    }
  })

  it('rejects a position past the end rather than clamping it to totalUnits', () => {
    const result = resolveCurriculumAction(setPosition('cfg-gatb', 141), CONFIGS, true)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.notice).toContain('GATB Math 3')
      expect(result.notice).toContain('140 lessons')
      expect(result.notice).toContain('past the end')
    }
  })

  it('accepts the last lesson exactly', () => {
    expect(resolveCurriculumAction(setPosition('cfg-gatb', 140), CONFIGS, true).ok).toBe(true)
  })

  it('accepts a position on a config with a position but no known total', () => {
    const openEnded: ChatActivityConfig = {
      id: 'cfg-open',
      name: 'Reading Eggs',
      childId: 'lincoln',
      defaultMinutes: 15,
      type: 'app',
      currentPosition: 12,
      sortOrder: 4,
    }
    expect(resolveCurriculumAction(setPosition('cfg-open', 900), [openEnded], true).ok).toBe(true)
  })

  it('uses the config’s own unit noun in the past-the-end refusal', () => {
    const chapters: ChatActivityConfig = {
      ...gatb,
      id: 'cfg-ch',
      name: 'Story of the World',
      unitLabel: 'chapter',
      totalUnits: 42,
    }
    const result = resolveCurriculumAction(setPosition('cfg-ch', 99), [chapters], true)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.notice).toContain('42 chapters')
  })
})

describe('resolveCurriculumAction — addActivity', () => {
  it('resolves without naming an existing config, and stamps end-of-list sortOrder', () => {
    const result = resolveCurriculumAction(addActivity(), CONFIGS, true)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.resolved.config).toBeUndefined()
      expect(result.resolved.sortOrder).toBe(4) // max(1,2,3) + 1
    }
  })

  it('refuses a shared workbook with the DATA-08 rule’s own sentence', () => {
    const result = resolveCurriculumAction(
      addActivity({ type: 'workbook', shared: true }),
      CONFIGS,
      true,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.notice).toBe(WORKBOOK_OWNER_REASON)
  })

  it('allows a shared non-workbook', () => {
    expect(
      resolveCurriculumAction(addActivity({ type: 'routine', shared: true }), CONFIGS, true).ok,
    ).toBe(true)
  })
})

describe('nextActivitySortOrder', () => {
  it('appends past the largest existing order, not the list length', () => {
    expect(nextActivitySortOrder(CONFIGS)).toBe(4)
    expect(nextActivitySortOrder([{ ...gatb, sortOrder: 50 }])).toBe(51)
  })

  it('starts at 1 for an empty list, and tolerates a missing sortOrder', () => {
    expect(nextActivitySortOrder([])).toBe(1)
    expect(nextActivitySortOrder([{ ...gatb, sortOrder: undefined }])).toBe(1)
  })
})

// ── Card wording ────────────────────────────────────────────────────────────

describe('describeCurriculumAction', () => {
  const resolve = (action: CurriculumAction) => {
    const result = resolveCurriculumAction(action, CONFIGS, true)
    if (!result.ok) throw new Error(`expected ok: ${result.notice}`)
    return result.resolved
  }

  it('shows a real old → new for a position bump, in the config’s unit noun', () => {
    expect(describeCurriculumAction(resolve(setPosition('cfg-gatb', 107)), 'Lincoln')).toBe(
      'GATB Math 3: lesson 98 → 107',
    )
  })

  it('omits the arrow when the config has no position yet', () => {
    const fresh: ChatActivityConfig = { ...gatb, id: 'cfg-fresh', currentPosition: undefined }
    const result = resolveCurriculumAction(setPosition('cfg-fresh', 7), [fresh], true)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(describeCurriculumAction(result.resolved, 'Lincoln')).toBe('GATB Math 3: lesson 7')
    }
  })

  it('names the child and the activity for a completion', () => {
    expect(describeCurriculumAction(resolve(complete('cfg-gatb')), 'Lincoln')).toBe(
      'Mark "GATB Math 3" finished for Lincoln',
    )
  })

  it('names the child and the new activity for an add', () => {
    expect(describeCurriculumAction(resolve(addActivity()), 'Lincoln')).toBe(
      'Add "Khan Academy math" to Lincoln\'s curriculum',
    )
  })

  it('never renders a doc id', () => {
    for (const action of [complete('cfg-gatb'), setPosition('cfg-gatb', 107), addActivity()]) {
      expect(describeCurriculumAction(resolve(action), 'Lincoln')).not.toContain('cfg-')
    }
  })
})

describe('describeAddActivityShape', () => {
  it('shows subject, minutes and frequency', () => {
    expect(describeAddActivityShape(addActivity())).toBe('Math · 20m · daily')
  })

  it('adds the position when the parent gave real numbers', () => {
    expect(
      describeAddActivityShape(addActivity({ totalUnits: 140, currentPosition: 98 })),
    ).toBe('Math · 20m · daily · lesson 98 of 140')
    expect(describeAddActivityShape(addActivity({ totalUnits: 140 }))).toBe(
      'Math · 20m · daily · 140 lessons',
    )
    expect(describeAddActivityShape(addActivity({ currentPosition: 12 }))).toBe(
      'Math · 20m · daily · starting at lesson 12',
    )
  })
})

describe('curriculumActionFootnote', () => {
  it('states the completion consequence and that there is no undo anywhere', () => {
    const note = curriculumActionFootnote(complete('cfg-gatb'))
    expect(note).toContain('stops appearing in future plans')
    expect(note).toContain('everything already logged stays')
    expect(note).toContain('no undo')
    expect(note).toContain('Progress → Curriculum')
  })

  it('says the add and the position change touch nothing already recorded', () => {
    for (const action of [
      addActivity(),
      setPosition('cfg-gatb', 107),
    ]) {
      expect(
        curriculumActionFootnote(action),
        `kind=${action.kind}`,
      ).toContain('already recorded stay as they are')
    }
  })
})
