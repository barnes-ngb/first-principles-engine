import { describe, expect, it } from 'vitest'

import type { Rung } from '../../core/types/domain'
import { EvidenceType } from '../../core/types/enums'
import {
  canMarkAchieved,
  getActiveRungId,
  getRungStatus,
  rungIdFor,
  type ProgressByRungId,
} from './ladder.logic'

const rung = (order: number, id?: string): Rung => ({
  id,
  title: `Rung ${order}`,
  order,
})

const achieved = (ladderId: string, rungId: string) => ({
  childId: 'child-a',
  ladderId,
  rungId,
  label: `Rung`,
  status: 'achieved' as const,
  achievedAt: '2026-02-04T12:00:00',
})

describe('rungIdFor', () => {
  it('returns the explicit id when present', () => {
    expect(rungIdFor(rung(1, 'abc'))).toBe('abc')
  })

  it('falls back to order-{n} when no id', () => {
    expect(rungIdFor(rung(3))).toBe('order-3')
  })
})

describe('getActiveRungId', () => {
  it('returns the first unachieved rung', () => {
    const rungs = [rung(1, 'r1'), rung(2, 'r2'), rung(3, 'r3')]
    const progress: ProgressByRungId = {
      r1: achieved('ladder', 'r1'),
    }

    expect(getActiveRungId(rungs, progress)).toBe('r2')
  })

  it('returns the first rung when nothing is achieved', () => {
    const rungs = [rung(1, 'r1'), rung(2, 'r2')]

    expect(getActiveRungId(rungs, {})).toBe('r1')
  })

  it('returns undefined when all rungs are achieved', () => {
    const rungs = [rung(1, 'r1'), rung(2, 'r2')]
    const progress: ProgressByRungId = {
      r1: achieved('ladder', 'r1'),
      r2: achieved('ladder', 'r2'),
    }

    expect(getActiveRungId(rungs, progress)).toBeUndefined()
  })

  it('sorts by order regardless of array position', () => {
    const rungs = [rung(3, 'r3'), rung(1, 'r1'), rung(2, 'r2')]

    expect(getActiveRungId(rungs, {})).toBe('r1')
  })

  it('handles fallback rung ids (order-N)', () => {
    const rungs = [rung(1), rung(2)]
    const progress: ProgressByRungId = {
      'order-1': achieved('ladder', 'order-1'),
    }

    expect(getActiveRungId(rungs, progress)).toBe('order-2')
  })
})

describe('getRungStatus', () => {
  it('returns achieved when milestone is achieved by status', () => {
    const r = rung(1, 'r1')
    const progress: ProgressByRungId = {
      r1: achieved('ladder', 'r1'),
    }

    expect(getRungStatus(r, progress, 'r1')).toBe('achieved')
  })

  it('returns locked when status is active but not the active rung', () => {
    const r = rung(1, 'r1')
    const progress: ProgressByRungId = {
      r1: {
        childId: 'child-a',
        ladderId: 'ladder',
        rungId: 'r1',
        label: 'Rung',
        status: 'active',
      },
    }

    expect(getRungStatus(r, progress, 'r2')).toBe('locked')
  })

  it('returns active when rung matches the active rung id', () => {
    const r = rung(2, 'r2')

    expect(getRungStatus(r, {}, 'r2')).toBe('active')
  })

  it('returns locked when rung is not active and not achieved', () => {
    const r = rung(3, 'r3')

    expect(getRungStatus(r, {}, 'r1')).toBe('locked')
  })
})

describe('canMarkAchieved', () => {
  it('returns true when there are linked artifacts', () => {
    const artifacts = [
      {
        childId: 'child-a',
        title: 'Note',
        type: EvidenceType.Note,
        createdAt: '2026-02-04T12:00:00',
        tags: {
          engineStage: 'Wonder' as never,
          domain: 'Science',
          subjectBucket: 'Science' as never,
          location: 'Home',
        },
      },
    ]

    expect(canMarkAchieved(artifacts)).toBe(true)
  })

  it('returns false when there are no linked artifacts', () => {
    expect(canMarkAchieved([])).toBe(false)
  })
})
