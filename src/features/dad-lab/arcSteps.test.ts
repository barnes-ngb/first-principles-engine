import { describe, expect, it } from 'vitest'

import type { ArcStep } from '../../core/types'

import { markStepDone, setActiveStep } from './arcSteps'

const step = (title: string, status: ArcStep['status']): ArcStep => ({
  title,
  conceptBeat: `${title} beat`,
  status,
})

describe('markStepDone', () => {
  it('marks the target step done and auto-advances the next upcoming step to active', () => {
    const steps = [step('a', 'active'), step('b', 'upcoming'), step('c', 'upcoming')]
    const next = markStepDone(steps, 0)
    expect(next.map((s) => s.status)).toEqual(['done', 'active', 'upcoming'])
  })

  it('advances the upcoming step after the done index, not an earlier one', () => {
    const steps = [step('a', 'upcoming'), step('b', 'active'), step('c', 'upcoming')]
    const next = markStepDone(steps, 1)
    // b is done; the next upcoming AFTER index 1 (c) becomes active, a stays upcoming
    expect(next.map((s) => s.status)).toEqual(['upcoming', 'done', 'active'])
  })

  it('falls back to the earliest upcoming step when none follow the done index', () => {
    const steps = [step('a', 'upcoming'), step('b', 'active')]
    const next = markStepDone(steps, 1)
    expect(next.map((s) => s.status)).toEqual(['active', 'done'])
  })

  it('leaves no active step when the last remaining steps are all done', () => {
    const steps = [step('a', 'done'), step('b', 'active')]
    const next = markStepDone(steps, 1)
    expect(next.map((s) => s.status)).toEqual(['done', 'done'])
    expect(next.some((s) => s.status === 'active')).toBe(false)
  })

  it('never produces more than one active step', () => {
    const steps = [step('a', 'active'), step('b', 'upcoming'), step('c', 'upcoming')]
    const next = markStepDone(steps, 0)
    expect(next.filter((s) => s.status === 'active')).toHaveLength(1)
  })

  it('stamps completedReportId / completedDateKey on the done step', () => {
    const steps = [step('a', 'active'), step('b', 'upcoming')]
    const next = markStepDone(steps, 0, { completedReportId: 'r1', completedDateKey: '2026-07-03' })
    expect(next[0]).toMatchObject({
      status: 'done',
      completedReportId: 'r1',
      completedDateKey: '2026-07-03',
    })
  })

  it('does not mutate the input array', () => {
    const steps = [step('a', 'active'), step('b', 'upcoming')]
    const snapshot = JSON.parse(JSON.stringify(steps))
    markStepDone(steps, 0)
    expect(steps).toEqual(snapshot)
  })

  it('is a no-op for an out-of-range index', () => {
    const steps = [step('a', 'active')]
    expect(markStepDone(steps, 5)).toBe(steps)
    expect(markStepDone(steps, -1)).toBe(steps)
  })
})

describe('setActiveStep', () => {
  it('activates the target and demotes any other active step to upcoming', () => {
    const steps = [step('a', 'active'), step('b', 'upcoming'), step('c', 'upcoming')]
    const next = setActiveStep(steps, 2)
    expect(next.map((s) => s.status)).toEqual(['upcoming', 'upcoming', 'active'])
  })

  it('leaves done steps untouched', () => {
    const steps = [step('a', 'done'), step('b', 'active'), step('c', 'upcoming')]
    const next = setActiveStep(steps, 2)
    expect(next.map((s) => s.status)).toEqual(['done', 'upcoming', 'active'])
  })

  it('enforces a single active step', () => {
    const steps = [step('a', 'active'), step('b', 'upcoming')]
    const next = setActiveStep(steps, 1)
    expect(next.filter((s) => s.status === 'active')).toHaveLength(1)
  })

  it('is a no-op for an out-of-range index', () => {
    const steps = [step('a', 'active')]
    expect(setActiveStep(steps, 9)).toBe(steps)
  })
})
