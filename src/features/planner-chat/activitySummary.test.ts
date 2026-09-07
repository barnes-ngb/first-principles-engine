import { describe, expect, it } from 'vitest'

import type { ActivityConfig } from '../../core/types'
import { activitySummaryLine, VIEW_ACTIVITIES_LABEL } from './activitySummary'

function config(name: string, completed = false): ActivityConfig {
  return {
    id: name,
    childId: 'lincoln',
    name,
    type: 'workbook',
    subjectBucket: 'Other',
    frequency: 'daily',
    defaultMinutes: 15,
    completed,
  } as unknown as ActivityConfig
}

describe('activitySummaryLine (UX-258)', () => {
  it('is null when there is nothing to count', () => {
    expect(activitySummaryLine([])).toBeNull()
  })

  it('counts the active ones', () => {
    expect(activitySummaryLine([config('a'), config('b'), config('c')])).toBe('3 activities')
  })

  it('says "activity" for one', () => {
    expect(activitySummaryLine([config('a')])).toBe('1 activity')
  })

  it('names completed ones separately rather than folding them into the total', () => {
    const line = activitySummaryLine([config('a'), config('b'), config('done', true)])
    expect(line).toBe('2 activities · 1 completed')
  })

  it('says zero active when every config is completed', () => {
    // A real state after a family finishes a program. It must not read as "1
    // activity" — nothing is being planned.
    expect(activitySummaryLine([config('done', true)])).toBe('0 activities · 1 completed')
  })

  it('names no activity, so a long list cannot come back as a wall', () => {
    const many = Array.from({ length: 24 }, (_, i) => config(`Activity number ${i}`))
    const line = activitySummaryLine(many)!
    expect(line).toBe('24 activities')
    for (const c of many) expect(line).not.toContain(c.name)
  })

  it('has a link label that names the two things it does', () => {
    expect(VIEW_ACTIVITIES_LABEL).toBe('View / edit')
  })
})
