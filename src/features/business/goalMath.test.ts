import { describe, expect, it } from 'vitest'

import type { BusinessGoalMilestone } from '../../core/types/business'
import { computeGoalProgress, goalStackTotal, withCumulativeThresholds } from './goalMath'

function rung(id: string, label: string, price: number): BusinessGoalMilestone {
  // `threshold` is intentionally bogus here — the math must recompute it.
  return { id, label, price, threshold: -999 }
}

// A representative Xbox-ish stack: console → game → controller.
const stack: BusinessGoalMilestone[] = [
  rung('console', 'Xbox Series S', 300),
  rung('game', 'A game', 60),
  rung('controller', 'Second controller', 65),
]

describe('withCumulativeThresholds', () => {
  it('computes cumulative thresholds in climb order', () => {
    const out = withCumulativeThresholds(stack)
    expect(out.map((m) => m.threshold)).toEqual([300, 360, 425])
  })

  it('returns an empty list for an empty stack', () => {
    expect(withCumulativeThresholds([])).toEqual([])
  })

  it('floors negative / non-finite prices to 0 so thresholds never dip', () => {
    const out = withCumulativeThresholds([
      rung('a', 'A', 100),
      rung('b', 'B', -50),
      rung('c', 'C', Number.NaN),
      rung('d', 'D', 40),
    ])
    expect(out.map((m) => m.threshold)).toEqual([100, 100, 100, 140])
  })
})

describe('goalStackTotal', () => {
  it('sums all prices in the stack', () => {
    expect(goalStackTotal(stack)).toBe(425)
  })

  it('is 0 for an empty stack', () => {
    expect(goalStackTotal([])).toBe(0)
  })
})

describe('computeGoalProgress', () => {
  it('collects nothing and points at the first rung when total is 0', () => {
    const p = computeGoalProgress(stack, 0)
    expect(p.collectedCount).toBe(0)
    expect(p.nextIndex).toBe(0)
    expect(p.amountToNext).toBe(300)
    expect(p.allUnlocked).toBe(false)
    expect(p.milestones.map((m) => m.collected)).toEqual([false, false, false])
    expect(p.milestones.map((m) => m.isNext)).toEqual([true, false, false])
  })

  it('collects a rung exactly at its threshold (>= is inclusive)', () => {
    const p = computeGoalProgress(stack, 300)
    expect(p.collectedCount).toBe(1)
    expect(p.milestones[0].collected).toBe(true)
    expect(p.nextIndex).toBe(1)
    expect(p.milestones[1].isNext).toBe(true)
    expect(p.amountToNext).toBe(60) // 360 - 300
  })

  it('reports the dollars remaining to the next unlock mid-climb', () => {
    const p = computeGoalProgress(stack, 330)
    expect(p.collectedCount).toBe(1)
    expect(p.nextIndex).toBe(1)
    expect(p.amountToNext).toBe(30) // 360 - 330
  })

  it('marks every rung collected and nothing next once the stack is cleared', () => {
    const p = computeGoalProgress(stack, 500)
    expect(p.collectedCount).toBe(3)
    expect(p.allUnlocked).toBe(true)
    expect(p.nextIndex).toBeNull()
    expect(p.amountToNext).toBeNull()
    expect(p.milestones.every((m) => m.collected)).toBe(true)
    expect(p.milestones.some((m) => m.isNext)).toBe(false)
  })

  it('never reads a negative total as dragging the meter down', () => {
    const p = computeGoalProgress(stack, -100)
    expect(p.collectedCount).toBe(0)
    expect(p.nextIndex).toBe(0)
    expect(p.amountToNext).toBe(300)
  })

  it('handles an empty stack: nothing next, nothing unlocked', () => {
    const p = computeGoalProgress([], 50)
    expect(p.milestones).toEqual([])
    expect(p.collectedCount).toBe(0)
    expect(p.nextIndex).toBeNull()
    expect(p.amountToNext).toBeNull()
    expect(p.allUnlocked).toBe(false)
    expect(p.stackTotal).toBe(0)
  })
})
