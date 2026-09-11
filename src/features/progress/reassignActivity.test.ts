import { describe, expect, it } from 'vitest'

import type { ActivityConfig } from '../../core/types/planning'
import { ActivityType } from '../../core/types/enums'
import {
  BOTH_OWNER_ID,
  REASSIGN_COMPLETED_REFUSAL,
  planReassignActivity,
  reassignFailureNotice,
  reassignedNotice,
} from './reassignActivity'

const CHILDREN = [
  { id: 'lincoln', name: 'Lincoln' },
  { id: 'london', name: 'London' },
]

function config(over: Partial<ActivityConfig> = {}): ActivityConfig {
  return {
    id: 'cfg-1',
    name: 'Prayer and Scripture',
    type: ActivityType.Routine,
    childId: 'london',
    ...over,
  } as ActivityConfig
}

describe('planReassignActivity — every type the add dialog can create', () => {
  it.each(Object.values(ActivityType))('offers a destination for a %s row', (type) => {
    // POSITIVE CONTROL for the widening: the old gate was
    // `type === 'workbook'`, so six of these seven rows could not be moved at
    // all. A new `ActivityType` member lands here unplanned and fails loudly.
    const plan = planReassignActivity(config({ type }), CHILDREN)

    expect(plan.refusal).toBe('')
    expect(plan.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(['lincoln', 'london']),
    )
    expect(plan.prompt).toContain('Prayer and Scripture')
    expect(plan.shapeNote).not.toBe('')
  })

  it('never offers “both” for a workbook — DATA-08 stands', () => {
    const plan = planReassignActivity(
      config({ type: ActivityType.Workbook, name: 'GATB Math K' }),
      CHILDREN,
    )

    expect(plan.options.map((o) => o.id)).toEqual(['lincoln', 'london'])
    expect(plan.shapeNote).toContain('one child')
  })

  it('offers “both” for a shared routine', () => {
    const plan = planReassignActivity(config(), CHILDREN)

    expect(plan.options.map((o) => o.id)).toContain(BOTH_OWNER_ID)
  })

  it('does not offer “both” in a one-child family — it could not mean anything', () => {
    const plan = planReassignActivity(config(), [CHILDREN[0]])

    expect(plan.options.map((o) => o.id)).toEqual(['lincoln'])
  })
})

describe('planReassignActivity — the rows that do not move', () => {
  it('refuses a finished program, as a rename does', () => {
    const plan = planReassignActivity(config({ completed: true }), CHILDREN)

    expect(plan.refusal).toBe(REASSIGN_COMPLETED_REFUSAL)
    expect(plan.options).toEqual([])
  })

  it('refuses a strand that has recorded sessions, and says whose they are', () => {
    const plan = planReassignActivity(
      config({
        type: ActivityType.Strand,
        name: 'History',
        childId: 'lincoln',
        currentPosition: 14,
      }),
      CHILDREN,
    )

    // The count is evidence — each session left an artifact behind it — so
    // moving the row would move a record of days that happened.
    expect(plan.refusal).toContain('Lincoln')
    expect(plan.refusal).toContain('14 sessions')
    expect(plan.options).toEqual([])
  })

  it('moves a strand that has recorded nothing — that one is just a mistyped row', () => {
    const plan = planReassignActivity(
      config({ type: ActivityType.Strand, name: 'History', currentPosition: 0 }),
      CHILDREN,
    )

    expect(plan.refusal).toBe('')
    expect(plan.options.map((o) => o.id)).toContain('lincoln')
  })

  it('treats an unwritten session count as no sessions', () => {
    const plan = planReassignActivity(
      config({ type: ActivityType.Strand, currentPosition: undefined }),
      CHILDREN,
    )

    expect(plan.refusal).toBe('')
  })

  it('does not refuse a workbook for having a position — that is a page, not a record of days', () => {
    const plan = planReassignActivity(
      config({ type: ActivityType.Workbook, currentPosition: 42 }),
      CHILDREN,
    )

    expect(plan.refusal).toBe('')
  })
})

describe('what the snack says', () => {
  it('names the new owner', () => {
    expect(reassignedNotice('GATB Math K', { id: 'lincoln', label: 'Lincoln' })).toBe(
      '“GATB Math K” is now Lincoln\'s.',
    )
  })

  it('gives “both” its own sentence rather than a possessive nobody writes', () => {
    const text = reassignedNotice('Prayer and Scripture', {
      id: BOTH_OWNER_ID,
      label: 'Both kids',
    })

    expect(text).not.toContain("Both kids's")
    expect(text).toContain('both kids')
  })

  it('says the row is UNCHANGED when the move failed', () => {
    const text = reassignFailureNotice('Prayer and Scripture')

    expect(text).toContain("Couldn't move")
    expect(text).toContain('still where it was')
  })
})
